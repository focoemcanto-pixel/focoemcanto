import { labParameters } from './analytics';
/**
 * DESEMPENHO DAS ESTRATÉGIAS — "se eu tivesse seguido as entradas válidas, teria ganhado ou perdido?".
 * Deterministic and documented. Reads the LAB data that is already collected (observations, proposal
 * records, scanner watches, proposal sizing snapshots); stores nothing and changes nothing. Nothing
 * here can alter a strategy, a stop, a target, the risk settings or enable REAL.
 *
 * Rules (performance-v1):
 * - Only EXECUTABLE opportunities enter the result: a READY proposal (technically valid, sized within
 *   risk) or a PAPER entry. LEGACY proposals (created before the Risk Engine and actionability rules)
 *   are summarized apart and never mixed into the result. INVALIDATED, EXPIRED-before-confirmation and MISSED
 *   never enter it (they are not losses, and MISSED is not a trade). BLOCKED_RISK is a separate,
 *   counterfactual analysis and never enters the executable result.
 * - WIN = TARGET_FIRST, LOSS = STOP_FIRST. AMBIGUOUS is never converted. NEITHER (EXPIRED: horizon or
 *   session end without touching stop/target) is not a win or a loss: shown apart, with its
 *   mark-to-market R, and excluded from win rate, expectancy, profit factor and the result in R.
 * - Same economic opportunity: same symbol, direction, confirmation candle (marketAsOf) and identical
 *   entry, stop and target. Counted ONCE in the global result; every strategy that produced it keeps the
 *   credit in its own statistics (strategy participants).
 * - Correlated exposure: executable opportunities in the same symbol and direction confirmed within
 *   clusterWindowSeconds of the previous one form a cluster. Measured only; sizing is not changed.
 * - Datasets (LIVE_DETECTED, PAPER_FORWARD, REPLAY, BACKTEST) are never mixed; versions never merged.
 * - N = decided results (wins + losses). N < minSample → AMOSTRA INSUFICIENTE: descriptive only.
 * - Costs are not recorded: gross = net and costs are DADO INSUFICIENTE.
 */
export const performanceParameters = Object.freeze({
  version: 'performance-v1',
  minSample: labParameters.minSample,
  minSegmentSample: labParameters.minSegmentSample,
  promisingSample: labParameters.promisingSample,
  promisingExpectancyR: labParameters.promisingExpectancyR,
  promisingProfitFactor: labParameters.promisingProfitFactor,
  degradationWindow: labParameters.degradationWindow,
  clusterWindowSeconds: 300,
  stopMfeThresholds: [0.5, 0.8, 1] as readonly number[],
  /** Technical risk per contract as a fraction of the 1R of its own proposal. */
  riskBuckets: [0.5, 0.75, 1, 1.25] as readonly number[],
});
export type PerfDataset = 'LIVE_DETECTED' | 'PAPER_FORWARD' | 'REPLAY' | 'BACKTEST';
export type PerfOutcome = {
  status: string;
  resultR: number | null;
  resultPoints?: number | null;
  mfeR: number | null;
  maeR: number | null;
  exitTimestamp: number | null;
  expiredBy?: string | null;
  version?: string;
};
export type PerfRow = {
  id: string;
  origin: 'OBSERVATION' | 'PROPOSAL_RECORD';
  source: 'LIVE' | 'REPLAY' | 'BACKTEST';
  scope: string;
  symbol: string;
  strategyId: string;
  version: string;
  direction: 'BUY' | 'SELL';
  confirmedAt: number;
  marketAsOf: number;
  lifecycle: string;
  proposalState: string | null;
  actionability: string | null;
  outcome: PerfOutcome | null;
  paper: {
    entry?: number | null;
    exitTime?: number | null;
    resultR?: number | null;
    resultBRL?: number | null;
    mfeR?: number | null;
    maeR?: number | null;
  } | null;
  entry: number;
  stop: number;
  target: number;
  rr: number | null;
  riskPoints: number | null;
  features: { trend5m: string | null; regimes: string[] };
  participants: { strategyId: string; version: string }[];
  cluster: {
    signalsLast5m: number;
    confirmedLast5m: number;
    actionableLast5m: number;
  } | null;
  proposal: {
    state: string | null;
    createdAt: number | null;
    expiresAt: number | null;
    riskSettingsVersion: number | null;
    oneRBRL: number | null;
    dailyLossBRL: number | null;
    maxTradesPerDay: number | null;
    riskPerContractBRL: number | null;
    quantity: number | null;
    blockCode: string | null;
  } | null;
};
export type WatchCount = {
  source: string;
  date: string;
  strategyId: string;
  version: string;
  state: string;
  n: number;
};
export type RiskVersion = {
  version: number;
  createdAt: number;
  oneRBRL: number;
  dailyLossBRL: number;
  maxTradesPerDay: number;
  maxContracts: number;
};

const n = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
/** Coerces the database JSON (numbers may arrive as strings) into a PerfRow. */
export function toPerfRow(o: any): PerfRow {
  const oc = o.outcome,
    pr = o.proposal,
    pp = o.paper;
  return {
    id: String(o.id),
    origin: o.origin === 'PROPOSAL_RECORD' ? 'PROPOSAL_RECORD' : 'OBSERVATION',
    source: o.source,
    scope: o.scope,
    symbol: o.symbol,
    strategyId: o.strategyId,
    version: o.version,
    direction: o.direction,
    confirmedAt: Number(o.confirmedAt),
    marketAsOf: Number(o.marketAsOf),
    lifecycle: o.lifecycle,
    proposalState: o.proposalState ?? null,
    actionability: o.actionability ?? null,
    outcome: oc
      ? {
          status: oc.status,
          resultR: n(oc.resultR),
          resultPoints: n(oc.resultPoints),
          mfeR: n(oc.mfeR),
          maeR: n(oc.maeR),
          exitTimestamp: n(oc.exitTimestamp),
          expiredBy: oc.expiredBy ?? null,
          version: oc.version,
        }
      : null,
    paper: pp
      ? {
          entry: n(pp.entry),
          exitTime: n(pp.exitTime),
          resultR: n(pp.resultR),
          resultBRL: n(pp.resultBRL),
          mfeR: n(pp.mfeR),
          maeR: n(pp.maeR),
        }
      : null,
    entry: Number(o.entry),
    stop: Number(o.stop),
    target: Number(o.target),
    rr: n(o.rr),
    riskPoints: n(o.riskPoints),
    features: {
      trend5m: o.features?.trend5m ?? null,
      regimes: Array.isArray(o.features?.regimes) ? o.features.regimes : [],
    },
    participants: Array.isArray(o.participants) ? o.participants.filter((x: any) => x?.strategyId && x?.version) : [],
    cluster: o.cluster
      ? {
          signalsLast5m: Number(o.cluster.signalsLast5m) || 0,
          confirmedLast5m: Number(o.cluster.confirmedLast5m) || 0,
          actionableLast5m: Number(o.cluster.actionableLast5m) || 0,
        }
      : null,
    proposal: pr
      ? {
          state: pr.state ?? null,
          createdAt: n(pr.createdAt),
          expiresAt: n(pr.expiresAt),
          riskSettingsVersion: n(pr.riskSettingsVersion),
          oneRBRL: n(pr.oneRBRL),
          dailyLossBRL: n(pr.dailyLossBRL),
          maxTradesPerDay: n(pr.maxTradesPerDay),
          riskPerContractBRL: n(pr.riskPerContractBRL),
          quantity: n(pr.quantity),
          blockCode: pr.blockCode ?? null,
        }
      : null,
  };
}

export type Stage = 'EXECUTABLE' | 'LEGACY' | 'BLOCKED_RISK' | 'MISSED' | 'INVALIDATED' | 'CANCELLED' | 'PENDING';
/** Where a confirmed opportunity ended in the funnel. Only EXECUTABLE enters the result. */
export function stageOf(r: Pick<PerfRow, 'lifecycle' | 'proposalState'>): Stage {
  if (r.lifecycle === 'BLOCKED_RISK' || r.proposalState === 'RISK_BLOCKED') return 'BLOCKED_RISK';
  if (r.lifecycle === 'MISSED') return 'MISSED';
  if (r.lifecycle === 'INVALIDATED') return 'INVALIDATED';
  if (r.lifecycle === 'CANCELLED') return 'CANCELLED';
  // Proposals from before the Risk Engine/actionability existed: reported apart, never in the result.
  if (r.proposalState === 'LEGACY') return 'LEGACY';
  if (r.proposalState === 'READY' || r.lifecycle.startsWith('PAPER')) return 'EXECUTABLE';
  return 'PENDING';
}
export type OutcomeClass = 'WIN' | 'LOSS' | 'AMBIGUOUS' | 'NEITHER' | 'OPEN';
export function outcomeClass(o: PerfOutcome | null): OutcomeClass {
  if (!o || o.status === 'OPEN') return 'OPEN';
  if (o.status === 'TARGET_FIRST') return 'WIN';
  if (o.status === 'STOP_FIRST') return 'LOSS';
  if (o.status === 'AMBIGUOUS') return 'AMBIGUOUS';
  return 'NEITHER';
}
/** Same economic opportunity (documented rule above). */
export function opportunityKey(r: Pick<PerfRow, 'symbol' | 'direction' | 'marketAsOf' | 'entry' | 'stop' | 'target'>) {
  return `${r.symbol}|${r.direction}|${r.marketAsOf}|${r.entry}|${r.stop}|${r.target}`;
}
export const datasetOf = (r: PerfRow): PerfDataset => (r.source === 'LIVE' ? 'LIVE_DETECTED' : r.source);
const brtParts = (epochSeconds: number) => {
  const d = new Date((epochSeconds - 3 * 3600) * 1000);
  return {
    date: d.toISOString().slice(0, 10),
    hour: d.getUTCHours(),
    weekday: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getUTCDay()],
  };
};
export const brtDate = (epochSeconds: number) => brtParts(epochSeconds).date;
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

type Trade = {
  row: PerfRow;
  cls: OutcomeClass;
  r: number | null;
  mfeR: number | null;
  maeR: number | null;
  exitAt: number | null;
};
const asTrade = (row: PerfRow): Trade => {
  const cls = outcomeClass(row.outcome);
  return {
    row,
    cls,
    r: row.outcome?.resultR ?? null,
    mfeR: row.outcome?.mfeR ?? null,
    maeR: row.outcome?.maeR ?? null,
    exitAt: row.outcome?.exitTimestamp ?? null,
  };
};
/** First row of each economic opportunity (chronological), plus how many rows were merged. */
export function uniqueOpportunities(rows: PerfRow[]) {
  const seen = new Map<string, PerfRow>();
  for (const r of [...rows].sort((a, b) => a.confirmedAt - b.confirmedAt || a.id.localeCompare(b.id)))
    if (!seen.has(opportunityKey(r))) seen.set(opportunityKey(r), r);
  return [...seen.values()];
}
const distribution = (values: number[], edges: number[]) =>
  edges.map((lo, i) => ({
    from: lo,
    to: edges[i + 1] ?? null,
    count: values.filter((v) => v >= lo && (edges[i + 1] === undefined || v < edges[i + 1])).length,
  }));

/** Core metrics over trades that are already one per opportunity. Decided = wins + losses only. */
export function metricsOf(trades: Trade[], p = performanceParameters) {
  const decided = trades
      .filter((t) => (t.cls === 'WIN' || t.cls === 'LOSS') && t.r !== null)
      .sort((a, b) => (a.exitAt ?? a.row.confirmedAt) - (b.exitAt ?? b.row.confirmedAt) || a.row.confirmedAt - b.row.confirmedAt),
    r = decided.map((t) => t.r!),
    wins = decided.filter((t) => t.cls === 'WIN'),
    losses = decided.filter((t) => t.cls === 'LOSS'),
    grossWinR = sum(wins.map((t) => t.r!)),
    grossLossR = -sum(losses.map((t) => t.r!)),
    neither = trades.filter((t) => t.cls === 'NEITHER');
  let equity = 0,
    peak = 0,
    maxDd = 0,
    lossStreak = 0,
    winStreak = 0,
    maxLossStreak = 0,
    maxWinStreak = 0;
  const curve: { at: number; cumR: number; id: string; strategyId: string }[] = [];
  for (const t of decided) {
    equity += t.r!;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
    lossStreak = t.cls === 'LOSS' ? lossStreak + 1 : 0;
    winStreak = t.cls === 'WIN' ? winStreak + 1 : 0;
    maxLossStreak = Math.max(maxLossStreak, lossStreak);
    maxWinStreak = Math.max(maxWinStreak, winStreak);
    curve.push({
      at: t.exitAt ?? t.row.confirmedAt,
      cumR: equity,
      id: t.row.id,
      strategyId: t.row.strategyId,
    });
  }
  const resolved = trades.filter((t) => t.cls !== 'OPEN'),
    mfe = resolved.flatMap((t) => (t.mfeR === null ? [] : [t.mfeR])),
    mae = resolved.flatMap((t) => (t.maeR === null ? [] : [t.maeR])),
    stopMfe = losses.flatMap((t) => (t.mfeR === null ? [] : [t.mfeR])),
    recent = r.slice(-p.degradationWindow);
  return {
    opportunities: trades.length,
    n: decided.length,
    wins: wins.length,
    losses: losses.length,
    ambiguous: trades.filter((t) => t.cls === 'AMBIGUOUS').length,
    neither: neither.length,
    neitherMarkedR: neither.some((t) => t.r !== null) ? sum(neither.flatMap((t) => (t.r === null ? [] : [t.r]))) : null,
    open: trades.filter((t) => t.cls === 'OPEN').length,
    winRate: decided.length ? wins.length / decided.length : null,
    resultR: decided.length ? equity : null,
    expectancyR: mean(r),
    /** null when there is no loss (JSON-safe); the UI shows ∞ when wins > 0 and losses = 0. */
    profitFactor: grossLossR > 0 ? grossWinR / grossLossR : null,
    grossWinR,
    grossLossR,
    avgWinR: mean(wins.map((t) => t.r!)),
    avgLossR: mean(losses.map((t) => t.r!)),
    maxDrawdownR: maxDd,
    maxLossStreak,
    maxWinStreak,
    recentExpectancyR: recent.length === p.degradationWindow ? mean(recent) : null,
    avgMfeR: mean(mfe),
    avgMaeR: mean(mae),
    mfeDistribution: distribution(mfe, [0, 0.5, 1, 1.5, 2]),
    maeDistribution: distribution(mae, [0, 0.25, 0.5, 0.75, 1]),
    stopTrades: {
      n: stopMfe.length,
      avgMfeR: mean(stopMfe),
      reached: p.stopMfeThresholds.map((th) => ({
        thresholdR: th,
        count: stopMfe.filter((x) => x >= th).length,
        share: stopMfe.length ? stopMfe.filter((x) => x >= th).length / stopMfe.length : null,
      })),
    },
    curve,
  };
}
export type PerfMetrics = ReturnType<typeof metricsOf>;
export type Verdict = 'POSITIVO' | 'NEGATIVO' | 'NEUTRO' | 'AMOSTRA INSUFICIENTE' | 'SEM DADOS';
/** Classification of a result. With N < minSample there is never a conclusion, only description. */
export function verdictOf(m: PerfMetrics, p = performanceParameters): { verdict: Verdict; reason: string; tags: string[] } {
  if (!m.n)
    return {
      verdict: 'SEM DADOS',
      reason: 'Nenhuma oportunidade executável com desfecho (alvo ou stop) no período.',
      tags: [],
    };
  const tags = m.n < p.minSample ? ['AMOSTRA INSUFICIENTE'] : [];
  if ((m.resultR ?? 0) < 0) tags.push(m.n < p.minSample ? 'DESEMPENHO RECENTE NEGATIVO' : 'RESULTADO NEGATIVO');
  else if ((m.resultR ?? 0) > 0) tags.push(m.n < p.minSample ? 'RESULTADO POSITIVO NESTA AMOSTRA' : 'RESULTADO POSITIVO');
  if (m.n < p.minSample)
    return {
      verdict: 'AMOSTRA INSUFICIENTE',
      reason: `N=${m.n} < ${p.minSample}: números descritivos, sem conclusão de desempenho.`,
      tags,
    };
  if (m.recentExpectancyR !== null && m.recentExpectancyR < 0 && (m.expectancyR ?? 0) > 0) tags.push('DEGRADANDO');
  else if (m.n >= p.promisingSample && (m.expectancyR ?? 0) >= p.promisingExpectancyR && (m.profitFactor ?? 0) >= p.promisingProfitFactor)
    tags.push('PROMISSORA');
  const v: Verdict = (m.resultR ?? 0) > 0 ? 'POSITIVO' : (m.resultR ?? 0) < 0 ? 'NEGATIVO' : 'NEUTRO';
  return {
    verdict: v,
    reason: `N=${m.n} ≥ ${p.minSample}. Resultado passado não garante resultado futuro.`,
    tags,
  };
}
/** R$ only from each proposal's OWN risk-settings snapshot (never today's 1R applied to the past). */
function brlOf(trades: Trade[]) {
  const decided = trades.filter((t) => (t.cls === 'WIN' || t.cls === 'LOSS') && t.r !== null),
    covered = decided.filter(
      (t) => t.row.proposal?.riskSettingsVersion != null && (t.row.proposal?.riskPerContractBRL ?? 0) > 0 && (t.row.proposal?.quantity ?? 0) > 0,
    );
  return {
    valueBRL: covered.length ? sum(covered.map((t) => t.r! * t.row.proposal!.riskPerContractBRL! * t.row.proposal!.quantity!)) : null,
    covered: covered.length,
    total: decided.length,
    versions: [...new Set(covered.map((t) => t.row.proposal!.riskSettingsVersion!))].sort((a, b) => a - b),
  };
}
function summary(rows: PerfRow[], p = performanceParameters) {
  const unique = uniqueOpportunities(rows),
    m = metricsOf(unique.map(asTrade), p);
  return {
    ...m,
    records: rows.length,
    duplicates: rows.length - unique.length,
    brl: brlOf(unique.map(asTrade)),
    ...verdictOf(m, p),
  };
}
export type PerfSummary = ReturnType<typeof summary>;

/** Per strategy × version (never merged). Own rows plus participant credit for the same opportunity. */
function byStrategy(rows: PerfRow[], p = performanceParameters) {
  const groups = new Map<
    string,
    {
      strategyId: string;
      version: string;
      rows: PerfRow[];
      asParticipant: number;
    }
  >();
  const add = (strategyId: string, version: string, r: PerfRow, participant: boolean) => {
    const key = `${strategyId}@${version}`,
      g = groups.get(key) || {
        strategyId,
        version,
        rows: [],
        asParticipant: 0,
      };
    if (g.rows.some((x) => opportunityKey(x) === opportunityKey(r))) return;
    g.rows.push(r);
    if (participant) g.asParticipant++;
    groups.set(key, g);
  };
  for (const r of rows) add(r.strategyId, r.version, r, false);
  for (const r of rows) for (const part of r.participants) add(part.strategyId, part.version, r, true);
  return [...groups.values()]
    .map((g) => {
      const s = summary(g.rows, p);
      return {
        strategyId: g.strategyId,
        version: g.version,
        asParticipant: g.asParticipant,
        ids: g.rows.map((x) => x.id),
        ...s,
      };
    })
    .sort((a, b) => a.strategyId.localeCompare(b.strategyId) || a.version.localeCompare(b.version, undefined, { numeric: true }));
}
/** Attempt number of an executable entry: its rank among the same strategy@version's executable entries that day. */
export function reentries(executable: PerfRow[], confirmed: PerfRow[]) {
  const out = new Map<
    string,
    {
      attempt: number;
      sinceSignalMin: number | null;
      sinceTradeMin: number | null;
      sinceStopMin: number | null;
    }
  >();
  const byKey = new Map<string, PerfRow[]>();
  for (const r of [...executable].sort((a, b) => a.confirmedAt - b.confirmedAt)) {
    const k = `${r.strategyId}@${r.version}|${brtDate(r.confirmedAt)}`;
    byKey.set(k, [...(byKey.get(k) || []), r]);
  }
  for (const [k, list] of byKey) {
    const signals = confirmed.filter((x) => `${x.strategyId}@${x.version}|${brtDate(x.confirmedAt)}` === k);
    list.forEach((r, i) => {
      const prevSignal = signals.filter((x) => x.confirmedAt < r.confirmedAt).at(-1),
        prevTrade = list[i - 1],
        // Causal: only a stop already hit before this confirmation counts.
        prevStop = list
          .slice(0, i)
          .filter((x) => outcomeClass(x.outcome) === 'LOSS' && (x.outcome?.exitTimestamp ?? Infinity) <= r.confirmedAt)
          .at(-1);
      out.set(r.id, {
        attempt: i + 1,
        sinceSignalMin: prevSignal ? (r.confirmedAt - prevSignal.confirmedAt) / 60 : null,
        sinceTradeMin: prevTrade ? (r.confirmedAt - prevTrade.confirmedAt) / 60 : null,
        sinceStopMin: prevStop ? (r.confirmedAt - prevStop.outcome!.exitTimestamp!) / 60 : null,
      });
    });
  }
  return out;
}
const trendAlignment = (r: PerfRow) => {
  const t = r.features.trend5m;
  if (!t) return null;
  if (t === 'FLAT') return 'NEUTRAL';
  return (t === 'UP') === (r.direction === 'BUY') ? 'WITH_TREND' : 'COUNTER_TREND';
};
const riskBucket = (r: PerfRow, p = performanceParameters) => {
  const rpc = r.proposal?.riskPerContractBRL,
    oneR = r.proposal?.oneRBRL;
  if (!rpc || !oneR) return null;
  const x = rpc / oneR,
    edges = p.riskBuckets,
    i = edges.findIndex((e) => x < e);
  return i === -1 ? `> ${edges.at(-1)} do 1R` : i === 0 ? `0–${edges[0]} do 1R` : `${edges[i - 1]}–${edges[i]} do 1R`;
};
function segmentsOf(unique: PerfRow[], attempts: ReturnType<typeof reentries>, p = performanceParameters) {
  const keys: Record<string, (r: PerfRow) => string | null> = {
    hour: (r) => `${String(brtParts(r.confirmedAt).hour).padStart(2, '0')}h`,
    weekday: (r) => brtParts(r.confirmedAt).weekday,
    direction: (r) => (r.direction === 'BUY' ? 'COMPRA' : 'VENDA'),
    trend: trendAlignment,
    rr: (r) => (r.rr === null ? null : r.rr < 1.5 ? 'R/R < 1,5' : r.rr < 2.5 ? 'R/R 1,5–2,5' : 'R/R ≥ 2,5'),
    riskBucket: (r) => riskBucket(r, p),
    attempt: (r) => {
      const a = attempts.get(r.id)?.attempt;
      return a ? (a >= 4 ? '4ª+ entrada' : `${a}ª entrada`) : null;
    },
    signalsLast5m: (r) =>
      r.cluster ? (r.cluster.signalsLast5m <= 2 ? '0–2 sinais/5min' : r.cluster.signalsLast5m <= 5 ? '3–5 sinais/5min' : '6+ sinais/5min') : null,
  };
  return Object.fromEntries(
    Object.entries(keys).map(([name, keyOf]) => {
      const groups = new Map<string, PerfRow[]>();
      let unknown = 0;
      for (const r of unique) {
        const k = keyOf(r);
        if (k === null) unknown++;
        else groups.set(k, [...(groups.get(k) || []), r]);
      }
      return [
        name,
        {
          unknown,
          rows: [...groups]
            .map(([key, g]) => {
              const m = metricsOf(g.map(asTrade), p);
              return {
                key,
                opportunities: g.length,
                n: m.n,
                wins: m.wins,
                losses: m.losses,
                resultR: m.resultR,
                expectancyR: m.expectancyR,
                winRate: m.winRate,
                profitFactor: m.profitFactor,
                sufficient: m.n >= p.minSegmentSample,
              };
            })
            .sort((a, b) => a.key.localeCompare(b.key, 'pt-BR', { numeric: true })),
        },
      ];
    }),
  );
}
/** Same-direction executable opportunities confirmed close together (correlated exposure). */
export function correlatedClusters(unique: PerfRow[], p = performanceParameters) {
  const sorted = [...unique].sort((a, b) => a.confirmedAt - b.confirmedAt),
    clusters: PerfRow[][] = [];
  const last = new Map<string, PerfRow[]>();
  for (const r of sorted) {
    const k = `${r.symbol}|${r.direction}`,
      cur = last.get(k);
    if (cur && r.confirmedAt - cur.at(-1)!.confirmedAt <= p.clusterWindowSeconds) cur.push(r);
    else {
      const next = [r];
      clusters.push(next);
      last.set(k, next);
    }
  }
  // Peak simultaneous open executable opportunities (each is 1R of exposure if all were taken).
  const events = sorted.flatMap((r) => [
    { t: r.confirmedAt, d: 1 },
    { t: r.outcome?.exitTimestamp ?? r.confirmedAt + 86400, d: -1 },
  ]);
  events.sort((a, b) => a.t - b.t || a.d - b.d);
  let open = 0,
    peak = 0;
  for (const e of events) peak = Math.max(peak, (open += e.d));
  const multi = clusters.filter((c) => c.length > 1);
  return {
    windowSeconds: p.clusterWindowSeconds,
    clusters: multi.map((c) => ({
      start: c[0].confirmedAt,
      end: c.at(-1)!.confirmedAt,
      direction: c[0].direction,
      size: c.length,
      strategies: [...new Set(c.map((x) => `${x.strategyId}@${x.version}`))],
      ids: c.map((x) => x.id),
      resultR: metricsOf(c.map(asTrade)).resultR,
    })),
    opportunitiesInClusters: sum(multi.map((c) => c.length)),
    maxClusterSize: Math.max(0, ...clusters.map((c) => c.length)),
    peakSimultaneousR: peak,
  };
}
/**
 * RISK-CONSTRAINED: what following the configured risk management would have produced, simulated
 * causally in the order the opportunities happened (never re-ordered). Each opportunity uses the risk
 * snapshot of its own proposal; with none, `fallback` (the current settings, labelled as such) or the
 * simulation is unavailable. Budget = realized net loss of exits already known + 1R per open entry.
 */
export function riskConstrained(unique: PerfRow[], fallback: RiskVersion | null) {
  const rows = [...unique].sort((a, b) => a.confirmedAt - b.confirmedAt),
    days = new Map<string, PerfRow[]>();
  for (const r of rows) days.set(brtDate(r.confirmedAt), [...(days.get(brtDate(r.confirmedAt)) || []), r]);
  let source: 'SNAPSHOT' | 'CURRENT_SETTINGS' | null = null,
    unavailable = 0;
  const taken: Trade[] = [],
    skipped = { dailyLoss: 0, maxTrades: 0 },
    perDay: {
      date: string;
      taken: number;
      skippedDailyLoss: number;
      skippedMaxTrades: number;
      resultR: number | null;
      rawR: number | null;
    }[] = [];
  for (const [date, list] of days) {
    const dayTaken: Trade[] = [];
    let sd = 0,
      sm = 0;
    for (const r of list) {
      const pr = r.proposal,
        snap =
          pr?.riskSettingsVersion != null && pr.oneRBRL && pr.dailyLossBRL && pr.maxTradesPerDay
            ? {
                limitR: pr.dailyLossBRL / pr.oneRBRL,
                maxTrades: pr.maxTradesPerDay,
              }
            : null,
        s =
          snap ||
          (fallback
            ? {
                limitR: fallback.dailyLossBRL / fallback.oneRBRL,
                maxTrades: fallback.maxTradesPerDay,
              }
            : null);
      if (!s) {
        unavailable++;
        continue;
      }
      source = snap ? (source === 'CURRENT_SETTINGS' ? 'CURRENT_SETTINGS' : 'SNAPSHOT') : 'CURRENT_SETTINGS';
      const t = r.confirmedAt,
        known = dayTaken.filter((x) => x.exitAt !== null && x.exitAt <= t && x.r !== null && x.cls !== 'AMBIGUOUS'),
        openRisk = dayTaken.length - known.length,
        lossUsed = Math.max(0, -sum(known.map((x) => x.r!)));
      if (dayTaken.length >= s.maxTrades) {
        sm++;
        continue;
      }
      if (lossUsed + openRisk + 1 > s.limitR + 1e-9) {
        sd++;
        continue;
      }
      dayTaken.push(asTrade(r));
    }
    skipped.dailyLoss += sd;
    skipped.maxTrades += sm;
    taken.push(...dayTaken);
    perDay.push({
      date,
      taken: dayTaken.length,
      skippedDailyLoss: sd,
      skippedMaxTrades: sm,
      resultR: metricsOf(dayTaken).resultR,
      rawR: metricsOf(list.map(asTrade)).resultR,
    });
  }
  const raw = metricsOf(rows.map(asTrade)),
    constrained = metricsOf(taken);
  return {
    available: unavailable === 0 && rows.length > 0,
    source,
    unavailable,
    fallbackVersion: source === 'CURRENT_SETTINGS' ? (fallback?.version ?? null) : null,
    raw: {
      opportunities: rows.length,
      n: raw.n,
      resultR: raw.resultR,
      wins: raw.wins,
      losses: raw.losses,
    },
    constrained: {
      taken: taken.length,
      n: constrained.n,
      resultR: constrained.resultR,
      wins: constrained.wins,
      losses: constrained.losses,
      maxDrawdownR: constrained.maxDrawdownR,
    },
    skipped,
    perDay,
  };
}
export function paperForward(rows: PerfRow[], p = performanceParameters) {
  const trades = rows.filter((r) => r.source === 'LIVE' && r.paper && r.paper.entry != null),
    closed = trades.filter((r) => r.paper!.exitTime && r.paper!.resultR !== null && r.paper!.resultR !== undefined);
  const m = metricsOf(
    closed.map((r) => ({
      row: r,
      cls: r.paper!.resultR! > 0 ? 'WIN' : r.paper!.resultR! < 0 ? 'LOSS' : 'NEITHER',
      r: r.paper!.resultR!,
      mfeR: r.paper!.mfeR ?? null,
      maeR: r.paper!.maeR ?? null,
      exitAt: r.paper!.exitTime! / (r.paper!.exitTime! > 1e11 ? 1000 : 1),
    })) as Trade[],
    p,
  );
  const brl = closed.filter((r) => typeof r.paper!.resultBRL === 'number');
  return {
    trades: trades.length,
    ...m,
    openTrades: trades.length - closed.length,
    resultBRL: brl.length ? sum(brl.map((r) => r.paper!.resultBRL!)) : null,
    ...verdictOf(m, p),
  };
}

export type PerformanceInput = {
  rows: PerfRow[];
  watches: WatchCount[];
  riskVersions?: RiskVersion[];
};
/** The whole DESEMPENHO view for one dataset (never mixed) plus the PAPER/LIVE comparison. */
export function performance(input: PerformanceInput, dataset: Exclude<PerfDataset, 'PAPER_FORWARD'> = 'LIVE_DETECTED', p = performanceParameters) {
  const rows = input.rows.filter((r) => datasetOf(r) === dataset).sort((a, b) => a.confirmedAt - b.confirmedAt),
    source = dataset === 'LIVE_DETECTED' ? 'mt5' : dataset.toLowerCase(),
    watches = input.watches.filter((w) => w.source === source),
    stage = new Map(rows.map((r) => [r.id, stageOf(r)])),
    executable = rows.filter((r) => stage.get(r.id) === 'EXECUTABLE'),
    blocked = rows.filter((r) => stage.get(r.id) === 'BLOCKED_RISK'),
    legacy = rows.filter((r) => stage.get(r.id) === 'LEGACY'),
    uniqueExec = uniqueOpportunities(executable),
    attempts = reentries(executable, rows),
    watchState = (st: string) => sum(watches.filter((w) => w.state === st).map((w) => Number(w.n))),
    detected = sum(watches.map((w) => Number(w.n))),
    expiredAfterProposal = rows.filter((r) => r.lifecycle === 'EXPIRED' && stage.get(r.id) === 'EXECUTABLE').length;
  const current = (input.riskVersions || []).at(-1) || null;
  const funnel = {
    detected,
    confirmed: rows.length,
    proposed: rows.filter((r) => r.proposalState !== null).length,
    executable: executable.length,
    executableOpportunities: uniqueExec.length,
    operated: executable.filter((r) => r.paper && r.paper.entry != null).length,
    resultKnown: uniqueExec.filter((r) => ['WIN', 'LOSS', 'AMBIGUOUS', 'NEITHER'].includes(outcomeClass(r.outcome))).length,
    invalidatedBeforeConfirmation: watchState('INVALIDATED'),
    expiredBeforeConfirmation: Math.max(0, watchState('EXPIRED') - rows.filter((r) => r.lifecycle === 'EXPIRED').length),
    invalidatedAfterConfirmation: rows.filter((r) => ['INVALIDATED', 'CANCELLED'].includes(stage.get(r.id)!)).length,
    expiredAfterProposal,
    missed: rows.filter((r) => stage.get(r.id) === 'MISSED').length,
    blockedRisk: blocked.length,
    pending: rows.filter((r) => stage.get(r.id) === 'PENDING').length,
    legacy: legacy.length,
    proposalRecords: rows.filter((r) => r.origin === 'PROPOSAL_RECORD').length,
  };
  // Strategy-level funnel: detection → invalidation before entry (not a loss) → proposal expiry.
  const strategies = [...new Set([...watches.map((w) => `${w.strategyId}@${w.version}`), ...rows.map((r) => `${r.strategyId}@${r.version}`)])].sort();
  const funnelByStrategy = strategies.map((k) => {
    const [strategyId, version] = k.split('@'),
      ws = watches.filter((w) => w.strategyId === strategyId && w.version === version),
      rs = rows.filter((r) => r.strategyId === strategyId && r.version === version),
      det = sum(ws.map((w) => Number(w.n))),
      inv = sum(ws.filter((w) => w.state === 'INVALIDATED').map((w) => Number(w.n))),
      expired = rs.filter((r) => r.lifecycle === 'EXPIRED' && stageOf(r) === 'EXECUTABLE'),
      lifetimes = expired.flatMap((r) => (r.proposal?.createdAt && r.proposal?.expiresAt ? [(r.proposal.expiresAt - r.proposal.createdAt) / 60] : [])),
      after = metricsOf(uniqueOpportunities(expired).map(asTrade), p);
    return {
      strategyId,
      version,
      detected: det,
      confirmed: rs.length,
      invalidatedBeforeConfirmation: inv,
      invalidationRate: det ? inv / det : null,
      missedOrInvalidatedAfter: rs.filter((r) => ['MISSED', 'INVALIDATED', 'CANCELLED'].includes(stageOf(r))).length,
      executable: rs.filter((r) => stageOf(r) === 'EXECUTABLE').length,
      blockedRisk: rs.filter((r) => stageOf(r) === 'BLOCKED_RISK').length,
      expiredProposals: expired.length,
      avgProposalLifetimeMin: mean(lifetimes),
      afterExpiry: {
        wins: after.wins,
        losses: after.losses,
        neither: after.neither,
        ambiguous: after.ambiguous,
        open: after.open,
        resultR: after.resultR,
      },
    };
  });
  const blockedUnique = uniqueOpportunities(blocked),
    blockedMetrics = metricsOf(blockedUnique.map(asTrade), p),
    excess = blockedUnique.flatMap((r) => (r.proposal?.riskPerContractBRL && r.proposal?.oneRBRL ? [r.proposal.riskPerContractBRL - r.proposal.oneRBRL] : []));
  const days = [...new Set(rows.map((r) => brtDate(r.confirmedAt)))].sort().reverse();
  const duplicates = [...new Map(executable.concat(blocked).map((r) => [opportunityKey(r), r])).keys()]
    .map((k) => executable.concat(blocked).filter((r) => opportunityKey(r) === k))
    .filter((g) => g.length > 1)
    .map((g) => ({
      at: g[0].confirmedAt,
      direction: g[0].direction,
      entry: g[0].entry,
      stop: g[0].stop,
      target: g[0].target,
      stage: stageOf(g[0]),
      strategies: g.map((r) => `${r.strategyId}@${r.version}`),
      ids: g.map((r) => r.id),
    }));
  const attemptRows = [...attempts.values()];
  return {
    parameters: p,
    dataset,
    days: days.length,
    costs: {
      status: 'DADO INSUFICIENTE',
      grossEqualsNet: true,
      reason: 'Custos/corretagem não são registrados; resultado bruto = líquido nesta versão.',
    },
    funnel,
    executable: summary(executable, p),
    legacy: { ...summary(legacy, p), note: 'Propostas anteriores à gestão de risco e às regras de actionability: separadas, fora do resultado.' },
    strategies: byStrategy(executable, p),
    byDay: days.map((date) => {
      const ex = executable.filter((r) => brtDate(r.confirmedAt) === date),
        s = summary(ex, p);
      return {
        date,
        ids: ex.map((r) => r.id),
        opportunities: s.opportunities,
        n: s.n,
        wins: s.wins,
        losses: s.losses,
        neither: s.neither,
        ambiguous: s.ambiguous,
        open: s.open,
        resultR: s.resultR,
        blocked: blocked.filter((r) => brtDate(r.confirmedAt) === date).length,
      };
    }),
    segments: segmentsOf(uniqueExec, attempts, p),
    reentries: {
      byAttempt: segmentsOf(uniqueExec, attempts, p).attempt.rows,
      avgMinutesSincePreviousEntry: mean(attemptRows.flatMap((a) => (a.sinceTradeMin === null ? [] : [a.sinceTradeMin]))),
      avgMinutesSincePreviousStop: mean(attemptRows.flatMap((a) => (a.sinceStopMin === null ? [] : [a.sinceStopMin]))),
      reentriesAfterStop: attemptRows.filter((a) => a.sinceStopMin !== null).length,
    },
    duplicates,
    correlation: correlatedClusters(uniqueExec, p),
    blocked: {
      records: blocked.length,
      opportunities: blockedUnique.length,
      targetFirst: blockedMetrics.wins,
      stopFirst: blockedMetrics.losses,
      neither: blockedMetrics.neither,
      ambiguous: blockedMetrics.ambiguous,
      open: blockedMetrics.open,
      hypotheticalR: blockedMetrics.resultR,
      neitherMarkedR: blockedMetrics.neitherMarkedR,
      avgExcessBRL: mean(excess),
      note: 'Contrafactual: nunca entra no resultado das executáveis. Não é sugestão para aumentar o risco.',
    },
    funnelByStrategy,
    riskConstrained: riskConstrained(uniqueExec, current),
    paperForward: paperForward(input.rows, p),
    rows: rows.map((r) => {
      const a = attempts.get(r.id);
      return {
        id: r.id,
        origin: r.origin,
        dataset: datasetOf(r),
        at: r.confirmedAt,
        date: brtDate(r.confirmedAt),
        strategyId: r.strategyId,
        version: r.version,
        direction: r.direction,
        entry: r.entry,
        stop: r.stop,
        target: r.target,
        rr: r.rr,
        riskPoints: r.riskPoints,
        stage: stage.get(r.id),
        lifecycle: r.lifecycle,
        proposalState: r.proposalState,
        outcome: r.outcome?.status ?? 'OPEN',
        expiredBy: r.outcome?.expiredBy ?? null,
        outcomeVersion: r.outcome?.version ?? null,
        resultR: r.outcome?.resultR ?? null,
        mfeR: r.outcome?.mfeR ?? null,
        maeR: r.outcome?.maeR ?? null,
        opportunityKey: opportunityKey(r),
        attempt: a?.attempt ?? null,
        sinceStopMin: a?.sinceStopMin ?? null,
        trend: trendAlignment(r),
        signalsLast5m: r.cluster?.signalsLast5m ?? null,
        riskPerContractBRL: r.proposal?.riskPerContractBRL ?? null,
        oneRBRL: r.proposal?.oneRBRL ?? null,
        riskSettingsVersion: r.proposal?.riskSettingsVersion ?? null,
        paperResultR: r.paper?.resultR ?? null,
      };
    }),
  };
}
export type Performance = ReturnType<typeof performance>;
/** Deterministic Professor text: numbers only, N always stated, never causality, never robustness with small N. */
export function performanceNarrative(perf: Performance, strategy?: string) {
  const p = perf.parameters,
    s = perf.executable,
    lines: string[] = [];
  const fmt = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}R`);
  lines.push(
    `Executáveis (${perf.dataset}): ${s.opportunities} oportunidade(s), N=${s.n} com alvo ou stop (${s.wins} alvo, ${s.losses} stop), ${s.neither} sem desfecho, ${s.ambiguous} ambígua(s). Resultado ${fmt(s.resultR)}, expectativa ${fmt(s.expectancyR)}. ${s.verdict}.`,
  );
  for (const g of perf.strategies.filter((g) => !strategy || g.strategyId === strategy))
    lines.push(
      `• ${g.strategyId} v${g.version}: N=${g.n}, resultado ${fmt(g.resultR)}, expectativa ${fmt(g.expectancyR)}${g.n < p.minSample ? ' — AMOSTRA INSUFICIENTE' : ''}.`,
    );
  lines.push(
    `Critério: N < ${p.minSample} não permite conclusão. Os números descrevem esta amostra; não explicam por que uma estratégia ganhou ou perdeu e não garantem resultado futuro. Mudança de estratégia exige hipótese, replay/backtest, validação fora da amostra, PAPER forward e aprovação humana em nova versão.`,
  );
  return lines.join('\n');
}
