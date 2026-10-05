import { decisionSnapshot } from '../core/market-context';
import { validateLevels, validateSetup } from '../core/invariants';
import { timeframeSeconds } from '../core/providers';
import type { Timeframe } from '../core/types';
import type { MarketSnapshot } from '../core/types';
import { calculateFeatures } from './features';
import { strategyRegistry, scannerParameters } from './strategies';
import { buildHypotheses, deskSummary } from './proximity';
import type { MarketFeatures } from './features';
import type { FrameContext, MarketContextSnapshot } from './types';
/** Versioned, objective subset of the features already computed by the scanner (nothing inferred). */
export const marketContextVersion = 'context-v1';
function marketContext(features: MarketFeatures, snapshot: MarketSnapshot): MarketContextSnapshot {
  const frame = (tf: '1m' | '5m' | '15m'): FrameContext => {
    const f = features.frames[tf],
      bars = snapshot.candles[tf] || [],
      recent = bars.slice(-20);
    return {
      bars: f?.count ?? 0,
      close: f?.last?.close ?? null,
      emaFast: f?.emaFast ?? null,
      emaSlow: f?.emaSlow ?? null,
      atr: f?.atr ?? null,
      rsi: f?.rsi ?? null,
      macd: f?.macd ?? null,
      signal: f?.signal ?? null,
      support: f?.support ?? null,
      resistance: f?.resistance ?? null,
      volumeRatio: f?.volumeRatio ?? null,
      momentum: f?.momentum ?? null,
      rangeHigh: recent.length ? Math.max(...recent.map((c) => c.high)) : null,
      rangeLow: recent.length ? Math.min(...recent.map((c) => c.low)) : null,
    };
  };
  return { version: marketContextVersion, regimes: features.regimes, frames: { '1m': frame('1m'), '5m': frame('5m'), '15m': frame('15m') } };
}
import type {
  ScannerResult,
  StrategyEvaluator,
  StrategyCandidate,
  SetupWatch,
  WatchState,
} from './types';
export function scanMarket(
  snapshot: MarketSnapshot,
  registry: StrategyEvaluator[] = strategyRegistry,
  feedLive = true,
): ScannerResult {
  snapshot = {
    ...snapshot,
    candles: Object.fromEntries(
      Object.entries(snapshot.candles).map(([tf, cs]) => [
        tf,
        cs.filter(
          (c) =>
            c.timestamp + timeframeSeconds[tf as Timeframe] <= snapshot.asOf,
        ),
      ]),
    ) as MarketSnapshot['candles'],
  };
  snapshot = decisionSnapshot(snapshot);
  const features = calculateFeatures(snapshot),
    candidates = registry.map((r) => r.evaluate(snapshot, features));
  if (snapshot.source === 'live' && !feedLive)
    candidates.forEach((c) => {
    const p=c.definition.parameters;
    const rules={minStopPoints:p.minStopPoints ?? p.minStopTicks*snapshot.tickSize, maxStopPoints:p.maxStopPoints ?? (features.frames['1m'].atr || 0)*p.maxStopAtr,targetR:p.targetR};
    const errors=c.analysis.setup ? validateSetup(c.analysis.setup,snapshot.tickSize,rules) : c.projected ? validateLevels({direction:c.analysis.trend==='down'?'SELL':'BUY',...c.projected},snapshot.tickSize,rules) : c.analysis.rejectionReasons || [];
    if(errors.length && c.state!=='INSUFFICIENT_DATA' && c.state!=='UNAVAILABLE_DATA') {
      c.state='REJECTED'; c.analysis.status='blocked'; c.analysis.setup=undefined;c.projected=undefined;c.analysis.projected=undefined; c.reasons=errors;c.analysis.rejectionReasons=errors;c.analysis.explanation='SETUP DESCARTADO: '+errors.join(' ');
    }
      c.state = 'UNAVAILABLE_DATA';
      c.analysis.setup = undefined;
      c.analysis.status = 'blocked';
      c.reasons = [
        'Feed OFFLINE/antigo: nenhuma nova hipótese pode ser confirmada.',
      ];
      c.analysis.explanation = c.reasons[0];
    });
  const summary = Object.fromEntries(
    [
      'REJECTED',
      'INSUFFICIENT_DATA',
      'UNAVAILABLE_DATA',
      'FORMING',
      'WAITING_TRIGGER',
      'CONFIRMED',
      'DISABLED',
    ].map((k) => [k, 0]),
  ) as ScannerResult['summary'];
  candidates.forEach((c) => {
    const p=c.definition.parameters;
    const rules={minStopPoints:p.minStopPoints ?? p.minStopTicks*snapshot.tickSize, maxStopPoints:p.maxStopPoints ?? (features.frames['1m'].atr || 0)*p.maxStopAtr,targetR:p.targetR};
    const errors=c.analysis.setup ? validateSetup(c.analysis.setup,snapshot.tickSize,rules) : c.projected ? validateLevels({direction:c.analysis.trend==='down'?'SELL':'BUY',...c.projected},snapshot.tickSize,rules) : c.analysis.rejectionReasons || [];
    if(errors.length && c.state!=='INSUFFICIENT_DATA' && c.state!=='UNAVAILABLE_DATA') {
      c.state='REJECTED'; c.analysis.status='blocked'; c.analysis.setup=undefined;c.projected=undefined;c.analysis.projected=undefined; c.reasons=errors;c.analysis.rejectionReasons=errors;c.analysis.explanation='SETUP DESCARTADO: '+errors.join(' ');
    }
    if (
      c.state !== 'UNAVAILABLE_DATA' &&
      c.state !== 'INSUFFICIENT_DATA' &&
      (!c.definition.eligibleRegimes.some((r) =>
        features.regimes.includes(r),
      ) ||
        c.definition.ineligibleRegimes.some((r) =>
          features.regimes.includes(r),
        ))
    ) {
      c.state = 'REJECTED';
      c.analysis.status = 'waiting';
      c.analysis.setup = undefined;
      c.reasons.push('Regime incompatível com a definição da estratégia.');
    }
    if (!c.definition.enabled) {
      c.state = 'DISABLED';
      c.analysis.setup = undefined;
    }
    summary[c.state]++;
  });
  const confirmed = candidates.filter((c) => c.state === 'CONFIRMED'),
    directions = new Set(confirmed.map((c) => c.analysis.setup?.direction));
  if (directions.size > 1)
    confirmed.forEach((c) => {
      const conflict =
        'Hipóteses confirmadas em direções opostas. Conflito explícito; proposta bloqueada.';
      c.analysis.conflicts.push(conflict);
      c.analysis.setup!.conflicts.push(conflict);
    });
  const opportunities: StrategyCandidate[] = [],
    groups: ScannerResult['groups'] = [];
  for (const c of candidates.filter((c) =>
    ['FORMING', 'WAITING_TRIGGER', 'CONFIRMED'].includes(c.state),
  )) {
    const p = c.projected;
    const at = opportunities.findIndex(
      (o) =>
        p &&
        o.projected &&
        c.state === o.state &&
        c.analysis.trend === o.analysis.trend &&
        Math.abs(p.entry - o.projected.entry) <=
          snapshot.tickSize * scannerParameters.dedupEntryTicks &&
        Math.abs(p.stop - o.projected.stop) <=
          snapshot.tickSize * scannerParameters.dedupStopTicks,
    );
    if (at >= 0) groups[at].participants.push(c.definition.id);
    else {
      opportunities.push(c);
      groups.push({
        primary: c.definition.id,
        participants: [c.definition.id],
      });
    }
  }
  const feedBlocked = snapshot.source === 'live' && !feedLive,
    hypotheses = buildHypotheses(candidates, feedBlocked);
  return {
    lastBar: snapshot.candles['1m'].at(-1),
    asOf: snapshot.asOf,
    symbol: snapshot.symbol,
    regimes: features.regimes,
    candidates,
    opportunities,
    groups,
    summary,
    hypotheses,
    desk: deskSummary(hypotheses, candidates, feedBlocked),
    context: marketContext(features, snapshot),
  };
}
const transitions: Record<WatchState, WatchState[]> = {
  DETECTED: [
    'FORMING',
    'WAITING_TRIGGER',
    'CONFIRMED',
    'INVALIDATED',
    'EXPIRED',
  ],
  FORMING: [
    'WAITING_TRIGGER',
    'CONFIRMED',
    'INVALIDATED',
    'EXPIRED',
    'REJECTED_BY_USER',
  ],
  WAITING_TRIGGER: [
    'FORMING',
    'CONFIRMED',
    'INVALIDATED',
    'EXPIRED',
    'REJECTED_BY_USER',
  ],
  CONFIRMED: ['PROPOSED', 'RISK_BLOCKED', 'INVALIDATED', 'EXPIRED'],
  PROPOSED: ['ACCEPTED', 'REJECTED_BY_USER', 'INVALIDATED', 'EXPIRED'],
  // Technical proposal exists but the risk limit allows zero contracts. Terminal; never an order.
  RISK_BLOCKED: [],
  ACCEPTED: ['OPEN_PAPER', 'CLOSED_PAPER'],
  REJECTED_BY_USER: [],
  INVALIDATED: [],
  EXPIRED: [],
  OPEN_PAPER: ['CLOSED_PAPER'],
  CLOSED_PAPER: [],
};
export function transitionWatch(
  w: SetupWatch,
  to: WatchState,
  at: number,
  reason: string,
): SetupWatch {
  if (w.state === to) return w;
  if (!transitions[w.state].includes(to))
    throw new Error(`Transição inválida ${w.state} → ${to}`);
  return {
    ...w,
    state: to,
    lastAsOf: at,
    confirmedAt: to === 'CONFIRMED' ? at : w.confirmedAt,
    invalidatedAt: to === 'INVALIDATED' ? at : w.invalidatedAt,
    expiredAt: to === 'EXPIRED' ? at : w.expiredAt,
    transitions: [...w.transitions, { from: w.state, to, at, reason }],
  };
}
export function advanceWatches(
  previous: SetupWatch[],
  scan: ScannerResult,
): SetupWatch[] {
  const watches = structuredClone(previous);
  for (const w of watches) {
    if (
      !['DETECTED', 'FORMING', 'WAITING_TRIGGER', 'CONFIRMED'].includes(
        w.state,
      ) ||
      scan.asOf <= w.lastAsOf
    )
      continue;
    const c = scan.candidates.find(
      (c) =>
        c.definition.id === w.candidate.definition.id &&
        c.definition.version === w.candidate.definition.version,
    );
    if (scan.asOf >= w.validUntil) {
      Object.assign(
        w,
        transitionWatch(w, 'EXPIRED', scan.asOf, 'Validade temporal encerrada'),
      );
      continue;
    }
    if (!c || c.state === 'INSUFFICIENT_DATA' || c.state === 'UNAVAILABLE_DATA') {
      Object.assign(w,transitionWatch(w,'INVALIDATED',scan.asOf,'Estrutura atual insuficiente ou versão da estratégia alterada; hipótese antiga não reutilizada'));
      continue;
    }
    if (
      (w.state === 'CONFIRMED' && c.state !== 'CONFIRMED') ||
      c.analysis.trend !== w.candidate.analysis.trend
    ) {
      Object.assign(
        w,
        transitionWatch(
          w,
          'INVALIDATED',
          scan.asOf,
          'Confirmação não se manteve ou direção da hipótese mudou',
        ),
      );
      continue;
    }
    const entry = c.projected?.entry,
      stop = w.candidate.projected?.stop,
      sign = w.candidate.analysis.trend === 'down' ? -1 : 1;
    if (
      c.state === 'REJECTED' ||
      (stop !== undefined &&
        scan.lastBar !== undefined &&
        (sign === 1 ? scan.lastBar.low <= stop : scan.lastBar.high >= stop)) ||
      (entry !== undefined && stop !== undefined && sign * (entry - stop) <= 0)
    ) {
      Object.assign(
        w,
        transitionWatch(
          w,
          'INVALIDATED',
          scan.asOf,
          'Contexto perdido ou invalidação técnica atingida',
        ),
      );
      continue;
    }
    const next =
      c.state === 'CONFIRMED'
        ? 'CONFIRMED'
        : c.state === 'WAITING_TRIGGER'
          ? 'WAITING_TRIGGER'
          : 'FORMING';
    if (transitions[w.state].includes(next))
      Object.assign(w, transitionWatch(w, next, scan.asOf, c.trigger));
    w.candidate = c;
    w.lastAsOf = scan.asOf;
  }
  for (const c of scan.opportunities) {
    if (
      watches.some(
        (w) =>
          w.candidate.definition.id === c.definition.id &&
          w.candidate.definition.version === c.definition.version &&
          w.candidate.analysis.trend === c.analysis.trend &&
          ![
            'INVALIDATED',
            'EXPIRED',
            'CLOSED_PAPER',
            'REJECTED_BY_USER',
            'RISK_BLOCKED',
          ].includes(w.state),
      )
    )
      continue;
    const id = `${scan.symbol}:${c.definition.id}:${c.definition.version}:${scan.asOf}`,
      state =
        c.state === 'CONFIRMED'
          ? 'CONFIRMED'
          : c.state === 'WAITING_TRIGGER'
            ? 'WAITING_TRIGGER'
            : 'FORMING';
    const w: SetupWatch = {
      id,
      state: 'DETECTED',
      candidate: c,
      detectedAt: scan.asOf,
      validUntil: c.validUntil,
      lastAsOf: scan.asOf,
      participants: (
        scan.groups.find((g) => g.primary === c.definition.id)
          ?.participants || [c.definition.id]
      ).map((id) => ({
        id,
        version: scan.candidates.find((x) => x.definition.id === id)!.definition
          .version,
      })),
      transitions: [],
    };
    watches.push(transitionWatch(w, state, scan.asOf, c.trigger));
  }
  return watches;
}
