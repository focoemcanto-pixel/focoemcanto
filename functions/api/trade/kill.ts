import { config, rpc, type BridgeEnv } from '../../../trade/bridge/config';
/**
 * BLOQUEAR EXECUÇÃO: always available, needs no execution configuration. Turns the kill switch on,
 * disarms the REAL session and cancels queued commands. It does not close open positions nor
 * cancel orders already delivered to the broker. Releasing only happens by arming a REAL session.
 */
export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: BridgeEnv;
}) {
  try {
    const body: any = await request.json();
    if (body.enabled !== true)
      throw new Error(
        'O kill switch só é liberado ao ARMAR SESSÃO REAL, com checklist e confirmação.',
      );
    return Response.json(
      await rpc(env, 'trade_bridge_kill', {
        p_bridge: config(env).bridgeId,
        p_enabled: true,
      }),
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Bloqueado' },
      { status: 409 },
    );
  }
}
