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
  | 'CLOSED_PAPER';
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
  parameters: Record<string, number>;
  enabled: boolean;
  unavailableReason?: string;
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
}
