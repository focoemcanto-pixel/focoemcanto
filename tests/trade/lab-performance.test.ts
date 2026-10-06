/**
 * LAB DESEMPENHO: executable-only result, economic duplicates, datasets/versions never mixed, blocked
 * risk apart, N gate, causal reentries and risk simulation, persistence and the server-side collector.
 * PGlite only; the fixture fetch answers void functions with HTTP 204 and an empty body, exactly like
 * PostgREST in production (the behavior that stalled outcome tracking).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { rpc } from '../../trade/bridge/config';
import { runScanner } from '../../trade/scanner/service';
import { trackOutcome, sessionCloseOf } from '../../trade/lab/outcome';
import { performance, performanceNarrative, stageOf, opportunityKey, riskConstrained, uniqueOpportunities, type PerfRow, type WatchCount } from '../../trade/lab/performance';
import { seedRisk } from './risk-fixture';

const migrations = readdirSync('supabase/migrations').filter((f) => f >= '20261003035402' && f.endsWith('.sql')).sort();
const env = { TRADE_SUPABASE_URL: 'https://fixture.invalid', TRADE_SUPABASE_SERVICE_KEY: 'fixture', TRADE_EXECUTION_ENABLED: 'false' };
async function world(risk = true) {
  const db = new PGlite(),
    original = globalThis.fetch,
    called: string[] = [];
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for (const m of migrations) await db.exec(readFileSync('supabase/migrations/' + m, 'utf8'));
  if (risk) await seedRisk(db);
  globalThis.fetch = (async (u: any, init: any) => {
    const url = new URL(String(u));
    assert.equal(url.hostname, 'fixture.invalid');
    const name = url.pathname.split('/').pop()!;
    called.push(name);
    const args = Object.values(JSON.parse(String(init?.body)));
    try {
      const r = await db.query<any>(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args);
      const result = r.rows[0]?.result;
      // PostgREST: a void function answers 204 No Content (empty body).
      return r.fields[0]?.dataTypeID === 2278 || result === null || result === undefined ? new Response(null, { status: 204 }) : Response.json(result);
    } catch (e: any) {
      return Response.json({ code: 'P0001', message: String(e.message) }, { status: 400 });
    }
  }) as any;
  const q = async (sql: string, args: any[] = []) => (await db.query<any>(sql, args)).rows;
  const close = async () => {
    globalThis.fetch = original;
    await db.close();
  };
  return { db, q, close, called };
}

// ---------- pure fixtures ----------
const T0 = Date.parse('2026-10-05T19:00:00Z') / 1000; // 16:00 BRT
let seq = 0;
function row(over: Partial<PerfRow> & { status?: string; r?: number | null; exit?: number | null } = {}): PerfRow {
  const at = over.confirmedAt ?? T0 + seq * 60;
  seq++;
  const status = over.status ?? 'STOP_FIRST',
    r = over.r !== undefined ? over.r : status === 'TARGET_FIRST' ? 2 : status === 'STOP_FIRST' ? -1 : null;
  return {
    id: over.id ?? `r${seq}`,
    origin: 'OBSERVATION',
    source: 'LIVE',
    scope: 'mt5:WINV26:xp-mt5-primary',
    symbol: 'WINV26',
    strategyId: 'ema_continuation_v1',
    version: '1.2.0',
    direction: 'SELL',
    confirmedAt: at,
    marketAsOf: over.marketAsOf ?? at,
    lifecycle: 'EXPIRED',
    proposalState: 'READY',
    actionability: 'ACTIONABLE',
    outcome: status === 'OPEN' ? null : { status, resultR: r, mfeR: 0.5, maeR: status === 'STOP_FIRST' ? 1 : 0.2, exitTimestamp: over.exit !== undefined ? over.exit : at + 300, expiredBy: status === 'EXPIRED' ? 'SESSION_END' : null },
    paper: null,
    entry: 207000 + seq,
    stop: 207300 + seq,
    target: 206400 + seq,
    rr: 2,
    riskPoints: 300,
    features: { trend5m: 'DOWN', regimes: [] },
    participants: [],
    cluster: { signalsLast5m: 1, confirmedLast5m: 0, actionableLast5m: 0 },
    proposal: { state: 'EXPIRADA', createdAt: at, expiresAt: at + 120, riskSettingsVersion: null, oneRBRL: 100, dailyLossBRL: null, maxTradesPerDay: null, riskPerContractBRL: 60, quantity: 1, blockCode: null },
    ...over,
  } as PerfRow;
}
const perf = (rows: PerfRow[], watches: WatchCount[] = [], dataset: 'LIVE_DETECTED' | 'REPLAY' = 'LIVE_DETECTED') => performance({ rows, watches }, dataset);

test('INVALIDATED, EXPIRED-before-entry and MISSED never count as loss or trade; AMBIGUOUS is never converted', () => {
  const rows = [
    row({ lifecycle: 'INVALIDATED', proposalState: null, status: 'STOP_FIRST' }),
    row({ lifecycle: 'MISSED', proposalState: null, status: 'STOP_FIRST' }),
    row({ lifecycle: 'CANCELLED', proposalState: null, status: 'STOP_FIRST' }),
    row({ status: 'TARGET_FIRST' }),
    row({ status: 'STOP_FIRST' }),
    row({ status: 'AMBIGUOUS', r: null }),
    row({ status: 'EXPIRED', r: 0.4 }),
  ];
  const watches: WatchCount[] = [
    { source: 'mt5', date: '2026-10-05', strategyId: 'ema_continuation_v1', version: '1.2.0', state: 'INVALIDATED', n: 10 },
    { source: 'mt5', date: '2026-10-05', strategyId: 'ema_continuation_v1', version: '1.2.0', state: 'EXPIRED', n: 6 },
  ];
  const p = perf(rows, watches);
  assert.deepEqual([p.executable.wins, p.executable.losses, p.executable.ambiguous, p.executable.neither], [1, 1, 1, 1]);
  assert.equal(p.executable.opportunities, 4, 'MISSED / INVALIDATED / CANCELLED are not executable');
  assert.equal(p.executable.n, 2);
  assert.equal(p.executable.resultR, 1, 'NEITHER (+0.4 marked) is not in the result');
  assert.equal(p.executable.neitherMarkedR, 0.4);
  assert.equal(p.executable.winRate, 0.5, 'AMBIGUOUS and NEITHER are not zeros in the win rate');
  assert.equal(p.funnel.missed, 1);
  assert.equal(p.funnel.invalidatedBeforeConfirmation, 10);
  assert.equal(p.funnel.expiredBeforeConfirmation, 6 - 4, 'expired proposals are not "expired before confirmation"');
  assert.equal(p.funnel.expiredAfterProposal, 4);
  assert.equal(stageOf({ lifecycle: 'MISSED', proposalState: 'READY' }), 'MISSED');
});

test('result R, expectancy, profit factor, drawdown and streaks are exact', () => {
  seq = 0;
  const rs = [2, -1, -1, 2, -1, -1, -1];
  const p = perf(rs.map((r) => row({ status: r > 0 ? 'TARGET_FIRST' : 'STOP_FIRST', r })));
  const s = p.executable;
  assert.equal(s.resultR, -1);
  assert.equal(s.expectancyR, -1 / 7);
  assert.equal(s.profitFactor, 4 / 5);
  // equity 2,1,0,2,1,0,-1 → peak 2 → max drawdown 3
  assert.equal(s.maxDrawdownR, 3);
  assert.equal(s.maxLossStreak, 3);
  assert.equal(s.maxWinStreak, 1);
  assert.deepEqual(
    s.curve.map((c) => c.cumR),
    [2, 1, 0, 2, 1, 0, -1],
  );
  assert.equal(perf([row({ status: 'TARGET_FIRST' })]).executable.profitFactor, null, 'no loss → PF null (UI shows ∞), never Infinity in JSON');
});

test('strategy_version, day and dataset are never merged; blocked-risk stays a separate counterfactual', () => {
  seq = 0;
  const day2 = T0 + 86400;
  const rows = [
    row({ status: 'TARGET_FIRST' }),
    row({ version: '1.3.0', status: 'STOP_FIRST' }),
    row({ confirmedAt: day2, status: 'STOP_FIRST' }),
    row({ source: 'REPLAY', status: 'TARGET_FIRST' }),
    row({ lifecycle: 'BLOCKED_RISK', proposalState: 'RISK_BLOCKED', status: 'TARGET_FIRST' }),
    row({ lifecycle: 'BLOCKED_RISK', proposalState: 'RISK_BLOCKED', status: 'STOP_FIRST' }),
    row({ lifecycle: 'BLOCKED_RISK', proposalState: 'RISK_BLOCKED', status: 'EXPIRED', r: 0.3 }),
  ];
  const p = perf(rows);
  assert.deepEqual(
    p.strategies.map((g) => [g.version, g.n, g.resultR]),
    [
      ['1.2.0', 2, 1],
      ['1.3.0', 1, -1],
    ],
  );
  assert.deepEqual(
    p.byDay.map((d) => [d.date, d.n, d.resultR, d.blocked]),
    [
      ['2026-10-06', 1, -1, 0],
      ['2026-10-05', 2, 1, 3],
    ],
  );
  assert.equal(p.executable.resultR, 0, 'REPLAY and BLOCKED_RISK never enter LIVE executables');
  assert.deepEqual([p.blocked.targetFirst, p.blocked.stopFirst, p.blocked.neither, p.blocked.hypotheticalR], [1, 1, 1, 1]);
  const replay = perf(rows, [], 'REPLAY');
  assert.deepEqual([replay.executable.n, replay.executable.resultR], [1, 2]);
});

test('N < minSample is AMOSTRA INSUFICIENTE (descriptive only); N ≥ minSample gets a sign', () => {
  seq = 0;
  const small = perf([row({ status: 'TARGET_FIRST' })]).executable;
  assert.equal(small.verdict, 'AMOSTRA INSUFICIENTE');
  assert.ok(small.tags.includes('RESULTADO POSITIVO NESTA AMOSTRA'));
  const neg = perf(Array.from({ length: 7 }, () => row({ status: 'STOP_FIRST' }))).executable;
  assert.deepEqual(neg.tags, ['AMOSTRA INSUFICIENTE', 'DESEMPENHO RECENTE NEGATIVO']);
  const big = perf(Array.from({ length: 30 }, (_, i) => row({ status: i % 3 ? 'STOP_FIRST' : 'TARGET_FIRST' }))).executable;
  assert.equal(big.n, 30);
  assert.equal(big.verdict, 'NEUTRO');
  const text = performanceNarrative(perf([row({ strategyId: 'momentum_activity_v1', status: 'TARGET_FIRST' })]));
  assert.match(text, /N=1/);
  assert.match(text, /AMOSTRA INSUFICIENTE/);
  assert.doesNotMatch(text, /porque|institui|robust|excelente|lucrativa/i);
});

test('same economic opportunity counts once in the result; every participating strategy keeps its credit', () => {
  seq = 0;
  const a = row({ status: 'STOP_FIRST' }),
    b = { ...a, id: 'macd', strategyId: 'macd_structure_confirmation_v1' };
  const p = perf([a, b, row({ status: 'TARGET_FIRST' })]);
  assert.equal(opportunityKey(a), opportunityKey(b));
  assert.equal(p.executable.records, 3);
  assert.equal(p.executable.opportunities, 2);
  assert.equal(p.executable.duplicates, 1);
  assert.equal(p.executable.resultR, 1);
  assert.equal(p.duplicates.length, 1);
  assert.deepEqual(p.duplicates[0].strategies.sort(), ['ema_continuation_v1@1.2.0', 'macd_structure_confirmation_v1@1.2.0']);
  assert.equal(p.strategies.find((g) => g.strategyId === 'macd_structure_confirmation_v1')!.resultR, -1);
  // Different levels on the same candle are different opportunities (no heuristic merging).
  assert.equal(uniqueOpportunities([a, { ...b, stop: b.stop + 5 }]).length, 2);
});

test('reentries: attempt number per strategy and day; "since last stop" only counts stops already hit (causal)', () => {
  seq = 0;
  const first = row({ confirmedAt: T0, status: 'STOP_FIRST', exit: T0 + 600 }),
    second = row({ confirmedAt: T0 + 300, status: 'STOP_FIRST', exit: T0 + 900 }), // first not stopped yet
    third = row({ confirmedAt: T0 + 1200, status: 'TARGET_FIRST' });
  const p = perf([first, second, third]);
  const byId = Object.fromEntries(p.rows.map((x) => [x.id, x]));
  assert.deepEqual([byId[first.id].attempt, byId[second.id].attempt, byId[third.id].attempt], [1, 2, 3]);
  assert.equal(byId[second.id].sinceStopMin, null, 'the first stop (exit T0+600) had not happened at T0+300');
  assert.equal(byId[third.id].sinceStopMin, 5, 'last stop known at T0+1200 was the second (T0+900)');
  assert.deepEqual(
    p.reentries.byAttempt.map((x: any) => [x.key, x.n, x.resultR]),
    [
      ['1ª entrada', 1, -1],
      ['2ª entrada', 1, -1],
      ['3ª entrada', 1, 2],
    ],
  );
  assert.equal(p.correlation.clusters.length, 1, '00:00 and +5min sells form one correlated cluster');
});

test('RISK-CONSTRAINED: causal order, daily loss budget and max trades from each proposal snapshot; R$ never uses today’s 1R', () => {
  seq = 0;
  const snap = { state: 'EXPIRADA', createdAt: 0, expiresAt: 0, riskSettingsVersion: 7, oneRBRL: 100, dailyLossBRL: 200, maxTradesPerDay: 5, riskPerContractBRL: 50, quantity: 2, blockCode: null };
  const rows = [0, 1, 2, 3].map((i) => row({ confirmedAt: T0 + i * 3600, exit: T0 + i * 3600 + 60, status: 'STOP_FIRST', proposal: { ...snap } }));
  const rc = riskConstrained(rows, null);
  assert.equal(rc.available, true);
  assert.equal(rc.source, 'SNAPSHOT');
  assert.deepEqual([rc.raw.resultR, rc.constrained.resultR, rc.constrained.taken, rc.skipped.dailyLoss], [-4, -2, 2, 2]);
  const none = riskConstrained([row({ status: 'STOP_FIRST' })], null);
  assert.equal(none.available, false);
  // R$: result R × risk per contract × quantity of THAT proposal's own snapshot.
  const p = perf(rows);
  assert.equal(p.executable.brl.valueBRL, -4 * 50 * 2);
  assert.deepEqual(p.executable.brl.versions, [7]);
  assert.equal(perf([row({ status: 'STOP_FIRST' })]).executable.brl.valueBRL, null, 'no risk version → no R$');
});

test('05/10/2026 regression: 15 executable proposals → 14 opportunities, 1 target, 11 stops (12 proposals), 2 without outcome; ≈ −9R (−10R counting the duplicate)', () => {
  // Levels/outcomes from the read-only audit of 05/10 (no account data). PROPOSAL_RECORD = before the LAB.
  const at = (hhmm: string) => Date.parse(`2026-10-05T${hhmm}:00-03:00`) / 1000;
  const mk = (id: string, hhmm: string, strategyId: string, direction: 'BUY' | 'SELL', levels: [number, number, number], status: string, r: number | null, extra: Partial<PerfRow> = {}) =>
    row({ id, confirmedAt: at(hhmm), marketAsOf: at(hhmm), strategyId, direction, entry: levels[0], stop: levels[1], target: levels[2], status, r, ...extra });
  const rec = { origin: 'PROPOSAL_RECORD' as const, features: { trend5m: null, regimes: [] }, cluster: null };
  const rows = [
    mk('p1600', '16:00', 'resistance_rejection_v1', 'SELL', [209835, 210140, 209225], 'STOP_FIRST', -1, rec),
    mk('p1605', '16:05', 'ema_continuation_v1', 'BUY', [209920, 209450, 210860], 'STOP_FIRST', -1, rec),
    mk('p1615', '16:15', 'ema_continuation_v1', 'BUY', [209950, 209480, 210890], 'STOP_FIRST', -1, rec),
    mk('p1617', '16:17', 'momentum_activity_v1', 'SELL', [209710, 210155, 208820], 'TARGET_FIRST', 2, rec),
    mk('p1619', '16:19', 'support_rejection_v1', 'BUY', [209605, 209470, 209875], 'STOP_FIRST', -1, rec),
    mk('p1621', '16:21', 'false_breakout_v1', 'BUY', [209495, 209275, 209935], 'STOP_FIRST', -1, rec),
    mk('o1638', '16:38', 'support_rejection_v1', 'BUY', [207970, 207640, 208630], 'STOP_FIRST', -1),
    mk('o1653', '16:53', 'support_rejection_v1', 'BUY', [207790, 207445, 208480], 'STOP_FIRST', -1, { lifecycle: 'MISSED', proposalState: null }),
    mk('o1657', '16:57', 'ema_continuation_v1', 'SELL', [207970, 208455, 207000], 'EXPIRED', 0.37),
    mk('o1743', '17:43', 'ema_continuation_v1', 'SELL', [207630, 208000, 206890], 'STOP_FIRST', -1),
    mk('o1750e', '17:50', 'ema_continuation_v1', 'SELL', [207580, 207880, 206980], 'STOP_FIRST', -1),
    mk('o1750m', '17:50', 'macd_structure_confirmation_v1', 'SELL', [207580, 207880, 206980], 'STOP_FIRST', -1),
    mk('o1814', '18:14', 'ema_continuation_v1', 'SELL', [207790, 207950, 207470], 'STOP_FIRST', -1),
    mk('o1815', '18:15', 'ema_continuation_v1', 'SELL', [207680, 207950, 207140], 'STOP_FIRST', -1),
    mk('o1816', '18:16', 'false_breakout_v1', 'BUY', [207895, 207495, 208695], 'EXPIRED', -0.26),
    mk('o1820', '18:20', 'false_breakout_v1', 'SELL', [207925, 208105, 207565], 'STOP_FIRST', -1),
    mk('b1618', '16:18', 'structure_breakout_v1', 'SELL', [209595, 210155, 208475], 'TARGET_FIRST', 2, { lifecycle: 'BLOCKED_RISK', proposalState: 'RISK_BLOCKED' }),
    mk('b1606', '16:06', 'ema_continuation_v1', 'BUY', [210010, 209450, 211130], 'STOP_FIRST', -1, { lifecycle: 'BLOCKED_RISK', proposalState: 'RISK_BLOCKED' }),
    mk('l0944', '09:44', 'support_rejection_v1', 'BUY', [207455, 207285, 207795], 'TARGET_FIRST', 2, { ...rec, version: '1.0.0', proposalState: 'LEGACY' }),
  ];
  const p = perf(rows);
  const s = p.executable;
  assert.deepEqual([s.records, s.opportunities, s.wins, s.losses, s.neither, s.ambiguous], [15, 14, 1, 11, 2, 0]);
  assert.equal(s.resultR, -9);
  assert.equal(s.duplicates, 1, '17:50 ema + macd = one economic opportunity');
  assert.equal(s.verdict, 'AMOSTRA INSUFICIENTE');
  assert.equal(p.executable.records - p.executable.opportunities + -(s.resultR ?? 0), 10, 'counting the duplicate as a second trade gives −10R');
  const ema = p.strategies.find((g) => g.strategyId === 'ema_continuation_v1')!;
  assert.deepEqual([ema.n, ema.wins, ema.losses, ema.neither, ema.resultR], [6, 0, 6, 1, -6]);
  assert.deepEqual(ema.tags, ['AMOSTRA INSUFICIENTE', 'DESEMPENHO RECENTE NEGATIVO']);
  const mom = p.strategies.find((g) => g.strategyId === 'momentum_activity_v1')!;
  assert.deepEqual([mom.n, mom.resultR, mom.verdict], [1, 2, 'AMOSTRA INSUFICIENTE']);
  assert.equal(p.funnel.missed, 1, '16:53 was MISSED by the system’s own rule at confirmation');
  assert.equal(p.legacy.records, 1, 'v1.0.0 legacy proposals are reported apart');
  assert.equal(p.strategies.some((g) => g.version === '1.0.0'), false);
  assert.deepEqual([p.blocked.opportunities, p.blocked.targetFirst, p.blocked.stopFirst, p.blocked.hypotheticalR], [2, 1, 1, 1]);
  assert.equal(p.riskConstrained.available, false, 'no risk version existed on 05/10 → DADO INSUFICIENTE');
  assert.equal(p.executable.brl.valueBRL, null);
  assert.equal(p.costs.status, 'DADO INSUFICIENTE');
});

test('outcome-v2 (LIVE): tracking never crosses the B3 session; at the close an open setup is EXPIRED by SESSION_END at the last close', () => {
  const asOf = Date.parse('2026-10-05T18:20:00-03:00') / 1000;
  const close = sessionCloseOf(asOf - 60);
  assert.equal(close, Date.parse('2026-10-05T18:30:00-03:00') / 1000);
  const bar = (t: number, c: number) => ({ timestamp: t, open: c, high: c + 10, low: c - 10, close: c });
  const setup = { direction: 'short' as const, entry: 207925, stop: 208105, target: 207565, asOf };
  const today = [bar(asOf, 207950), bar(asOf + 60, 207900), bar(asOf + 120, 207880)];
  const nextDay = [bar(Date.parse('2026-10-06T09:00:00-03:00') / 1000, 207000)]; // would hit the target overnight
  const live = trackOutcome(setup, [...today, ...nextDay], undefined, undefined, { nowSeconds: asOf + 3600 * 15 });
  assert.equal(live.status, 'EXPIRED');
  assert.equal(live.expiredBy, 'SESSION_END');
  assert.equal(live.exitPrice, 207880);
  assert.equal(live.barsTracked, 3);
  // Before the close (no newer bar, clock before close + grace) it stays OPEN.
  assert.equal(trackOutcome(setup, today, undefined, undefined, { nowSeconds: asOf + 300 }).status, 'OPEN');
  // After close + grace, even without a newer bar, it ends.
  assert.equal(trackOutcome(setup, today, undefined, undefined, { nowSeconds: close + 901 }).status, 'EXPIRED');
  // Without the LIVE session rule (replay) the old horizon behavior is unchanged.
  assert.equal(trackOutcome(setup, [...today, ...nextDay]).status, 'TARGET_FIRST');
});

test('rpc: a void function (HTTP 204 / empty body) is success, not a persistence failure', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response(null, { status: 204 })) as any;
    assert.equal(await rpc(env as any, 'trade_setup_outcome', {}), null);
    globalThis.fetch = (async () => new Response('', { status: 200 })) as any;
    assert.equal(await rpc(env as any, 'trade_setup_note_add', {}), null);
    globalThis.fetch = (async () => new Response('not json', { status: 200 })) as any;
    await assert.rejects(rpc(env as any, 'trade_lab_read', {}), /persistência/);
  } finally {
    globalThis.fetch = original;
  }
});

test('collector: with PostgREST-faithful 204s every open observation is tracked in one run, MISSED never leaks into a proposal, and the analytics come only from the database', async () => {
  const w = await world();
  try {
    for (let c = 30; c <= 260; c++) await runScanner(env as any, 'replay', c, 'perf');
    const obs = await w.q("select id, lifecycle, watch_id, outcome, outcome_status from trade_setup_observations where scope like 'replay:%perf'");
    assert.ok(obs.length >= 3, `replay produced observations (${obs.length})`);
    const tracked = obs.filter((o: any) => o.outcome);
    assert.equal(tracked.length, obs.length, 'every observation got an outcome (the loop no longer stops after the first void RPC)');
    assert.ok(w.called.includes('trade_setup_outcomes_batch'));
    // A setup MISSED at confirmation is never proposed (the void lifecycle RPC no longer throws).
    const missed = obs.filter((o: any) => o.lifecycle === 'MISSED' || o.lifecycle === 'INVALIDATED');
    for (const m of missed) {
      const leaked = await w.q("select count(*)::int n from trade_operation_proposals where payload->>'setupWatchId'=$1", [m.watch_id]);
      assert.equal(leaked[0].n, 0, `MISSED ${m.id} must not become a proposal`);
    }
    // Persistence: a brand-new reader (no memory, no browser) recomputes the same numbers from the DB.
    const { onRequestGet } = await import('../../functions/api/trade/lab');
    const read = async () =>
      (await (await onRequestGet({ env: env as any, request: new Request('https://fixture.invalid/api/trade/lab?view=performance&period=custom&from=2026-09-01&to=2026-10-30&dataset=REPLAY') })).json()) as any;
    const a = await read(),
      b = await read();
    assert.equal(a.dataset, 'REPLAY');
    assert.equal(a.funnel.confirmed, obs.length);
    assert.deepEqual(a.executable, b.executable);
    assert.equal(a.rows.every((x: any) => x.dataset === 'REPLAY'), true, 'datasets never mixed');
    assert.equal((await w.q('select count(*)::int n from trade_bridge_commands'))[0].n, 0, 'analytics never creates a broker command');
  } finally {
    await w.close();
  }
});

test('proposal records: proposals without an observation are followed once with their own levels; final outcome immutable; observed proposals excluded; batches skip bad items', async () => {
  const w = await world(false);
  try {
    const scope = 'mt5:WINV26:xp-mt5-primary',
      asOf = Math.floor(Date.now() / 1000) - 600;
    const ins = (id: string, extra: any = {}) =>
      w.q(
        `insert into trade_operation_proposals(id,owner_id,bridge_id,payload,state,expires_at) values($1,'focoos-admin','xp-mt5-primary',$2,'EXPIRADA',now())`,
        [id, { mode: 'PAPER', source: 'mt5', scope, symbol: 'WINV26', direction: 'SELL', entry: 207000, sl: 207300, tp: 206400, asOf, proposalState: 'READY', setupWatchId: `w-${id}`, setup: { strategy: 'ema_continuation_v1', version: '1.2.0' }, ...extra }],
      );
    await ins('00000000-0000-4000-8000-000000000001');
    await ins('00000000-0000-4000-8000-000000000002');
    // The second one has an observation for its watch → it is not a record.
    await w.q(
      `insert into trade_setup_observations(id,owner_id,scope,source,symbol,strategy_id,version,config_hash,direction,watch_id,detected_at,confirmed_at,market_as_of,snapshot,lifecycle)
       values('obs-x','focoos-admin',$1,'LIVE','WINV26','ema_continuation_v1','1.2.0','h','SELL','w-00000000-0000-4000-8000-000000000002',$2,$2,$2,'{}','MISSED')`,
      [scope, asOf],
    );
    const open = await rpc(env as any, 'trade_proposal_records_open', { p_owner: 'focoos-admin', p_scope: scope, p_limit: 50 });
    assert.deepEqual(
      open.map((x: any) => x.id),
      ['00000000-0000-4000-8000-000000000001'],
    );
    const final = { status: 'STOP_FIRST', resultR: -1, mfeR: 0.2, maeR: 1, exitTimestamp: asOf + 120 };
    const n = await rpc(env as any, 'trade_proposal_record_outcomes_batch', {
      p_owner: 'focoos-admin',
      p_items: [
        { id: '00000000-0000-4000-8000-000000000001', outcome: final },
        { id: '00000000-0000-4000-8000-000000000002', outcome: final }, // observed → ignored
        { id: '00000000-0000-4000-8000-000000000001', outcome: { status: 'BOGUS' } },
      ],
    });
    assert.equal(n, 1);
    await assert.rejects(w.q(`update trade_proposal_record_outcomes set outcome='{"status":"TARGET_FIRST"}', outcome_status='TARGET_FIRST'`), /immutable/);
    await assert.rejects(w.q('delete from trade_proposal_record_outcomes'), /Append-only/);
    assert.deepEqual(await rpc(env as any, 'trade_proposal_records_open', { p_owner: 'focoos-admin', p_scope: scope, p_limit: 50 }), [], 'final records are no longer tracked');
    // Observation batch: an invalid item is skipped, the valid one applied (never aborts the batch).
    const applied = await rpc(env as any, 'trade_setup_outcomes_batch', {
      p_owner: 'focoos-admin',
      p_items: [
        { id: 'obs-x', outcome: { status: 'NOPE' } },
        { id: 'obs-x', outcome: { status: 'STOP_FIRST', resultR: -1 } },
      ],
    });
    assert.equal(applied, 1);
    const read = await rpc(env as any, 'trade_lab_performance', { p_owner: 'focoos-admin', p_from: asOf - 60, p_to: asOf + 60 });
    assert.equal(read.records.length, 1);
    assert.equal(read.records[0].origin, 'PROPOSAL_RECORD');
    assert.equal(read.records[0].outcome.status, 'STOP_FIRST');
    assert.equal(read.observations.length, 1);
    assert.doesNotMatch(JSON.stringify(read), /account_hash|accountHash|token|fingerprint/i);
  } finally {
    await w.close();
  }
});

test('collector is independent of the UI: the EA batch alone runs scanner + outcome tracking server-side', async () => {
  const w = await world();
  try {
    const { onRequestPost: exchange } = await import('../../functions/api/trade/bridge/exchange');
    const token = 'unit-test-placeholder-32-characters-long';
    const tasks: Promise<unknown>[] = [];
    const now = Date.now();
    const batch = {
      bridgeId: 'xp-mt5-primary',
      symbol: 'WINV26',
      session: 'browserless-perf',
      batch: 0,
      accountHash: 'a'.repeat(64),
      ticks: [{ symbol: 'WINV26', timeMsc: now, bid: 130000, ask: 130005, last: 130000, volume: 1, flags: 6 }],
      candles: [],
      events: [],
      state: { connected: true, executionAllowed: false, tickSize: 5, positions: [], orders: [] },
    };
    const r = await exchange({
      request: new Request('https://fixture.invalid/api/trade/bridge/exchange', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      }),
      env: { ...env, TRADE_BRIDGE_TOKEN: token, TRADE_ACCOUNT_HASH: 'a'.repeat(64) } as any,
      waitUntil: (t) => tasks.push(t),
    });
    assert.equal(r.status, 200, await r.clone().text());
    await Promise.all(tasks);
    // No page, no click, no PAPER: the bridge request itself scanned and ran the LAB outcome tracker.
    for (const fn of ['trade_scanner_save', 'trade_setup_open', 'trade_proposal_records_open']) assert.ok(w.called.includes(fn), `${fn} ran from the EA batch`);
    assert.equal((await w.q('select count(*)::int n from trade_bridge_commands'))[0].n, 0);
  } finally {
    await w.close();
  }
});

test('a LIVE setup whose price already ran away is MISSED and never becomes a proposal (void lifecycle RPC no longer aborts the decision)', async () => {
  // Find the first replay candle where a setup is proposed, then replay the same candles as LIVE MT5
  // with a quote that already ran 1R beyond the reference entry.
  const probe = await world();
  let cursor = 0,
    plan: any = null;
  try {
    for (let c = 30; c <= 260 && !plan; c++) {
      const r: any = await runScanner(env as any, 'replay', c, 'probe');
      if (r.technicalProposals?.length) {
        cursor = c;
        plan = r.technicalProposals[0].proposal;
      }
    }
  } finally {
    await probe.close();
  }
  assert.ok(plan, 'replay produced a proposal to mirror');
  const w = await world();
  try {
    const { generateMockCandles } = await import('../../trade/core/providers');
    const end = Math.floor(Date.now() / 60000) * 60,
      mock = generateMockCandles(),
      delta = end - (mock[cursor - 1].timestamp + 60),
      candles = mock.slice(0, cursor).map((c) => ({ ...c, symbol: 'WINV26', timestamp: c.timestamp + delta }));
    const sign = plan.direction === 'BUY' ? 1 : -1,
      away = plan.entry + sign * Math.abs(plan.entry - plan.sl); // +1R beyond the entry: chasing
    await w.db.exec('delete from trade_bridge_clock_settings');
    await w.db.query('select trade_bridge_exchange_v2($1,false,1,$2,15000)', [
      {
        bridgeId: 'xp-mt5-primary',
        symbol: 'WINV26',
        session: 's',
        batch: 1,
        accountHash: 'a'.repeat(64),
        state: { protocolVersion: 2, connected: true, executionAllowed: false, tickSize: 5, positions: [], orders: [] },
        ticks: [{ symbol: 'WINV26', timeMsc: Date.now(), bid: away, ask: away, last: away, volume: 1, flags: 6 }],
        candles,
        events: [],
      },
      'a'.repeat(64),
    ]);
    const r: any = await runScanner({ ...env, TRADE_MT5_SYMBOL: 'WINV26' } as any, 'mt5', 0);
    const obs = await w.q("select lifecycle, watch_id, proposal_id from trade_setup_observations where scope like 'mt5:%'");
    assert.ok(obs.length >= 1, `LIVE observation recorded (feedLive=${r.feedLive})`);
    const missed = obs.filter((o: any) => o.lifecycle === 'MISSED');
    assert.ok(missed.length >= 1, JSON.stringify(obs));
    for (const m of missed) {
      assert.equal(m.proposal_id, null);
      const leaked = await w.q("select count(*)::int n from trade_operation_proposals where payload->>'setupWatchId'=$1", [m.watch_id]);
      assert.equal(leaked[0].n, 0, 'a MISSED setup must not be proposed');
    }
    assert.ok(r.proposalBlocks.some((b: any) => /^MISSED/.test(b.reason)), JSON.stringify(r.proposalBlocks));
  } finally {
    await w.close();
  }
});
