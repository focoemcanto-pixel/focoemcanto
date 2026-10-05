import {
  config,
  rpc,
  persistenceFailure,
  PersistenceError,
  type BridgeEnv,
} from '../../../trade/bridge/config';
import { strategyRegistry } from '../../../trade/scanner/strategies';
/**
 * One-time static REAL configuration from the authenticated UI: risk policy and per-version live
 * authorization. Saving never arms REAL (policy changes disarm any armed session) and never sends
 * anything to the broker. Account and symbol come from the server configuration, never the client.
 */
export const policyConfirmation = 'SALVAR CONFIGURAÇÃO REAL';
export const authorizationConfirmation = 'AUTORIZAR ESTRATÉGIA REAL';
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
    const s = ctx?.bridge?.state || {};
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
    const p = body.policy || {},
      maxRiskBRL = num(p.maxRiskBRL, 1, 100000),
      maxDailyLossBRL = num(p.maxDailyLossBRL, maxRiskBRL, 1000000),
      maxOrdersPerSession = num(p.maxOrdersPerSession, 1, 100, true);
    const policy = {
      enabled: p.enabled === true,
      rolloverConfirmed: p.rolloverConfirmed === true,
      contractExpiresAt: new Date(s.expirationTime * 1000).toISOString(),
      maxRiskBRL,
      maxDailyLossBRL,
      maxSlippagePoints: num(p.maxSlippagePoints, 5, 2000),
      maxContracts: num(p.maxContracts, 1, c.maxContracts, true),
      maxNotionalBRL: num(p.maxNotionalBRL, 1, 100000000),
      maxOrdersPerSession,
      maxOrdersPerDay: num(p.maxOrdersPerDay, maxOrdersPerSession, 500, true),
      maxSessionMinutes: num(p.maxSessionMinutes ?? 120, 5, 480, true),
    };
    const saved = await rpc(env, 'trade_real_policy_save', {
      p_bridge: c.bridgeId,
      p_account: c.accountHash,
      p_symbol: c.symbol,
      p_policy: policy,
    });
    return Response.json({ policy: saved, disarmed: true });
  } catch (e) {
    return Response.json(
      e instanceof PersistenceError
        ? persistenceFailure(e)
        : { error: e instanceof Error ? e.message : 'Configuração recusada' },
      { status: 409 },
    );
  }
}
