import {
  authenticateBridge,
  config,
  rpc,
  runtimeConfiguration,
  type BridgeEnv,
} from '../../../../trade/bridge/config';
import { validateBatch, commandWire } from '../../../../trade/bridge/protocol';
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
}: {
  request: Request;
  env: BridgeEnv;
}) {
  if (!(await authenticateBridge(request, env)))
    return Response.json({ error: 'Bridge não autorizado' }, { status: 401 });
  try {
    if (
      request.headers.get('Content-Type')?.split(';')[0] !== 'application/json'
    )
      throw new Error('JSON obrigatório');
    const raw = await request.text();
    if (raw.length > 1000000) throw new Error('Lote excede limite');
    const batch = validateBatch(JSON.parse(raw), env),
      c = config(env);
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
        verifiedAt: new Date().toISOString(),
      },
    };
    const result = await rpc(env, 'trade_bridge_exchange', {
      p_batch: batch,
      p_execution: c.execution && !!c.accountHash,
      p_max: c.maxContracts,
      p_account: c.accountHash,
      p_max_age: c.maxAgeMs,
    });
    return new Response(commandWire(result.command), {
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Bridge indisponível' },
      { status: 400 },
    );
  }
}
