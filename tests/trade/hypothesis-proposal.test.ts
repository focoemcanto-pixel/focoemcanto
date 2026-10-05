import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  buildTechnicalProposal,
  sizeProposal,
  isExecutable,
  type Proposal,
} from '../../trade/bridge/approval';
import { paperRiskLimit, realRiskLimit } from '../../trade/bridge/config';
import {
  PaperExecutionProvider,
  hypotheticalObservation,
} from '../../trade/bridge/paper';
import { MT5BrokerExecutionProvider } from '../../trade/bridge/mt5';
import { runReplay } from '../../trade/core/engine';
import { generateMockCandles, snapshotOf } from '../../trade/core/providers';
import type { Analysis, Candle } from '../../trade/core/types';
import { scanMarket } from '../../trade/scanner/engine';
import {
  strategyRegistry,
  RuleStrategy,
  ruleStrategyVersion,
} from '../../trade/scanner/strategies';
import { runScanner } from '../../trade/scanner/service';

/** Production example: SELL 208.495, technical stop 210.885 (2.390 pts), target 203.715. */
function sellAnalysis(asOf: number): Analysis {
  const conditions = [
    { key: 'trigger', label: 'Gatilho', met: true, detail: 'fixture' },
  ];
  return {
    strategy: 'structure_breakout_v1',
    version: ruleStrategyVersion,
    stage: 'paper',
    status: 'complete',
    trend: 'down',
    conditions,
    missing: [],
    conflicts: [],
    explanation: 'fixture',
    setup: {
      id: `structure_breakout_v1:${ruleStrategyVersion}:WINV26:${asOf}`,
      strategy: 'structure_breakout_v1',
      version: ruleStrategyVersion,
      symbol: 'WINV26',
      tickSize: 5,
      riskRules: { minStopPoints: 20, maxStopPoints: 5000, targetR: 2 },
      timestamp: asOf,
      direction: 'short',
      entry: 208495,
      stop: 210885,
      targets: [203715],
      riskPoints: 2390,
      potentialPoints: 4780,
      rr: 2,
      conditions,
      conflicts: [],
      explanation: 'fixture',
    },
  };
}
const now = Date.parse('2026-10-05T14:00:30Z'),
  asOf = Math.floor(now / 1000) - 30;
function technical() {
  return buildTechnicalProposal(
    sellAnalysis(asOf),
    {
      mode: 'PAPER',
      source: 'mt5',
      symbol: 'WINV26',
      cursor: asOf,
      asOf,
      liveAuthorized: false,
    },
    now,
  );
}
const win = { pointValue: 0.2, currency: 'BRL', pointValueSource: 'mt5' };
const size = (maxRiskBRL: number | null, maxContracts = 10) =>
  sizeProposal(technical(), {
    ...win,
    maxContracts,
    maxRiskBRL,
    maxRiskSource: 'TRADE_PAPER_MAX_RISK_BRL',
  });

test('technical proposal carries levels, distances, R/R and snapshot — no budget or quantity', () => {
  const t = technical() as any;
  assert.equal(t.direction, 'SELL');
  assert.equal(t.entry, 208495);
  assert.equal(t.sl, 210885);
  assert.equal(t.tp, 203715);
  assert.equal(t.riskPoints, 2390);
  assert.equal(t.potentialPoints, 4780);
  assert.equal(t.rr, 2);
  assert.equal(t.asOf, asOf);
  assert.ok(t.expiresAt > now);
  for (const key of ['quantity', 'riskBRL', 'potentialBRL', 'sizing', 'proposalState'])
    assert.equal(key in t, false, key);
});

test('A: valid setup + one contract above the limit → technical proposal kept, RISK_BLOCKED, quantity 0', () => {
  const p = size(100);
  assert.equal(p.proposalState, 'RISK_BLOCKED');
  assert.equal(p.quantity, 0);
  assert.equal(isExecutable(p), false);
  assert.equal(p.direction, 'SELL');
  assert.equal(p.entry, 208495);
  assert.equal(p.sl, 210885);
  assert.equal(p.tp, 203715);
  assert.equal(p.riskPoints, 2390);
  assert.equal(p.riskPerContractBRL, 478);
  assert.equal(p.riskBlock?.code, 'RISK_LIMIT_EXCEEDED');
  assert.equal(p.riskBlock?.minimumRiskBRL, 478);
  assert.equal(p.riskBlock?.maxRiskBRL, 100);
  assert.equal(p.riskBlock?.excessBRL, 378);
  assert.equal(p.riskBRL, 0);
  assert.match(p.riskBlock!.message, /Stop técnico mantido/);
});

test('B: valid setup + risk within the limit → READY with risk-engine quantity', () => {
  const one = size(500);
  assert.equal(one.proposalState, 'READY');
  assert.equal(one.quantity, 1);
  assert.equal(one.riskBRL, 478);
  const two = size(1000);
  assert.equal(two.quantity, 2);
  assert.equal(two.riskBRL, 956);
  assert.equal(two.sizing?.engine, 'risk-engine');
  assert.equal(size(1000, 1).quantity, 1);
  const requested = sizeProposal(technical(), {
    ...win,
    maxContracts: 10,
    maxRiskBRL: 5000,
    maxRiskSource: 'test',
    requestedQuantity: 3,
  });
  assert.equal(requested.quantity, 3);
  assert.throws(() =>
    sizeProposal(technical(), {
      ...win,
      maxContracts: 2,
      maxRiskBRL: 5000,
      maxRiskSource: 'test',
      requestedQuantity: 3,
    }),
  );
});

test('C: changing the financial limit changes quantity/eligibility only, never entry/stop/target', () => {
  const t = technical();
  const sized = [50, 100, 477.99, 478, 1000, 5000, 1e6].map((limit) =>
    sizeProposal(t, { ...win, maxContracts: 4, maxRiskBRL: limit, maxRiskSource: 'test' }),
  );
  assert.deepEqual(
    sized.map((p) => p.quantity),
    [0, 0, 0, 1, 2, 4, 4],
  );
  for (const p of sized) {
    assert.equal(p.entry, t.entry);
    assert.equal(p.sl, t.sl);
    assert.equal(p.tp, t.tp);
    assert.equal(p.riskPoints, t.riskPoints);
    assert.equal(p.potentialPoints, t.potentialPoints);
    assert.equal(p.rr, t.rr);
    assert.equal(p.setup, t.setup);
  }
});

test('missing or invalid limit fails closed: RISK_BLOCKED, never a silent default', () => {
  for (const limit of [null, 0, -5, Number.NaN]) {
    const p = size(limit as any);
    assert.equal(p.proposalState, 'RISK_BLOCKED');
    assert.equal(p.riskBlock?.code, 'RISK_LIMIT_NOT_CONFIGURED');
    assert.equal(p.quantity, 0);
  }
});

test('PAPER limit: explicit variable, shared fallback, labelled compatibility default, invalid fails closed', () => {
  assert.deepEqual(paperRiskLimit({ TRADE_PAPER_MAX_RISK_BRL: '250', TRADE_MAX_RISK_BRL: '80' }), {
    maxRiskBRL: 250,
    source: 'TRADE_PAPER_MAX_RISK_BRL',
  });
  assert.deepEqual(paperRiskLimit({ TRADE_MAX_RISK_BRL: '80' }), {
    maxRiskBRL: 80,
    source: 'TRADE_MAX_RISK_BRL',
  });
  assert.deepEqual(paperRiskLimit({}), { maxRiskBRL: 100, source: 'compat-default' });
  assert.equal(paperRiskLimit({ TRADE_PAPER_MAX_RISK_BRL: 'abc' }).maxRiskBRL, null);
  assert.equal(paperRiskLimit({ TRADE_PAPER_MAX_RISK_BRL: '0' }).maxRiskBRL, null);
});

test('G: REAL without policy max_risk_brl fails closed; never borrows a PAPER default', () => {
  assert.deepEqual(realRiskLimit({ policy: {} }).maxRiskBRL, null);
  assert.deepEqual(realRiskLimit(undefined).maxRiskBRL, null);
  assert.deepEqual(
    realRiskLimit({ policy: { max_risk_brl: 500 }, bridge: { state: { localLimits: { maxRiskBRL: 300 } } } }),
    { maxRiskBRL: 300, source: 'EA localLimits.maxRiskBRL' },
  );
  const limit = realRiskLimit({ policy: { max_risk_brl: null } });
  const p = sizeProposal(technical(), { ...win, maxContracts: 2, maxRiskBRL: limit.maxRiskBRL, maxRiskSource: limit.source });
  assert.equal(p.proposalState, 'RISK_BLOCKED');
  assert.equal(p.riskBlock?.code, 'RISK_LIMIT_NOT_CONFIGURED');
});

test('D/E: RISK_BLOCKED never reaches the PAPER or REAL provider', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error('provider must not be called');
  };
  try {
    const blocked = size(100);
    const env = {
      TRADE_SUPABASE_URL: 'https://fixture.invalid',
      TRADE_SUPABASE_SERVICE_KEY: 'fixture',
      TRADE_EXECUTION_ENABLED: 'true',
    };
    await assert.rejects(new PaperExecutionProvider(env).approve(blocked), /RISK_BLOCKED/);
    assert.throws(() => new PaperExecutionProvider(env).observe(blocked, []), /RISK_BLOCKED/);
    const real: Proposal = { ...blocked, mode: 'REAL' };
    await assert.rejects(
      new MT5BrokerExecutionProvider(env).approve(real, {
        command: { id: real.id } as any,
        nonce: 'n'.repeat(64),
      }),
      /bloqueada/,
    );
    // H: a READY REAL proposal still needs the explicit human intent (signed command + nonce).
    await assert.rejects(new MT5BrokerExecutionProvider(env).approve({ ...size(1000), mode: 'REAL' }), /bloqueada/);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test('F: RISK_BLOCKED is observable hypothetically: R, MFE, MAE and duration; no money, no fill', () => {
  const p = size(100),
    bar = (i: number, o: number, h: number, l: number, c: number): Candle => ({
      symbol: 'WINV26',
      timeframe: '1m',
      timestamp: asOf + i * 60,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: 1,
    });
  const bars = [
    bar(0, 208495, 209000, 207000, 207500),
    bar(1, 207500, 208100, 205000, 205500),
    bar(2, 205500, 205600, 203500, 203600),
  ];
  const open = hypotheticalObservation(p, bars.slice(0, 2));
  assert.equal(open.status, 'OBSERVAÇÃO HIPOTÉTICA');
  assert.equal(open.exitTime, null);
  const done = hypotheticalObservation(p, bars, open);
  assert.equal(done.exitReason, 'TARGET');
  assert.equal(done.resultR, 2);
  assert.equal(done.resultBRL, null);
  assert.equal(done.filled, 0);
  assert.equal(done.hypothetical, true);
  assert.equal(done.durationMinutes, 2);
  assert.equal(done.mfeR, 2);
  assert.ok(Math.abs(done.maeR - 505 / 2390) < 1e-9);
  // Same technical levels as the blocked proposal; the observation never edits them.
  assert.equal(p.sl, 210885);
});

test('warm-up per rule: M1-only rules evaluate without 22 M5 bars; RuleStrategy v1.2.0', () => {
  const rules = strategyRegistry.filter((s): s is RuleStrategy => s instanceof RuleStrategy);
  assert.equal(rules.length, 14);
  assert.ok(rules.every((r) => r.definition.version === '1.2.0'));
  const m1Only = rules.filter((r) => !r.definition.dataRequirements!.some((d) => d.timeframe === '5m'));
  assert.deepEqual(
    m1Only.map((r) => r.kind).sort(),
    ['breakout', 'expansion', 'false-breakout', 'momentum', 'resistance', 'retest', 'rsi', 'support'],
  );
  // 30 closed M1 bars of the current session = 6 M5 bars: far from 22 M5.
  const scan = scanMarket(runReplay(generateMockCandles(), 30).snapshot);
  for (const c of scan.candidates) {
    const rule = rules.find((r) => r.definition.id === c.definition.id);
    if (!rule) continue;
    if (m1Only.includes(rule)) assert.notEqual(c.state, 'INSUFFICIENT_DATA', c.definition.id);
    else {
      assert.equal(c.state, 'INSUFFICIENT_DATA', c.definition.id);
      const m5 = c.warmup!.frames.find((f) => f.timeframe === '5m')!;
      assert.ok(m5.have < m5.need);
      assert.ok(c.warmup!.readyAt! > scan.asOf);
    }
  }
});

test('hypotheses are visible and explained but never confirm or propose anything themselves', () => {
  for (const cursor of [15, 30, 60, 180]) {
    const scan = scanMarket(runReplay(generateMockCandles(), cursor).snapshot);
    const hs = scan.hypotheses!;
    assert.equal(hs.length, scan.candidates.length);
    assert.deepEqual(hs.map((h) => h.rank), hs.map((_, i) => i + 1));
    assert.equal(scan.desk!.coverage.registered, 17);
    assert.equal(scan.desk!.coverage.awaitingData, 2);
    for (const h of hs) {
      const c = scan.candidates.find((x) => x.definition.id === h.id)!;
      assert.equal(h.stage === 'CONFIRMED', c.state === 'CONFIRMED');
      if (h.stage === 'CONFIRMED') assert.ok(c.analysis.setup);
      assert.ok(h.score >= 0 && h.score <= 100);
    }
    if (cursor === 15) assert.equal(scan.desk!.verdict, 'WARMING_UP');
  }
  const offline = scanMarket(snapshotOf(generateMockCandles().slice(0, 60), 'live'), undefined, false);
  assert.equal(offline.desk!.verdict, 'FEED_NOT_LIVE');
  assert.ok(offline.hypotheses!.every((h) => h.stage !== 'CONFIRMED'));
});

async function database() {
  const db = new PGlite();
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for (const name of [
    '20261003035402_mt5_bridge.sql',
    '20261003042050_human_approval.sql',
    '20261003124510_multi_strategy_scanner.sql',
    '20261004210552_real_execution_safety.sql',
    '20261005000359_real_execution_fail_closed.sql',
    '20261005091111_pre_real_homologation.sql',
    '20261005092318_pre_real_account_mode.sql',
    '20261005122031_bridge_market_clock.sql',
    '20261005150000_risk_blocked_technical_proposal.sql',
  ])
    await db.exec(readFileSync('supabase/migrations/' + name, 'utf8'));
  return db;
}
function route(db: PGlite, called: string[]) {
  return async (url: any, init: any) => {
    const name = new URL(String(url)).pathname.split('/').pop()!;
    called.push(name);
    const args = Object.values(JSON.parse(String(init?.body)));
    try {
      const r = await db.query<any>(
        `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`,
        args,
      );
      return Response.json(r.rows[0]?.result ?? null);
    } catch (e: any) {
      return Response.json({ code: 'P0001', message: String(e.message) }, { status: 400 });
    }
  };
}

test('D/F end-to-end PAPER: blocked proposal persisted, confirm refused before provider, observed hypothetically', async () => {
  const db = await database(),
    original = globalThis.fetch,
    called: string[] = [];
  try {
    globalThis.fetch = route(db, called) as any;
    const { onRequestPost, onRequestGet } = await import('../../functions/api/trade/operations');
    const env = {
      TRADE_SUPABASE_URL: 'https://fixture.invalid',
      TRADE_SUPABASE_SERVICE_KEY: 'fixture',
      TRADE_EXECUTION_ENABLED: 'false',
      TRADE_PAPER_MAX_RISK_BRL: '10',
    };
    const post = (body: any) =>
      onRequestPost({
        env,
        request: new Request('https://fixture.invalid/api/trade/operations', {
          method: 'POST',
          body: JSON.stringify({ source: 'replay', cursor: 180, mode: 'PAPER', ...body }),
        }),
      });
    const technicalSetup = runReplay(generateMockCandles(), 180).analyses[0].setup!;
    const r = await post({ action: 'propose', quantity: 1 });
    const row: any = await r.json();
    assert.equal(r.status, 200, JSON.stringify(row));
    assert.equal(row.state, 'BLOQUEADA POR RISCO');
    assert.equal(row.payload.proposalState, 'RISK_BLOCKED');
    assert.equal(row.payload.quantity, 0);
    assert.equal(row.payload.sl, technicalSetup.stop);
    assert.equal(row.payload.tp, technicalSetup.targets[0]);
    assert.equal(row.payload.entry, technicalSetup.entry);
    called.length = 0;
    const confirm = await post({ action: 'confirm', id: row.id });
    assert.equal(confirm.status, 409);
    assert.match(((await confirm.json()) as any).error, /RISK_BLOCKED/);
    assert.deepEqual(called, ['trade_operations_read']);
    // The database refuses too, even if the endpoint were bypassed.
    await db.query("select trade_confirm('focoos-admin',$1,'confirm',null,1,'',15000)", [row.id]);
    await assert.rejects(db.query("update trade_operation_proposals set state='CONFIRMADA' where id=$1", [row.id]));
    assert.equal((await db.query<any>('select state from trade_operation_proposals where id=$1', [row.id])).rows[0].state, 'BLOQUEADA POR RISCO');
    // Duplicate proposals for the same setup are not created.
    await post({ action: 'propose', quantity: 1 });
    assert.equal((await db.query('select * from trade_operation_proposals')).rows.length, 1);
    const rows: any = await (
      await onRequestGet({ env, request: new Request('https://fixture.invalid/api/trade/operations?source=replay&cursor=420') })
    ).json();
    const observed = rows.find((x: any) => x.id === row.id).hypothetical_execution;
    assert.ok(observed, JSON.stringify(rows[0]));
    assert.equal(observed.hypothetical, true);
    assert.equal(observed.resultBRL, null);
    assert.equal(observed.filled, 0);
    assert.ok('mfeR' in observed && 'maeR' in observed);
    assert.equal((await db.query('select * from trade_bridge_commands')).rows.length, 0);
    assert.equal(
      (await db.query<any>("select count(*)::int n from trade_operation_journal where kind='BLOQUEADA_POR_RISCO'")).rows[0].n,
      1,
    );
    // With a sufficient explicit limit the same flow is READY and executable in PAPER.
    await db.exec('delete from trade_operation_journal; delete from trade_operation_proposals');
    const ready: any = await (
      await onRequestPost({
        env: { ...env, TRADE_PAPER_MAX_RISK_BRL: '1000' },
        request: new Request('https://fixture.invalid/api/trade/operations', {
          method: 'POST',
          body: JSON.stringify({ action: 'propose', source: 'replay', cursor: 180, mode: 'PAPER', quantity: 1 }),
        }),
      })
    ).json();
    assert.equal(ready.state, 'AGUARDANDO CONFIRMAÇÃO');
    assert.equal(ready.payload.proposalState, 'READY');
    assert.equal(ready.payload.quantity, 1);
  } finally {
    globalThis.fetch = original;
    await db.close();
  }
});

test('scanner: confirmed setup above the PAPER limit becomes a visible RISK_BLOCKED technical proposal', async () => {
  const db = await database(),
    original = globalThis.fetch,
    called: string[] = [];
  try {
    globalThis.fetch = route(db, called) as any;
    const env = {
      TRADE_SUPABASE_URL: 'https://fixture.invalid',
      TRADE_SUPABASE_SERVICE_KEY: 'fixture',
      TRADE_EXECUTION_ENABLED: 'false',
      TRADE_PAPER_MAX_RISK_BRL: '10',
    };
    const result: any = await runScanner(env, 'replay', 30, 'risk-blocked');
    assert.ok(result.technicalProposals.length >= 1, JSON.stringify(result.proposalBlocks));
    for (const t of result.technicalProposals) {
      assert.equal(t.proposal.proposalState, 'RISK_BLOCKED');
      assert.equal(t.proposal.quantity, 0);
      const c = result.scan.candidates.find((x: any) => x.definition.id === t.strategy);
      assert.equal(c.state, 'CONFIRMED');
      assert.equal(t.proposal.sl, c.analysis.setup.stop);
      assert.equal(t.proposal.entry, c.analysis.setup.entry);
    }
    assert.deepEqual(result.riskPolicy.paper, { maxRiskBRL: 10, source: 'TRADE_PAPER_MAX_RISK_BRL' });
    const rows = (await db.query<any>('select state from trade_operation_proposals')).rows;
    assert.ok(rows.length && rows.every((r) => r.state === 'BLOQUEADA POR RISCO'));
    const watches = (await db.query<any>("select state from trade_setup_watches where state='RISK_BLOCKED'")).rows;
    assert.equal(watches.length, rows.length);
    // Polling the same minute is idempotent: no duplicate rows.
    await runScanner(env, 'replay', 30, 'risk-blocked');
    assert.equal((await db.query('select * from trade_operation_proposals')).rows.length, rows.length);
    assert.ok(!called.includes('trade_confirm'));
    assert.equal((await db.query('select * from trade_bridge_commands')).rows.length, 0);
  } finally {
    globalThis.fetch = original;
    await db.close();
  }
});
