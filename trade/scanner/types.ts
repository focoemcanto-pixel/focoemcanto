import type { Analysis, MarketSnapshot, Timeframe } from '../core/types';
export type Regime =
  | 'TREND_UP'
  | 'TREND_DOWN'
  | 'RANGE'
  | 'EXPANSION'
  | 'CONTRACTION'
  | 'HIGH_VOLATILITY'
  | 'LOW_VOLATILITY'
  | 'UNCERTAIN';
export type CandidateState =
  | 'REJECTED'
  | 'INSUFFICIENT_DATA'
  | 'UNAVAILABLE_DATA'
  | 'FORMING'
  | 'WAITING_TRIGGER'
  | 'CONFIRMED'
  | 'DISABLED';
export type WatchState =
  | 'DETECTED'
  | 'FORMING'
  | 'WAITING_TRIGGER'
  | 'CONFIRMED'
  | 'PROPOSED'
  | 'ACCEPTED'
  | 'REJECTED_BY_USER'
  | 'INVALIDATED'
  | 'EXPIRED'
  | 'OPEN_PAPER'
  | 'CLOSED_PAPER'
  | 'RISK_BLOCKED';
export interface InstrumentSpecification {
  symbol: string;
  assetClass: string;
  tickSize: number;
  tickValue: number;
  pointValue: number;
  minVolume: number;
  volumeStep: number;
  currency: string;
  session: { timezone: string; open: string; close: string };
  contractExpiration: string | null;
  rollover: { requiresValidation: boolean };
}
export interface StrategyDefinition {
  id: string;
  version: string;
  name: string;
  stage: 'paper' | 'research';
  liveAuthorized: false;
  timeframes: Timeframe[];
  eligibleRegimes: Regime[];
  ineligibleRegimes: Regime[];
  requiredData: string[];
  /** Closed current-session bars each timeframe needs before the rule can be evaluated. */
  dataRequirements?: DataRequirement[];
  parameters: Record<string, number>;
  enabled: boolean;
  unavailableReason?: string;
}
export interface DataRequirement {
  timeframe: Timeframe;
  bars: number;
  reason: string;
}
export interface Warmup {
  frames: { timeframe: Timeframe; have: number; need: number }[];
  /** Earliest close time at which every frame has enough bars, if the session keeps printing. */
  readyAt: number | null;
}
/** Distance from the last close to the level that would fire the trigger. Diagnostic only. */
export interface TriggerProximity {
  level: number | null;
  label: string;
  distancePoints: number | null;
}
export interface StrategyCandidate {
  definition: StrategyDefinition;
  state: CandidateState;
  analysis: Analysis;
  reasons: string[];
  projected?: {
    entry: number;
    stop: number;
    target: number;
    rr: number;
    region: [number, number];
  };
  trigger: string;
  detectedAt: number;
  validUntil: number;
  regime: Regime[];
  warmup?: Warmup;
  proximity?: TriggerProximity;
}
export type HypothesisStage =
  | 'CONFIRMED'
  | 'WAITING_TRIGGER'
  | 'FORMING'
  | 'FAR'
  | 'REJECTED'
  | 'WARMING_UP'
  | 'UNAVAILABLE_DATA'
  | 'DISABLED';
export type HypothesisBlockerCode =
  | 'REGIME_MISMATCH'
  | 'CONTEXT_NOT_MET'
  | 'RISK_OUT_OF_BOUNDS'
  | 'INVALID_LEVELS'
  | 'FEED_NOT_LIVE'
  | 'DATA_UNAVAILABLE'
  | 'WARMING_UP'
  | 'DISABLED'
  | 'DIRECTION_CONFLICT';
/** Visible, explained state of one registered strategy. Never a recommendation or a proposal. */
export interface Hypothesis {
  id: string;
  version: string;
  name: string;
  stage: HypothesisStage;
  direction: 'long' | 'short' | null;
  met: number;
  total: number;
  missing: string[];
  blockers: { code: HypothesisBlockerCode; message: string }[];
  factors: {
    key: string;
    label: string;
    points: number;
    weight: number;
    detail: string;
  }[];
  score: number;
  rank: number;
  why: string;
  trigger: string;
  projection: { entry: number; stop: number; target: number } | null;
  validUntil: number;
  warmup?: Warmup;
}
export type DeskVerdict =
  | 'CONFIRMED'
  | 'CONFLICT'
  | 'WAITING_TRIGGER'
  | 'FORMING'
  | 'WARMING_UP'
  | 'FEED_NOT_LIVE'
  | 'NOTHING';
export interface DeskSummary {
  verdict: DeskVerdict;
  headline: string;
  detail: string;
  nearest: string[];
  coverage: {
    registered: number;
    operational: number;
    awaitingData: number;
    warmingUp: number;
    nextReadyAt: number | null;
  };
}
export interface SetupWatch {
  id: string;
  state: WatchState;
  candidate: StrategyCandidate;
  detectedAt: number;
  validUntil: number;
  lastAsOf: number;
  confirmedAt?: number;
  invalidatedAt?: number;
  expiredAt?: number;
  participants: { id: string; version: string }[];
  transitions: {
    from: WatchState;
    to: WatchState;
    at: number;
    reason: string;
  }[];
}
export interface StrategyEvaluator {
  definition: StrategyDefinition;
  evaluate(
    snapshot: MarketSnapshot,
    features: import('./features').MarketFeatures,
  ): StrategyCandidate;
}
export interface ScannerResult {
  lastBar?: { low: number; high: number };
  asOf: number;
  symbol: string;
  regimes: Regime[];
  candidates: StrategyCandidate[];
  opportunities: StrategyCandidate[];
  groups: { primary: string; participants: string[] }[];
  summary: Record<CandidateState, number>;
  hypotheses?: Hypothesis[];
  desk?: DeskSummary;
  /** Objective features the rules saw at asOf (current-session, closed bars only). For setup snapshots. */
  context?: MarketContextSnapshot;
}
export type FrameContext = {
  bars: number;
  close: number | null;
  emaFast: number | null;
  emaSlow: number | null;
  atr: number | null;
  rsi: number | null;
  macd: number | null;
  signal: number | null;
  support: number | null;
  resistance: number | null;
  volumeRatio: number | null;
  momentum: number | null;
  rangeHigh: number | null;
  rangeLow: number | null;
};
export interface MarketContextSnapshot {
  version: string;
  regimes: Regime[];
  frames: Record<'1m' | '5m' | '15m', FrameContext>;
}
