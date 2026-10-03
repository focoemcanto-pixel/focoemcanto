import type { Candle } from '../core/types';
import type { Proposal } from './approval';
/** Causal execution model: market at next finalized bar open, adverse barrier wins. */
export function paperExecution(p: Proposal, candles: Candle[], previous?: any) {
  const next = candles.filter(
    (bar: Candle) => bar.symbol === p.symbol && bar.timestamp >= p.asOf,
  );
  if (previous?.exitTime) return previous;
  const first = next[0];
  if (first) {
    const sign = p.direction === 'BUY' ? 1 : -1;
    const entry = previous?.entry ?? first.open,
      openedAt = previous?.openedAt ?? first.timestamp;
    if (
      !previous?.entry &&
      (sign * (entry - p.sl) <= 0 || sign * (p.tp - entry) <= 0)
    )
      return {
        status: 'CANCELADA',
        filled: 0,
        entry: null,
        position: null,
        exit: null,
        exitTime: first.timestamp,
        exitReason: 'ENTRY_GAP_INVALIDATED',
        resultR: null,
        resultBRL: null,
        resultPoints: null,
        simulated: true,
      };
    let exit: number | null = null,
      exitTime: number | null = null;
    for (const bar of next.filter(
      (c) =>
        !previous?.lastBarTimestamp || c.timestamp > previous.lastBarTimestamp,
    )) {
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
    const current = next[next.length - 1].close;
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
      resultR:
        exit === null ? null : ((exit - entry) * sign) / Math.abs(entry - p.sl),
      resultPoints: exit === null ? null : (exit - entry) * sign,
      exitReason:
        exit === null
          ? null
          : (sign === 1 ? exit <= p.sl : exit >= p.sl)
            ? 'STOP'
            : 'TARGET',
      openedAt,
      closedAt: exitTime,
      durationMinutes: exitTime === null ? null : (exitTime - openedAt) / 60,
      lastBarTimestamp: next[next.length - 1].timestamp,
      simulated: true,
    };
  }
  return null;
}
