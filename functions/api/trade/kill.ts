import { config, rpc, type BridgeEnv } from '../../../trade/bridge/config';
export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: BridgeEnv;
}) {
  try {
    const body: any = await request.json();
    if (typeof body.enabled !== 'boolean')
      throw new Error('enabled obrigatório');
    if (!body.enabled && (!config(env).execution || !config(env).accountHash))
      throw new Error('Execução não configurada');
    return Response.json(
      await rpc(env, 'trade_bridge_kill', {
        p_bridge: config(env).bridgeId,
        p_enabled: body.enabled,
      }),
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Bloqueado' },
      { status: 409 },
    );
  }
}
