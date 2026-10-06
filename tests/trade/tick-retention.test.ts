import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { runScanner } from '../../trade/scanner/service';

const migrations = readdirSync('supabase/migrations').filter((f) => f >= '20261003035402' && f.endsWith('.sql')).sort();
const bridge = 'xp-mt5-primary'; // source clock = America/Sao_Paulo wall time labelled as UTC (production)
/** Raw broker-wall ms for a BRT wall-clock instant. */
const raw = (d: string, hhmm = '10:00') => Date.parse(`${d}T${hhmm}:00Z`);

async function world() {
  const db = new PGlite();
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for (const m of migrations) await db.exec(readFileSync('supabase/migrations/' + m, 'utf8'));
  const original = globalThis.fetch;
  globalThis.fetch = (async (u: any, init: any) => {
    const url = new URL(String(u));
    assert.equal(url.hostname, 'fixture.invalid');
    const name = url.pathname.split('/').pop()!;
    const args = Object.values(JSON.parse(String(init?.body)));
    try {
      const r = await db.query<any>(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args);
      return r.fields[0]?.dataTypeID === 2278 || (r.rows[0]?.result ?? null) === null ? new Response(null, { status: 204 }) : Response.json(r.rows[0].result); // PostgREST: void/null → 204
    } catch (e: any) {
      return Response.json({ code: 'P0001', message: String(e.message) }, { status: 400 });
    }
  }) as any;
  let ordinal = 0;
  const ticks = async (day: string, n: number, hhmm = '10:00') => {
    for (let i = 0; i < n; i++)
      await db.query('insert into trade_bridge_ticks values($1,$2,1,$3,$4,$5,$6)', [bridge, 's', ++ordinal, 'WINV26', raw(day, hhmm) + i * 1000, { bid: 1, ask: 2 }]);
  };
  const counts = async () => {
    const tables = (await db.query<any>("select tablename from pg_tables where schemaname='public' and tablename not in ('trade_bridge_ticks','trade_tick_retention_runs') order by 1")).rows;
    const out: Record<string, number> = {};
    for (const t of tables) out[t.tablename] = (await db.query<any>(`select count(*)::int n from public.${t.tablename}`)).rows[0].n;
    return out;
  };
  const days = async () =>
    (await db.query<any>(`select to_char(to_timestamp(time_msc/1000) at time zone 'UTC','YYYY-MM-DD') d, count(*)::int n from trade_bridge_ticks group by 1 order by 1`)).rows;
  const close = async () => {
    globalThis.fetch = original;
    await db.close();
  };
  return { db, ticks, counts, days, close };
}
const env = { TRADE_SUPABASE_URL: 'https://fixture.invalid', TRADE_SUPABASE_SERVICE_KEY: 'fixture', TRADE_EXECUTION_ENABLED: 'false' };

test('N/O/P/Q: keeps exactly the 5 most recent trading sessions; weekends, holidays and stray ticks do not shrink it; nothing else is touched', async () => {
  const w = await world();
  try {
    // Sessions: Thu 24, Fri 25, Mon 28, Tue 29, (Wed 30 holiday: no data), Thu 01, Fri 02 (2 stray test ticks only),
    // Mon 05, Tue 06 (current, morning). The 5 most recent sessions are 29, 01, 05, 06 + 28.
    for (const d of ['2026-09-24', '2026-09-25', '2026-09-28', '2026-09-29', '2026-10-01', '2026-10-05']) await w.ticks(d, 12);
    await w.ticks('2026-10-02', 2, '16:30');
    await w.ticks('2026-10-06', 12, '09:05');
    // Late-evening tick of 27/09 (Sunday after-hours replay noise) is older than the cutoff too.
    await w.ticks('2026-09-27', 1, '23:59');
    // Unrelated data that must survive: LAB observations, proposals/PAPER, journal, candles (old and new).
    for (let c = 30; c <= 60; c++) await runScanner(env as any, 'replay', c, 'retention');
    await w.db.query('insert into trade_bridge_candles values($1,$2,$3,$4),($1,$2,$5,$4)', [bridge, 'WINV26', raw('2026-09-01') / 1000, { o: 1 }, raw('2026-10-06') / 1000]);
    const before = await w.counts();
    assert.ok(before.trade_setup_observations > 0 && before.trade_operation_proposals > 0 && before.trade_bridge_candles === 2);

    const plan: any = (await w.db.query<any>('select public.trade_tick_retention_plan($1,5,10) p', [bridge])).rows[0].p;
    assert.equal(plan.status, 'READY');
    assert.deepEqual(plan.sessions.map((s: any) => s.date), ['2026-10-06', '2026-10-05', '2026-10-01', '2026-09-29', '2026-09-28']);
    assert.equal(plan.cutoffRawMs, Date.parse('2026-09-28T00:00:00Z')); // 00:00 BRT of the oldest preserved session
    assert.equal(plan.toDelete, 12 + 12 + 1);
    assert.equal(plan.preserved, 12 * 5 + 2);

    // Audit-only: the run records exactly what WOULD be removed and deletes nothing.
    await w.db.query('select public.trade_tick_retention_run(p_force=>true,p_min_ticks=>10)');
    await w.db.query('select public.trade_tick_retention_run(p_force=>true,p_min_ticks=>10)'); // idempotent
    assert.equal((await w.days()).reduce((s: number, d: any) => s + d.n, 0), 12 * 7 + 2 + 1);
    const runs = (await w.db.query<any>('select status,dry_run,deleted,to_delete,preserved,cutoff_brt::text c from trade_tick_retention_runs where cutoff_brt is not null order by id')).rows;
    assert.deepEqual(runs.map((r: any) => [r.status, r.dry_run, Number(r.deleted), Number(r.to_delete), Number(r.preserved), r.c]), [
      ['DRY_RUN', true, 0, 25, 62, '2026-09-28 00:00:00'],
      ['DRY_RUN', true, 0, 25, 62, '2026-09-28 00:00:00'],
    ]);
    // Deletion is not enabled in this phase and no deletion function exists.
    await assert.rejects(w.db.query('select public.trade_tick_retention_run(p_dry_run=>false,p_force=>true)'), /TICK_DELETION_DISABLED/);
    assert.equal((await w.db.query<any>("select count(*)::int n from pg_proc where proname='trade_tick_retention_batch'")).rows[0].n, 0);
    // O/P/Q: candles, LAB, PAPER/proposals, journal, commands and every other table are untouched.
    assert.deepEqual(await w.counts(), before);
    assert.equal(before.trade_bridge_commands, 0);
  } finally {
    await w.close();
  }
});

test('N: fewer sessions than required deletes nothing; market hours are skipped unless forced', async () => {
  const w = await world();
  try {
    for (const d of ['2026-10-01', '2026-10-05']) await w.ticks(d, 12);
    await w.ticks('2026-09-02', 3); // too few ticks to be a session
    await w.db.query('select public.trade_tick_retention_run(p_force=>true,p_min_ticks=>10)');
    const r = (await w.db.query<any>('select status,deleted from trade_tick_retention_runs where bridge_id=$1', [bridge])).rows;
    assert.deepEqual(r.map((x: any) => [x.status, Number(x.deleted)]), [['SKIPPED_INSUFFICIENT_SESSIONS', 0]]);
    assert.equal((await w.days()).length, 3);
    // Market-hours guard (deterministic: evaluated by the same rule the procedure uses).
    const guard = (await w.db.query<any>(
      "select extract(isodow from t)<=5 and t::time between time '08:30' and time '18:45' g from (values (timestamp '2026-10-05 10:00'),(timestamp '2026-10-05 19:30'),(timestamp '2026-10-04 10:00')) v(t)",
    )).rows.map((x: any) => x.g);
    assert.deepEqual(guard, [true, false, false]);
  } finally {
    await w.close();
  }
});
