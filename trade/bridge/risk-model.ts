/** Pure PAPER risk-management types and the 1R rule (shared by UI and backend; no I/O). */
export type RiskModel = 'FIXED_BRL' | 'PCT_CAPITAL';
export type RiskSettings = {
  version: number;
  configHash: string;
  mode: 'PAPER';
  capitalBRL: number;
  riskModel: RiskModel;
  riskValue: number;
  oneRBRL: number;
  dailyLossUnit: 'R' | 'BRL';
  dailyLossValue: number;
  dailyLossBRL: number;
  maxContracts: number;
  maxTradesPerDay: number;
  createdAt?: string;
};
export type RiskStatus = {
  settings: RiskSettings | null;
  day?: string;
  tradesToday: number;
  realizedTodayBRL: number;
  lossTodayBRL: number;
  lossTodayR: number | null;
  openRiskBRL: number;
  dailyLossRemainingBRL: number | null;
  tradesRemaining: number | null;
  blocked: null | 'RISK_SETTINGS_MISSING' | 'RISK_SETTINGS_UNAVAILABLE' | 'DAILY_LOSS_LIMIT_REACHED' | 'DAILY_TRADE_LIMIT_REACHED';
};
/** Same rule as the database (display/preview only; the database result is authoritative). */
export function oneRBRL(capitalBRL: number, model: RiskModel, value: number) {
  return Math.round((model === 'FIXED_BRL' ? value : (capitalBRL * value) / 100) * 100) / 100;
}
