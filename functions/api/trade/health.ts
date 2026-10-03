import {
  config,
  rpc,
  runtimeConfiguration,
  persistenceFailure,
  type BridgeEnv,
} from '../../../trade/bridge/config';
import { feedStatus } from '../../../trade/bridge/mt5';
/** Admin-session middleware protects this endpoint. No token, account or key output. */
export async function onRequestGet({ env }: { env: BridgeEnv }) {
  const runtime = runtimeConfiguration(env);
  try {
    const bridge = await rpc(env, 'trade_bridge_read', {
      p_bridge: config(env).bridgeId,
    });
    const rows = await rpc(env, 'trade_operations_read', {
      p_owner: 'focoos-admin',
    });
    const feed = feedStatus(bridge, env);
    return Response.json({
      runtime,
      persistence: 'AVAILABLE',
      operations: 'AVAILABLE',
      paperAvailable: true,
      bridge: {
        id: config(env).bridgeId,
        symbol: feed.symbol,
        receivedAt: feed.receivedAt,
        status: feed.status,
        killSwitch: feed.killSwitch,
        eaExecutionEnabled: !!bridge?.state?.executionAllowed,
      },
      realExecutionEnabled: feed.executionEnabled,
      operationsCount: rows.length,
    });
  } catch (e) {
    return Response.json(
      { runtime, persistence: 'UNAVAILABLE', ...persistenceFailure(e) },
      { status: 503 },
    );
  }
}
