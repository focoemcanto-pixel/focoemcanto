import { config, type BridgeEnv } from './config';
import { feedStatus } from './mt5';
/**
 * Single source of truth for operational readiness, in separate dimensions. Market data uses the same
 * feedStatus over the same normalized bridge read as the header (LIVE/STALE/OFFLINE), so the header and
 * the REAL panel can never disagree. "EA connected" and "EA execution enabled" are different facts:
 * a connected EA with EnableExecution=false is CONNECTED + EXECUTION DISABLED, never DISCONNECTED.
 * Unknown (context unavailable) is reported as UNKNOWN, never guessed as OFFLINE/disconnected.
 */
export type Readiness = {
  marketData: 'LIVE' | 'STALE' | 'OFFLINE' | 'UNKNOWN';
  feedAgeMs: number | null;
  bridgeTransport: 'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN';
  ea: 'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN';
  eaVersion: string | null;
  eaExecution: 'ENABLED' | 'DISABLED' | 'UNKNOWN';
  backendExecution: 'ENABLED' | 'DISABLED';
  realSession: 'ARMED' | 'NOT_ARMED' | 'UNKNOWN';
  policy: 'VALID' | 'INVALID' | 'MISSING' | 'UNKNOWN';
  killSwitch: 'ON' | 'OFF' | 'UNKNOWN';
  strategy: 'AUTHORIZED' | 'NOT_AUTHORIZED' | 'UNKNOWN';
  account: 'VERIFIED' | 'NOT_VERIFIED' | 'UNKNOWN';
};
export function readinessDimensions(bridge: any, env: BridgeEnv, ctx?: any, now = Date.now()): Readiness {
  const c = config(env),
    s = bridge?.state || {},
    received = bridge?.receivedAt ? Date.parse(bridge.receivedAt) : NaN,
    recent = Number.isFinite(received) && now - received >= -2000 && now - received <= c.maxAgeMs,
    feed = bridge ? feedStatus(bridge, env, now) : null,
    known = ctx !== undefined && ctx !== null;
  const policy = ctx?.policy;
  return {
    marketData: feed ? (feed.status as Readiness['marketData']) : 'UNKNOWN',
    feedAgeMs: feed?.ageMs ?? null,
    bridgeTransport: !bridge ? 'UNKNOWN' : recent ? 'CONNECTED' : 'DISCONNECTED',
    ea: !bridge ? 'UNKNOWN' : recent && s.connected === true ? 'CONNECTED' : 'DISCONNECTED',
    eaVersion: s.eaVersion ?? null,
    eaExecution: !bridge ? 'UNKNOWN' : s.executionAllowed === true ? 'ENABLED' : 'DISABLED',
    backendExecution: c.execution ? 'ENABLED' : 'DISABLED',
    realSession: !known ? 'UNKNOWN' : ctx.session?.active === true ? 'ARMED' : 'NOT_ARMED',
    policy: !known ? 'UNKNOWN' : !policy ? 'MISSING' : policy.enabled === true ? 'VALID' : 'INVALID',
    killSwitch: !bridge ? 'UNKNOWN' : bridge.killSwitch === false ? 'OFF' : 'ON',
    strategy: !known ? 'UNKNOWN' : (ctx.authorizations || []).some((a: any) => a.live_authorized === true) ? 'AUTHORIZED' : 'NOT_AUTHORIZED',
    account: !known
      ? 'UNKNOWN'
      : /^[a-f0-9]{64}$/.test(c.accountHash) && ctx.bridge?.accountHash === c.accountHash && policy?.account_hash === c.accountHash
        ? 'VERIFIED'
        : 'NOT_VERIFIED',
  };
}
