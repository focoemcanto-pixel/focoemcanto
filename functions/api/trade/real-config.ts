import {
  config,
  rpc,
  persistenceFailure,
  PersistenceError,
  realRiskCap,
  type BridgeEnv,
} from '../../../trade/bridge/config';
import { strategyRegistry } from '../../../trade/scanner/strategies';
/**
 * Static REAL configuration from the authenticated UI: GESTÃO DE RISCO · REAL (capital operacional, 1R,
 * limits — materialized into the enforced policy) and per-version live authorization. Saving never arms
 * REAL (policy changes disarm any armed session) and never sends anything to the broker. Account, symbol
 * and contract expiry come from the server/MT5, never the client. Capital operacional is a planning
 * number; the XP balance/margin is reported separately and never overwrites it.
 */
export const policyConfirmation = 'SALVAR CONFIGURAÇÃO REAL';
export const authorizationConfirmation = 'AUTORIZAR ESTRATÉGIA REAL';
const owner = 'focoos-admin'; // Existing admin-session middleware, never client supplied.
const strategies = () =>
  strategyRegistry
    .filter((s) => !s.definition.unavailableReason && s.definition.enabled)
    .map((s) => ({
      id: s.definition.id,
      version: s.definition.version,
      name: s.definition.name,
    }));
export async function onRequestGet({ env }: { env: BridgeEnv }) {
  try {
    const c = config(env),
      ctx = await rpc(env, 'trade_real_context', { p_bridge: c.bridgeId }),
      { account_hash, ...policy } = ctx?.policy || {};
    const s = ctx?.bridge?.state || {},
      risk = await rpc(env, 'trade_real_risk_settings_read', { p_bridge: c.bridgeId });
    return Response.json(
      {
        policy,
        policyAccountMatches:
          /^[a-f0-9]{64}$/.test(c.accountHash) && account_hash === c.accountHash,
        accountConfigured: /^[a-f0-9]{64}$/.test(c.accountHash),
        bridgeAccountMatches:
          /^[a-f0-9]{64}$/.test(c.accountHash) &&
          ctx?.bridge?.accountHash === c.accountHash,
        accountTradeMode: s.accountTradeMode ?? null,
        symbol: c.symbol,
        bridgeSymbol: ctx?.bridge?.symbol ?? null,
        contractExpiresAt: Number.isFinite(s.expirationTime) && s.expirationTime > 0
          ? new Date(s.expirationTime * 1000).toISOString()
          : null,
        maxContractsCap: c.maxContracts,
        riskCapBRL: realRiskCap(env),
        riskSettings: risk?.settings ?? null,
        riskHistory: risk?.history ?? [],
        // Broker capacity, shown apart from the planning capital; never written into the risk settings.
        brokerFreeMarginBRL: Number.isFinite(s.freeMargin) ? s.freeMargin : null,
        brokerBalanceBRL: Number.isFinite(s.balance) ? s.balance : null,
        executionBackendEnabled: c.execution,
        authorizations: ctx?.authorizations || [],
        strategies: strategies(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return Response.json(persistenceFailure(e), { status: 503 });
  }
}
const num = (v: unknown, min: number, max: number, integer = false) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n)))
    throw new Error('Valor de configuração inválido');
  return n;
};
export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: BridgeEnv;
}) {
  try {
    const body: any = await request.json(),
      c = config(env);
    if (body.action === 'authorize') {
      if (body.confirmation !== authorizationConfirmation)
        throw new Error('Confirmação deliberada obrigatória.');
      const known = strategies().find(
        (s) => s.id === body.strategy && s.version === body.version,
      );
      if (!known) throw new Error('Estratégia/versão inexistente no registro atual.');
      if (typeof body.authorized !== 'boolean') throw new Error('authorized obrigatório');
      return Response.json(
        await rpc(env, 'trade_live_authorization_set', {
          p_strategy: known.id,
          p_version: known.version,
          p_authorized: body.authorized,
        }),
      );
    }
    if (body.action !== 'policy') throw new Error('Ação inválida');
    if (body.confirmation !== policyConfirmation)
      throw new Error('Confirmação deliberada obrigatória.');
    if (!/^[a-f0-9]{64}$/.test(c.accountHash))
      throw new Error(
        'TRADE_ACCOUNT_HASH não configurado no backend. Configure-o uma vez com o fingerprint exibido pelo EA.',
      );
    const ctx = await rpc(env, 'trade_real_context', { p_bridge: c.bridgeId }),
      s = ctx?.bridge?.state || {};
    if (ctx?.bridge?.accountHash !== c.accountHash)
      throw new Error('Conta do bridge diverge de TRADE_ACCOUNT_HASH. Nada foi salvo.');
    if (ctx?.bridge?.symbol !== c.symbol)
      throw new Error('Símbolo do bridge diverge de TRADE_MT5_SYMBOL. Nada foi salvo.');
    if (!Number.isFinite(s.expirationTime) || s.expirationTime * 1000 <= Date.now())
      throw new Error('Vencimento do contrato indisponível ou vencido no MT5.');
    // GESTÃO DE RISCO · REAL. Only these fields are forwarded; the database validates them, computes 1R and
    // the daily limit, materializes the policy and records the version + audit. No absolute maxRiskBRL input.
    const p = body.settings || {},
      cap = realRiskCap(env);
    if (cap === 0) throw new Error('TRADE_REAL_MAX_RISK_BRL inválido: configuração REAL bloqueada.');
    const settings = {
      capitalBRL: num(p.capitalBRL, 0.01, 100000000),
      riskModel: p.riskModel === 'FIXED_BRL' || p.riskModel === 'PCT_CAPITAL' ? p.riskModel : (() => { throw new Error('Modelo de 1R inválido'); })(),
      riskValue: num(p.riskValue, 0.01, 100000),
      dailyLossUnit: p.dailyLossUnit === 'R' || p.dailyLossUnit === 'BRL' ? p.dailyLossUnit : (() => { throw new Error('Unidade da perda diária inválida'); })(),
      dailyLossValue: num(p.dailyLossValue, 0.01, 100000000),
      maxContracts: num(p.maxContracts, 1, c.maxContracts, true),
      maxOrdersPerSession: num(p.maxOrdersPerSession, 1, 100, true),
      maxOrdersPerDay: num(p.maxOrdersPerDay, 1, 500, true),
      maxSessionMinutes: num(p.maxSessionMinutes ?? 120, 5, 480, true),
      maxSlippagePoints: num(p.maxSlippagePoints, 5, 2000),
      maxNotionalBRL: num(p.maxNotionalBRL, 1, 100000000),
      enabled: p.enabled === true,
      rolloverConfirmed: p.rolloverConfirmed === true,
    };
    const saved = await rpc(env, 'trade_real_risk_settings_save', {
      p_owner: owner,
      p_bridge: c.bridgeId,
      p_account: c.accountHash,
      p_symbol: c.symbol,
      p_expires: new Date(s.expirationTime * 1000).toISOString(),
      p_cap: cap,
      p_settings: settings,
    });
    return Response.json({ ...saved, disarmed: true });
  } catch (e) {
    return Response.json(
      e instanceof PersistenceError
        ? persistenceFailure(e)
        : { error: e instanceof Error ? e.message : 'Configuração recusada' },
      { status: 409 },
    );
  }
}
