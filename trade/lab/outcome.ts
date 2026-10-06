/**
 * Objective outcome of a setup after confirmation, whether or not it was traded.
 * Causal: only bars that opened at/after the confirmation instant are used, in order.
 * When stop and target are both inside one bar and no finer data proves the order: AMBIGUOUS.
 */
export const outcomeParameters = Object.freeze({
  version: 'outcome-v2',
  /** Bars followed after confirmation before declaring EXPIRED (M1 bars). */
  horizonBars: 240,
  /**
   * Day trade: tracking never crosses the B3 session (v2; v1 could continue on the next day's bars).
   * Bars at/after this BRT time, or from a later date, end the session: a setup still open is EXPIRED
   * (SESSION_END) and marked at the last close of its own session. Brazil has no DST (fixed −03:00).
   */
  sessionCloseBRT: '18:30',
  /** With no newer bar, the session is also over this long after sessionCloseBRT (server clock). */
  sessionCloseGraceSeconds: 900,
});
const brtOffset = 3 * 3600;
/** UTC epoch seconds of the session close (BRT) of the trading date containing `epochSeconds`. */
export function sessionCloseOf(epochSeconds: number, p = outcomeParameters) {
  const [h, m] = p.sessionCloseBRT.split(':').map(Number),
    day = Math.floor((epochSeconds - brtOffset) / 86400);
  return day * 86400 + brtOffset + h * 3600 + m * 60;
}
export type OutcomeStatus = 'OPEN' | 'TARGET_FIRST' | 'STOP_FIRST' | 'AMBIGUOUS' | 'EXPIRED';
export type Outcome = {
  status: OutcomeStatus;
  version: string;
  entry: number;
  barsTracked: number;
  lastBarTimestamp: number | null;
  exitPrice: number | null;
  exitTimestamp: number | null;
  resultPoints: number | null;
  resultR: number | null;
  mfePoints: number;
  maePoints: number;
  mfeR: number;
  maeR: number;
  minutesToTarget: number | null;
  minutesToStop: number | null;
  resolvedBy: 'BARS' | 'TICKS' | null;
  /** Why an EXPIRED outcome ended without touching stop or target. */
  expiredBy?: 'HORIZON' | 'SESSION_END' | null;
};
type Bar = { timestamp: number; open: number; high: number; low: number; close: number };
/** Optional finer resolution for a bar that touched both levels: returns which was hit first. */
export type BarResolver = (bar: Bar) => 'STOP' | 'TARGET' | null;

export function trackOutcome(
  setup: { direction: 'long' | 'short'; entry: number; stop: number; target: number; asOf: number },
  bars: Bar[],
  resolve?: BarResolver,
  p = outcomeParameters,
  /** B3 session rule (LIVE market data only; synthetic replay clocks have no trading session). */
  session?: { nowSeconds: number },
): Outcome {
  const sign = setup.direction === 'long' ? 1 : -1,
    risk = sign * (setup.entry - setup.stop),
    close = session ? sessionCloseOf(setup.asOf - 60, p) : Infinity,
    after = bars.filter((b) => b.timestamp >= setup.asOf && b.timestamp < close).sort((a, b) => a.timestamp - b.timestamp),
    sessionOver = !!session && (bars.some((b) => b.timestamp >= close) || session.nowSeconds >= close + p.sessionCloseGraceSeconds);
  let mfe = 0,
    mae = 0,
    tracked = 0;
  const base = (status: OutcomeStatus, extra: Partial<Outcome> = {}): Outcome => ({
    status,
    version: p.version,
    entry: setup.entry,
    barsTracked: tracked,
    lastBarTimestamp: after[tracked - 1]?.timestamp ?? null,
    exitPrice: null,
    exitTimestamp: null,
    resultPoints: null,
    resultR: null,
    mfePoints: mfe,
    maePoints: mae,
    mfeR: risk > 0 ? mfe / risk : 0,
    maeR: risk > 0 ? mae / risk : 0,
    minutesToTarget: null,
    minutesToStop: null,
    resolvedBy: null,
    ...extra,
  });
  if (!(risk > 0) || sign * (setup.target - setup.entry) <= 0) return base('AMBIGUOUS');
  for (const bar of after) {
    if (tracked >= p.horizonBars) break;
    tracked++;
    const favorable = sign === 1 ? bar.high - setup.entry : setup.entry - bar.low,
      adverse = sign === 1 ? setup.entry - bar.low : bar.high - setup.entry,
      stopHit = sign === 1 ? bar.low <= setup.stop : bar.high >= setup.stop,
      targetHit = sign === 1 ? bar.high >= setup.target : bar.low <= setup.target,
      minutes = (bar.timestamp - setup.asOf) / 60 + 1;
    let first: 'STOP' | 'TARGET' | null = stopHit && targetHit ? null : stopHit ? 'STOP' : targetHit ? 'TARGET' : null,
      by: Outcome['resolvedBy'] = 'BARS';
    if (stopHit && targetHit) {
      // A gap through a level at the open settles the order objectively.
      const openStop = sign === 1 ? bar.open <= setup.stop : bar.open >= setup.stop,
        openTarget = sign === 1 ? bar.open >= setup.target : bar.open <= setup.target;
      first = openStop ? 'STOP' : openTarget ? 'TARGET' : resolve?.(bar) ?? null;
      by = openStop || openTarget ? 'BARS' : first ? 'TICKS' : null;
      if (!first) {
        mfe = Math.max(mfe, favorable);
        mae = Math.max(mae, adverse);
        return base('AMBIGUOUS', { exitTimestamp: bar.timestamp });
      }
    }
    if (first === 'STOP') {
      const exit = sign === 1 ? Math.min(setup.stop, bar.open) : Math.max(setup.stop, bar.open);
      mae = Math.max(mae, sign * (setup.entry - exit));
      // The favorable side of the stop bar is not credited: intrabar order is unknown.
      return base('STOP_FIRST', { exitPrice: exit, exitTimestamp: bar.timestamp, resultPoints: sign * (exit - setup.entry), resultR: (sign * (exit - setup.entry)) / risk, minutesToStop: minutes, resolvedBy: by });
    }
    if (first === 'TARGET') {
      const exit = sign === 1 ? Math.max(setup.target, bar.open) : Math.min(setup.target, bar.open);
      mfe = Math.max(mfe, sign * (exit - setup.entry));
      mae = Math.max(mae, Math.min(adverse, risk));
      return base('TARGET_FIRST', { exitPrice: setup.target, exitTimestamp: bar.timestamp, resultPoints: sign * (setup.target - setup.entry), resultR: (sign * (setup.target - setup.entry)) / risk, minutesToTarget: minutes, resolvedBy: by });
    }
    mfe = Math.max(mfe, favorable);
    mae = Math.max(mae, adverse);
  }
  if (tracked >= p.horizonBars) {
    const last = after[tracked - 1];
    return base('EXPIRED', { exitPrice: last.close, exitTimestamp: last.timestamp, resultPoints: sign * (last.close - setup.entry), resultR: (sign * (last.close - setup.entry)) / risk, expiredBy: 'HORIZON' });
  }
  if (sessionOver) {
    const last = after[tracked - 1];
    return last
      ? base('EXPIRED', { exitPrice: last.close, exitTimestamp: last.timestamp, resultPoints: sign * (last.close - setup.entry), resultR: (sign * (last.close - setup.entry)) / risk, expiredBy: 'SESSION_END' })
      : base('EXPIRED', { expiredBy: 'SESSION_END' });
  }
  return base('OPEN');
}

/** Tick-based order for a bar touching both levels; null when ticks don't cover the bar. */
export function resolveWithTicks(
  ticks: { timeMsc: number; last?: number; bid?: number; ask?: number }[],
  setup: { direction: 'long' | 'short'; stop: number; target: number },
): 'STOP' | 'TARGET' | null {
  const sign = setup.direction === 'long' ? 1 : -1;
  for (const t of [...ticks].sort((a, b) => a.timeMsc - b.timeMsc)) {
    const price = t.last && t.last > 0 ? t.last : sign === 1 ? t.bid : t.ask;
    if (typeof price !== 'number' || !(price > 0)) continue;
    if (sign * (price - setup.stop) <= 0) return 'STOP';
    if (sign * (price - setup.target) >= 0) return 'TARGET';
  }
  return null;
}
