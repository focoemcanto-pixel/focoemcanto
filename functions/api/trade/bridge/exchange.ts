import {
  authenticateBridge,
  config,
  rpc,
  runtimeConfiguration,
  type BridgeEnv,
} from '../../../../trade/bridge/config';
import { validateBatch, commandWire } from '../../../../trade/bridge/protocol';
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
    batch.state = {
      ...batch.state,
      backendDiagnostics: {
        ...runtimeConfiguration(env),
        role: 'service_role-required',
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
