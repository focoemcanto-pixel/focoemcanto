import { rpc, type BridgeEnv } from './config';
/**
 * PAPER risk management (versioned, persisted in trade_risk_settings_versions). The database is the
 * authority: it validates, computes 1R and keeps every version immutable. Operational capital is a
 * planning number, never the broker balance. Nothing here touches REAL.
 */
import type { RiskSettings, RiskStatus } from './risk-model';
export * from './risk-model';
const num = (v: unknown) => (v === null || v === undefined ? v : Number(v));
function normalize(s: any): RiskStatus {
  const st = s?.settings;
  return {
    settings: st
      ? {
          ...st,
          version: Number(st.version),
          capitalBRL: Number(st.capitalBRL),
          riskValue: Number(st.riskValue),
          oneRBRL: Number(st.oneRBRL),
          dailyLossValue: Number(st.dailyLossValue),
          dailyLossBRL: Number(st.dailyLossBRL),
          maxContracts: Number(st.maxContracts),
          maxTradesPerDay: Number(st.maxTradesPerDay),
        }
      : null,
    day: s?.day,
    tradesToday: Number(s?.tradesToday ?? 0),
    realizedTodayBRL: Number(s?.realizedTodayBRL ?? 0),
    netPnlTodayBRL: Number(s?.netPnlTodayBRL ?? s?.realizedTodayBRL ?? 0),
    policy: s?.policy,
    openPositions: Number(s?.openPositions ?? 0),
    lossTodayBRL: Number(s?.lossTodayBRL ?? 0),
    lossTodayR: num(s?.lossTodayR) as number | null,
    openRiskBRL: Number(s?.openRiskBRL ?? 0),
    dailyLossRemainingBRL: num(s?.dailyLossRemainingBRL) as number | null,
    tradesRemaining: num(s?.tradesRemaining) as number | null,
    blocked: s?.blocked ?? null,
  };
}
/** Current settings + today's PAPER consumption. Fails closed: unreadable settings mean no quantity. */
export async function paperRiskStatus(env: BridgeEnv): Promise<RiskStatus> {
  try {
    return normalize(await rpc(env, 'trade_risk_status', { p_owner: 'focoos-admin' }));
  } catch {
    return normalize({ blocked: 'RISK_SETTINGS_UNAVAILABLE' });
  }
}
/** Risk Engine inputs for PAPER: riskBudgetBRL = persisted 1R. No settings → no limit → RISK_BLOCKED. */
export function paperRiskPolicy(status: RiskStatus): { maxRiskBRL: number | null; source: string; maxContracts: number } {
  const s = status.settings;
  return s
    ? { maxRiskBRL: s.oneRBRL, source: `gestão de risco v${s.version} (${s.configHash.slice(0, 8)})`, maxContracts: s.maxContracts }
    : { maxRiskBRL: null, source: status.blocked === 'RISK_SETTINGS_UNAVAILABLE' ? 'gestão de risco indisponível' : 'gestão de risco não configurada', maxContracts: 1 };
}
/** Immutable copy stored in each proposal: later changes of 1R never rewrite it. */
export function riskSnapshot(status: RiskStatus) {
  const s = status.settings;
  return s
    ? {
        version: s.version,
        configHash: s.configHash,
        capitalBRL: s.capitalBRL,
        riskModel: s.riskModel,
        riskValue: s.riskValue,
        oneRBRL: s.oneRBRL,
        dailyLossBRL: s.dailyLossBRL,
        maxContracts: s.maxContracts,
        maxTradesPerDay: s.maxTradesPerDay,
        dailyBlocked: status.blocked,
      }
    : null;
}
export type RiskSnapshot = NonNullable<ReturnType<typeof riskSnapshot>>;
