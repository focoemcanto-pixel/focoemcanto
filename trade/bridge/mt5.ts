import type { ExecutionApprovalProvider } from './approval';
import type { MarketDataProvider } from '../core/providers';
import { aggregateCandles } from '../core/providers';
import type { Candle, Timeframe } from '../core/types';
import { config, rpc, type BridgeEnv } from './config';
import {
  validateCommand,
  type BrokerCommand,
  type BrokerExecutionProvider,
} from './protocol';
/** Gap detection reports missing M1 intervals; session breaks are not filled with invented candles. */
export function candleQuality(candles:any[],symbol:string){
 let duplicates=0,outOfOrder=0,gaps=0;const seen=new Set<number>();let previous:number|undefined;
 for(const c of candles){if(c.symbol!==symbol)continue;if(seen.has(c.timestamp))duplicates++;seen.add(c.timestamp);if(previous!==undefined){if(c.timestamp<previous)outOfOrder++;else if(c.timestamp-previous>60)gaps++;}previous=c.timestamp;}
 return {timezone:'UTC',displayTimezone:'America/Sao_Paulo',timeframe:'1m',candles:seen.size,duplicates,outOfOrder,gaps,gapsRequireSessionReview:true};
}
export function feedStatus(data: any, env: BridgeEnv, now = Date.now()) {
  const c = config(env),
    lastTick = data?.tick || null;
  const receivedAge = data?.receivedAt
    ? Math.max(0, now - Date.parse(data.receivedAt))
    : null;
  const ageMs = lastTick ? now - lastTick.timeMsc : null;
  const producerOffset = data?.state?.marketClock?.utcOffsetSeconds;
  const configuredOffset = lastTick?.rawTimeMsc !== undefined ? (lastTick.rawTimeMsc-lastTick.timeMsc)/1000 : 0;
  const clockMatches = producerOffset === undefined || (Number.isInteger(producerOffset) && Math.abs(producerOffset-configuredOffset)<=2);
  const live =
    clockMatches &&
    lastTick?.symbol === c.symbol &&
    !!data?.state?.connected &&
    ageMs !== null &&
    ageMs >= -2000 &&
    ageMs <= c.maxAgeMs &&
    receivedAge !== null &&
    Number.isFinite(receivedAge) &&
    now - Date.parse(data.receivedAt) >= -2000 &&
    receivedAge <= c.maxAgeMs;
  return {
    source: 'XP / MetaTrader 5',
    symbol: c.symbol,
    status: live ? 'LIVE' : clockMatches && lastTick?.symbol === c.symbol && data?.state?.connected === true && receivedAge !== null && Number.isFinite(receivedAge) && receivedAge <= c.maxAgeMs ? 'STALE' : 'OFFLINE',
    quality:candleQuality(data?.candles||[],c.symbol),
    maxAgeMs: c.maxAgeMs,
    ageMs,
    clock: {...(data?.marketClock || {sourceTimezone:'UTC'}), verifiedProducerOffset:producerOffset ?? null, configuredOffsetSeconds:configuredOffset, matches:clockMatches},
    clockDiagnostics: {...data?.clockDiagnostics, serverEpochMs:now, tickEpochMs:lastTick?.timeMsc ?? null, tickIso:lastTick ? new Date(lastTick.timeMsc).toISOString() : null, differenceMs:ageMs},
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
export class MT5BrokerExecutionProvider implements BrokerExecutionProvider, ExecutionApprovalProvider {
  constructor(private env: BridgeEnv) {}
  async state() {
    const data = await new MT5MarketDataProvider(this.env).read();
    return {
      feed: feedStatus(data, this.env),
      state: data.state,
      commands: data.commands,
    };
  }
  async confirm(proposalId: string, value: BrokerCommand) {
    const command = validateCommand(value, this.env),
      c = config(this.env);
    if (command.id !== proposalId) throw new Error('Command mismatch');
    return rpc(this.env, 'trade_confirm', {
      p_owner: 'focoos-admin',
      p_id: proposalId,
      p_action: 'confirm',
      p_command: command,
      p_max: c.maxContracts,
      p_account: c.accountHash,
      p_max_age: c.maxAgeMs,
    });
  }
  async approve(
    p: import('./approval').Proposal,
    intent?: { command: BrokerCommand; nonce: string },
  ) {
    const c = config(this.env);
    if (
      p.mode !== 'REAL' ||
      !intent ||
      intent.command.id !== p.id ||
      !c.execution
    )
      throw new Error('Execução real bloqueada');
    return rpc(this.env, 'trade_real_confirm', {
      p_owner: 'focoos-admin',
      p_id: p.id,
      p_nonce: intent.nonce,
      p_command: intent.command,
      p_max: c.maxContracts,
      p_account: c.accountHash,
      p_age: c.maxAgeMs,
      p_backend: c.execution,
    });
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
