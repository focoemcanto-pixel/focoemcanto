/**
 * Transport stability: the EA exchange must never wait on the panel's operations read, and that read must stay
 * bounded as the hypothetical-observation journal grows. Local Postgres (PGlite); no network, no broker.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

async function db() {
  const d = new PGlite();
  await d.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for (const m of readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql') && f !== '20261003021627_foco_trade_initial.sql').sort())
    await d.exec(readFileSync('supabase/migrations/' + m, 'utf8'));
  return d;
}

test('the exchange availability probe uses an owner without proposals, never the real operations list', async () => {
  const src = readFileSync('functions/api/trade/bridge/exchange.ts', 'utf8');
  const probe = src.slice(src.indexOf('async function probeOperations'), src.indexOf('export async function onRequestPost'));
  assert.ok(probe.includes('p_owner: operationsProbeOwner'));
  assert.ok(!probe.includes("'focoos-admin'"), 'the EA path must not read the operator operations');
  const { operationsProbeOwner } = await import('../../functions/api/trade/bridge/exchange');
  assert.notEqual(operationsProbeOwner, 'focoos-admin');
  const d = await db();
  try {
    await d.query(`insert into trade_operation_proposals(id,owner_id,bridge_id,payload,expires_at,state) values(gen_random_uuid(),'focoos-admin','xp-mt5-primary','{"mode":"PAPER"}',now()+interval '1 minute','AGUARDANDO CONFIRMAÇÃO')`);
    const r = (await d.query<any>('select trade_operations_read($1) r', [operationsProbeOwner])).rows[0].r;
    assert.deepEqual(r, [], 'probe answers from the owner index with no data');
  } finally {
    await d.close();
  }
});

test('operations read returns at most 50 recent journal entries per proposal, without snapshots, oldest first; the table keeps everything', async () => {
  const d = await db();
  try {
    const id = (await d.query<any>(`insert into trade_operation_proposals(id,owner_id,bridge_id,payload,expires_at,state) values(gen_random_uuid(),'focoos-admin','xp-mt5-primary','{"mode":"PAPER","setup":{"id":"s"}}',now()+interval '1 minute','BLOQUEADA POR RISCO') returning id`)).rows[0].id;
    await d.query(`insert into trade_operation_journal(proposal_id,kind,payload) select $1,'HIPOTETICO_PAPER',jsonb_build_object('n',g,'big',repeat('x',2000)) from generate_series(1,60) g`, [id]);
    const rows = (await d.query<any>(`select trade_operations_read('focoos-admin') r`)).rows[0].r;
    assert.equal(rows.length, 1);
    const j = rows[0].journal;
    assert.equal(j.length, 50);
    assert.deepEqual(Object.keys(j[0]).sort(), ['created_at', 'id', 'kind']);
    assert.ok(j.every((x: any, i: number) => i === 0 || x.id > j[i - 1].id), 'oldest first');
    assert.equal(j[49].id, Math.max(...j.map((x: any) => x.id)), 'the most recent entries are kept');
    assert.equal(Number((await d.query<any>('select count(*) n from trade_operation_journal where proposal_id=$1', [id])).rows[0].n), 60, 'audit keeps every entry');
    // Same proposal, state and command fields as before.
    assert.equal(rows[0].id, id);
    assert.equal(rows[0].state, 'BLOQUEADA POR RISCO');
    assert.equal(rows[0].command, null);
    assert.deepEqual(rows[0].events, []);
    const idx = (await d.query<any>(`select indexdef from pg_indexes where indexname='trade_operation_journal_proposal'`)).rows;
    assert.equal(idx.length, 1);
  } finally {
    await d.close();
  }
});

// ── Persistence outage on the EA exchange path (API → RPC → Postgres), idempotent recovery ─────────────────
const account = 'a'.repeat(64),
  token = 'unit-test-placeholder-32-characters-long';
const batchOf = (session: string, batch: number, now = Date.now()) => ({
  bridgeId: 'xp-mt5-primary',
  symbol: 'WINV26',
  session,
  batch,
  accountHash: account,
  state: { protocolVersion: 2, connected: true, executionAllowed: false, tickSize: 5, positions: [], orders: [] },
  ticks: [{ symbol: 'WINV26', timeMsc: now + batch, bid: 130000, ask: 130005, last: 130000, volume: 1, flags: 6 }],
  candles: [],
  events: [],
});

test('PERSISTENCE_UNAVAILABLE on the exchange RPC: no ACK, nothing persisted, upstream status/code kept; the same batch is accepted exactly once after recovery', async () => {
  const d = await db(),
    original = globalThis.fetch;
  let outage: null | { status: number; body: unknown } = null;
  const calls: string[] = [];
  globalThis.fetch = (async (u: any, init: any) => {
    const url = new URL(String(u));
    assert.equal(url.hostname, 'fixture.invalid', 'no network beyond the local fixture');
    const name = url.pathname.split('/').pop()!;
    calls.push(name);
    if (outage && name === 'trade_bridge_exchange_v2') return Response.json(outage.body, { status: outage.status });
    const args = Object.values(JSON.parse(String(init?.body)));
    try {
      const r = await d.query<any>(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args);
      return (r.rows[0]?.result ?? null) === null ? new Response(null, { status: 204 }) : Response.json(r.rows[0].result);
    } catch (e: any) {
      return Response.json({ code: 'P0001', message: String(e.message) }, { status: 400 });
    }
  }) as any;
  try {
    const { onRequestPost: exchange } = await import('../../functions/api/trade/bridge/exchange');
    const env = { TRADE_SUPABASE_URL: 'https://fixture.invalid', TRADE_SUPABASE_SERVICE_KEY: 'fixture', TRADE_BRIDGE_TOKEN: token, TRADE_EXECUTION_ENABLED: 'false', TRADE_ACCOUNT_HASH: account } as any;
    const post = (b: unknown) =>
      exchange({
        request: new Request('https://fixture.invalid/api/trade/bridge/exchange', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(b),
        }),
        env,
      });
    const count = async (t: string) => (await d.query<any>(`select count(*)::int n from ${t}`)).rows[0].n;
    // 1) Normal: 200 + "OK" wire (the only ACK the EA accepts).
    const s = 'f'.repeat(32);
    const ok = await post(batchOf(s, 1));
    assert.equal(ok.status, 200);
    assert.ok((await ok.text()).startsWith('OK\n'));
    const ticks = await count('trade_bridge_ticks'),
      batches = await count('trade_bridge_batches');
    // 2) Postgres restarting (PostgREST 503 PGRST002) and statement timeout (500 57014): no ACK, nothing written.
    for (const o of [
      { status: 503, body: { code: 'PGRST002', message: 'Could not query the database for the schema cache. Retrying.' } },
      { status: 500, body: { code: '57014', message: 'canceling statement due to statement timeout' } },
    ]) {
      outage = o;
      const r = await post(batchOf(s, 2));
      assert.equal(r.status, 400);
      const body: any = await r.json();
      assert.equal(body.errorCode, 'PERSISTENCE_UNAVAILABLE');
      assert.equal(body.stage, 'trade_bridge_exchange_v2');
      assert.equal(body.operation, 'trade_bridge_exchange_v2');
      assert.equal(body.upstreamStatus, o.status);
      assert.equal(body.pgCode, o.body.code);
      assert.equal(body.batch, 2);
      assert.doesNotMatch(JSON.stringify(body), new RegExp(token));
      assert.equal(await count('trade_bridge_ticks'), ticks, 'no partial persistence');
      assert.equal(await count('trade_bridge_batches'), batches, 'batch not acknowledged, cursor not advanced');
    }
    // 3) Recovery: the SAME durable batch is accepted once; a repeated retry (lost response) adds nothing.
    outage = null;
    const rec = await post(batchOf(s, 2));
    assert.equal(rec.status, 200);
    assert.equal(await count('trade_bridge_batches'), batches + 1);
    const afterTicks = await count('trade_bridge_ticks');
    assert.equal(afterTicks, ticks + 1);
    const again = await post(batchOf(s, 2));
    assert.equal(again.status, 200);
    assert.equal(await count('trade_bridge_ticks'), afterTicks, 'retry is idempotent');
    assert.equal(await count('trade_bridge_batches'), batches + 1);
    // Session/lease consistent and no order path touched.
    assert.equal((await d.query<any>('select session from trade_bridge_state')).rows[0].session, s);
    assert.equal(await count('trade_bridge_commands'), 0);
    assert.equal(await count('trade_real_confirmations'), 0);
  } finally {
    globalThis.fetch = original;
    await d.close();
  }
});

test('observation writes are skipped when nothing changed (same JSON regardless of key order)', async () => {
  const { sameJson } = await import('../../functions/api/trade/operations');
  assert.equal(sameJson({ a: 1, b: { c: [1, 2], d: null } }, { b: { d: null, c: [1, 2] }, a: 1 }), true);
  assert.equal(sameJson({ a: 1 }, { a: 2 }), false);
  assert.equal(sameJson({ a: [1, 2] }, { a: [2, 1] }), false, 'array order matters');
  assert.equal(sameJson(null, undefined), true);
  assert.equal(sameJson({ exitTime: null }, null), false);
  const src = readFileSync('functions/api/trade/operations.ts', 'utf8');
  assert.equal((src.match(/!sameJson\(hypothetical, row\.hypothetical_execution\)/g) || []).length, 2);
  assert.ok(src.includes('if (!sameJson(execution, row.execution))'));
});

test('EA classifies a known JSON error envelope by its errorCode; unknown codes keep the shape label', () => {
  const ea = readFileSync('mt5/FocoTradeBridge.mq5', 'utf8');
  // BackendErrorCode returns the errorCode when it is in the allow-list, which includes PERSISTENCE_UNAVAILABLE;
  // only an unknown JSON falls back to ResponseShape (BRIDGE_RESPONSE_JSON_UNKNOWN).
  assert.match(ea, /\|PERSISTENCE_UNAVAILABLE\|/);
  assert.match(ea, /return code!="" && StringFind\(allowed,"\|"\+code\+"\|"\)>=0\?code:ResponseShape\(reply\);/);
  // A transport failure without HTTP response keeps the same durable batch.
  assert.match(ea, /Durable batch ",JsonField\(pending,"batch"\)," kept; retrying the same batch\./);
});

test('proposal UPDATEs that do not change the lifecycle never rewrite the setup watch or the scanner snapshot; real transitions still do', async () => {
  const d = await db();
  try {
    const owner = 'focoos-admin',
      scope = 'mt5:xp-mt5-primary:WINV26';
    await d.query(`insert into trade_scanner_state(owner_id,scope,as_of,payload) values($1,$2,1,'{"watches":[]}')`, [owner, scope]);
    await d.query(`insert into trade_setup_watches(owner_id,scope,id,strategy_id,version,state,detected_at,valid_until,payload) values($1,$2,'w1','s','1.2.0','PROPOSED',1,2,'{"id":"w1"}')`, [owner, scope]);
    const insert = (state: string) =>
      d.query<any>(`insert into trade_operation_proposals(id,owner_id,bridge_id,payload,expires_at,state) values(gen_random_uuid(),$1,'xp-mt5-primary',$2,now()+interval '1 minute',$3) returning id`, [
        owner,
        { mode: 'PAPER', scope, setupWatchId: 'w1', setup: { id: 'x' } },
        state,
      ]);
    const id = (await insert('AGUARDANDO CONFIRMAÇÃO')).rows[0].id;
    const snap = async () => (await d.query<any>(`select s.xmin::text sx, w.xmin::text wx, w.state ws, jsonb_array_length(s.payload->'watches') n from trade_scanner_state s, trade_setup_watches w where w.id='w1'`)).rows[0];
    const before = await snap();
    assert.equal(before.n, 1, 'insert still rebuilds the snapshot');
    // Hypothetical observation once per candle: same lifecycle → no write on the watch or the scanner row.
    for (let i = 0; i < 3; i++) await d.query(`update trade_operation_proposals set hypothetical_execution=$2 where id=$1`, [id, { mfeR: i }]);
    const same = await snap();
    assert.equal(same.sx, before.sx, 'scanner snapshot not rewritten');
    assert.equal(same.wx, before.wx, 'setup watch not rewritten');
    // A real transition (operator discards) behaves exactly as before.
    await d.query(`update trade_operation_proposals set state='DESCARTADA' where id=$1`, [id]);
    const after = await snap();
    assert.equal(after.ws, 'REJECTED_BY_USER');
    assert.notEqual(after.sx, before.sx);
    const w = (await d.query<any>(`select payload from trade_setup_watches where id='w1'`)).rows[0].payload;
    assert.equal(w.transitions.at(-1).to, 'REJECTED_BY_USER');
    assert.equal(Number((await d.query<any>(`select count(*) n from trade_human_decisions where proposal_id=$1`, [id])).rows[0].n), 1);
    // Observations after the transition are again no-ops.
    await d.query(`update trade_operation_proposals set hypothetical_execution=$2 where id=$1`, [id, { mfeR: 9 }]);
    assert.equal((await snap()).sx, after.sx);
  } finally {
    await d.close();
  }
});
