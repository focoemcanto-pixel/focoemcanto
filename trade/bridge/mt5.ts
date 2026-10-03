import type { MarketDataProvider } from '../core/providers';
import { aggregateCandles } from '../core/providers';
import type { Candle, Timeframe } from '../core/types';
import { config, rpc, type BridgeEnv } from './config';
import {
  validateCommand,
  type BrokerCommand,
  type BrokerExecutionProvider,
} from './protocol';
export function feedStatus(data: any, env: BridgeEnv, now = Date.now()) {
  const c = config(env),
    lastTick = data?.tick || null;
  const receivedAge = data?.receivedAt
    ? Math.max(0, now - Date.parse(data.receivedAt))
    : null;
  const ageMs = lastTick ? now - lastTick.timeMsc : null;
  const live =
    !!data?.state?.connected &&
    ageMs !== null &&
    ageMs >= -2000 &&
    ageMs <= c.maxAgeMs &&
    receivedAge !== null &&
    receivedAge <= c.maxAgeMs;
  return {
    source: 'XP / MetaTrader 5',
    symbol: c.symbol,
    status: live ? 'LIVE' : 'OFFLINE',
    maxAgeMs: c.maxAgeMs,
    ageMs,
    receivedAgeMs: receivedAge,
    receivedAt: data?.receivedAt || null,
    lastTick,
    positionsCount: data?.state?.positions?.length || 0,
    ordersCount: data?.state?.orders?.length || 0,
    executionEnabled:
      c.execution && !!data?.state?.executionAllowed && !data?.killSwitch,
    killSwitch: data?.killSwitch ?? true,
  };
}
export class MT5MarketDataProvider implements MarketDataProvider {
  readonly source = 'live' as const;
  constructor(private env: BridgeEnv) {}
  async read() {
    return rpc(this.env, 'trade_bridge_read', {
      p_bridge: config(this.env).bridgeId,
    });
  }
  async history(
    symbol: string,
    timeframe: Timeframe,
    asOf: number,
  ): Promise<Candle[]> {
    if (symbol !== config(this.env).symbol)
      throw new Error('Símbolo não autorizado');
    const data = await this.read();
    return aggregateCandles(data.candles || [], timeframe, asOf);
  }
}
export class MT5BrokerExecutionProvider implements BrokerExecutionProvider {
  constructor(private env: BridgeEnv) {}
  async state() {
    const data = await new MT5MarketDataProvider(this.env).read();
    return {
      feed: feedStatus(data, this.env),
      state: data.state,
      commands: data.commands,
    };
  }
  async submit(value: BrokerCommand) {
    const command = validateCommand(value, this.env),
      c = config(this.env);
    return rpc(this.env, 'trade_bridge_enqueue', {
      p_bridge: c.bridgeId,
      p_command: command,
      p_max: c.maxContracts,
      p_account: c.accountHash,
      p_max_age: c.maxAgeMs,
    });
  }
}
