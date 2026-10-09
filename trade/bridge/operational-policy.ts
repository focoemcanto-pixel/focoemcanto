import { config, realRiskCap, type BridgeEnv } from './config';

/** POLICY2 is a signed, short-lived snapshot, never an order or a remote change to EA inputs. */
export function policyLimits(ctx: any, env: BridgeEnv) {
  const p = ctx?.policy || {}, cap = realRiskCap(env);
  return {
    maxRiskBRL: cap === null ? p.max_risk_brl : Math.min(p.max_risk_brl, cap),
    maxLossBRL: p.max_daily_loss_brl,
    maxSlippagePoints: p.max_slippage_points,
    maxContracts: Math.min(config(env).maxContracts, p.max_contracts),
    maxPositions: p.max_positions,
    maxPositionContracts: p.max_position_contracts,
    maxNotionalBRL: p.max_notional_brl,
    maxOrdersPerSession: p.max_orders_per_session,
    maxOrdersPerDay: p.max_orders_per_day,
    maxSessionMinutes: p.max_session_minutes,
  };
}
export function policyComparison(ctx: any, env: BridgeEnv, now = Date.now()) {
  const operational = { ...policyLimits(ctx, env), maxRiskBRL: ctx?.policy?.max_risk_brl, maxContracts: ctx?.policy?.max_contracts }, hardCaps = ctx?.bridge?.state?.localLimits || {};
  const backendCaps: Record<string, number | null> = { maxRiskBRL: realRiskCap(env), maxContracts: config(env).maxContracts };
  const localKeys = new Set(['maxRiskBRL', 'maxLossBRL', 'maxSlippagePoints', 'maxContracts', 'maxPositions']);
  const rows = Object.entries(operational).map(([key, v]) => {
    const policy = Number.isFinite(v) && v > 0 ? v : null;
    const hardCap = localKeys.has(key) && Number.isFinite(hardCaps[key]) && hardCaps[key] > 0 ? hardCaps[key] : null;
    const backendCap = backendCaps[key] ?? null;
    return { key, policy, hardCap, backendCap, effective: localKeys.has(key) ? policy !== null && hardCap !== null ? Math.min(policy, hardCap, backendCap ?? Infinity) : null : policy,
      capped: policy !== null && ((hardCap !== null && policy > hardCap) || (backendCap !== null && policy > backendCap)),
      action: localKeys.has(key) && hardCap === null ? 'MT5 → Entradas: provisionar teto local positivo.' : policy !== null && hardCap !== null && policy > hardCap ? 'Teto local restringe a policy; reduza a gestão no app ou decida deliberadamente outro teto no MT5.' : policy !== null && backendCap !== null && policy > backendCap ? 'Teto administrativo restringe a policy; reduza a gestão no app.' : null };
  });
  return { version: ctx?.policy?.risk_settings_version ?? null, hash: ctx?.policyFingerprint ?? null, rows,
    brokerDeviationHardCapPoints: hardCaps.maxDeviationPoints ?? null,
    synchronization: ctx?.bridge?.state?.policyProtocol === 1
      ? ctx?.policyFingerprint && ctx.bridge.state.policyReceipt?.hash === ctx.policyFingerprint && ctx.bridge.state.policyReceipt?.version === ctx.policy?.risk_settings_version && Number.isFinite(ctx.bridge.state.policyReceipt?.validUntil) && ctx.bridge.state.policyReceipt.validUntil > now ? 'SYNCED' : 'PENDING'
      : 'LEGACY',
    requiresMT5: ctx?.bridge?.state?.policyProtocol !== 1 || ctx?.bridge?.state?.localAccountAuthorized !== true || rows.some(r => r.hardCap === null && localKeys.has(r.key)) };
}
export async function hmacWire(canonical: string, env: BridgeEnv) {
  if (!env.TRADE_BRIDGE_TOKEN || env.TRADE_BRIDGE_TOKEN.length < 32) throw new Error('Assinatura indisponível');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.TRADE_BRIDGE_TOKEN), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical)))).map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function policyWire(ctx: any, env: BridgeEnv, now = Date.now()) {
  const p = ctx?.policy, b = ctx?.bridge, c = config(env), l = policyLimits(ctx, env);
  if (!p || !b || !/^[a-f0-9]{32}$/.test(ctx.policyFingerprint || '') || p.account_hash !== c.accountHash || b.accountHash !== c.accountHash || !Number.isInteger(p.risk_settings_version) || !Object.values(l).every(v => Number.isFinite(v) && v > 0)) throw new Error('Policy assinada indisponível');
  const s = ctx.session, active = c.execution && s?.active === true && b.killSwitch === false && Date.parse(s.expires_at) > now;
  const fields = ['POLICY2', p.risk_settings_version, ctx.policyFingerprint, c.accountHash, b.session, c.symbol,
    l.maxRiskBRL.toFixed(8), l.maxLossBRL.toFixed(8), l.maxSlippagePoints.toFixed(8), l.maxContracts, l.maxPositions,
    l.maxPositionContracts, l.maxNotionalBRL.toFixed(8), l.maxOrdersPerSession, l.maxOrdersPerDay, l.maxSessionMinutes,
    active ? s.id : '0', active ? Date.parse(s.armed_at) : 0, active ? Date.parse(s.expires_at) : 0, active ? 1 : 0, now, now + Math.min(c.maxAgeMs, 15000)];
  const canonical = fields.join('|');
  return canonical + '|' + await hmacWire(canonical, env) + '\n';
}
export function transportHealth(bridge: any, maxAgeMs: number, now = Date.now()) {
  const t = bridge?.state?.transport || {}, received = Date.parse(bridge?.receivedAt || ''), age = now - received;
  const offline = !Number.isFinite(age) || age < -2000 || age > maxAgeMs || bridge?.state?.connected !== true;
  return { ...t, state: offline ? 'OFFLINE' : t.consecutiveFailures > 0 || Number.isFinite(t.lastFailureAt) && now - t.lastFailureAt < 60000 ? 'DEGRADED' : 'CONNECTED',
    reason: offline ? 'Heartbeat ausente/antigo: novas ordens bloqueadas.' : t.consecutiveFailures > 0 ? 'Falha de transporte reportada: aguarde ACK e reconciliação; não reenvie ordem.' : t.lastFailureAt > now - 60000 ? 'Transporte recuperado recentemente; batch durável preservado.' : 'Heartbeat recente.' };
}
