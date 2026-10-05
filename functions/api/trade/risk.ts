import { rpc, persistenceFailure, PersistenceError, type BridgeEnv } from '../../../trade/bridge/config';
import { paperRiskStatus } from '../../../trade/bridge/risk-settings';
const owner = 'focoos-admin'; // Existing admin-session middleware, never client supplied.
/** PAPER risk management: current version + today's PAPER consumption. Read-only. */
export async function onRequestGet({ env }: { env: BridgeEnv }) {
  try {
    return Response.json(await paperRiskStatus(env), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json(persistenceFailure(e), { status: 503 });
  }
}
/**
 * Saves a new immutable PAPER risk version. Only these fields are forwarded; the database validates
 * them and computes 1R. This endpoint has no path to REAL: it never touches execution policy, kill
 * switch, authorizations, sessions, commands or the broker account.
 */
export async function onRequestPost({ request, env }: { request: Request; env: BridgeEnv }) {
  try {
    const b: any = await request.json();
    const settings = {
      capitalBRL: Number(b?.capitalBRL),
      riskModel: String(b?.riskModel ?? ''),
      riskValue: Number(b?.riskValue),
      dailyLossUnit: String(b?.dailyLossUnit ?? ''),
      dailyLossValue: Number(b?.dailyLossValue),
      maxContracts: Number(b?.maxContracts),
      maxTradesPerDay: Number(b?.maxTradesPerDay),
    };
    if (Object.values(settings).some((v) => typeof v === 'number' && !Number.isFinite(v)))
      throw new Error('RISK_SETTINGS_INVALID: valores numéricos inválidos');
    await rpc(env, 'trade_risk_settings_save', { p_owner: owner, p_settings: settings });
    return Response.json(await paperRiskStatus(env));
  } catch (e) {
    return Response.json(
      e instanceof PersistenceError ? persistenceFailure(e) : { error: e instanceof Error ? e.message : 'Falha' },
      { status: 409 },
    );
  }
}
