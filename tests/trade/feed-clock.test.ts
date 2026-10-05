/**
 * One temporal semantics for the XP/MT5 feed, end to end, with the production clock setting
 * (XP broker-wall: BRT wall time labelled as UTC). Raw labels are preserved; every freshness check
 * compares the normalized UTC instant with the backend clock. No broker, no network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { feedStatus } from '../../trade/bridge/mt5';
import { realReadiness } from '../../trade/bridge/real';
import { runScanner } from '../../trade/scanner/service';
import { generateMockCandles } from '../../trade/core/providers';

const bridge = 'xp-mt5-primary',
  account = 'a'.repeat(64),
  wall = 3 * 3600 * 1000; // BRT = UTC-3, no DST
const env = { TRADE_SUPABASE_URL: 'https://fixture.invalid', TRADE_SUPABASE_SERVICE_KEY: 'fixture', TRADE_ACCOUNT_HASH: account };
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
async function database() {
  const db = new PGlite();
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for (const m of migrations) await db.exec(readFileSync('supabase/migrations/' + m, 'utf8'));
  return db;
}
/** EA v2.02-compatible heartbeat: no marketClock in state, broker-wall tick/candle labels. */
function batch(n: number, tickUtcMs: number, opts: { wallClock?: boolean; candles?: any[]; session?: string } = {}) {
  const label = (utcMs: number) => (opts.wallClock === false ? utcMs : utcMs - wall);
  return {
    bridgeId: bridge,
    symbol: 'WINV26',
    session: opts.session || 'ea-v202',
    batch: n,
    accountHash: account,
    state: { protocolVersion: 2, connected: true, executionAllowed: false, tickSize: 5, tickValue: 1, currency: 'BRL', positions: [], orders: [], historyAsOfMsc: Date.now() },
    ticks: [{ symbol: 'WINV26', timeMsc: label(tickUtcMs), bid: 208705, ask: 208710, last: 208705, volume: 1, flags: 6 }],
    candles: (opts.candles || []).map((c) => ({ ...c, timestamp: Math.floor(label(c.timestamp * 1000) / 1000) })),
    events: [],
  };
}
const send = (db: PGlite, b: any) => db.query('select trade_bridge_exchange_v2($1,false,1,$2,15000)', [b, account]);
const read = async (db: PGlite) => (await db.query<any>('select trade_bridge_read($1) r', [bridge])).rows[0].r;

test('A/B/G/H/I: current broker-wall tick is LIVE; normalized exactly once; received_at real UTC; raw preserved', async () => {
  const db = await database();
  try {
    const tickUtc = Date.now() - 5000; // B — 5 s old
    await send(db, batch(1, tickUtc));
    const r = await read(db),
      f = feedStatus(r, env);
    assert.equal(f.status, 'LIVE'); // A
    assert.ok(f.ageMs! >= 4000 && f.ageMs! < 8000, String(f.ageMs)); // B
    assert.equal(r.tick.timeMsc, tickUtc); // G — normalized UTC = raw + 3 h, once
    assert.equal(r.tick.rawTimeMsc, tickUtc - wall); // I — raw label kept
    const stored = (await db.query<any>('select time_msc from trade_bridge_ticks')).rows[0];
    assert.equal(Number(stored.time_msc), tickUtc - wall); // I — persisted raw, never rewritten
    const received = Date.parse(r.receivedAt);
    assert.ok(Math.abs(received - Date.now()) < 5000); // H — backend clock, real UTC
    assert.equal(f.clock.configuredOffsetSeconds, -wall / 1000);
  } finally {
    await db.close();
  }
});

test('C/D: aging tick goes LIVE → STALE → OFFLINE; backlog is diagnosed, never promoted', async () => {
  const db = await database();
  try {
    const now = Date.now(),
      candle = { symbol: 'WINV26', timeframe: '1m', open: 1, high: 1, low: 1, close: 1, volume: 1, timestamp: Math.floor(now / 60000) * 60 - 60 };
    await send(db, batch(1, now - 1000, { candles: [candle] }));
    const r = await read(db);
    assert.equal(feedStatus(r, env, now).status, 'LIVE');
    // C — same heartbeat evidence, 20 s later the tick is older than 15 s: STALE.
    const later = feedStatus({ ...r, receivedAt: new Date(now + 19000).toISOString() }, env, now + 20000);
    assert.equal(later.status, 'STALE');
    // D — no heartbeat for longer than the limit: OFFLINE.
    assert.equal(feedStatus(r, env, now + 60000).status, 'OFFLINE');
    // Production case: heartbeats and M1 bars current, EA replaying hours-old ticks.
    await send(db, batch(2, now - 4.5 * 3600 * 1000, { candles: [candle] }));
    const backlog = feedStatus(await read(db), env);
    // The newest stored tick stays the newest: an old replayed tick never moves the clock backwards.
    assert.equal(backlog.status, 'LIVE');
    const db2 = await database();
    try {
      await send(db2, batch(1, now - 4.5 * 3600 * 1000, { candles: [candle] }));
      const f = feedStatus(await read(db2), env);
      assert.equal(f.status, 'STALE');
      assert.equal(f.staleReason, 'TICK_BACKLOG');
      assert.ok(Math.abs(f.ageMs! - 4.5 * 3600 * 1000) < 10000);
    } finally {
      await db2.close();
    }
  } finally {
    await db.close();
  }
});

test('E/F: a future tick fails closed; a UTC bridge never receives the offset', async () => {
  const db = await database();
  try {
    await send(db, batch(1, Date.now() + 60000));
    const f = feedStatus(await read(db), env);
    assert.notEqual(f.status, 'LIVE'); // E
    assert.equal(f.staleReason, 'TICK_IN_FUTURE');
  } finally {
    await db.close();
  }
  const utc = await database();
  try {
    await utc.exec('delete from trade_bridge_clock_settings'); // a bridge declared as UTC
    const tickUtc = Date.now() - 2000;
    await send(utc, batch(1, tickUtc, { wallClock: false }));
    const r = await read(utc);
    assert.equal(r.tick.timeMsc, tickUtc); // F — no offset applied
    assert.equal(r.tick.rawTimeMsc, tickUtc);
    assert.equal(feedStatus(r, env).status, 'LIVE');
  } finally {
    await utc.close();
  }
});

test('J: the scanner consumes normalized candle times from the live broker-wall feed', async () => {
  const db = await database(),
    original = globalThis.fetch;
  try {
    const mock = generateMockCandles(),
      end = Math.floor(Date.now() / 60000) * 60,
      delta = end - (mock[179].timestamp + 60),
      candles = mock.slice(0, 180).map((c) => ({ ...c, symbol: 'WINV26', timestamp: c.timestamp + delta }));
    await send(db, batch(1, Date.now() - 1000, { candles }));
    globalThis.fetch = (async (u: any, init: any) => {
      assert.equal(new URL(String(u)).hostname, 'fixture.invalid');
      const name = String(u).split('/').pop()!,
        args = Object.values(JSON.parse(String(init.body)));
      const r = await db.query<any>(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args);
      return Response.json(r.rows[0]?.result ?? null);
    }) as any;
    const result: any = await runScanner(env as any, 'mt5', 0);
    assert.equal(result.feedLive, true); // not "AGUARDANDO FEED"
    assert.equal(result.scan.asOf, end); // normalized UTC, not the BRT label
    assert.ok(result.scan.candidates.length > 0);
  } finally {
    globalThis.fetch = original;
    await db.close();
  }
});

test('K/L/M/N: REAL readiness and enqueue use the same normalized clock; nothing arms, nothing is sent', async () => {
  const db = await database();
  try {
    await send(db, batch(1, Date.now() - 1000));
    const ctx = (await db.query<any>('select trade_real_context($1) r', [bridge])).rows[0].r;
    const real = realReadiness(ctx, { ...env, TRADE_BRIDGE_TOKEN: 'x'.repeat(32) } as any);
    assert.equal(real.gates.find((g) => g.key === 'feed')?.ok, true); // K — LIVE through the same normalization
    assert.equal(real.armed, false); // M
    assert.notEqual(real.state, 'ARMED');
    assert.equal(real.canExecute, false);
    assert.deepEqual((await db.query<any>("select trade_real_session_check($1,15000) r", [bridge])).rows[0].r, { armed: false });
    assert.equal((await db.query<any>('select kill_switch from trade_bridge_state')).rows[0].kill_switch, true);
    // L — isolated fixture: open the enqueue gates only to reach its freshness check (p_max=0 stops before insert).
    await db.exec("update trade_bridge_state set kill_switch=false, state=jsonb_set(state,'{executionAllowed}','true')");
    const command = { id: crypto.randomUUID(), action: 'BUY', symbol: 'WINV26', volume: 1, expiresAt: Date.now() + 10000 };
    await assert.rejects(db.query('select trade_bridge_enqueue($1,$2,0,$3,15000)', [bridge, command, account]), /Exposure exceeds limit/); // fresh: passed the stale check
    await db.query("update trade_bridge_state set tick=jsonb_set(tick,'{timeMsc}',to_jsonb((tick->>'timeMsc')::bigint-60000))");
    await assert.rejects(db.query('select trade_bridge_enqueue($1,$2,0,$3,15000)', [bridge, command, account]), /Stale feed/);
    // N — no command, no session.
    assert.equal((await db.query('select * from trade_bridge_commands')).rows.length, 0);
    assert.equal((await db.query('select * from trade_real_sessions')).rows.length, 0);
  } finally {
    await db.close();
  }
});
