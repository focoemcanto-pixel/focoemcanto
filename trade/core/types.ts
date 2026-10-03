export type Timeframe = '1m' | '5m' | '15m' | '1h';
export type Stage = 'research' | 'backtest' | 'paper' | 'live-monitoring';
export type Candle = {
  symbol: string;
  timestamp: number;
  timeframe: Timeframe;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
export type Condition = {
  key: string;
  label: string;
  met: boolean;
  detail: string;
};
export type Setup = {
  id: string;
  strategy: string;
  version: string;
  timestamp: number;
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  targets: number[];
  riskPoints: number;
  potentialPoints: number;
  rr: number;
  conditions: Condition[];
  conflicts: string[];
  explanation: string;
};
export type Analysis = {
  strategy: string;
  version: string;
  stage: Stage;
  status: 'waiting' | 'complete' | 'blocked';
  trend: 'up' | 'down' | 'neutral';
  conditions: Condition[];
  missing: string[];
  conflicts: string[];
  support?: number;
  resistance?: number;
  region?: [number, number];
  setup?: Setup;
  projected?: {
    entry: number;
    stop: number;
    target: number;
    rr: number;
    region: [number, number];
  };
  explanation: string;
};
export type MarketSnapshot = {
  symbol: string;
  asOf: number;
  candles: Record<Timeframe, Candle[]>;
  source: 'mock' | 'replay' | 'live';
  tickSize: number;
};
export interface Strategy<P = unknown> {
  id: string;
  version: string;
  stage: Stage;
  liveAuthorized: boolean;
  parameters: P;
  evaluate(snapshot: MarketSnapshot): Analysis;
}
export type PaperTrade = {
  id: string;
  setup: Setup;
  entryTimestamp: number;
  exitTimestamp?: number;
  entry: number;
  exit?: number;
  resultR?: number;
  durationMinutes?: number;
  outcome: 'open' | 'target' | 'stop';
  conditions: Condition[];
  ambiguous?: boolean;
};
export type Metrics = {
  occurrences: number;
  closed: number;
  winRate: number;
  payoff: number | null;
  expectancy: number;
  profitFactor: number | null;
  drawdownR: number;
  netR: number;
};
