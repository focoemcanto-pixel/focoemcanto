/**
 * REAL operational readiness, end to end, with a simulated EA and a local Postgres (PGlite).
 * The only network allowed is the local fixture host; any other request fails the test.
 * No XP, no MT5, no broker. A dispatched command is only returned to the simulated EA heartbeat.
 * Production clock semantics are kept: XP ticks/candles are broker-wall labelled (BRT as UTC).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { generateMockCandles, snapshotOf } from '../../trade/core/providers';
import { scanMarket } from '../../trade/scanner/engine';
import { realReadiness } from '../../trade/bridge/real';

const bridge = 'xp-mt5-primary',
  account = 'a'.repeat(64),
  wall = 3 * 3600 * 1000; // XP broker wall clock (BRT) labelled as UTC
const migrations = [
  '20261003035402_mt5_bridge.sql',
  '20261003042050_human_approval.sql',
  '20261003124510_multi_strategy_scanner.sql',
  '20261004210552_real_execution_safety.sql',
  '20261005000359_real_execution_fail_closed.sql',
  '20261005091111_pre_real_homologation.sql',
  '20261005092318_pre_real_account_mode.sql',
  '20261005122031_bridge_market_clock.sql',
  '20261005150000_risk_blocked_technical_proposal.sql',
  '20261006090000_real_session_arming.sql',
];
const env = {
  TRADE_SUPABASE_URL: 'https://fixture.invalid',
  TRADE_SUPABASE_SERVICE_KEY: 'isolated-fixture-only',
  TRADE_EXECUTION_ENABLED: 'true',
  TRADE_ACCOUNT_HASH: account,
  TRADE_BRIDGE_TOKEN: 'isolated-test-fixture-token-32-characters',
  TRADE_MAX_CONTRACTS: '2',
  TRADE_MT5_SYMBOL: 'WINV26',
};

/** A complete current-session setup from the shared scanner, stamped with real time. */
function liveSetup() {
  const mock = generateMockCandles(),
    end = Math.floor(Date.now() / 60000) * 60;
  for (let cursor = 120; cursor <= 420; cursor++) {
    const delta = end - (mock[cursor - 1].timestamp + 60),
      candles = mock.slice(0, cursor).map((c) => ({ ...c, symbol: 'WINV26', timestamp: c.timestamp + delta }));
    const candidate = scanMarket(snapshotOf(candles, 'live')).candidates.find(
      (c) => c.state === 'CONFIRMED' && c.analysis.status === 'complete' && !c.analysis.conflicts.length,
    );
    if (candidate) return { candles, candidate, setup: candidate.analysis.setup! };
  }
  throw new Error('no setup');
}

async function world() {
  const db = new PGlite(),
    original = globalThis.fetch,
    called: string[] = [];
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for (const m of migrations) await db.exec(readFileSync('supabase/migrations/' + m, 'utf8'));
  globalThis.fetch = (async (u: any, init: any) => {
    const url = new URL(String(u));
    assert.equal(url.hostname, 'fixture.invalid', 'no network beyond the local fixture');
    const name = url.pathname.split('/').pop()!;
    called.push(name);
    const args = Object.values(JSON.parse(String(init?.body)));
    try {
      const r = await db.query<any>(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args);
      return Response.json(r.rows[0]?.result ?? null);
    } catch (e: any) {
      return Response.json({ code: 'P0001', message: String(e.message) }, { status: 400 });
    }
  }) as any;
  const live = liveSetup(),
    price = live.setup.entry;
  let batch = 0,
    eaSession = 'ea-session-1';
  const state = (now = Date.now()): any => ({
    protocolVersion: 2,
    marketClock: { basis: 'broker-wall', utcOffsetSeconds: -wall / 1000 },
    connected: true,
    executionAllowed: true,
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
    expirationTime: Math.floor((now + 86400000) / 1000),
    tradeMode: 4,
    sessionOpen: true,
    historyReady: true,
    historyAsOfMsc: now,
    loss24hBRL: 0,
    protectionFault: false,
    positions: [],
    orders: [],
    localAccountAuthorized: true,
    localLimits: { maxContracts: 2, maxPositions: 1, maxRiskBRL: 10000, maxLossBRL: 100000, maxSlippagePoints: 1000 },
  });
  /** Simulated EA heartbeat: returns a dispatched command, if the backend releases one. */
  const heartbeat = async (patch: Record<string, unknown> = {}, opts: { tickAgeMs?: number; candles?: boolean } = {}) => {
    const now = Date.now();
    const r = await db.query<any>('select trade_bridge_exchange_v2($1,true,2,$2,15000) result', [
      {
        bridgeId: bridge,
        symbol: 'WINV26',
        session: eaSession,
        batch: ++batch,
        accountHash: account,
        state: { ...state(now), ...patch },
        ticks: [{ symbol: 'WINV26', timeMsc: now - wall - (opts.tickAgeMs || 0), bid: price - 5, ask: price, last: price, volume: 1, flags: 0 }],
        candles: opts.candles ? live.candles.map((c) => ({ ...c, timestamp: c.timestamp - wall / 1000 })) : [],
        events: [],
      },
      account,
    ]);
    return r.rows[0].result?.command ?? null;
  };
  const api = async (path: string, body?: unknown) => {
    const mod: any = await import('../../functions/api/trade/' + path);
    const r: Response = body === undefined
      ? await mod.onRequestGet({ env, request: new Request('https://fixture.invalid/api/trade/' + path) })
      : await mod.onRequestPost({ env, request: new Request('https://fixture.invalid/api/trade/' + path, { method: 'POST', body: JSON.stringify(body) }) });
    return { status: r.status, data: (await r.json()) as any };
  };
  const commands = async () => (await db.query<any>('select * from trade_bridge_commands')).rows;
  const session = async () => (await db.query<any>('select * from trade_real_sessions order by armed_at desc limit 1')).rows[0];
  /** One-time static configuration, done through the same endpoints as the UI. */
  const configure = async () => {
    const policy = await api('real-config', {
      action: 'policy',
      confirmation: 'SALVAR CONFIGURAÇÃO REAL',
      policy: {
        enabled: true,
        rolloverConfirmed: true,
        maxRiskBRL: 10000,
        maxDailyLossBRL: 100000,
        maxSlippagePoints: 1000,
        maxContracts: 2,
        maxNotionalBRL: 100000000,
        maxOrdersPerSession: 5,
        maxOrdersPerDay: 10,
        maxSessionMinutes: 120,
      },
    });
    assert.equal(policy.status, 200, JSON.stringify(policy.data));
    const auth = await api('real-config', {
      action: 'authorize',
      strategy: live.setup.strategy,
      version: live.setup.version,
      authorized: true,
      confirmation: 'AUTORIZAR ESTRATÉGIA REAL',
    });
    assert.equal(auth.status, 200, JSON.stringify(auth.data));
  };
  const arm = (minutes = 60) => api('real-session', { action: 'arm', minutes, confirmation: 'ARMAR SESSÃO REAL' });
  const propose = () => api('operations', { action: 'propose', mode: 'REAL', source: 'mt5', cursor: 0, quantity: 1, strategy: live.setup.strategy });
  const close = async () => {
    globalThis.fetch = original;
    await db.close();
  };
  await heartbeat({}, { candles: true });
  return { db, called, heartbeat, api, commands, session, configure, arm, propose, close, live, setEaSession: (s: string) => (eaSession = s) };
}

test('A/B/C/D/E: select REAL, arm, READY proposal, ENTRAR and final confirmation; only the last makes a command eligible', async () => {
  const w = await world();
  try {
    // A — selecting REAL only reads status: nothing armed, nothing queued.
    let real = (await w.api('real-session')).data;
    assert.equal(real.state, 'UNAVAILABLE');
    assert.equal(real.armed, false);
    await w.configure();
    real = (await w.api('real-session')).data;
    assert.equal(real.state, 'BLOCKED', JSON.stringify(real.armingGates.filter((g: any) => !g.ok)));
    assert.equal(real.canArm, true);
    assert.equal(real.canExecute, false);
    assert.equal((await w.api('execution-status')).data.real.armed, false);
    assert.equal(await w.heartbeat(), null);
    assert.equal((await w.commands()).length, 0);
    // Arming without the deliberate confirmation is refused.
    assert.equal((await w.api('real-session', { action: 'arm', minutes: 60 })).status, 409);
    // B — arming: kill switch released for the session only; still no command, no proposal.
    const armed = await w.arm();
    assert.equal(armed.status, 200, JSON.stringify(armed.data));
    assert.equal(armed.data.state, 'ARMED');
    assert.ok(Date.parse(armed.data.session.expiresAt) > Date.now());
    assert.equal(await w.heartbeat(), null);
    assert.equal((await w.commands()).length, 0);
    assert.equal((await w.db.query('select * from trade_operation_proposals')).rows.length, 0);
    // C — REAL armed + READY proposal: still no command.
    const proposed = await w.propose();
    assert.equal(proposed.status, 200, JSON.stringify(proposed.data));
    const p = proposed.data.payload;
    assert.equal(p.proposalState, 'READY');
    assert.equal(p.inspectionOnly, undefined);
    assert.ok(p.quantity >= 1);
    assert.equal(await w.heartbeat(), null);
    assert.equal((await w.commands()).length, 0);
    // D — ENTRAR prepares the second confirmation: nonce issued, nothing queued.
    const prepared = await w.api('operations', { action: 'prepare-real', id: p.id, mode: 'REAL', cursor: 0 });
    assert.equal(prepared.status, 200, JSON.stringify(prepared.data));
    assert.match(prepared.data.nonce, /^[0-9a-f-]{72}$/);
    assert.equal(await w.heartbeat(), null);
    assert.equal((await w.commands()).length, 0);
    // O — missing / wrong confirmation text is refused.
    assert.equal((await w.api('operations', { action: 'confirm', id: p.id, mode: 'REAL', cursor: 0, nonce: prepared.data.nonce })).status, 409);
    assert.equal((await w.api('operations', { action: 'confirm', id: p.id, mode: 'REAL', cursor: 0, nonce: prepared.data.nonce, confirmation: 'confirmar' })).status, 409);
    // N — invalid nonce is refused.
    assert.equal((await w.api('operations', { action: 'confirm', id: p.id, mode: 'REAL', cursor: 0, nonce: 'x'.repeat(72), confirmation: 'CONFIRMAR ORDEM REAL' })).status, 409);
    assert.equal((await w.commands()).length, 0);
    // E — valid final confirmation: only now a signed command is queued and released to the (simulated) EA.
    const confirmed = await w.api('operations', { action: 'confirm', id: p.id, mode: 'REAL', cursor: 0, nonce: prepared.data.nonce, confirmation: 'CONFIRMAR ORDEM REAL' });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
    assert.equal((await w.commands()).length, 1);
    const dispatched = await w.heartbeat();
    assert.equal(dispatched?.id, p.id);
    assert.equal(dispatched.signatureVersion, 2);
    assert.equal(dispatched.volume, p.quantity);
    assert.equal(dispatched.sl, p.sl);
    assert.equal(dispatched.tp, p.tp);
    assert.equal((await w.commands())[0].state, 'dispatch_unknown');
    // A consumed nonce cannot be replayed into a second command.
    assert.equal(await w.heartbeat(), null);
    assert.equal((await w.commands()).length, 1);
  } finally {
    await w.close();
  }
});

test('F/Q: bridge offline disarms; reopening MT5 restores the feed but never re-arms', async () => {
  const w = await world();
  try {
    await w.configure();
    assert.equal((await w.arm()).data.state, 'ARMED');
    // Mac/MT5 closed: no heartbeat for longer than the feed limit.
    await w.db.exec("update trade_bridge_state set received_at=now()-interval '40 seconds'");
    let real = (await w.api('real-session')).data;
    assert.equal(real.armed, false);
    assert.equal(real.session.reason, 'BRIDGE_OFFLINE');
    assert.equal((await w.session()).disarm_reason, 'BRIDGE_OFFLINE');
    assert.equal((await w.db.query<any>('select kill_switch from trade_bridge_state')).rows[0].kill_switch, true);
    // F — arming while offline is refused.
    const offlineArm = await w.arm();
    assert.equal(offlineArm.status, 409);
    // Q — MT5 reopened: new EA session, fresh feed. Feed is LIVE again, REAL stays BLOCKED.
    w.setEaSession('ea-session-2');
    assert.equal(await w.heartbeat(), null);
    real = (await w.api('real-session')).data;
    assert.equal(real.overview.feedStatus, 'LIVE');
    assert.equal(real.armed, false);
    assert.equal(real.state, 'BLOCKED');
    assert.equal(real.overview.killSwitch, true);
    assert.equal((await w.propose()).data.payload?.inspectionOnly, true);
    assert.equal((await w.commands()).length, 0);
  } finally {
    await w.close();
  }
});

test('G/M: stale feed disarms and an old snapshot never executes', async () => {
  const w = await world();
  try {
    await w.configure();
    await w.arm();
    // M — proposal prepared, then the snapshot gets too old (> 120 s) before ENTRAR.
    const p = (await w.propose()).data.payload;
    await w.db.query("update trade_operation_proposals set payload=jsonb_set(payload,'{asOf}',to_jsonb((payload->>'asOf')::bigint-600)) where id=$1", [p.id]);
    assert.equal((await w.api('operations', { action: 'prepare-real', id: p.id, mode: 'REAL', cursor: 0 })).status, 409);
    // G — bridge alive, but the last tick is 60 s old: STALE, session disarmed, nothing sendable.
    await w.db.exec("update trade_bridge_state set tick=jsonb_set(tick,'{timeMsc}',to_jsonb((tick->>'timeMsc')::bigint-60000))");
    const real = (await w.api('real-session')).data;
    assert.equal(real.armed, false);
    assert.equal(real.session.reason, 'FEED_STALE');
    assert.equal((await w.commands()).length, 0);
  } finally {
    await w.close();
  }
});

test('H: BLOQUEAR EXECUÇÃO disarms, cancels queued commands, never releases by itself', async () => {
  const w = await world();
  try {
    await w.configure();
    await w.arm();
    const p = (await w.propose()).data.payload;
    const prepared = (await w.api('operations', { action: 'prepare-real', id: p.id, mode: 'REAL', cursor: 0 })).data;
    assert.equal((await w.api('operations', { action: 'confirm', id: p.id, mode: 'REAL', cursor: 0, nonce: prepared.nonce, confirmation: 'CONFIRMAR ORDEM REAL' })).status, 200);
    assert.equal((await w.commands())[0].state, 'queued');
    const kill = await w.api('kill', { enabled: true });
    assert.equal(kill.status, 200);
    assert.equal((await w.commands())[0].state, 'cancelled');
    assert.equal((await w.session()).disarm_reason, 'KILL_SWITCH');
    assert.equal(await w.heartbeat(), null);
    // Releasing is only possible through a new deliberate arming.
    assert.equal((await w.api('kill', { enabled: false })).status, 409);
    await assert.rejects(w.db.query("select trade_bridge_kill('xp-mt5-primary',false)"), /only by arming/);
    assert.equal((await w.api('real-session')).data.state, 'BLOCKED');
  } finally {
    await w.close();
  }
});

test('I/K/L/P: missing risk limit, wrong fingerprint, wrong symbol and expired session all fail closed', async () => {
  const w = await world();
  try {
    await w.configure();
    // I — no max_risk_brl in the policy: arming refused.
    await w.db.exec('update trade_execution_policy set max_risk_brl=null');
    const noLimit = await w.arm();
    assert.equal(noLimit.status, 409);
    assert.match(noLimit.data.error, /Limites|limit/i);
    await assert.rejects(
      w.db.query("select trade_real_arm('focoos-admin',$1,60,$2,15000,true,'ARMAR SESSÃO REAL')", [bridge, account]),
      /POLICY_LIMITS_MISSING/,
    );
    await w.db.exec('update trade_execution_policy set max_risk_brl=10000');
    // P — session expiry: armed, then expires → disarmed, proposal becomes inspection only.
    assert.equal((await w.arm()).data.state, 'ARMED');
    await w.db.exec("update trade_real_sessions set armed_at=now()-interval '1 hour', expires_at=now()-interval '1 second' where disarmed_at is null");
    let real = (await w.api('real-session')).data;
    assert.equal(real.armed, false);
    assert.equal(real.session.reason, 'EXPIRED');
    assert.equal((await w.propose()).data.payload.inspectionOnly, true);
    // K — account fingerprint changes under an armed session.
    assert.equal((await w.arm()).data.state, 'ARMED');
    await w.db.query('update trade_bridge_state set account_hash=$1', ['b'.repeat(64)]);
    real = (await w.api('real-session')).data;
    assert.equal(real.session.reason, 'ACCOUNT_CHANGED');
    assert.equal((await w.arm()).status, 409);
    await w.db.query('update trade_bridge_state set account_hash=$1', [account]);
    // L — symbol changes under an armed session.
    assert.equal((await w.arm()).data.state, 'ARMED');
    await w.db.exec("update trade_bridge_state set symbol='WINZ26'");
    real = (await w.api('real-session')).data;
    assert.equal(real.session.reason, 'SYMBOL_CHANGED');
    assert.equal((await w.commands()).length, 0);
  } finally {
    await w.close();
  }
});

test('N: an expired final-confirmation nonce aborts', async () => {
  const w = await world();
  try {
    await w.configure();
    await w.arm();
    const p = (await w.propose()).data.payload;
    const prepared = (await w.api('operations', { action: 'prepare-real', id: p.id, mode: 'REAL', cursor: 0 })).data;
    await w.db.exec("update trade_real_confirmations set expires_at=now()-interval '1 second'");
    assert.equal((await w.api('operations', { action: 'confirm', id: p.id, mode: 'REAL', cursor: 0, nonce: prepared.nonce, confirmation: 'CONFIRMAR ORDEM REAL' })).status, 409);
    assert.equal((await w.commands()).length, 0);
  } finally {
    await w.close();
  }
});

test('J: armed REAL + RISK_BLOCKED proposal never executes', async () => {
  const w = await world();
  try {
    await w.configure();
    // Limit below one contract (policy change through SQL also disarms; arm again deliberately).
    await w.db.exec('update trade_execution_policy set max_risk_brl=1');
    assert.equal((await w.arm()).data.state, 'ARMED');
    const blocked = await w.propose();
    assert.equal(blocked.data.state, 'BLOQUEADA POR RISCO');
    assert.equal(blocked.data.payload.proposalState, 'RISK_BLOCKED');
    assert.equal(blocked.data.payload.quantity, 0);
    for (const action of ['prepare-real', 'confirm'])
      assert.equal((await w.api('operations', { action, id: blocked.data.id, mode: 'REAL', cursor: 0, nonce: 'x'.repeat(72), confirmation: 'CONFIRMAR ORDEM REAL' })).status, 409);
    assert.equal(await w.heartbeat(), null);
    assert.equal((await w.commands()).length, 0);
    assert.equal((await w.db.query('select * from trade_real_confirmations')).rows.length, 0);
  } finally {
    await w.close();
  }
});

test('gates are organised as static configuration, session controls and per-order checks', () => {
  const r = realReadiness({}, env as any);
  const scopes = Object.fromEntries(r.gates.map((g) => [g.key, g.scope]));
  for (const k of ['backend', 'policy', 'authorization', 'account', 'protocol', 'symbol', 'expiration', 'rollover', 'limits', 'local', 'metadata'])
    assert.equal(scopes[k], 'static', k);
  for (const k of ['armed', 'kill', 'ea', 'bridge', 'feed', 'session', 'reconciliation', 'unresolved', 'daily', 'positions'])
    assert.equal(scopes[k], 'session', k);
  assert.equal(r.state, 'UNAVAILABLE');
  assert.equal(r.canArm, false);
  assert.ok(!r.armingGates.some((g) => g.key === 'armed' || g.key === 'kill'));
});
