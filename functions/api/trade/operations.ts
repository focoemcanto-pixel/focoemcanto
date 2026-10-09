import {
  config,
  rpc,
  persistenceFailure,
  PersistenceError,
  realRiskLimit,
  realRiskCap,
  type BridgeEnv,
} from '../../../trade/bridge/config';
import {
  MT5MarketDataProvider,
  MT5BrokerExecutionProvider,
  feedStatus,
} from '../../../trade/bridge/mt5';
import {
  buildTechnicalProposal,
  sizeProposal,
  isExecutable,
  executionView,
  type Proposal,
} from '../../../trade/bridge/approval';
import { TrendPullbackConfirmation } from '../../../trade/core/strategy';
import { generateMockCandles, snapshotOf } from '../../../trade/core/providers';
import {
  realContext,
  realReadiness,
  assertReady,
  signCommand,
  nonceHash,
} from '../../../trade/bridge/real';
import {
  paperExecution,
  hypotheticalObservation,
  PaperExecutionProvider,
} from '../../../trade/bridge/paper';
import { instrumentValue } from '../../../trade/bridge/instruments';
import { scannerParameters } from '../../../trade/scanner/strategies';
import { scanMarket } from '../../../trade/scanner/engine';
import { validateCommand } from '../../../trade/bridge/protocol';
import { assessActionability } from '../../../trade/lab/actionability';
import { paperRiskStatus, paperRiskPolicy, riskSnapshot } from '../../../trade/bridge/risk-settings';
const owner = 'focoos-admin'; // Existing admin-session middleware, never client supplied.
/** Opportunity-card lifecycle events the UI may record (journal only; none of them executes anything). */
export const opportunityEvents = [
  'OPPORTUNITY_PRESENTED',
  'OPPORTUNITY_MINIMIZED',
  'OPPORTUNITY_RESTORED',
  'OPPORTUNITY_EXPIRED',
  'OPPORTUNITY_INVALIDATED',
  'ENTER_CLICKED',
  'FINAL_CONFIRMATION_PRESENTED',
  'FINAL_CONFIRMATION_EXPIRED',
  'FINAL_CONFIRMATION_CANCELLED',
] as const;
/** Journal an opportunity event. Best effort: auditing never blocks or alters the operation itself. */
async function journalEvent(env: BridgeEnv, id: string, kind: string, detail: Record<string, unknown> = {}) {
  await rpc(env, 'trade_opportunity_event', { p_owner: owner, p_id: id, p_kind: kind, p_payload: detail }).catch(() => {});
}
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
    strategyId || mode === 'REAL'
      ? scanMarket(snapshot).candidates.find(
          (c) => c.definition.id === (strategyId || strategy.id),
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
  let body: any,
    audit: any = {};
  try {
    body = await request.json();
    const c = config(env);
    if (body.action === 'propose') {
      if (!['PAPER', 'REAL'].includes(body.mode))
        throw new Error('Modo inválido');
      const m = await market(
          env,
          body.source,
          body.cursor,
          body.mode,
          body.strategy,
        ),
        contract = instrumentValue(m.snapshot.symbol, body.mode, m.data?.state);
      audit = {
        strategyId: m.analysis.strategy,
        version: m.analysis.version,
        setupId: m.analysis.setup?.id,
        marketAsOf: m.snapshot.asOf,
        requestedOrder: {
          symbol: m.snapshot.symbol,
          quantity: Number.isFinite(body.quantity) ? body.quantity : null,
          entry: m.analysis.setup?.entry,
          stop: m.analysis.setup?.stop,
          target: m.analysis.setup?.targets[0],
        },
        conditions: m.analysis.conditions,
      };
      const ctx = body.mode === 'REAL' ? await realContext(env) : null,
        auth = ctx?.authorizations?.find(
          (a: any) =>
            a.strategy_id === m.analysis.strategy &&
            a.version === m.analysis.version,
        );
      const inspectionOnly = body.mode === 'REAL' && !realReadiness(ctx, env).canExecute;
      // 1) Technical proposal: levels from the setup only. 2) Risk Engine: quantity/eligibility.
      const technical = buildTechnicalProposal(
        body.mode === 'REAL'
          ? { ...m.analysis, stage: auth?.stage || m.analysis.stage }
          : m.analysis,
        {
          mode: body.mode,
          source: body.source,
          symbol: m.snapshot.symbol,
          cursor: body.source === 'mt5' ? m.snapshot.asOf : body.cursor,
          asOf: m.snapshot.asOf,
          liveAuthorized: auth?.live_authorized === true,
          inspectionOnly,
        },
      );
      // REAL never borrows the PAPER limit: no approved policy limit means RISK_BLOCKED.
      const riskStatus = body.mode === 'REAL' ? null : await paperRiskStatus(env),
        paperPolicy = riskStatus ? paperRiskPolicy(riskStatus) : null;
      const limit = body.mode === 'REAL' ? realRiskLimit(ctx, env) : paperPolicy!;
      const sized = sizeProposal(technical, {
        pointValue: contract.pointValue,
        currency: contract.currency,
        pointValueSource: contract.source,
        maxContracts: paperPolicy ? paperPolicy.maxContracts : c.maxContracts,
        maxRiskBRL: limit.maxRiskBRL,
        maxRiskSource: limit.source,
        requestedQuantity: body.quantity ?? undefined,
      });
      const p = riskStatus ? { ...sized, riskSettings: riskSnapshot(riskStatus) } : sized;
      audit = {
        ...audit,
        proposalState: p.proposalState,
        riskBlock: p.riskBlock,
        requestedOrder: { ...audit.requestedOrder, quantity: p.quantity },
      };
      if (body.mode === 'REAL' && !inspectionOnly && isExecutable(p))
        assertReady(realReadiness(ctx, env, p));
      const saved = await rpc(env, 'trade_propose', {
        p_owner: owner,
        p_bridge: c.bridgeId,
        p_proposal: p,
      });
      if (body.mode === 'REAL' && !isExecutable(p))
        await rpc(env, 'trade_real_audit', {
          p_bridge: c.bridgeId,
          p_payload: {
            ...audit,
            proposalId: p.id,
            action: 'propose',
            status: 'RISK_BLOCKED',
            reason: p.riskBlock?.message || 'Proposta sem quantidade executável.',
            timestamp: new Date().toISOString(),
          },
        }).catch(() => {});
      return Response.json(saved);
    }
    if (body.action === 'event') {
      // Lifecycle of the opportunity card. Server-side: kind allow-list, owner check, timestamp and remaining
      // validity from the stored expiresAt. Never touches state, commands, sessions or the kill switch.
      if (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)) throw new Error('Proposta inválida');
      if (!(opportunityEvents as readonly string[]).includes(body.kind)) throw new Error('Evento inválido');
      const reason = typeof body.reason === 'string' ? body.reason.slice(0, 40) : undefined;
      await journalEvent(env, body.id, body.kind, reason ? { reason } : {});
      return Response.json({ recorded: true });
    }
    if (!['confirm', 'discard', 'prepare-real'].includes(body.action))
      throw new Error('Ação inválida');
    const rows = await rpc(env, 'trade_operations_read', { p_owner: owner }),
      row = rows.find((r: any) => r.id === body.id);
    if (!row) throw new Error('Proposta inexistente');
    const p: Proposal = row.payload;
    if (body.mode && body.mode !== p.mode) throw new Error('Modo/proposta divergente. Gere uma proposta própria para o modo selecionado.');
    if (p.mode === 'REAL') body.mode = 'REAL';
    audit = {
      proposalId: p.id,
      strategyId: p.setup.strategy,
      version: p.setup.version,
      setupId: p.setup.id,
      marketAsOf: p.asOf,
      requestedOrder: {
        symbol: p.symbol,
        direction: p.direction,
        quantity: p.quantity,
        entry: p.entry,
        stop: p.sl,
        target: p.tp,
      },
      riskBRL: p.riskBRL,
      riskPoints: p.riskPoints,
    };
    if (
      ['prepare-real', 'confirm'].includes(body.action) &&
      (row.state === 'BLOQUEADA POR RISCO' || !isExecutable(p))
    )
      throw new Error(
        'RISK_BLOCKED: proposta técnica não executável com o limite atual. Nenhuma ordem foi enviada.',
      );
    if (p.mode === 'REAL' && p.inspectionOnly && ['prepare-real','confirm'].includes(body.action)) {
      const ctx=await realContext(env),readiness=realReadiness(ctx,env,p);
      const snapshot={...audit,inspectionOnly:true,gates:readiness.gates,policy:readiness.limits,feed:{symbol:ctx.bridge?.symbol,receivedAt:ctx.bridge?.receivedAt},strategy:p.setup.strategy,version:p.setup.version};
      if(body.action==='prepare-real'){
        const nonce=crypto.randomUUID()+crypto.randomUUID();
        const prepared=await rpc(env,'trade_inspection_prepare',{p_owner:owner,p_id:p.id,p_hash:await nonceHash(nonce),p_snapshot:snapshot});
        return Response.json({nonce,expiresAt:prepared.expiresAt,proposal:p,inspectionOnly:true,readiness});
      }
      if(body.confirmation!=='CONFIRMAR ORDEM REAL'||typeof body.nonce!=='string'||body.nonce.length>100)throw new Error('Segunda confirmação humana REAL obrigatória');
      const blocked=await rpc(env,'trade_inspection_confirm',{p_owner:owner,p_id:p.id,p_hash:await nonceHash(body.nonce),p_snapshot:snapshot});
      return Response.json({...blocked,gates:readiness.gates},{status:409});
    }
    let command = null;
    if (
      ['confirm', 'prepare-real'].includes(body.action) &&
      row.state === 'AGUARDANDO CONFIRMAÇÃO'
    ) {
      const m = await market(
        env,
        p.source,
        body.cursor,
        p.mode,
        p.setup.strategy,
      );
      if (
        m.analysis.status !== 'complete' ||
        m.analysis.setup?.id !== p.setup.id ||
        m.snapshot.asOf !== p.asOf
      )
        throw new Error('Análise mudou. Descarte e gere uma nova proposta.');
      if (p.mode === 'REAL') {
        const ctx = await realContext(env);
        assertReady(realReadiness(ctx, env, p));
        command = await signCommand(
          {
            ...validateCommand(
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
            ),
            referencePrice: p.entry,
            maxRiskBRL: realRiskCap(env) === null ? ctx.policy.max_risk_brl : Math.min(ctx.policy.max_risk_brl, realRiskCap(env)!),
            maxLossBRL: ctx.policy.max_daily_loss_brl,
            maxSlippagePoints: ctx.policy.max_slippage_points,
            ...(ctx.bridge?.state?.policyProtocol === 1 ? {
              policyVersion: ctx.policy.risk_settings_version,
              policyHash: ctx.policyFingerprint,
              realSessionId: ctx.session?.id,
            } : {}),
          },
          env,
        );
      }
    }
    if (body.action === 'prepare-real') {
      if (p.mode !== 'REAL' || !command)
        throw new Error('Proposta REAL pendente obrigatória');
      const nonce = crypto.randomUUID() + crypto.randomUUID(),
        ctx = await realContext(env);
      const prepared = await rpc(env, 'trade_real_prepare', {
        p_owner: owner,
        p_id: p.id,
        p_hash: await nonceHash(nonce),
        p_command: command,
        p_snapshot: { ...audit, setup: p.setup, feed: ctx.bridge.tick },
        p_max: c.maxContracts,
        p_account: c.accountHash,
        p_age: c.maxAgeMs,
        p_backend: c.execution,
      });
      return Response.json({
        nonce,
        expiresAt: prepared.expiresAt,
        proposal: p,
      });
    }
    if (p.mode === 'REAL' && body.action === 'confirm') {
      if (
        body.confirmation !== 'CONFIRMAR ORDEM REAL' ||
        typeof body.nonce !== 'string' ||
        body.nonce.length > 100
      )
        throw new Error('Segunda confirmação humana REAL obrigatória');
      if (!command) {
        if (row.state !== 'CONFIRMADA' || !row.command?.payload)
          throw new Error('Proposta REAL não confirmável');
        command = row.command.payload;
      }
      return Response.json(
        await new MT5BrokerExecutionProvider(env).approve(p, {
          command,
          nonce: body.nonce,
        }),
      );
    }
    if (p.mode === 'PAPER' && body.action === 'confirm') {
      // Every refusal is recorded (journal + LAB event) with a clear reason; nothing is executed.
      const refuse = async (code: string, message: string): Promise<never> => {
        await rpc(env, 'trade_paper_refusal', { p_owner: owner, p_id: p.id, p_code: code, p_message: message }).catch(() => {});
        throw new Error(`${code}: ${message}`);
      };
      // Price validity on the live quote (feed must be LIVE): a market that moved away is not chased.
      if (p.source === 'mt5') {
        const live = await new MT5MarketDataProvider(env).status(),
          quote = live && feedStatus(live, env).status === 'LIVE' ? live.tick : null,
          act = assessActionability({ direction: p.direction, entry: p.entry, stop: p.sl, target: p.tp, expiresAt: p.expiresAt }, quote ?? null);
        if (act.status !== 'ACTIONABLE')
          await refuse(act.status, `${act.reasons.join(' ') || 'Feed não está LIVE.'} Proposta não aceita; o setup segue acompanhado no LAB.`);
      }
      // Manual quantity: may only REDUCE the risk-sized suggestion (validated and persisted in SQL).
      let chosen: Proposal = p;
      if (body.quantity !== undefined && body.quantity !== null && Number(body.quantity) !== p.quantity) {
        try {
          const updated = await rpc(env, 'trade_paper_quantity', { p_owner: owner, p_id: p.id, p_quantity: Math.trunc(Number(body.quantity)) });
          chosen = updated.payload;
        } catch (e) {
          const m = e instanceof Error ? e.message : '';
          throw new Error(/QUANTITY_/.test(m) ? m : 'QUANTITY_INVALID: quantidade não aceita.');
        }
      }
      // Authoritative PAPER gate (database): risk-settings version unchanged, risk <= 1R, daily loss
      // (gross losses + open risk + this trade) and trade-count limits. Uses the stored proposal only.
      const gate = await rpc(env, 'trade_paper_entry_check', {
        p_owner: owner,
        p_risk_brl: chosen.riskBRL,
        p_settings_version: chosen.riskSettings?.version ?? null,
      });
      if (!gate?.allowed)
        await refuse(
          gate?.code || 'RISK_GATE',
          gate?.code === 'RISK_SETTINGS_CHANGED'
            ? 'Sua gestão de risco mudou desde que esta proposta foi criada. A proposta precisa ser recalculada; se o setup continuar válido, uma nova proposta aparece automaticamente.'
            : gate?.code === 'RISK_SETTINGS_MISSING'
              ? 'Gestão de risco não configurada. Configure capital, regra de 1R e limites antes de operar PAPER.'
              : gate?.message || 'Entrada PAPER bloqueada pela gestão de risco.',
        );
      if (chosen.quantity > Number(gate.settings?.maxContracts))
        await refuse('RISK_MAX_CONTRACTS', 'Quantidade acima do máximo de contratos configurado.');
      return Response.json(await new PaperExecutionProvider(env).approve(chosen));
    }
    const closed = await rpc(env, 'trade_confirm', {
      p_owner: owner,
      p_id: p.id,
      p_action: body.action,
      p_command: null,
      p_max: c.maxContracts,
      p_account: c.accountHash,
      p_max_age: c.maxAgeMs,
    });
    // Explicit operator decision (not a LOSS): the journal already holds the DESCARTADA snapshot.
    if (body.action === 'discard' && closed?.state === 'DESCARTADA') await journalEvent(env, p.id, 'DISCARDED_BY_OPERATOR');
    return Response.json(closed);
  } catch (e) {
    if (
      body?.mode === 'REAL' ||
      body?.action === 'prepare-real' ||
      body?.confirmation
    )
      await rpc(env, 'trade_real_audit', {
        p_bridge: config(env).bridgeId,
        p_payload: {
          ...audit,
          proposalId:
            audit.proposalId ||
            (typeof body.id === 'string' ? body.id.slice(0, 36) : null),
          action: String(body.action).slice(0, 30),
          status: 'BLOCKED',
          reason: e instanceof PersistenceError ? e.code : e instanceof Error ? e.message.slice(0,500) : 'Operação bloqueada',
          timestamp: new Date().toISOString(),
        },
      }).catch(() => {});
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
        row.state === 'BLOQUEADA POR RISCO' &&
        row.payload.source === source &&
        !row.hypothetical_execution?.exitTime
      ) {
        // Study only: no quantity, no money, no provider. Outcome in R, MFE/MAE and duration.
        const hypothetical = hypotheticalObservation(
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
        continue;
      }
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
          data?.state?.orders || [],
        );
      else if (p.source === source) {
        execution =
          new PaperExecutionProvider(env).observe(p, candles, row.execution) ||
          row.execution;
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
    // Price validity of each pending live proposal, decided by the server on the LIVE quote only
    // (WAITING/ACTIONABLE/MISSED/INVALIDATED/EXPIRED/NO_QUOTE). The UI never offers ENTRAR otherwise.
    const liveQuote = data && feedStatus(data, env).status === 'LIVE' ? data.tick : null;
    // Risk-blocked technical proposals too: blocked by the PAPER 1R may still fit the REAL limit (REAL
    // re-sizes server-side on ENTRAR REAL); their live price validity must be just as current.
    for (const row of rows as any[])
      if ((row.state === 'AGUARDANDO CONFIRMAÇÃO' || row.state === 'BLOQUEADA POR RISCO') && row.payload?.source === 'mt5')
        row.actionability = assessActionability(
          { direction: row.payload.direction, entry: row.payload.entry, stop: row.payload.sl, target: row.payload.tp, expiresAt: row.payload.expiresAt },
          liveQuote ?? null,
        );
    return Response.json(rows);
  } catch (e) {
    return Response.json(persistenceFailure(e), { status: 503 });
  }
}
