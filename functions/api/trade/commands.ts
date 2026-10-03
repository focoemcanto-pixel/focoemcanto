import { type BridgeEnv } from '../../../trade/bridge/config';
import { MT5BrokerExecutionProvider } from '../../../trade/bridge/mt5';
export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: BridgeEnv;
}) {
  try {
    return Response.json(
      await new MT5BrokerExecutionProvider(env).submit(await request.json()),
      { status: 202 },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Comando bloqueado' },
      { status: 409 },
    );
  }
}
