/**
 * Daily PAPER + LAB readiness regressions (A–V). Everything runs on PGlite with a fetch guard that
 * only allows the local fixture host: no test can reach a broker, the XP, MT5 or any external API.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { runScanner } from '../../trade/scanner/service';
import { labAnalytics, type LabObservation } from '../../trade/lab/analytics';
import { participantEvidence } from '../../trade/lab/snapshot';
import { entryWindow, serverSkew } from '../../app/trade/decision-view';
import { seedRisk } from './risk-fixture';

const migrations = readdirSync('supabase/migrations').filter((f) => f >= '20261003035402' && f.endsWith('.sql')).sort();
async function world() {
  const db = new PGlite(),
    original = globalThis.fetch,
    called: string[] = [];
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for (const m of migrations) await db.exec(readFileSync('supabase/migrations/' + m, 'utf8'));
  await seedRisk(db);
  globalThis.fetch = (async (u: any, init: any) => {
    const url = new URL(String(u));
    // V — the only reachable host is the local fixture.
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
  const env = { TRADE_SUPABASE_URL: 'https://fixture.invalid', TRADE_SUPABASE_SERVICE_KEY: 'fixture', TRADE_EXECUTION_ENABLED: 'false' };
  const q = async (sql: string, args: any[] = []) => (await db.query<any>(sql, args)).rows;
  const ops = await import('../../functions/api/trade/operations');
  const post = (body: any) => ops.onRequestPost({ env: env as any, request: new Request('https://fixture.invalid/api/trade/operations', { method: 'POST', body: JSON.stringify(body) }) });
  const read = async (cursor: number) => (await (await ops.onRequestGet({ env: env as any, request: new Request(`https://fixture.invalid/api/trade/operations?source=replay&cursor=${cursor}`) })).json()) as any[];
  const noBroker = async () => {
    // U — no PAPER flow creates a bridge command or calls an enqueue/REAL execution RPC.
    assert.equal((await q('select count(*)::int n from trade_bridge_commands'))[0].n, 0);
    assert.ok(!called.some((n) => /trade_bridge_enqueue|trade_real_execute|trade_real_session_arm/.test(n)), called.join(','));
  };
  const close = async () => {
    globalThis.fetch = original;
    await db.close();
  };
  return { db, env, q, post, read, noBroker, close, called };
}

test('A/B/C: a 4/5 hypothesis never becomes an entry; only CONFIRMED setups propose; READY never executes by itself', async () => {
  const w = await world();
  try {
    let waitingSeen = 0;
    for (let c = 30; c <= 90; c++) {
      const r: any = await runScanner(w.env as any, 'replay', c, 'flow');
      waitingSeen += (r.watches || []).filter((x: any) => ['WAITING_TRIGGER', 'FORMING'].includes(x.state)).length;
    }
    assert.ok(waitingSeen > 0, 'replay exercised hypotheses waiting for a trigger');
    const proposals = await w.q("select payload->>'setupWatchId' watch, state, execution from trade_operation_proposals");
    assert.ok(proposals.length > 0);
    const watches = await w.q("select id, payload from trade_setup_watches where scope like 'replay:%flow'");
    for (const p of proposals) {
      const wt = watches.find((x: any) => x.id === p.watch);
      assert.ok(wt, 'proposal belongs to a watch');
      // B — the watch reached CONFIRMED (5/5) before any proposal existed.
      assert.ok(wt.payload.confirmedAt, `watch ${p.watch} was never confirmed`);
      // C — nothing is executed without the human action.
      assert.notEqual(p.state, 'CONFIRMADA');
      assert.equal(p.execution, null);
    }
    // A — watches that never confirmed have no proposal.
    for (const wt of watches.filter((x: any) => !x.payload.confirmedAt))
      assert.ok(!proposals.some((p: any) => p.watch === wt.id), `unconfirmed ${wt.id} was proposed`);
    await w.noBroker();
  } finally {
    await w.close();
  }
});

test('D: the entry window comes from the backend expiresAt, counts down and then is expired (never operable)', () => {
  const exp = 1_000_000;
  assert.deepEqual(entryWindow(exp, exp - 24_000), { available: true, seconds: 24, label: 'ENTRADA DISPONÍVEL · 24s' });
  assert.equal(entryWindow(exp, exp - 500).label, 'ENTRADA DISPONÍVEL · 1s');
  assert.equal(entryWindow(exp, exp).available, false);
  assert.equal(entryWindow(exp, exp + 1).label, 'ENTRADA EXPIRADA · não perseguir preço');
  assert.equal(entryWindow(undefined, 0).available, false);
  // Local clock 10 s behind the server: the server clock decides.
  const skew = serverSkew(new Date(exp - 5_000).toUTCString(), exp - 15_000);
  assert.equal(skew, 10_000);
  assert.equal(entryWindow(exp, exp - 15_000, skew).seconds, 5);
  assert.equal(serverSkew(null, 0), 0);
});

test('E/F/H: expired PAPER is refused; valid PAPER simulates with full record; an ignored setup stays observed', async () => {
  const w = await world();
  try {
    const scan: any = await runScanner(w.env as any, 'replay', 30, 'paper');
    const ready = scan.technicalProposals.filter((t: any) => t.proposal.proposalState === 'READY');
    assert.ok(ready.length >= 1, JSON.stringify(scan.proposalBlocks));
    const rows = await w.read(30);
    const rowOf = (t: any) => rows.find((r: any) => r.payload.setupObservationId === t.observationId);
    const all = ready.map(rowOf).filter(Boolean);
    assert.ok(all.length >= 1);

    // E — the backend validity expired: the confirmation is not executed.
    const expired = all[0];
    await w.q("update trade_operation_proposals set expires_at=now()-interval '1 second' where id=$1", [expired.id]);
    const r = await w.post({ action: 'confirm', id: expired.id, cursor: 30, mode: 'PAPER' });
    const after = (await w.q('select state, execution from trade_operation_proposals where id=$1', [expired.id]))[0];
    assert.equal(after.state, 'EXPIRADA', await r.clone().text());
    assert.equal(after.execution, null);
    const eo = (await w.q('select lifecycle, outcome_status from trade_setup_observations where proposal_id=$1', [expired.id]))[0];
    assert.equal(eo.lifecycle, 'EXPIRED'); // still observed hypothetically

    // A fresh opportunity for F/H.
    let more: any[] = [];
    for (let c = 31; c <= 200 && more.length < 2; c++) {
      const s: any = await runScanner(w.env as any, 'replay', c, 'paper');
      const fresh = s.technicalProposals.filter((t: any) => t.proposal.proposalState === 'READY');
      if (fresh.length) {
        const rr = await w.read(c);
        for (const t of fresh) {
          const row = rr.find((x: any) => x.payload.setupObservationId === t.observationId && x.state === 'AGUARDANDO CONFIRMAÇÃO');
          if (row) more.push({ row, cursor: c });
        }
      }
    }
    assert.ok(more.length >= 2, 'replay produced two more READY proposals');
    // F — valid PAPER executes the simulation with planned vs effective entry, stop, target, MFE/MAE, R, exit reason.
    const f = more[0];
    const ok = await w.post({ action: 'confirm', id: f.row.id, cursor: f.cursor, mode: 'PAPER' });
    assert.equal(ok.status, 200, await ok.clone().text());
    await w.read(420);
    const done = (await w.q('select state, execution from trade_operation_proposals where id=$1', [f.row.id]))[0];
    assert.equal(done.state, 'CONFIRMADA');
    const x = done.execution;
    for (const k of ['plannedEntry', 'entry', 'slippagePoints', 'fillModel', 'quantity', 'plannedRiskPoints', 'plannedRR']) assert.ok(k in x, `execution.${k}`);
    if (x.exitTime) for (const k of ['exitReason', 'resultR', 'mfeR', 'maeR']) assert.ok(k in x, `execution.${k}`);
    const journal = (await w.q('select kind from trade_operation_journal where proposal_id=$1 order by id', [f.row.id])).map((j: any) => j.kind);
    assert.ok(journal.includes('CONFIRMADA'));
    const fo = (await w.q('select lifecycle, paper from trade_setup_observations where proposal_id=$1', [f.row.id]))[0];
    assert.ok(['PAPER_ACTIVE', 'PAPER_CLOSED'].includes(fo.lifecycle));
    assert.equal(fo.paper.plannedEntry, f.row.payload.entry);

    // H — "NÃO ENTRAR": the setup is IGNORED but its hypothetical outcome keeps being tracked.
    {
      const h = more[1];
      await w.post({ action: 'discard', id: h.row.id, cursor: h.cursor, mode: 'PAPER' });
      const ho = (await w.q('select id, lifecycle from trade_setup_observations where proposal_id=$1', [h.row.id]))[0];
      assert.equal(ho.lifecycle, 'IGNORED');
      for (let c = h.cursor + 1; c <= h.cursor + 15; c++) await runScanner(w.env as any, 'replay', c, 'paper');
      const tracked = (await w.q('select outcome, paper from trade_setup_observations where id=$1', [ho.id]))[0];
      assert.ok(tracked.outcome && tracked.outcome.barsTracked > 0, 'ignored setup still tracked');
      assert.equal(tracked.paper, null); // a hypothetical outcome is never turned into a PAPER trade
    }
    await w.noBroker();
  } finally {
    await w.close();
  }
});

const obs = (over: Partial<LabObservation>): LabObservation => ({
  id: 'o',
  source: 'LIVE',
  strategyId: 'support_rejection_v1',
  version: '1.2.0',
  direction: 'BUY',
  confirmedAt: 100,
  lifecycle: 'EXPIRED',
  outcome: { status: 'TARGET_FIRST', resultR: 2, mfeR: 2.1, maeR: 0.3, minutesToTarget: 9, minutesToStop: null, barsTracked: 9 },
  paper: null,
  features: { hourBRT: 16, weekday: 'Mon', regimes: [], rr: 2, trend5m: 'DOWN' },
  scope: 'mt5:WINV26:xp',
  marketAsOf: 100,
  participants: [],
  ...over,
});
const group = (a: ReturnType<typeof labAnalytics>, id: string, ds = 'LIVE_DETECTED') => a.groups.find((g) => g.strategyId === id && g.dataset === ds);

test('G/I/J/L/M: one opportunity, one outcome, global N=1; each proven participant gets it in its own statistics; PAPER stays separate', () => {
  const o = obs({
    participants: [{ strategyId: 'false_breakout_v1', version: '1.2.0', configHash: 'h' }],
    lifecycle: 'PAPER_CLOSED',
    paper: { resultR: 1.4, mfeR: 1.8, maeR: 0.2, durationMinutes: 12, exitTime: 200 },
  });
  const a = labAnalytics([o]);
  // L — global: one market opportunity per dataset.
  assert.deepEqual(a.opportunities.map((x) => [x.dataset, x.opportunities, x.metrics.n]), [['LIVE_DETECTED', 1, 1], ['PAPER_FORWARD', 1, 1]]);
  // J/M — each confirmed strategy receives the hypothetical outcome in its own statistics.
  assert.equal(group(a, 'support_rejection_v1')!.metrics.n, 1);
  assert.equal(group(a, 'false_breakout_v1')!.metrics.n, 1);
  assert.equal(group(a, 'false_breakout_v1')!.asParticipant, 1);
  assert.equal(group(a, 'false_breakout_v1')!.metrics.expectancyR, 2);
  // G/I — one PAPER trade, credited only to the strategy whose levels were traded; datasets never mix.
  assert.equal(group(a, 'support_rejection_v1', 'PAPER_FORWARD')!.metrics.expectancyR, 1.4);
  assert.equal(group(a, 'false_breakout_v1', 'PAPER_FORWARD'), undefined);
  assert.equal(group(a, 'support_rejection_v1')!.metrics.expectancyR, 2);
  // Small N is never a conclusion (T).
  assert.ok(a.groups.every((g) => g.status === 'AMOSTRA INSUFICIENTE'));
  // A participant that ALSO has its own observation of the same opportunity is counted once.
  const own = obs({ id: 'o2', strategyId: 'false_breakout_v1', participants: [{ strategyId: 'support_rejection_v1', version: '1.2.0' }] });
  const b = labAnalytics([obs({ participants: [{ strategyId: 'false_breakout_v1', version: '1.2.0' }] }), own]);
  assert.equal(group(b, 'false_breakout_v1')!.metrics.n, 1);
  assert.equal(group(b, 'support_rejection_v1')!.metrics.n, 1);
  assert.equal(b.opportunities[0].opportunities, 1);
  // Different versions never merge.
  const c = labAnalytics([obs({ participants: [{ strategyId: 'false_breakout_v1', version: '1.3.0' }] })]);
  assert.equal(group(c, 'false_breakout_v1')!.version, '1.3.0');
});

test('K: a participant gets credit only when CONFIRMED on the same candle with its own conditions met and the same direction', () => {
  const cand = (id: string, state: string, direction = 'long', met = true) => ({
    definition: { id, version: '1.2.0' },
    state,
    analysis: { setup: { direction, entry: 100, stop: 90, targets: [120], rr: 2, conditions: [{ key: 'a', met: true }, { key: 'b', met }] } },
  });
  const primary = cand('support_rejection_v1', 'CONFIRMED');
  const scan: any = {
    asOf: 500,
    groups: [{ primary: 'support_rejection_v1', participants: ['support_rejection_v1', 'false_breakout_v1', 'forming_v1', 'short_v1', 'partial_v1'] }],
    candidates: [primary, cand('false_breakout_v1', 'CONFIRMED'), cand('forming_v1', 'WAITING_TRIGGER'), cand('short_v1', 'CONFIRMED', 'short'), cand('partial_v1', 'CONFIRMED', 'long', false), cand('elsewhere_v1', 'CONFIRMED')],
  };
  const ev = participantEvidence({ candidate: primary } as any, scan);
  assert.deepEqual(ev.map((e) => e.strategyId), ['false_breakout_v1']); // not forming, not opposite, not partial, not outside the group
  assert.equal(ev[0].confirmedAt, 500); // the confirmation candle itself: no look-ahead
  assert.equal(ev[0].state, 'CONFIRMED');
  assert.ok(ev[0].definition);
  // Legacy snapshots without evidence give no participant credit.
  const legacy = labAnalytics([obs({ participants: undefined })]);
  assert.equal(legacy.groups.length, 1);
});

test('J: the database hashes each participant definition, strips it and registers the version; snapshot stays immutable', async () => {
  const w = await world();
  try {
    const def = (id: string) => ({ id, version: '9.9.9', name: id, timeframes: ['1m'], parameters: { x: 1 } });
    const snapshot = {
      symbol: 'WINV26', direction: 'BUY', watchId: 'w1', detectedAt: 1, confirmedAt: 2, marketAsOf: 2,
      strategy: { id: 'p_v1', version: '9.9.9', definition: def('p_v1') },
      participantEvidence: [{ strategyId: 'q_v1', version: '9.9.9', state: 'CONFIRMED', confirmedAt: 2, conditions: [], entry: 1, stop: 0, target: 2, rr: 2, definition: def('q_v1') }],
    };
    await w.q('select public.trade_setup_observe($1,$2)', ['focoos-admin', { id: 'obs:x', scope: 'mt5:x', source: 'LIVE', snapshot, actionability: null }]);
    const row = (await w.q("select snapshot, (select config_hash from trade_strategy_versions where strategy_id='q_v1') reg, md5($1::jsonb::text) h from trade_setup_observations where id='obs:x'", [def('q_v1')]))[0];
    const pe = row.snapshot.participantEvidence[0];
    assert.equal(pe.definition, undefined);
    assert.equal(pe.configHash, row.h);
    assert.equal(row.reg, row.h);
    const ev = (await w.q("select payload from trade_setup_observation_events where observation_id='obs:x' and kind='CONFIRMED'"))[0].payload;
    assert.deepEqual(ev.participants, [{ strategyId: 'q_v1', version: '9.9.9', configHash: row.h }]);
    await assert.rejects(w.q("update trade_setup_observations set snapshot=snapshot-'participantEvidence' where id='obs:x'"));
  } finally {
    await w.close();
  }
});

test('S/T: the Professor answers performance only from LAB numbers, labels HYPOTHETICAL vs PAPER and never invents', async () => {
  const { performanceAnswer, performanceQuestion } = await import('../../functions/api/trade/professor');
  for (const qn of ['Essa estratégia funciona?', 'Qual estratégia está melhor?', 'Qual a taxa de acerto?', 'Essa estratégia dá dinheiro?', 'Qual setup está performando melhor?'])
    assert.ok(performanceQuestion.test(qn.toLowerCase()), qn);
  const text = performanceAnswer(labAnalytics([obs({ participants: [{ strategyId: 'false_breakout_v1', version: '1.2.0' }] })]).groups, undefined);
  assert.match(text, /support_rejection_v1 v1\.2\.0 · LIVE_DETECTED \(resultado HIPOTÉTICO/);
  assert.match(text, /false_breakout_v1 v1\.2\.0/);
  assert.match(text, /N=1/);
  assert.match(text, /AMOSTRA INSUFICIENTE/);
  assert.doesNotMatch(text, /PROMISSORA:|ganhou|lucrativa|confiável|vencedora|Expectativa 2/i);
});

test('13: the scanner and PAPER follow-up are driven server-side by the EA batch (no browser needed)', async () => {
  const w = await world();
  try {
    const { onRequestPost: exchange } = await import('../../functions/api/trade/bridge/exchange');
    const token = 'unit-test-placeholder-32-characters-long';
    const env = { ...w.env, TRADE_BRIDGE_TOKEN: token, TRADE_ACCOUNT_HASH: 'a'.repeat(64) };
    const tasks: Promise<unknown>[] = [];
    const now = Date.now();
    const batch = {
      bridgeId: 'xp-mt5-primary', symbol: 'WINV26', session: 'browserless', batch: 0, accountHash: 'a'.repeat(64),
      ticks: [{ symbol: 'WINV26', timeMsc: now, bid: 130000, ask: 130005, last: 130000, volume: 1, flags: 6 }],
      candles: [], events: [],
      state: { connected: true, executionAllowed: false, tickSize: 5, positions: [], orders: [] },
    };
    const r = await exchange({
      request: new Request('https://fixture.invalid/api/trade/bridge/exchange', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(batch) }),
      env: env as any,
      waitUntil: (t) => tasks.push(t),
    });
    assert.equal(r.status, 200, await r.clone().text());
    assert.ok(tasks.length >= 1, 'background work scheduled by the bridge request itself');
    await Promise.all(tasks);
    assert.ok(w.called.includes('trade_scanner_save'), 'scanner ran from the bridge request');
    assert.ok(w.called.includes('trade_operations_read'), 'PAPER follow-up ran from the bridge request');
    const scannerRows = await w.q("select scope from trade_scanner_state where scope like 'mt5:%'");
    assert.ok(scannerRows.length >= 1, 'scanner state written by the EA-driven run');
    await w.noBroker();
  } finally {
    await w.close();
  }
});
