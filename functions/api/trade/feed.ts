import { type BridgeEnv } from '../../../trade/bridge/config';
import { MT5BrokerExecutionProvider } from '../../../trade/bridge/mt5';
export async function onRequestGet({ env }: { env: BridgeEnv }) {
  try {
    return Response.json(await new MT5BrokerExecutionProvider(env).state());
  } catch {
    return Response.json(
      {
        feed: {
          source: 'XP / MetaTrader 5',
          status: 'OFFLINE',
          lastTick: null,
        },
        error: 'Configure a persistência e conecte o EA',
      },
      { status: 503 },
    );
  }
}
