import { feedStatus, MT5MarketDataProvider } from '../../../../trade/bridge/mt5';
import {
  exchangeDiagnostic,
  type ExchangeStage,
} from '../../../../trade/bridge/diagnostics';
import {
  authenticateBridge,
  config,
  rpc,
  runtimeConfiguration,
  type BridgeEnv,
} from '../../../../trade/bridge/config';
import { validateBatch, commandWire } from '../../../../trade/bridge/protocol';
import { runScanner } from '../../../../trade/scanner/service';
import { onRequestGet as observePaper } from '../operations';
let lastBackgroundAt = 0;
let acceptedLoggedAt = 0;
const rejectionLoggedAt = new Map<string, number>();
// This cache is diagnostics only; market data is always persisted by the exchange RPC.
let operationsProbe:
  | { origin: string; checkedAt: number; available: boolean; code?: string }
  | undefined;
async function probeOperations(env: BridgeEnv) {
  const origin = env.TRADE_SUPABASE_URL || '';
  if (
    operationsProbe?.origin === origin &&
    Date.now() - operationsProbe.checkedAt < 30000
  )
    return operationsProbe;
  try {
    const rows = await rpc(env, 'trade_operations_read', {
      p_owner: 'focoos-admin',
    });
    operationsProbe = {
      origin,
      checkedAt: Date.now(),
      available: Array.isArray(rows),
    };
  } catch {
    operationsProbe = {
      origin,
      checkedAt: Date.now(),
      available: false,
      code: 'OPERATIONS_RPC_UNAVAILABLE',
    };
  }
  return operationsProbe;
}
export async function onRequestPost({
  request,
  env,
  waitUntil,
}: {
  request: Request;
  env: BridgeEnv;
  waitUntil?: (task: Promise<unknown>) => void;
}) {
  if (!(await authenticateBridge(request, env)))
    return Response.json(
      {
        error: 'Bridge não autorizado',
        errorCode: 'BRIDGE_UNAUTHORIZED',
        stage: 'authenticate',
      },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  let stage: ExchangeStage = 'parse',
    value: any;
  try {
    if (
      request.headers.get('Content-Type')?.split(';')[0] !== 'application/json'
    )
      throw new Error('JSON obrigatório');
    const raw = await request.text();
    if (raw.length > 1000000) throw new Error('Lote excede limite');
    value = JSON.parse(raw);
    stage = 'config';
    const c = config(env);
    stage = 'validateBatch';
    const batch = validateBatch(value, env);
    stage = 'probeOperations';
    const operationsStatus = await probeOperations(env);
    batch.state = {
      ...batch.state,
      backendDiagnostics: {
        ...runtimeConfiguration(env),
        role: 'service_role-required',
        operationsRpcAvailable: operationsStatus.available,
        operationsRpcCheckedAt: new Date(
          operationsStatus.checkedAt,
        ).toISOString(),
        transport: 'supabase-rpc',
        // Booleans only: whether TRADE_ACCOUNT_HASH exists and equals this EA's fingerprint. Never the value.
        accountHashConfigured: /^[a-f0-9]{64}$/.test(c.accountHash),
        accountHashMatchesBatch: /^[a-f0-9]{64}$/.test(c.accountHash) && c.accountHash === batch.accountHash,
        verifiedAt: new Date().toISOString(),
      },
    };
    stage =
      batch.state.protocolVersion === 2
        ? 'trade_bridge_exchange_v2'
        : 'trade_bridge_exchange';
    const result = await rpc(
      env,
      batch.state.protocolVersion === 2
        ? 'trade_bridge_exchange_v2'
        : 'trade_bridge_exchange',
      {
        p_batch: batch,
        p_execution:
          batch.state.protocolVersion === 2 && c.execution && !!c.accountHash,
        p_max: c.maxContracts,
        p_account: c.accountHash,
        p_max_age: c.maxAgeMs,
      },
    );
    if (waitUntil && Date.now() - lastBackgroundAt >= 10000) {
      lastBackgroundAt = Date.now();
      waitUntil(
        (async () => {
          try {
            await runScanner(env, 'mt5', 0);
            await observePaper({
              env,
              request: new Request(
                'https://internal/api/trade/operations?source=mt5',
              ),
            });
          } catch {
            /* feed ACK remains independent; scanner health/UI exposes failures */
          }
        })(),
      );
    }
    stage = 'commandWire';
    // Defense in depth: a disarmed backend never puts a command on the wire.
    const wire = commandWire(c.execution ? result.command : null);
    if (waitUntil && Date.now() - acceptedLoggedAt >= 30000) {
      acceptedLoggedAt = Date.now();
      const receipt = {
        kind: 'TRANSPORT_ACCEPTED',
        httpStatus: 200,
        stage: 'commandWire',
        bridgeId: batch.bridgeId,
        symbol: batch.symbol,
        protocolVersion: batch.state.protocolVersion ?? 1,
        sessionTag: batch.session.slice(0,12),
        clientAckStatus: Number.isInteger(batch.state.lastExchangeHttpStatus) ? batch.state.lastExchangeHttpStatus : null,
        clientAckAt: Number.isSafeInteger(batch.state.lastExchangeAckAt) ? batch.state.lastExchangeAckAt : null,
        batch: batch.batch,
        ticks: batch.ticks.length,
        candles: batch.candles.length,
        events: batch.events.length,
        responsePrefix: 'OK',
        commandCount: wire.split('\n').filter((line) => line.startsWith('CMD'))
          .length,
        executionEnabled: c.execution,
        timestamp: new Date().toISOString(),
      };
      console.info('trade_bridge_transport', JSON.stringify(receipt));
      waitUntil(
        rpc(env, 'trade_real_audit', {
          p_bridge: c.bridgeId,
          p_payload: receipt,
        }).catch(() => {}),
      );
      waitUntil((async()=>{
        try {
          const persisted=await new MT5MarketDataProvider(env).status();
          const feed=feedStatus(persisted,env);
          const proof={kind:'FEED_CLOCK_VERIFIED',bridgeId:c.bridgeId,symbol:c.symbol,status:feed.status,ageMs:feed.ageMs,receivedAgeMs:feed.receivedAgeMs,clock:feed.clock,clockDiagnostics:feed.clockDiagnostics,executionEnabled:c.execution,killSwitch:feed.killSwitch,timestamp:new Date().toISOString()};
          console.info('trade_bridge_feed',JSON.stringify(proof));
          await rpc(env,'trade_real_audit',{p_bridge:c.bridgeId,p_payload:proof});
        } catch { /* Diagnostic sampling cannot affect the durable ACK. */ }
      })());
    }
    return new Response(wire, {
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    const diagnostic = exchangeDiagnostic(stage, e, value, env);
    console.error('trade_bridge_transport', JSON.stringify(diagnostic));
    const key = [
      diagnostic.stage,
      diagnostic.errorCode,
      diagnostic.bridgeId,
      diagnostic.symbol,
      diagnostic.batch,
    ].join(':');
    if (Date.now() - (rejectionLoggedAt.get(key) || 0) >= 30000) {
      if (rejectionLoggedAt.size > 100) rejectionLoggedAt.clear();
      rejectionLoggedAt.set(key, Date.now());
      const audit = rpc(env, 'trade_real_audit', {
        p_bridge: diagnostic.bridgeId || 'transport',
        p_payload: {
          kind: 'TRANSPORT_REJECTED',
          ...diagnostic,
          timestamp: new Date().toISOString(),
        },
      }).catch(() => {});
      if (waitUntil) waitUntil(audit);
      else await audit;
    }
    return Response.json(diagnostic, {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
