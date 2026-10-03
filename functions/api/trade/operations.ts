import {
  config,
  rpc,
  persistenceFailure,
  PersistenceError,
  type BridgeEnv,
} from '../../../trade/bridge/config';
import {
  MT5MarketDataProvider,
  MT5BrokerExecutionProvider,
  feedStatus,
} from '../../../trade/bridge/mt5';
import {
  approvalPolicy,
  makeProposal,
  executionView,
  type Proposal,
} from '../../../trade/bridge/approval';
import { TrendPullbackConfirmation } from '../../../trade/core/strategy';
import { generateMockCandles, snapshotOf } from '../../../trade/core/providers';
import { evaluateSnapshot } from '../../../trade/core/engine';
import { paperExecution } from '../../../trade/bridge/paper';
import { instrumentValue } from '../../../trade/bridge/instruments';
import { scannerParameters } from '../../../trade/scanner/strategies';
import { scanMarket } from '../../../trade/scanner/engine';
import { validateCommand } from '../../../trade/bridge/protocol';
const owner = 'focoos-admin'; // Existing admin-session middleware, never client supplied.
async function market(
  env: BridgeEnv,
  source: string,
  cursor: number,
  mode: string,
  strategyId?: string,
) {
  if (source !== 'mt5' && source !== 'replay')
    throw new Error('Fonte inválida');
  if (
    !Number.isInteger(cursor) ||
    cursor < 0 ||
    (cursor > 420 && source === 'replay')
  )
    throw new Error('Cursor inválido');
  const strategy = new TrendPullbackConfirmation();
  const data =
    source === 'mt5' ? await new MT5MarketDataProvider(env).read() : null;
  if (source === 'mt5' && !data)
    throw new Error('Bridge ainda não recebeu dados do MT5.');
  if (data && feedStatus(data, env).status !== 'LIVE')
    throw new Error('Feed offline ou antigo');
  const candles = data
    ? (data.candles || []).filter(
        (c: any) =>
          c.symbol === config(env).symbol &&
          c.timestamp + 60 <= Date.now() / 1000,
      )
    : generateMockCandles().slice(0, cursor);
  const snapshot = snapshotOf(candles, data ? 'live' : 'replay');
  if (
    data &&
    Date.now() / 1000 - snapshot.asOf >
      scannerParameters.closedCandleMaxAgeSeconds
  )
    throw new Error(
      'Candles fechados estão antigos. Aguarde atualização do histórico.',
    );
  if (data) {
    snapshot.symbol = config(env).symbol;
    snapshot.tickSize = data.state.tickSize;
  }
  const analysis =
    mode === 'REAL'
      ? evaluateSnapshot(snapshot, [strategy])[0]
      : strategyId
        ? scanMarket(snapshot).candidates.find(
            (c) => c.definition.id === strategyId,
          )?.analysis
        : strategy.evaluate(snapshot);
  if (!analysis) throw new Error('Estratégia inexistente');
  return { analysis, snapshot, data, strategy, candles };
}
export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: BridgeEnv;
}) {
  try {
    const b: any = await request.json(),
      c = config(env);
    if (b.action === 'propose') {
      if (b.mode !== 'PAPER' && b.mode !== 'REAL')
        throw new Error('Modo inválido');
      const m = await market(env, b.source, b.cursor, b.mode, b.strategy);
      const contract = instrumentValue(
        m.snapshot.symbol,
        b.mode,
        m.data?.state,
      );
      const pointValue = contract.pointValue;
      const proposal = makeProposal(m.analysis, {
        mode: b.mode,
        source: b.source,
        symbol: m.snapshot.symbol,
        quantity: b.quantity,
        max: c.maxContracts,
        pointValue,
        currency: contract.currency,
        pointValueSource: contract.source,
        cursor: b.source === 'mt5' ? m.snapshot.asOf : b.cursor,
        asOf: m.snapshot.asOf,
        liveAuthorized: m.strategy.liveAuthorized,
      });
      return Response.json(
        await rpc(env, 'trade_propose', {
          p_owner: owner,
          p_bridge: c.bridgeId,
          p_proposal: proposal,
        }),
      );
    }
    if (!['confirm', 'discard'].includes(b.action))
      throw new Error('Ação inválida');
    const rows = await rpc(env, 'trade_operations_read', { p_owner: owner });
    const row = rows.find((r: any) => r.id === b.id);
    if (!row) throw new Error('Proposta inexistente');
    const p: Proposal = row.payload;
    let command = null;
    if (b.action === 'confirm' && row.state === 'AGUARDANDO CONFIRMAÇÃO') {
      const m = await market(env, p.source, b.cursor, p.mode, p.setup.strategy);
      if (
        m.analysis.status !== 'complete' ||
        m.analysis.setup?.id !== p.setup.id ||
        m.snapshot.asOf !== p.asOf
      )
        throw new Error('Análise mudou. Descarte e gere uma nova proposta.');
      if (p.mode === 'REAL')
        command = validateCommand(
          {
            id: p.id,
            action: p.direction,
            symbol: p.symbol,
            volume: p.quantity,
            sl: p.sl,
            tp: p.tp,
            price: 0,
            ticket: '0',
            expiresAt: p.expiresAt,
          },
          env,
        );
    }
    if (command)
      return Response.json(
        await new MT5BrokerExecutionProvider(env).confirm(p.id, command),
      );
    return Response.json(
      await rpc(env, 'trade_confirm', {
        p_owner: owner,
        p_id: p.id,
        p_action: b.action,
        p_command: command,
        p_max: c.maxContracts,
        p_account: c.accountHash,
        p_max_age: c.maxAgeMs,
      }),
    );
  } catch (e) {
    return Response.json(
      e instanceof PersistenceError
        ? persistenceFailure(e)
        : { error: e instanceof Error ? e.message : 'Operação bloqueada' },
      { status: 409 },
    );
  }
}
export async function onRequestGet({
  request,
  env,
}: {
  request: Request;
  env: BridgeEnv;
}) {
  try {
    const u = new URL(request.url),
      cursor = Number(u.searchParams.get('cursor') || 0),
      source = u.searchParams.get('source') || 'replay';
    const rows = await rpc(env, 'trade_operations_read', { p_owner: owner });
    const data = rows.some((r: any) => r.payload.source === 'mt5')
      ? await new MT5MarketDataProvider(env).read()
      : null;
    const candles =
      source === 'mt5'
        ? (data?.candles || []).filter(
            (c: any) => c.timestamp + 60 <= Date.now() / 1000,
          )
        : generateMockCandles().slice(0, Math.max(0, Math.min(420, cursor)));
    for (const row of rows) {
      if (
        row.state === 'DESCARTADA' &&
        row.payload.mode === 'PAPER' &&
        row.payload.source === source &&
        !row.hypothetical_execution?.exitTime
      ) {
        const hypothetical = paperExecution(
          row.payload,
          candles,
          row.hypothetical_execution,
        );
        if (hypothetical) {
          await rpc(env, 'trade_hypothetical_observe', {
            p_owner: owner,
            p_id: row.id,
            p_execution: hypothetical,
          });
          row.hypothetical_execution = hypothetical;
        }
      }
      if (row.state !== 'CONFIRMADA' || row.execution?.exitTime) continue;
      const p: Proposal = row.payload;
      let execution = row.execution;
      if (p.mode === 'REAL')
        execution = executionView(
          p,
          row.command,
          row.events,
          data?.state?.positions || [],
          !!data && feedStatus(data, env).status === 'LIVE',
        );
      else if (p.source === source) {
        execution = paperExecution(p, candles, row.execution) || row.execution;
      }
      if (execution) {
        await rpc(env, 'trade_operation_observe', {
          p_owner: owner,
          p_id: p.id,
          p_execution: execution,
          p_cursor:
            source === 'mt5'
              ? snapshotOf(candles, 'live').asOf
              : candles.length,
        });
        row.execution = execution;
        if (
          p.source === 'mt5' &&
          (!data || feedStatus(data, env).status !== 'LIVE') &&
          row.execution?.position
        ) {
          row.execution = {
            ...row.execution,
            feedLive: false,
            position: {
              ...row.execution.position,
              current: null,
              profit: null,
            },
          };
        }
      }
    }
    return Response.json(rows);
  } catch (e) {
    return Response.json(persistenceFailure(e), { status: 503 });
  }
}
