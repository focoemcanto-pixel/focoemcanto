import {
  rpc,
  persistenceFailure,
  type BridgeEnv,
} from '../../../trade/bridge/config';
export async function onRequestGet({ env }: { env: BridgeEnv }) {
  try {
    return Response.json(
      await rpc(env, 'trade_strategy_metrics', { p_owner: 'focoos-admin' }),
    );
  } catch (e) {
    return Response.json(persistenceFailure(e), { status: 503 });
  }
}
