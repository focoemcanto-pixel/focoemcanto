import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { runScanner } from '../../trade/scanner/service';
import { assessActionability } from '../../trade/lab/actionability';
import { trackOutcome, resolveWithTicks } from '../../trade/lab/outcome';
import { labAnalytics, metrics, strategyStatus, type LabObservation } from '../../trade/lab/analytics';
import { realReadiness } from '../../trade/bridge/real';

const migrations = readdirSync('supabase/migrations').filter((f) => f >= '20261003035402' && f.endsWith('.sql')).sort();
async function world(extraEnv: Record<string, string> = {}) {
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
  const env = { TRADE_SUPABASE_URL: 'https://fixture.invalid', TRADE_SUPABASE_SERVICE_KEY: 'fixture', TRADE_EXECUTION_ENABLED: 'false', ...extraEnv };
  const obs = async () => (await db.query<any>('select * from trade_setup_observations order by confirmed_at,id')).rows;
  const close = async () => {
    globalThis.fetch = original;
    await db.close();
  };
  return { db, env, called, obs, close };
}

test('1/2/3/5: a confirmed setup is recorded once per watch; polling never duplicates; a new opportunity is new', async () => {
  const w = await world();
  try {
    const first: any = await runScanner(w.env as any, 'replay', 30, 'lab');
    const confirmed = first.scan.candidates.filter((c: any) => c.state === 'CONFIRMED');
    assert.ok(confirmed.length > 0);
    const a = await w.obs();
    assert.equal(a.length, (first.watches as any[]).filter((x) => x.state !== 'FORMING' && x.state !== 'WAITING_TRIGGER' && x.candidate.analysis.setup && x.lastAsOf === first.scan.asOf).length);
    for (const o of a) {
      assert.equal(o.source, 'REPLAY');
      assert.equal(o.version, '1.2.0'); // 5 — the version that produced it
      assert.match(o.config_hash, /^[0-9a-f]{32}$/);
    }
    // 2 — repeated polling of the same minute and continued confirmation do not duplicate.
    await runScanner(w.env as any, 'replay', 30, 'lab');
    await runScanner(w.env as any, 'replay', 30, 'lab');
    assert.equal((await w.obs()).length, a.length);
    // 3 — later, distinct opportunities create distinct observations (different watches).
    for (let c = 31; c <= 180; c += 1) await runScanner(w.env as any, 'replay', c, 'lab');
    const later = await w.obs();
    assert.ok(later.length > a.length);
    assert.equal(new Set(later.map((o: any) => o.watch_id)).size, later.length);
    const events = (await w.db.query<any>("select count(*)::int n from trade_setup_observation_events where kind='CONFIRMED'")).rows[0].n;
    assert.equal(events, later.length);
  } finally {
    await w.close();
  }
});

test('4/23: snapshot and final outcome are immutable; history survives a new strategy version', async () => {
  const w = await world();
  try {
    await runScanner(w.env as any, 'replay', 30, 'lab');
    const [o] = await w.obs();
    await assert.rejects(w.db.query("update trade_setup_observations set snapshot=jsonb_set(snapshot,'{entry}','1') where id=$1", [o.id]), /immutable/);
    await assert.rejects(w.db.query("update trade_setup_observations set version='9.9.9' where id=$1", [o.id]), /immutable/);
    await assert.rejects(w.db.query('delete from trade_setup_observations where id=$1', [o.id]), /Append-only/);
    await assert.rejects(w.db.query('delete from trade_setup_observation_events'), /Append-only/);
    const final = { status: 'TARGET_FIRST', resultR: 2 };
    await w.db.query("select trade_setup_outcome('focoos-admin',$1,$2)", [o.id, final]);
    await assert.rejects(w.db.query("update trade_setup_observations set outcome='{\"status\":\"STOP_FIRST\"}' where id=$1", [o.id]), /immutable/);
    await w.db.query("select trade_setup_outcome('focoos-admin',$1,$2)", [o.id, { status: 'STOP_FIRST', resultR: -1 }]);
    assert.equal((await w.db.query<any>('select outcome_status from trade_setup_observations where id=$1', [o.id])).rows[0].outcome_status, 'TARGET_FIRST');
    // 23 — a new version of the same strategy is registered; v1.2.0 observations remain intact and queryable.
    await w.db.query("insert into trade_strategy_versions(strategy_id,version,definition) values($1,'1.3.0',$2)", [o.strategy_id, { id: o.strategy_id, version: '1.3.0', parameters: { changed: true } }]);
    const lab = (await w.db.query<any>("select trade_lab_read('focoos-admin',0) r")).rows[0].r;
    assert.ok(lab.observations.some((x: any) => x.id === o.id && x.version === '1.2.0' && x.snapshot.entry === o.snapshot.entry));
    assert.ok(lab.registry.some((r: any) => r.strategyId === o.strategy_id && r.version === '1.3.0'));
    assert.equal(JSON.stringify(lab).includes('accountHash'), false);
  } finally {
    await w.close();
  }
});

test('6: a setup blocked by risk is still recorded and followed to its outcome', async () => {
  const w = await world({ TRADE_PAPER_MAX_RISK_BRL: '10' });
  try {
    await runScanner(w.env as any, 'replay', 30, 'risk');
    const blocked = (await w.obs()).filter((o: any) => o.lifecycle === 'BLOCKED_RISK');
    assert.ok(blocked.length > 0);
    for (let c = 31; c <= 120; c++) await runScanner(w.env as any, 'replay', c, 'risk');
    const after = (await w.db.query<any>('select * from trade_setup_observations where id=any($1)', [blocked.map((b: any) => b.id)])).rows;
    assert.ok(after.every((o: any) => o.outcome && o.outcome.barsTracked > 0));
    assert.ok(after.every((o: any) => o.lifecycle === 'BLOCKED_RISK'));
  } finally {
    await w.close();
  }
});

test('7/8/9: proposals expire, are invalidated by price and never chase', () => {
  const plan = { direction: 'BUY' as const, entry: 210010, stop: 209450, target: 211130 };
  assert.equal(assessActionability({ ...plan, expiresAt: 1000 }, { bid: 210005, ask: 210010 }, 2000).status, 'EXPIRED');
  assert.equal(assessActionability(plan, { bid: 209440, ask: 209445 }).status, 'INVALIDATED');
  assert.equal(assessActionability(plan, { bid: 211200, ask: 211205 }).status, 'MISSED');
  const ok = assessActionability(plan, { bid: 210085, ask: 210090 });
  assert.equal(ok.status, 'ACTIONABLE'); // 80 pts = 0.14R: still within the plan
  assert.equal(ok.driftPoints, 80);
  const chase = assessActionability(plan, { bid: 210495, ask: 210500 }); // 490 pts = 0.875R
  assert.equal(chase.status, 'MISSED');
  assert.match(chase.reasons.join(' '), /Não perseguir/);
  assert.equal(assessActionability(plan, null).status, 'NO_QUOTE');
});

test('10/11/18-separation: PAPER trade links to its setup and proposal; no broker command; journaled', async () => {
  const w = await world();
  try {
    const scan: any = await runScanner(w.env as any, 'replay', 30, 'paper');
    const tp = scan.technicalProposals.find((t: any) => t.proposal.proposalState === 'READY');
    assert.ok(tp, JSON.stringify(scan.proposalBlocks));
    assert.ok(tp.observationId);
    const { onRequestPost, onRequestGet } = await import('../../functions/api/trade/operations');
    const rows: any = await (await onRequestGet({ env: w.env as any, request: new Request('https://fixture.invalid/api/trade/operations?source=replay&cursor=30') })).json();
    const row = rows.find((r: any) => r.payload.setupObservationId === tp.observationId);
    assert.ok(row);
    const confirm = await onRequestPost({ env: w.env as any, request: new Request('https://fixture.invalid/api/trade/operations', { method: 'POST', body: JSON.stringify({ action: 'confirm', id: row.id, cursor: 30, mode: 'PAPER' }) }) });
    assert.equal(confirm.status, 200, await confirm.clone().text());
    let o = (await w.db.query<any>('select * from trade_setup_observations where id=$1', [tp.observationId])).rows[0];
    assert.equal(o.lifecycle, 'PAPER_ACCEPTED');
    assert.equal(o.proposal_id, row.id);
    await onRequestGet({ env: w.env as any, request: new Request('https://fixture.invalid/api/trade/operations?source=replay&cursor=420') });
    o = (await w.db.query<any>('select * from trade_setup_observations where id=$1', [tp.observationId])).rows[0];
    assert.ok(['PAPER_ACTIVE', 'PAPER_CLOSED'].includes(o.lifecycle));
    assert.equal(o.paper.plannedEntry, row.payload.entry);
    assert.equal(o.paper.fillModel, 'next-bar-open-v1');
    assert.ok('slippagePoints' in o.paper);
    const kinds = (await w.db.query<any>('select kind from trade_setup_observation_events where observation_id=$1 order by id', [o.id])).rows.map((r: any) => r.kind);
    assert.deepEqual(kinds.slice(0, 3), ['CONFIRMED', 'PROPOSED', 'PAPER_ACCEPTED']);
    // 11 — PAPER never reaches the broker.
    assert.equal((await w.db.query('select * from trade_bridge_commands')).rows.length, 0);
    assert.ok(!w.called.some((n) => /trade_real_|trade_bridge_enqueue/.test(n) && n !== 'trade_real_audit'));
    // User note stays separate from automatic data.
    const { onRequestPost: labPost, onRequestGet: labGet } = await import('../../functions/api/trade/lab');
    assert.equal((await labPost({ env: w.env as any, request: new Request('https://fixture.invalid/api/trade/lab', { method: 'POST', body: JSON.stringify({ action: 'note', id: o.id, note: 'Aceitei pelo contexto M5.' }) }) })).status, 200);
    const lab: any = await (await labGet({ env: w.env as any, request: new Request('https://fixture.invalid/api/trade/lab?days=3650') })).json();
    const rec = lab.recent.find((r: any) => r.id === o.id);
    assert.equal(rec.notes[0].note, 'Aceitei pelo contexto M5.');
    assert.equal(rec.snapshot.entry, row.payload.entry);
  } finally {
    await w.close();
  }
});

test('12/13/14/15/16/17: outcome — target first, stop first, ambiguous, ticks resolve, MFE/MAE and R', () => {
  const setup = { direction: 'long' as const, entry: 100, stop: 90, target: 120, asOf: 600 };
  const bar = (t: number, o: number, h: number, l: number, c: number) => ({ timestamp: t, open: o, high: h, low: l, close: c });
  const t = trackOutcome(setup, [bar(540, 1, 1, 1, 1), bar(600, 100, 108, 95, 105), bar(660, 105, 121, 102, 118)]);
  assert.equal(t.status, 'TARGET_FIRST'); // 12 (the pre-confirmation bar at 540 is ignored)
  assert.equal(t.resultR, 2); // 17
  assert.equal(t.mfePoints, 20); // 15
  assert.equal(t.maePoints, 5); // 16
  assert.equal(t.maeR, 0.5);
  assert.equal(t.minutesToTarget, 2);
  const s = trackOutcome(setup, [bar(600, 100, 104, 96, 97), bar(660, 97, 99, 89, 90)]);
  assert.equal(s.status, 'STOP_FIRST'); // 13
  assert.equal(s.resultR, -1);
  assert.equal(s.mfePoints, 4);
  assert.equal(s.maePoints, 10);
  const gap = trackOutcome(setup, [bar(600, 85, 86, 84, 85)]);
  assert.equal(gap.status, 'STOP_FIRST');
  assert.equal(gap.resultR, -1.5); // gap through the stop is honest, not -1R
  const both = trackOutcome(setup, [bar(600, 100, 125, 85, 110)]);
  assert.equal(both.status, 'AMBIGUOUS'); // 14 — never invented
  assert.equal(both.resultR, null);
  const ticks = [{ timeMsc: 1, last: 101 }, { timeMsc: 2, last: 121 }, { timeMsc: 3, last: 85 }];
  const resolved = trackOutcome(setup, [bar(600, 100, 125, 85, 110)], () => resolveWithTicks(ticks, setup));
  assert.equal(resolved.status, 'TARGET_FIRST');
  assert.equal(resolved.resolvedBy, 'TICKS');
  const open = trackOutcome(setup, [bar(600, 100, 105, 95, 101)]);
  assert.equal(open.status, 'OPEN');
  const short = trackOutcome({ direction: 'short', entry: 100, stop: 110, target: 80, asOf: 0 }, [bar(0, 100, 103, 79, 85)]);
  assert.equal(short.status, 'TARGET_FIRST');
  assert.equal(short.maePoints, 3);
});

const synthetic = (n: number, r: (i: number) => number, base: Partial<LabObservation> = {}): LabObservation[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${base.version || 'v'}-${base.source || 'LIVE'}-${i}`,
    source: 'LIVE',
    strategyId: 'ema_continuation_v1',
    version: '1.2.0',
    direction: 'BUY',
    confirmedAt: 1_000_000 + i * 60,
    lifecycle: 'BLOCKED_RISK',
    outcome: { status: r(i) > 0 ? 'TARGET_FIRST' : 'STOP_FIRST', resultR: r(i), mfeR: 1, maeR: 0.5, minutesToTarget: 10, minutesToStop: null, barsTracked: 10 },
    paper: null,
    features: { hourBRT: 10, weekday: 'Mon', regimes: ['TREND_UP'], rr: 2, trend5m: 'UP' },
    ...base,
  }));

test('18/19/20: analytics separates versions and datasets; small N is insufficient; win rate alone is not enough', () => {
  const a = labAnalytics([
    ...synthetic(4, () => 2),
    ...synthetic(40, (i) => (i % 2 ? 2 : -1), { version: '1.3.0' }),
    ...synthetic(10, () => -1, { source: 'REPLAY' }),
    ...synthetic(3, () => 1, { paper: { resultR: 1.5, exitTime: 1, mfeR: 1, maeR: 0.2, durationMinutes: 5 } }),
  ]);
  const g = (v: string, d: string) => a.groups.find((x) => x.version === v && x.dataset === d)!;
  assert.equal(g('1.2.0', 'LIVE_DETECTED').metrics.n, 7);
  assert.equal(g('1.3.0', 'LIVE_DETECTED').metrics.n, 40); // 18 — versions never merged
  assert.equal(g('1.2.0', 'REPLAY').metrics.n, 10); // 19 — datasets never merged
  assert.equal(g('1.2.0', 'PAPER_FORWARD').metrics.n, 3);
  assert.equal(g('1.2.0', 'PAPER_FORWARD').metrics.expectancyR, 1.5);
  assert.equal(g('1.2.0', 'LIVE_DETECTED').status, 'AMOSTRA INSUFICIENTE'); // 20 — 100% win rate with N=7
  assert.equal(g('1.3.0', 'LIVE_DETECTED').metrics.winRate, 0.5);
  assert.equal(g('1.3.0', 'LIVE_DETECTED').metrics.profitFactor, 2);
  assert.equal(g('1.3.0', 'LIVE_DETECTED').status, 'EM OBSERVAÇÃO'); // N=40 < 50 for PROMISSORA
  // High win rate with large losses is not "good".
  const trap = metrics(synthetic(60, (i) => (i % 10 === 0 ? -10 : 0.3)).map((o) => ({ at: o.confirmedAt, r: o.outcome!.resultR!, mfeR: 1, maeR: 1, minutes: 1, f: o.features, direction: 'BUY' })));
  assert.equal(trap.winRate, 0.9);
  assert.ok(trap.expectancyR! < 0);
  assert.notEqual(strategyStatus(trap).status, 'PROMISSORA');
  // Segments are only described with their own sample.
  assert.ok(g('1.3.0', 'LIVE_DETECTED').segments.hour.every((s: any) => s.sufficient === s.n >= 30));
  // Degradation: positive overall, negative recent window.
  const degr = metrics(synthetic(60, (i) => (i < 40 ? 2 : -1)).map((o) => ({ at: o.confirmedAt, r: o.outcome!.resultR!, mfeR: 1, maeR: 1, minutes: 1, f: o.features, direction: 'BUY' })));
  assert.equal(strategyStatus(degr).status, 'DEGRADANDO');
});

test('21: statistics never enable REAL', () => {
  const ctx = { policy: { enabled: false }, authorizations: [], session: null };
  const before = realReadiness(ctx, {} as any);
  labAnalytics(synthetic(200, () => 2));
  const after = realReadiness(ctx, {} as any);
  assert.equal(after.canExecute, false);
  assert.equal(after.canArm, false);
  assert.deepEqual(after.gates.map((g) => g.ok), before.gates.map((g) => g.ok));
});

test('22: a STALE feed creates no observation and no actionable proposal', async () => {
  const w = await world({ TRADE_MT5_SYMBOL: 'WINV26' });
  try {
    const { generateMockCandles } = await import('../../trade/core/providers');
    const end = Math.floor(Date.now() / 60000) * 60,
      mock = generateMockCandles(),
      delta = end - (mock[29].timestamp + 60),
      candles = mock.slice(0, 30).map((c) => ({ ...c, symbol: 'WINV26', timestamp: c.timestamp + delta }));
    await w.db.exec('delete from trade_bridge_clock_settings');
    await w.db.query('select trade_bridge_exchange_v2($1,false,1,$2,15000)', [
      { bridgeId: 'xp-mt5-primary', symbol: 'WINV26', session: 's', batch: 1, accountHash: 'a'.repeat(64), state: { protocolVersion: 2, connected: true, executionAllowed: false, tickSize: 5, positions: [], orders: [] }, ticks: [{ symbol: 'WINV26', timeMsc: Date.now() - 120000, bid: 1, ask: 2, last: 1, volume: 1, flags: 0 }], candles, events: [] },
      'a'.repeat(64),
    ]);
    const r: any = await runScanner(w.env as any, 'mt5', 0);
    assert.equal(r.feedLive, false);
    assert.equal(r.technicalProposals.length, 0);
    assert.equal((await w.obs()).length, 0);
    assert.equal((await w.db.query('select * from trade_operation_proposals')).rows.length, 0);
  } finally {
    await w.close();
  }
});
