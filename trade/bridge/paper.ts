import type { Candle } from '../core/types';
import type { Proposal } from './approval';
/** Causal execution model: market at next finalized bar open, adverse barrier wins. */
export function paperExecution(p: Proposal, candles: Candle[]) {
  const next = candles.filter(
    (bar: Candle) => bar.symbol === p.symbol && bar.timestamp >= p.asOf,
  );
  const first = next[0];
  if (first) {
    const sign = p.direction === 'BUY' ? 1 : -1;
    let exit: number | null = null,
      exitTime: number | null = null;
    for (const bar of next) {
      const stop = sign === 1 ? bar.low <= p.sl : bar.high >= p.sl,
        target = sign === 1 ? bar.high >= p.tp : bar.low <= p.tp;
      if (stop || target) {
        exit = stop
          ? sign === 1
            ? Math.min(p.sl, bar.open)
            : Math.max(p.sl, bar.open)
          : p.tp;
        exitTime = bar.timestamp;
        break;
      }
    }
    const current = next[next.length - 1].close,
      entry = first.open;
    return {
      status: 'EXECUTADA',
      filled: p.quantity,
      entry,
      position:
        exit === null
          ? {
              price: entry,
              current,
              profit: (current - entry) * sign * p.pointValue * p.quantity,
              sl: p.sl,
              tp: p.tp,
              volume: p.quantity,
            }
          : null,
      exit,
      exitTime,
      resultBRL:
        exit === null
          ? null
          : (exit - entry) * sign * p.pointValue * p.quantity,
      resultR: exit === null ? null : ((exit - entry) * sign) / p.riskPoints,
      simulated: true,
    };
  }
  return null;
}
