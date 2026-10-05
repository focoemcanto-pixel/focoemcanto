import type { ScannerResult, SetupWatch } from '../scanner/types';
/** Origin of a setup observation; statistics are never mixed across these without labelling. */
export type ObservationSource = 'LIVE' | 'REPLAY' | 'BACKTEST';
export const setupSnapshotSchema = 'setup-snapshot-v1';
/**
 * One observation per confirmed watch: the watch is the dedup unit (a persisting setup keeps its
 * watch across polls/bars; a new opportunity opens a new watch). Deterministic id.
 */
export function observationId(scope: string, watchId: string) {
  return `obs:${scope}:${watchId}`;
}
const brt = (epochSeconds: number) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(epochSeconds * 1000))
      .map((p) => [p.type, p.value]),
  );
  return { hour: Number(parts.hour), minute: Number(parts.minute), weekday: parts.weekday as string };
};
/**
 * Analytic participation, proven at the confirmation candle only (no look-ahead): another strategy
 * of the same dedup group (same rule that merges opportunities: same state, direction and levels
 * within tolerance) that is itself CONFIRMED on this very candle with all of its own conditions met.
 * A strategy that was merely forming, or confirms later, never receives this outcome. The definition
 * travels only so the database can hash it; it is stripped before storage.
 */
export function participantEvidence(watch: SetupWatch, scan: ScannerResult) {
  const primary = watch.candidate,
    s = primary.analysis.setup!,
    group = scan.groups.find((g) => g.participants.includes(primary.definition.id));
  return (group?.participants || [])
    .filter((id) => id !== primary.definition.id)
    .flatMap((id) => {
      const c = scan.candidates.find((x) => x.definition.id === id),
        ps = c?.analysis.setup;
      if (!c || !ps || c.state !== 'CONFIRMED' || ps.direction !== s.direction || !ps.conditions.every((x) => x.met)) return [];
      return [
        {
          strategyId: c.definition.id,
          version: c.definition.version,
          state: c.state,
          confirmedAt: scan.asOf,
          conditions: ps.conditions.map((x) => ({ key: x.key, met: x.met })),
          entry: ps.entry,
          stop: ps.stop,
          target: ps.targets[0],
          rr: ps.rr,
          definition: c.definition,
        },
      ];
    });
}
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/**
 * Immutable snapshot of what the system knew at confirmation. Only features the scanner really
 * computed (closed, current-session bars) are recorded; anything unavailable stays null.
 */
export function buildSetupSnapshot(
  watch: SetupWatch,
  scan: ScannerResult,
  opts: {
    source: ObservationSource;
    scope: string;
    quote?: { bid?: number; ask?: number; last?: number; timeMsc?: number } | null;
    pointValue?: number | null;
  },
) {
  const c = watch.candidate,
    s = c.analysis.setup!,
    sign = s.direction === 'long' ? 1 : -1,
    target = s.targets[0],
    ctx = scan.context,
    m1 = ctx?.frames['1m'],
    m5 = ctx?.frames['5m'],
    at = brt(scan.asOf),
    pointValue = num(opts.pointValue),
    bid = num(opts.quote?.bid),
    ask = num(opts.quote?.ask);
  return {
    schema: setupSnapshotSchema,
    source: opts.source,
    scope: opts.scope,
    watchId: watch.id,
    setupId: s.id,
    symbol: scan.symbol,
    strategy: {
      id: c.definition.id,
      version: c.definition.version,
      name: c.definition.name,
      timeframes: c.definition.timeframes,
      definition: c.definition,
    },
    direction: s.direction === 'long' ? 'BUY' : 'SELL',
    triggerTimeframe: '1m',
    contextTimeframes: c.definition.timeframes.filter((t) => t !== '1m'),
    detectedAt: watch.detectedAt,
    confirmedAt: watch.confirmedAt ?? scan.asOf,
    marketAsOf: scan.asOf,
    validUntil: watch.validUntil,
    referencePrice: s.entry,
    entry: s.entry,
    stop: s.stop,
    target,
    riskPoints: s.riskPoints,
    rewardPoints: s.potentialPoints,
    rr: s.rr,
    pointValue,
    riskBRLPerContract: pointValue ? s.riskPoints * pointValue : null,
    rewardBRLPerContract: pointValue ? s.potentialPoints * pointValue : null,
    conditions: s.conditions.map((x) => ({ key: x.key, label: x.label, met: x.met, detail: x.detail })),
    participants: watch.participants,
    participantEvidence: participantEvidence(watch, scan),
    regimes: scan.regimes,
    context: ctx ?? null,
    derived: {
      atr1m: m1?.atr ?? null,
      riskInAtr1m: m1?.atr ? s.riskPoints / m1.atr : null,
      distEmaFast1m: m1?.emaFast != null ? sign * (s.entry - m1.emaFast) : null,
      distEmaFast5m: m5?.emaFast != null ? sign * (s.entry - m5.emaFast) : null,
      distSupport1m: m1?.support != null ? s.entry - m1.support : null,
      distResistance1m: m1?.resistance != null ? m1.resistance - s.entry : null,
      range20Points1m: m1?.rangeHigh != null && m1?.rangeLow != null ? m1.rangeHigh - m1.rangeLow : null,
      volumeRatio1m: m1?.volumeRatio ?? null,
      trend5m: m5?.emaFast != null && m5?.emaSlow != null ? (m5.emaFast > m5.emaSlow ? 'UP' : m5.emaFast < m5.emaSlow ? 'DOWN' : 'FLAT') : null,
    },
    session: { hourBRT: at.hour, minuteBRT: at.minute, weekday: at.weekday },
    quote: opts.quote
      ? { bid, ask, last: num(opts.quote.last), spread: bid !== null && ask !== null ? ask - bid : null, timeMsc: num(opts.quote.timeMsc) }
      : null,
  };
}
export type SetupSnapshot = ReturnType<typeof buildSetupSnapshot>;
