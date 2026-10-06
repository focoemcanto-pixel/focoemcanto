import { brtDate, opportunityKey, outcomeClass, stageOf, type PerfRow } from './performance';
/**
 * EXECUTABLE RISK (executable-v1): normalized performance in R vs. financial performance in R$ of what
 * could really have been traded. Analysis only — it never changes MaxRiskBRL, a stop, a target or any
 * REAL control.
 *
 * Rules:
 * - riskPerContractBRL = |entry − structural stop| × pointValue, where pointValue = tickValue / tickSize
 *   of the real instrument (the value recorded in each signal's snapshot when present). The structural
 *   stop is NEVER moved closer to fit a limit.
 * - Contracts are integers only: floor(MaxRiskBRL / riskPerContractBRL), aligned to the volume step,
 *   capped by maxContracts; below volumeMin the opportunity is BLOCKED_BY_RISK (0 contracts).
 * - SIGNAL = one strategy's confirmed setup. OPPORTUNITY = one economic trade (same symbol, direction,
 *   confirmation candle and identical entry/stop/target); convergent strategies are its participants.
 *   Money is counted per opportunity, never per signal.
 * - Chronological simulation: opportunities in confirmation order; at most maxPositions open at once
 *   (a still-open or ambiguous trade keeps its slot: unknown exits are never assumed); each entry sized
 *   by its own risk; optional notional cap. Never re-ordered, never optimized.
 * - Sensitivity runs the same simulation for each MaxRiskBRL in a fixed list. It reports, it never picks.
 * - Results are gross: costs are not recorded (DADO INSUFICIENTE).
 */
export const executableParameters = Object.freeze({
  version: 'executable-v1',
  sensitivityLimitsBRL: [10, 25, 50, 75, 100, 125, 150, 200, 250, 300] as readonly number[],
  convergenceWindowSeconds: 300,
});
export type Instrument = { tickSize: number; tickValue: number; volumeMin: number; volumeStep: number; volumeMax: number };
export type Limits = { maxRiskBRL: number; maxContracts: number; maxPositions: number; maxNotionalBRL?: number | null };

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const round2 = (v: number) => Math.round(v * 100) / 100;
export const pointValueOf = (i: Instrument) => (i.tickSize > 0 && i.tickValue > 0 ? i.tickValue / i.tickSize : null);
/** Integer contracts within the risk budget; 0 when even the minimum lot exceeds it. Stop never adjusted. */
export function contractsFor(maxRiskBRL: number, riskPerContractBRL: number, i: Instrument, maxContracts: number) {
  if (!(riskPerContractBRL > 0) || !(maxRiskBRL > 0)) return 0;
  const step = i.volumeStep > 0 ? i.volumeStep : 1,
    raw = Math.floor(maxRiskBRL / riskPerContractBRL + 1e-9),
    stepped = Math.floor(raw / step + 1e-9) * step,
    capped = Math.min(stepped, maxContracts, i.volumeMax || Infinity);
  return capped >= (i.volumeMin || 1) ? Math.floor(capped) : 0;
}
export type Opportunity = {
  key: string;
  at: number;
  date: string;
  direction: 'BUY' | 'SELL';
  entry: number;
  stop: number;
  target: number;
  riskPoints: number;
  pointValue: number;
  riskPerContractBRL: number;
  outcome: string;
  resultR: number | null;
  resultPoints: number | null;
  exitAt: number | null;
  strategies: string[];
  signalIds: string[];
  /** Other same-direction opportunities confirmed within the convergence window before this one. */
  convergentWith: number;
  stage: string;
};
/** Signals → economic opportunities (deduplicated, chronological). */
export function opportunitiesOf(signals: PerfRow[], i: Instrument, p = executableParameters): Opportunity[] {
  const fallback = pointValueOf(i),
    byKey = new Map<string, Opportunity>();
  for (const s of [...signals].sort((a, b) => a.confirmedAt - b.confirmedAt || a.id.localeCompare(b.id))) {
    const key = opportunityKey(s),
      found = byKey.get(key),
      tag = `${s.strategyId}@${s.version}`;
    if (found) {
      if (!found.strategies.includes(tag)) found.strategies.push(tag);
      found.signalIds.push(s.id);
      continue;
    }
    const pv = s.pointValue && s.pointValue > 0 ? s.pointValue : fallback || 0,
      riskPoints = Math.abs(s.entry - s.stop),
      cls = outcomeClass(s.outcome);
    byKey.set(key, {
      key,
      at: s.confirmedAt,
      date: brtDate(s.confirmedAt),
      direction: s.direction,
      entry: s.entry,
      stop: s.stop,
      target: s.target,
      riskPoints,
      pointValue: pv,
      riskPerContractBRL: round2(riskPoints * pv),
      outcome: s.outcome?.status ?? 'OPEN',
      resultR: cls === 'OPEN' || cls === 'AMBIGUOUS' ? null : s.outcome?.resultR ?? null,
      resultPoints: cls === 'OPEN' || cls === 'AMBIGUOUS' ? null : s.outcome?.resultPoints ?? null,
      exitAt: cls === 'OPEN' || cls === 'AMBIGUOUS' ? null : s.outcome?.exitTimestamp ?? null,
      strategies: [tag],
      signalIds: [s.id],
      convergentWith: 0,
      stage: stageOf(s),
    });
  }
  const list = [...byKey.values()];
  for (const o of list) o.convergentWith = list.filter((x) => x !== o && x.direction === o.direction && x.at <= o.at && o.at - x.at <= p.convergenceWindowSeconds).length;
  return list;
}
/** R and 1-contract R$ of a set (decided = target/stop; NEITHER separate, marked at its own exit). */
function money(list: { outcome: string; resultR: number | null; resultPoints: number | null; pointValue: number }[], contracts = (_: any) => 1) {
  const decided = list.filter((x) => (x.outcome === 'TARGET_FIRST' || x.outcome === 'STOP_FIRST') && x.resultR !== null && x.resultPoints !== null),
    neither = list.filter((x) => x.outcome === 'EXPIRED' && x.resultPoints !== null);
  const brl = (x: (typeof list)[number]) => x.resultPoints! * x.pointValue * contracts(x);
  return {
    n: decided.length,
    targets: decided.filter((x) => x.outcome === 'TARGET_FIRST').length,
    stops: decided.filter((x) => x.outcome === 'STOP_FIRST').length,
    neither: neither.length,
    open: list.filter((x) => x.outcome === 'OPEN').length,
    ambiguous: list.filter((x) => x.outcome === 'AMBIGUOUS').length,
    resultR: round2(sum(decided.map((x) => x.resultR!))),
    resultBRL: round2(sum(decided.map(brl))),
    neitherBRL: neither.length ? round2(sum(neither.map(brl))) : null,
    grossWinBRL: round2(sum(decided.filter((x) => x.resultPoints! > 0).map(brl))),
    grossLossBRL: round2(-sum(decided.filter((x) => x.resultPoints! < 0).map(brl))),
  };
}
export type SimTrade = { key: string; at: number; contracts: number; riskBRL: number; outcome: string; resultBRL: number | null; resultR: number | null };
/** Chronological, causal simulation for one limit set. */
export function simulate(opps: Opportunity[], i: Instrument, l: Limits) {
  const open: { exitAt: number | null }[] = [],
    taken: SimTrade[] = [],
    skipped = { risk: 0, positions: 0, notional: 0 };
  for (const o of [...opps].sort((a, b) => a.at - b.at)) {
    // Release positions whose exit is known to have happened before this confirmation.
    for (let k = open.length - 1; k >= 0; k--) if (open[k].exitAt !== null && open[k].exitAt! <= o.at) open.splice(k, 1);
    const contracts = contractsFor(l.maxRiskBRL, o.riskPerContractBRL, i, l.maxContracts);
    if (!contracts) {
      skipped.risk++;
      continue;
    }
    if (open.length >= l.maxPositions) {
      skipped.positions++;
      continue;
    }
    if (l.maxNotionalBRL && o.entry * o.pointValue * contracts > l.maxNotionalBRL) {
      skipped.notional++;
      continue;
    }
    open.push({ exitAt: o.exitAt });
    const known = o.resultPoints !== null && (o.outcome === 'TARGET_FIRST' || o.outcome === 'STOP_FIRST' || o.outcome === 'EXPIRED');
    taken.push({
      key: o.key,
      at: o.at,
      contracts,
      riskBRL: round2(o.riskPerContractBRL * contracts),
      outcome: o.outcome,
      resultBRL: known ? round2(o.resultPoints! * o.pointValue * contracts) : null,
      resultR: known ? o.resultR : null,
    });
  }
  const decided = taken.filter((t) => t.outcome === 'TARGET_FIRST' || t.outcome === 'STOP_FIRST'),
    neither = taken.filter((t) => t.outcome === 'EXPIRED');
  let equity = 0,
    peak = 0,
    maxDd = 0;
  for (const t of [...decided].sort((a, b) => a.at - b.at)) {
    equity += t.resultBRL!;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
  }
  return {
    limits: l,
    eligible: opps.filter((o) => contractsFor(l.maxRiskBRL, o.riskPerContractBRL, i, l.maxContracts) > 0).length,
    blockedByRisk: opps.length - opps.filter((o) => contractsFor(l.maxRiskBRL, o.riskPerContractBRL, i, l.maxContracts) > 0).length,
    executed: taken.length,
    skipped,
    targets: decided.filter((t) => t.outcome === 'TARGET_FIRST').length,
    stops: decided.filter((t) => t.outcome === 'STOP_FIRST').length,
    neither: neither.length,
    unresolved: taken.length - decided.length - neither.length,
    contracts: sum(taken.map((t) => t.contracts)),
    riskBRL: round2(sum(taken.map((t) => t.riskBRL))),
    resultR: round2(sum(decided.map((t) => t.resultR!))),
    resultBRL: round2(sum(decided.map((t) => t.resultBRL!))),
    neitherBRL: neither.length ? round2(sum(neither.map((t) => t.resultBRL!))) : null,
    maxDrawdownBRL: round2(maxDd),
    trades: taken,
  };
}
export type Alert = { code: 'R_POSITIVE_BRL_NEGATIVE'; scope: string; resultR: number; resultBRL: number; message: string };
const alertOf = (scope: string, m: { resultR: number; resultBRL: number }): Alert[] =>
  m.resultR > 0 && m.resultBRL < 0
    ? [{ code: 'R_POSITIVE_BRL_NEGATIVE', scope, resultR: m.resultR, resultBRL: m.resultBRL, message: `${scope}: +${m.resultR}R mas ${m.resultBRL.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} — stops maiores pesam mais em R$ do que alvos com risco menor.` }]
    : [];
/**
 * The whole view for one set of signals (one dataset). `current` = the configured limits (reference only;
 * never changed here).
 */
export function executableAnalysis(signals: PerfRow[], i: Instrument, current: Limits | null, p = executableParameters) {
  const pv = pointValueOf(i);
  // Every confirmed signal that reached sizing (executable or blocked by risk) is a trade candidate.
  const candidates = signals.filter((s) => ['EXECUTABLE', 'BLOCKED_RISK'].includes(stageOf(s))),
    opps = opportunitiesOf(candidates, i, p),
    sigMoney = money(
      candidates.map((s) => {
        const cls = outcomeClass(s.outcome);
        return { outcome: s.outcome?.status ?? 'OPEN', resultR: cls === 'OPEN' || cls === 'AMBIGUOUS' ? null : s.outcome?.resultR ?? null, resultPoints: cls === 'OPEN' || cls === 'AMBIGUOUS' ? null : s.outcome?.resultPoints ?? null, pointValue: s.pointValue && s.pointValue > 0 ? s.pointValue : pv || 0 };
      }),
    ),
    oppMoney = money(opps);
  const strategies = [...new Set(candidates.map((s) => `${s.strategyId}@${s.version}`))].sort().map((tag) => {
    const own = opps.filter((o) => o.strategies.includes(tag)),
      m = money(own);
    return { strategy: tag, opportunities: own.length, convergent: own.filter((o) => o.strategies.length > 1).length, ...m, avgRiskPerContractBRL: own.length ? round2(sum(own.map((o) => o.riskPerContractBRL)) / own.length) : null, alerts: alertOf(tag, m) };
  });
  const oneContract = simulate(opps, i, { maxRiskBRL: Infinity, maxContracts: 1, maxPositions: Infinity });
  const sensitivity = p.sensitivityLimitsBRL.map((limit) => {
    const sim = simulate(opps, i, { maxRiskBRL: limit, maxContracts: current?.maxContracts ?? 1, maxPositions: current?.maxPositions ?? 1, maxNotionalBRL: current?.maxNotionalBRL ?? null });
    const { trades, ...rest } = sim;
    return { ...rest, eligibleKeys: opps.filter((o) => contractsFor(limit, o.riskPerContractBRL, i, current?.maxContracts ?? 1) > 0).map((o) => o.key), executedKeys: trades.map((t) => t.key) };
  });
  // Same limits without the MaxContracts cap: shows what integer sizing alone would do (analysis only).
  const sensitivityUncapped = p.sensitivityLimitsBRL.map((limit) => {
    const { trades, ...rest } = simulate(opps, i, { maxRiskBRL: limit, maxContracts: i.volumeMax || 1000, maxPositions: current?.maxPositions ?? 1, maxNotionalBRL: current?.maxNotionalBRL ?? null });
    return rest;
  });
  const riskDistribution = [10, 25, 50, 75, 100, 125, 150, 200, 250, 300, Infinity].map((hi, k, arr) => {
    const lo = k ? arr[k - 1] : 0;
    return { fromBRL: lo, toBRL: hi === Infinity ? null : hi, opportunities: opps.filter((o) => o.riskPerContractBRL > lo && o.riskPerContractBRL <= hi).length };
  });
  return {
    parameters: p,
    instrument: { ...i, pointValueBRL: pv },
    costs: 'DADO INSUFICIENTE',
    signals: { count: candidates.length, ...sigMoney },
    opportunities: { count: opps.length, convergent: opps.filter((o) => o.strategies.length > 1).length, ...oppMoney },
    /** Every opportunity with 1 contract and unlimited positions: the raw financial reality of the signals. */
    oneContract: (({ trades, ...rest }) => rest)(oneContract),
    /** Same, but at most one position at a time (MaxPositions=1), chronological. */
    oneContractOnePosition: (({ trades, ...rest }) => rest)(simulate(opps, i, { maxRiskBRL: Infinity, maxContracts: 1, maxPositions: current?.maxPositions ?? 1 })),
    current: current
      ? (({ trades, ...rest }) => rest)(simulate(opps, i, current))
      : null,
    sensitivity,
    sensitivityUncapped,
    riskDistribution,
    strategies,
    alerts: [...alertOf('Sinais (1 contrato cada)', sigMoney), ...alertOf('Oportunidades (1 contrato cada)', oppMoney), ...strategies.flatMap((s) => s.alerts)],
    rows: opps.map((o) => ({
      ...o,
      contractsAtCurrent: current ? contractsFor(current.maxRiskBRL, o.riskPerContractBRL, i, current.maxContracts) : null,
      minLimitBRL: o.riskPerContractBRL,
      resultBRL1: o.resultPoints === null ? null : round2(o.resultPoints * o.pointValue),
    })),
  };
}
export type ExecutableAnalysis = ReturnType<typeof executableAnalysis>;
