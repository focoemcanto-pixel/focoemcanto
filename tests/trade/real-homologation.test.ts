/**
 * REAL homologation regressions: what production showed on 06/10 (EA input EnableExecution=true but
 * executionAllowed=false, no TRADE_ACCOUNT_HASH, no policy, no limits) must stay fail-closed while the
 * checklist separates infrastructure from the operator's own decisions. PGlite only; no broker.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { makeProposal } from '../../trade/bridge/approval';
import { realReadiness } from '../../trade/bridge/real';
import { runReplay } from '../../trade/core/engine';
import { generateMockCandles } from '../../trade/core/providers';

const account = 'a'.repeat(64);
/** Fully configured, armed REAL fixture (isolated values, never production configuration). */
function ready() {
  const now = Date.now(),
    analysis = runReplay(generateMockCandles(), 180).analyses[0];
  analysis.setup!.timestamp = now / 1000 - 5;
  const base = makeProposal(
    analysis,
    { mode: 'PAPER', source: 'replay', symbol: 'WIN', quantity: 1, max: 2, pointValue: 0.2, currency: 'BRL', cursor: 180, asOf: now / 1000 - 5, liveAuthorized: false },
    now,
  );
  const p = { ...base, mode: 'REAL' as const, source: 'mt5' as const, symbol: 'WINV26', entry: 135425, sl: 134975, tp: 136325, riskPoints: 450, riskBRL: 90, potentialPoints: 900, potentialBRL: 180, rr: 2 };
  const env: Record<string, string> = {
    TRADE_EXECUTION_ENABLED: 'true',
    TRADE_ACCOUNT_HASH: account,
    TRADE_BRIDGE_TOKEN: 'isolated-test-fixture-token-32-characters',
    TRADE_MAX_CONTRACTS: '2',
  };
  const state: any = {
    connected: true,
    executionAllowed: true,
    executionGate: { input: true, terminalAlgoTrading: true, eaAlgoTrading: true, accountTradeAllowed: true, accountExpertAllowed: true, allowed: true },
    eaVersion: '2.07',
    protocolVersion: 2,
    magic: '706032601',
    currency: 'BRL',
    marginMode: 0,
    accountTradeMode: 2,
    tickSize: 5,
    tickValue: 1,
    volumeMin: 1,
    volumeStep: 1,
    volumeMax: 10,
    point: 1,
    stopsLevel: 5,
    expirationTime: (now + 86400000) / 1000,
    tradeMode: 4,
    sessionOpen: true,
    historyReady: true,
    historyAsOfMsc: now,
    loss24hBRL: 0,
    protectionFault: false,
    positions: [],
    orders: [],
    localAccountAuthorized: true,
    localLimits: { maxContracts: 2, maxPositions: 1, maxRiskBRL: 200, maxLossBRL: 600, maxSlippagePoints: 20 },
  };
  const ctx: any = {
    bridge: { bridgeId: 'xp-mt5-primary', symbol: 'WINV26', accountHash: account, receivedAt: new Date(now).toISOString(), killSwitch: false, tick: { symbol: 'WINV26', timeMsc: now, bid: 135420, ask: 135425, last: 135425, volume: 1, flags: 0 }, state },
    policy: {
      enabled: true,
      account_hash: account,
      symbol: 'WINV26',
      contract_expires_at: new Date(now + 86400000).toISOString(),
      rollover_confirmed: true,
      session_windows: [],
      max_contracts: 2,
      max_positions: 1,
      max_risk_brl: 200,
      max_daily_loss_brl: 600,
      max_slippage_points: 20,
      account_trade_mode: 2,
      max_position_contracts: 2,
      max_orders_per_session: 5,
      max_orders_per_day: 10,
      max_notional_brl: 1000000,
    },
    authorizations: [{ strategy_id: p.setup.strategy, version: p.setup.version, live_authorized: true, stage: 'live-monitoring' }],
    unresolved: 0,
    ordersDay: 0,
    ordersSession: 0,
    session: { id: 's', active: true, armed_at: new Date(now - 60000).toISOString(), expires_at: new Date(now + 3600000).toISOString(), disarmed_at: null, disarm_reason: null },
  };
  return { now, p, env, ctx, state };
}
/** Production as observed on 06/10: EA v2.06 connected, input armed but executionAllowed=false, nothing configured. */
function production() {
  const f = ready();
  f.env.TRADE_EXECUTION_ENABLED = 'false';
  f.env.TRADE_ACCOUNT_HASH = '';
  f.ctx.policy = { session_windows: [], max_contracts: 1, max_positions: 1, max_session_minutes: 120 };
  f.ctx.authorizations = [];
  f.ctx.session = null;
  f.ctx.bridge.killSwitch = true;
  f.state.executionAllowed = false;
  delete f.state.executionGate;
  f.state.eaVersion = '2.06';
  f.state.localAccountAuthorized = false;
  f.state.localLimits = { maxContracts: 1, maxPositions: 1, maxRiskBRL: 0, maxLossBRL: 0, maxSlippagePoints: 0 };
  return f;
}
const gate = (r: ReturnType<typeof realReadiness>, key: string) => r.gates.find((g) => g.key === key)!;

test('production 06/10: infrastructure pending is technical, limits/policy/strategy are operator decisions, arm/kill are session controls; nothing can arm or execute', () => {
  const f = production(),
    r = realReadiness(f.ctx, f.env, undefined, f.now);
  assert.equal(r.state, 'UNAVAILABLE');
  assert.equal(r.phase, 'INFRA_PENDING');
  assert.equal(r.infrastructureReady, false);
  assert.match(r.status, /INFRAESTRUTURA PENDENTE/);
  assert.equal(r.canArm, false);
  assert.equal(r.canExecute, false);
  for (const k of ['backend', 'ea', 'account']) assert.equal(gate(r, k).kind, 'TECHNICAL', k);
  for (const k of ['policy', 'limits', 'authorization', 'rollover', 'frequency', 'exposure']) assert.equal(gate(r, k).kind, 'DECISION', k);
  assert.equal(gate(r, 'armed').kind, 'SESSION');
  assert.equal(gate(r, 'kill').kind, 'SESSION');
  // v2.06 gives no breakdown: the reason says EnableExecution=true is not enough and names the MT5 permissions.
  assert.match(gate(r, 'ea').action, /EnableExecution=true não basta.*Algo Trading/);
  assert.match(gate(r, 'account').action, /TRADE_ACCOUNT_HASH/);
  // The EA's local limits are decisions, the local fingerprint is technical.
  const local = gate(r, 'local').checks!;
  assert.deepEqual(
    local.filter((x) => !x.ok).map((x) => x.kind),
    ['TECHNICAL', 'DECISION', 'DECISION', 'DECISION'],
  );
  assert.ok(r.pendingDecisions.some((g) => g.key === 'limits'));
  assert.ok(!r.pendingTechnical.some((g) => ['limits', 'policy', 'authorization', 'armed', 'kill'].includes(g.key)), 'a decision is never a technical failure');
});

test('EA execution=true is reflected exactly; v2.07 names the MT5 permission that is off', () => {
  const f = ready();
  assert.equal(gate(realReadiness(f.ctx, f.env, undefined, f.now), 'ea').ok, true);
  assert.equal(realReadiness(f.ctx, f.env, undefined, f.now).overview.eaExecutionAllowed, true);
  // EnableExecution=true but the terminal Algo Trading button is off → the EA reports executionAllowed=false.
  f.state.executionAllowed = false;
  f.state.executionGate = { ...f.state.executionGate, terminalAlgoTrading: false, allowed: false };
  const r = realReadiness(f.ctx, f.env, f.p, f.now),
    ea = gate(r, 'ea');
  assert.equal(ea.ok, false);
  assert.equal(r.canExecute, false);
  assert.deepEqual(
    ea.checks!.filter((x) => !x.ok).map((x) => x.label),
    ['Botão Algo Trading do terminal ligado'],
  );
  assert.match(ea.action, /Algo Trading/);
});

test('infrastructure ready but no operator decisions → AWAITING_OPERATOR; still cannot arm or execute', () => {
  const f = ready();
  f.ctx.policy = { session_windows: [], account_hash: account, account_trade_mode: 2, symbol: 'WINV26', contract_expires_at: new Date(f.now + 86400000).toISOString() };
  f.ctx.authorizations = [];
  f.ctx.session = null;
  f.ctx.bridge.killSwitch = true;
  f.state.localLimits = { maxContracts: 1, maxPositions: 1, maxRiskBRL: 0, maxLossBRL: 0, maxSlippagePoints: 0 };
  const r = realReadiness(f.ctx, f.env, undefined, f.now);
  assert.equal(r.infrastructureReady, true, JSON.stringify(r.pendingTechnical));
  assert.equal(r.phase, 'AWAITING_OPERATOR');
  assert.match(r.status, /INFRAESTRUTURA PRONTA · AGUARDANDO DECISÕES DO OPERADOR/);
  assert.equal(r.canArm, false);
  assert.equal(r.canExecute, false);
  assert.deepEqual(
    r.pendingDecisions.map((g) => g.key).sort(),
    ['authorization', 'daily', 'exposure', 'frequency', 'limits', 'local', 'policy', 'rollover'].sort(),
  );
});

test('everything configured but disarmed → READY_DISARMED: arming possible only by a human; no execution', () => {
  const f = ready();
  f.ctx.session = null;
  f.ctx.bridge.killSwitch = true;
  const r = realReadiness(f.ctx, f.env, f.p, f.now);
  assert.equal(r.phase, 'READY_DISARMED');
  assert.equal(r.canArm, true);
  assert.equal(r.armed, false);
  assert.equal(r.canExecute, false, 'a READY proposal without an armed session and released kill switch never executes');
});

test('fail closed: each missing piece alone blocks execution of a READY proposal in an armed session', () => {
  const base = ready();
  assert.equal(realReadiness(base.ctx, base.env, base.p, base.now).canExecute, true, 'fixture is complete');
  const cases: Record<string, (f: ReturnType<typeof ready>) => void> = {
    'backend TRADE_EXECUTION_ENABLED=false': (f) => (f.env.TRADE_EXECUTION_ENABLED = 'false'),
    'backend flag absent': (f) => delete f.env.TRADE_EXECUTION_ENABLED,
    'fingerprint absent in backend': (f) => (f.env.TRADE_ACCOUNT_HASH = ''),
    'fingerprint divergent (EA)': (f) => (f.ctx.bridge.accountHash = 'b'.repeat(64)),
    'fingerprint divergent (policy)': (f) => (f.ctx.policy.account_hash = 'c'.repeat(64)),
    'EA ExpectedAccountFingerprint empty': (f) => (f.state.localAccountAuthorized = false),
    'EA execution disabled': (f) => (f.state.executionAllowed = false),
    'policy disabled': (f) => (f.ctx.policy.enabled = false),
    'policy without risk limit': (f) => (f.ctx.policy.max_risk_brl = null),
    'policy without daily loss': (f) => (f.ctx.policy.max_daily_loss_brl = null),
    'policy without slippage': (f) => (f.ctx.policy.max_slippage_points = null),
    'EA local risk limit zero': (f) => (f.state.localLimits.maxRiskBRL = 0),
    'kill switch active': (f) => (f.ctx.bridge.killSwitch = true),
    'session not armed': (f) => (f.ctx.session = null),
    'strategy not authorized': (f) => (f.ctx.authorizations = []),
    'rollover not confirmed': (f) => (f.ctx.policy.rollover_confirmed = false),
    'contract expired in MT5': (f) => (f.state.expirationTime = (f.now - 1000) / 1000),
    'unresolved command': (f) => (f.ctx.unresolved = 1),
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const f = ready();
    mutate(f);
    assert.equal(realReadiness(f.ctx, f.env, f.p, f.now).canExecute, false, name);
  }
});

// ---------- persistence: lease, retries and diagnostics (PGlite, no broker) ----------
const migrations = readdirSync('supabase/migrations').filter((f) => f >= '20261003035402' && f.endsWith('.sql')).sort();
async function db() {
  const d = new PGlite();
  await d.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for (const m of migrations) await d.exec(readFileSync('supabase/migrations/' + m, 'utf8'));
  await d.exec('delete from trade_bridge_clock_settings');
  return d;
}
const batchOf = (session: string, batch: number, now = Date.now()) => ({
  bridgeId: 'xp-mt5-primary',
  symbol: 'WINV26',
  session,
  batch,
  accountHash: account,
  state: { protocolVersion: 2, connected: true, executionAllowed: true, tickSize: 5, positions: [], orders: [] },
  ticks: [{ symbol: 'WINV26', timeMsc: now + batch, bid: 130000, ask: 130005, last: 130000, volume: 1, flags: 6 }],
  candles: [],
  events: [],
});
const send = (d: PGlite, b: any, execution = false) => d.query<any>('select trade_bridge_exchange_v2($1,$2,1,$3,15000) r', [b, execution, account]);

test('lease takeover is safe: a new EA session takes over only after the lease expires, and the old one can never overwrite the current state', async () => {
  const d = await db();
  try {
    await send(d, batchOf('a'.repeat(32), 1));
    // A second EA while the first holds the lease (the 10:00:29 BRIDGE_SESSION_LEASE_CONFLICT).
    await assert.rejects(send(d, batchOf('b'.repeat(32), 1)), /Another EA session owns the lease/);
    assert.equal((await d.query<any>('select session from trade_bridge_state')).rows[0].session, 'a'.repeat(32));
    // Lease expires (old EA stopped) → the new session takes over (the 10:00:31 HTTP 200).
    await d.exec(`update trade_bridge_state set received_at=now()-interval '20 seconds'`);
    await send(d, batchOf('b'.repeat(32), 2));
    assert.equal((await d.query<any>('select session from trade_bridge_state')).rows[0].session, 'b'.repeat(32));
    // The old session can never overwrite the current one.
    await assert.rejects(send(d, batchOf('a'.repeat(32), 3)), /Another EA session owns the lease/);
    assert.equal((await d.query<any>('select session from trade_bridge_state')).rows[0].session, 'b'.repeat(32));
    assert.equal((await d.query<any>('select count(*)::int n from trade_bridge_commands')).rows[0].n, 0);
  } finally {
    await d.close();
  }
});

test('a lost response (BRIDGE_RESPONSE_TEXT / transport failure) is retried with the same durable batch: idempotent, no duplicate data, no new command', async () => {
  const d = await db();
  try {
    const b = batchOf('c'.repeat(32), 7);
    const first = (await send(d, b)).rows[0].r,
      ticks = (await d.query<any>('select count(*)::int n from trade_bridge_ticks')).rows[0].n;
    const retry = (await send(d, b)).rows[0].r;
    assert.deepEqual(retry.command ?? null, first.command ?? null);
    assert.equal((await d.query<any>('select count(*)::int n from trade_bridge_ticks')).rows[0].n, ticks, 'replayed batch adds nothing');
    assert.equal((await d.query<any>('select count(*)::int n from trade_bridge_commands')).rows[0].n, 0);
  } finally {
    await d.close();
  }
});

test('exchange diagnostics expose only booleans about TRADE_ACCOUNT_HASH, never its value', async () => {
  const d = await db(),
    original = globalThis.fetch;
  try {
    globalThis.fetch = (async (u: any, init: any) => {
      const name = new URL(String(u)).pathname.split('/').pop()!;
      const args = Object.values(JSON.parse(String(init?.body)));
      try {
        const r = await d.query<any>(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args);
        return r.fields[0]?.dataTypeID === 2278 || (r.rows[0]?.result ?? null) === null ? new Response(null, { status: 204 }) : Response.json(r.rows[0].result);
      } catch (e: any) {
        return Response.json({ code: 'P0001', message: String(e.message) }, { status: 400 });
      }
    }) as any;
    const { onRequestPost: exchange } = await import('../../functions/api/trade/bridge/exchange');
    const token = 'unit-test-placeholder-32-characters-long';
    const post = async (env: Record<string, string>, session: string) =>
      exchange({
        request: new Request('https://fixture.invalid/api/trade/bridge/exchange', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(batchOf(session, 1)),
        }),
        env: { TRADE_SUPABASE_URL: 'https://fixture.invalid', TRADE_SUPABASE_SERVICE_KEY: 'fixture', TRADE_BRIDGE_TOKEN: token, ...env } as any,
      });
    // Not configured (production today): accepted, diagnostics say so.
    assert.equal((await post({ TRADE_EXECUTION_ENABLED: 'false' }, 'd'.repeat(32))).status, 200);
    let diag = (await d.query<any>('select state from trade_bridge_state')).rows[0].state.backendDiagnostics;
    assert.equal(diag.accountHashConfigured, false);
    assert.equal(diag.accountHashMatchesBatch, false);
    assert.equal(diag.executionEnabled, false);
    // Configured and matching.
    await d.exec(`update trade_bridge_state set received_at=now()-interval '20 seconds'`);
    assert.equal((await post({ TRADE_EXECUTION_ENABLED: 'false', TRADE_ACCOUNT_HASH: account }, 'e'.repeat(32))).status, 200);
    diag = (await d.query<any>('select state from trade_bridge_state')).rows[0].state.backendDiagnostics;
    assert.equal(diag.accountHashConfigured, true);
    assert.equal(diag.accountHashMatchesBatch, true);
    assert.doesNotMatch(JSON.stringify(diag), new RegExp(account));
    // A wrong TRADE_ACCOUNT_HASH fails closed at the transport (no state written for that batch).
    const wrong = await post({ TRADE_EXECUTION_ENABLED: 'true', TRADE_ACCOUNT_HASH: 'f'.repeat(64) }, 'e'.repeat(32));
    assert.equal(wrong.status, 400);
    assert.equal((await wrong.json()).errorCode, 'BRIDGE_ACCOUNT_MISMATCH');
    assert.equal((await d.query<any>('select count(*)::int n from trade_bridge_commands')).rows[0].n, 0);
  } finally {
    globalThis.fetch = original;
    await d.close();
  }
});

test('EA v2.07: the log shows the real gate (not the input), the fingerprint only in the local log, transport failures keep the durable batch, no OrderSend outside Execute', () => {
  const ea = readFileSync('mt5/FocoTradeBridge.mq5', 'utf8');
  assert.match(ea, /#property version "2\.07"/);
  assert.doesNotMatch(ea, /EnableExecution\?"ARMED":"LOCKED"/, 'ARMED must come from ExecutionAllowed(), not the input');
  assert.match(ea, /if\(ExecutionAllowed\(\)\)return "ARMED";/);
  assert.match(ea, /\\"executionGate\\":"\+GateJson\(\)/);
  // Fingerprint printed locally; the only network payload carrying it is the existing accountHash field.
  assert.match(ea, /Print\("Foco Trade account fingerprint \(ExpectedAccountFingerprint \/ TRADE_ACCOUNT_HASH\): ",accountHash/);
  assert.doesNotMatch(ea, /Print\([^;]*BridgeToken/, 'the token is never printed');
  // A transport failure returns before the pending batch is cleared (retry the same durable batch).
  const failure = ea.indexOf('TRANSPORT_FAILURE'),
    clear = ea.indexOf('pending="";FileDelete(prefix+"pending.txt"');
  assert.ok(failure > 0 && clear > failure);
  assert.match(ea.slice(failure, ea.indexOf('\n', failure)), /return;\}$/);
  assert.equal((ea.match(/OrderSend\(/g) || []).length, 1, 'a single OrderSend, inside the gated Execute');
});
