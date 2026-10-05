/**
 * Deterministic LAB statistics. DATA (observations) → STATISTICS (this file) → INTERPRETATION (UI/AI,
 * which may only explain these numbers). Never mixes datasets, never ranks by win rate alone, and a
 * small N is always reported as insufficient. Nothing here can enable REAL execution.
 */
export const labParameters = Object.freeze({
  version: 'lab-v1',
  /** Below this many resolved observations no performance conclusion is shown. */
  minSample: 30,
  /** PROMISSORA requires at least this N plus the thresholds below. */
  promisingSample: 50,
  promisingExpectancyR: 0.1,
  promisingProfitFactor: 1.3,
  /** DEGRADANDO: the last window's expectancy is negative while the overall one is positive. */
  degradationWindow: 20,
  /** A segment (hour, regime, …) needs its own N before it is described at all. */
  minSegmentSample: 30,
});
export type Dataset = 'LIVE_DETECTED' | 'PAPER_FORWARD' | 'REPLAY' | 'BACKTEST' | 'REAL';
export type LabObservation = {
  id: string;
  source: 'LIVE' | 'REPLAY' | 'BACKTEST';
  strategyId: string;
  version: string;
  direction: 'BUY' | 'SELL';
  confirmedAt: number;
  lifecycle: string;
  outcome: { status: string; resultR: number | null; mfeR: number; maeR: number; minutesToTarget: number | null; minutesToStop: number | null; barsTracked: number } | null;
  paper: { resultR: number | null; mfeR?: number | null; maeR?: number | null; durationMinutes?: number | null; exitTime?: number | null } | null;
  features: { hourBRT: number | null; weekday: string | null; regimes: string[]; rr: number | null; trend5m: string | null };
  /** Opportunity identity (scope + confirmation candle). */
  scope?: string;
  marketAsOf?: number;
  /** Other strategies proven CONFIRMED on the same candle in the same dedup group (analytic credit only). */
  participants?: { strategyId: string; version: string; configHash?: string }[];
};
type Sample = { at: number; r: number; mfeR: number | null; maeR: number | null; minutes: number | null; f: LabObservation['features']; direction: string };
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

/** Expands observations into per-dataset samples. One setup can feed LIVE_DETECTED and PAPER_FORWARD. */
export function samples(o: LabObservation): { dataset: Dataset; resolved: Sample | null; status: string }[] {
  const out: { dataset: Dataset; resolved: Sample | null; status: string }[] = [];
  const hypothetical: Dataset = o.source === 'LIVE' ? 'LIVE_DETECTED' : o.source;
  const oc = o.outcome;
  const resolvedOutcome = oc && ['TARGET_FIRST', 'STOP_FIRST', 'EXPIRED'].includes(oc.status) && oc.resultR !== null;
  out.push({
    dataset: hypothetical,
    status: oc?.status ?? 'OPEN',
    resolved: resolvedOutcome
      ? { at: o.confirmedAt, r: oc!.resultR!, mfeR: oc!.mfeR, maeR: oc!.maeR, minutes: oc!.minutesToTarget ?? oc!.minutesToStop ?? oc!.barsTracked, f: o.features, direction: o.direction }
      : null,
  });
  if (o.paper && o.source === 'LIVE')
    out.push({
      dataset: 'PAPER_FORWARD',
      status: o.paper.exitTime ? 'CLOSED' : 'OPEN',
      resolved:
        o.paper.exitTime && typeof o.paper.resultR === 'number'
          ? { at: o.confirmedAt, r: o.paper.resultR, mfeR: o.paper.mfeR ?? null, maeR: o.paper.maeR ?? null, minutes: o.paper.durationMinutes ?? null, f: o.features, direction: o.direction }
          : null,
    });
  return out;
}

export function metrics(rows: Sample[], p = labParameters) {
  const ordered = [...rows].sort((a, b) => a.at - b.at),
    r = ordered.map((x) => x.r),
    wins = r.filter((x) => x > 0),
    losses = r.filter((x) => x < 0),
    grossWin = wins.reduce((s, x) => s + x, 0),
    grossLoss = -losses.reduce((s, x) => s + x, 0);
  let equity = 0,
    peak = 0,
    maxDd = 0,
    streak = 0,
    maxStreak = 0;
  const curve: { at: number; cumR: number }[] = [];
  for (const x of ordered) {
    equity += x.r;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
    streak = x.r < 0 ? streak + 1 : 0;
    maxStreak = Math.max(maxStreak, streak);
    curve.push({ at: x.at, cumR: equity });
  }
  const n = r.length,
    expectancy = mean(r),
    recent = r.slice(-p.degradationWindow);
  // 1R buckets; the end buckets are open (< −2R and ≥ 3R) so every result is counted exactly once.
  const histogram = [-3, -2, -1, 0, 1, 2, 3].map((lo) => ({
    from: lo === -3 ? null : lo,
    to: lo === 3 ? null : lo + 1,
    count: r.filter((x) => (lo === -3 || x >= lo) && (lo === 3 || x < lo + 1)).length,
  }));
  return {
    n,
    wins: wins.length,
    losses: losses.length,
    breakeven: n - wins.length - losses.length,
    winRate: n ? wins.length / n : null,
    lossRate: n ? losses.length / n : null,
    expectancyR: expectancy,
    avgR: expectancy,
    netR: equity,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    avgWinR: mean(wins),
    avgLossR: mean(losses),
    avgMfeR: mean(ordered.flatMap((x) => (x.mfeR === null ? [] : [x.mfeR]))),
    avgMaeR: mean(ordered.flatMap((x) => (x.maeR === null ? [] : [x.maeR]))),
    avgMinutes: mean(ordered.flatMap((x) => (x.minutes === null ? [] : [x.minutes]))),
    maxDrawdownR: maxDd,
    maxLossStreak: maxStreak,
    recentExpectancyR: recent.length === p.degradationWindow ? mean(recent) : null,
    histogram,
    curve,
  };
}
export type Metrics = ReturnType<typeof metrics>;
export type StrategyStatus = 'AMOSTRA INSUFICIENTE' | 'EM OBSERVAÇÃO' | 'PROMISSORA' | 'DEGRADANDO';
/** Documented, deterministic status. Win rate alone never makes a strategy "good". */
export function strategyStatus(m: Metrics, p = labParameters): { status: StrategyStatus; reason: string } {
  if (m.n < p.minSample) return { status: 'AMOSTRA INSUFICIENTE', reason: `N=${m.n} < ${p.minSample}: nenhuma conclusão de desempenho.` };
  if (m.recentExpectancyR !== null && m.recentExpectancyR < 0 && (m.expectancyR ?? 0) > 0)
    return { status: 'DEGRADANDO', reason: `Expectativa das últimas ${p.degradationWindow} < 0 com expectativa total > 0.` };
  if (m.n >= p.promisingSample && (m.expectancyR ?? 0) >= p.promisingExpectancyR && (m.profitFactor ?? 0) >= p.promisingProfitFactor)
    return { status: 'PROMISSORA', reason: `N≥${p.promisingSample}, expectativa ≥ ${p.promisingExpectancyR}R e profit factor ≥ ${p.promisingProfitFactor}.` };
  return { status: 'EM OBSERVAÇÃO', reason: 'Amostra mínima atingida sem critérios de PROMISSORA ou DEGRADANDO.' };
}
const segmentKeys: Record<string, (s: Sample) => string[]> = {
  hour: (s) => (s.f.hourBRT === null ? [] : [`${String(s.f.hourBRT).padStart(2, '0')}h`]),
  weekday: (s) => (s.f.weekday ? [s.f.weekday] : []),
  direction: (s) => [s.direction],
  regime: (s) => s.f.regimes,
  trend5m: (s) => (s.f.trend5m ? [(s.f.trend5m === 'UP') === (s.direction === 'BUY') && s.f.trend5m !== 'FLAT' ? 'alinhado ao M5' : 'contra/neutro M5'] : []),
  rr: (s) => (s.f.rr === null ? [] : [s.f.rr < 1.5 ? 'R/R < 1,5' : s.f.rr < 2.5 ? 'R/R 1,5–2,5' : 'R/R ≥ 2,5']),
};
export function segments(rows: Sample[], p = labParameters) {
  return Object.fromEntries(
    Object.entries(segmentKeys).map(([name, keyOf]) => {
      const groups = new Map<string, Sample[]>();
      for (const s of rows) for (const k of keyOf(s)) groups.set(k, [...(groups.get(k) || []), s]);
      return [
        name,
        [...groups].map(([key, g]) => {
          const m = metrics(g, p);
          return { key, n: m.n, sufficient: m.n >= p.minSegmentSample, expectancyR: m.expectancyR, winRate: m.winRate, profitFactor: m.profitFactor };
        }).sort((a, b) => b.n - a.n),
      ];
    }),
  );
}
/** Same market opportunity: same scope, confirmation candle, direction and set of confirmed strategies. */
export function opportunityKey(o: LabObservation) {
  // Without a recorded scope and confirmation candle (legacy rows) an observation is its own opportunity.
  if (!o.scope || typeof o.marketAsOf !== 'number') return `id:${o.id}`;
  const members = [`${o.strategyId}@${o.version}`, ...(o.participants || []).map((p) => `${p.strategyId}@${p.version}`)].sort();
  return `${o.scope}|${o.marketAsOf}|${o.direction}|${members.join(',')}`;
}
/**
 * Per strategy × version × dataset. Versions and datasets are never merged. A proven participant
 * receives the opportunity's outcome in ITS OWN statistics (role PARTICIPANT) — once, even if it also
 * has its own observation of the same opportunity. PAPER_FORWARD is credited only to the strategy whose
 * levels were traded. `opportunities` counts each market opportunity once (global N).
 */
export function labAnalytics(observations: LabObservation[], p = labParameters) {
  const groups = new Map<string, { strategyId: string; version: string; dataset: Dataset; resolved: Sample[]; statuses: Record<string, number>; asParticipant: number }>();
  const credited = new Set<string>();
  const add = (strategyId: string, version: string, s: ReturnType<typeof samples>[number], participant: boolean, opp: string) => {
    // A strategy's own observation always counts; participant credit is skipped when that strategy
    // already has this opportunity (own record or an earlier participant credit).
    const once = `${strategyId}|${version}|${s.dataset}|${opp}`;
    if (participant && credited.has(once)) return;
    credited.add(once);
    const key = `${strategyId}|${version}|${s.dataset}`;
    const g = groups.get(key) || { strategyId, version, dataset: s.dataset, resolved: [], statuses: {}, asParticipant: 0 };
    g.statuses[s.status] = (g.statuses[s.status] || 0) + 1;
    if (participant) g.asParticipant++;
    if (s.resolved) g.resolved.push(s.resolved);
    groups.set(key, g);
  };
  // Own observations first, so a strategy's own record wins over participant credit for the same opportunity.
  for (const o of observations) for (const s of samples(o)) add(o.strategyId, o.version, s, false, opportunityKey(o));
  for (const o of observations)
    for (const s of samples(o).filter((x) => x.dataset !== 'PAPER_FORWARD'))
      for (const part of o.participants || []) add(part.strategyId, part.version, s, true, opportunityKey(o));
  // Global: one row per opportunity per dataset, whatever the number of participating strategies.
  const global = new Map<Dataset, { seen: Set<string>; resolved: Sample[]; n: number }>();
  for (const o of observations)
    for (const s of samples(o)) {
      const g = global.get(s.dataset) || { seen: new Set<string>(), resolved: [], n: 0 };
      const k = opportunityKey(o);
      if (g.seen.has(k)) continue;
      g.seen.add(k);
      g.n++;
      if (s.resolved) g.resolved.push(s.resolved);
      global.set(s.dataset, g);
    }
  return {
    parameters: p,
    groups: [...groups.values()]
      .map((g) => {
        const m = metrics(g.resolved, p);
        return { strategyId: g.strategyId, version: g.version, dataset: g.dataset, observations: Object.values(g.statuses).reduce((a: number, b: number) => a + b, 0), asParticipant: g.asParticipant, statuses: g.statuses, metrics: m, ...strategyStatus(m, p), segments: segments(g.resolved, p) };
      })
      .sort((a, b) => b.observations - a.observations),
    opportunities: [...global].map(([dataset, g]) => ({ dataset, opportunities: g.n, metrics: metrics(g.resolved, p) })),
  };
}
/** Today's funnel: what the scanner found and what happened to it, traded or not. */
export function funnel(observations: LabObservation[], detected: number) {
  const count = (f: (o: LabObservation) => boolean) => observations.filter(f).length;
  return {
    detected,
    confirmed: observations.length,
    // Reached the Risk Engine (READY or RISK_BLOCKED proposal); MISSED/INVALIDATED/CANCELLED never did.
    proposed: count((o) => !['CONFIRMED', 'MISSED', 'INVALIDATED', 'CANCELLED'].includes(o.lifecycle)),
    paper: count((o) => o.lifecycle.startsWith('PAPER')),
    ignored: count((o) => o.lifecycle === 'IGNORED'),
    blockedRisk: count((o) => o.lifecycle === 'BLOCKED_RISK'),
    missed: count((o) => o.lifecycle === 'MISSED'),
    expired: count((o) => o.lifecycle === 'EXPIRED'),
    invalidated: count((o) => o.lifecycle === 'INVALIDATED'),
    cancelled: count((o) => o.lifecycle === 'CANCELLED'),
    outcomes: {
      targetFirst: count((o) => o.outcome?.status === 'TARGET_FIRST'),
      stopFirst: count((o) => o.outcome?.status === 'STOP_FIRST'),
      ambiguous: count((o) => o.outcome?.status === 'AMBIGUOUS'),
      expired: count((o) => o.outcome?.status === 'EXPIRED'),
      open: count((o) => !o.outcome || o.outcome.status === 'OPEN'),
    },
  };
}
