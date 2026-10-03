import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  rsi,
  atr,
  calculateFeatures,
  frameFeatures,
} from '../../trade/scanner/features';
import {
  scanMarket,
  advanceWatches,
  transitionWatch,
} from '../../trade/scanner/engine';
import { strategyRegistry, RuleStrategy } from '../../trade/scanner/strategies';
import { generateMockCandles, snapshotOf } from '../../trade/core/providers';
import { paperExecution } from '../../trade/bridge/paper';
import { makeProposal } from '../../trade/bridge/approval';
import { runScanner } from '../../trade/scanner/service';
const bars = generateMockCandles(),
  snapshot = snapshotOf(bars.slice(0, 180));
test('Wilder RSI, ATR, EMA, MACD and lagged levels exclude current/future candles', () => {
  assert.equal(rsi(Array.from({ length: 30 }, (_, i) => i)), 100);
  assert.equal(rsi(Array(30).fill(50)), 50);
  assert.equal(rsi([1, 2]), null);
  const fixture = bars.slice(0, 40).map((c, i) => ({
    ...c,
    open: 100,
    close: 100,
    low: 95,
    high: 105,
    volume: 10,
  }));
  assert.equal(atr(fixture), 10);
  const f = frameFeatures(fixture);
  assert.equal(f.support, 95);
  assert.equal(f.resistance, 105);
  assert.equal(f.volumeRatio, 1);
  assert.equal(f.macd, 0);
  assert.equal(f.signal, 0);
  const sf = calculateFeatures(snapshot);
  assert.ok(sf.frames['5m'].count < sf.frames['1m'].count);
  assert.equal(sf.vwap, null);
  const future = {
    ...snapshot,
    candles: {
      ...snapshot.candles,
      '1m': [
        ...snapshot.candles['1m'],
        { ...bars[180], close: 999999, high: 999999 },
      ],
    },
  };
  assert.deepEqual(calculateFeatures(future), sf);
  assert.deepEqual(scanMarket(future), scanMarket(snapshot));
});
for (const strategy of strategyRegistry) {
  test(`${strategy.definition.id}: deterministic rules, version, missing conditions and no live authorization`, () => {
    const a = strategy.evaluate(snapshot, calculateFeatures(snapshot));
    assert.deepEqual(
      a,
      strategy.evaluate(snapshot, calculateFeatures(snapshot)),
    );
    assert.equal(a.definition.liveAuthorized, false);
    assert.ok(a.definition.version);
    assert.ok(Object.keys(a.definition.parameters).length);
    const empty = snapshotOf([]),
      b = strategy.evaluate(empty, calculateFeatures(empty));
    assert.ok(['INSUFFICIENT_DATA', 'UNAVAILABLE_DATA'].includes(b.state));
    assert.equal(b.analysis.setup, undefined);
    if (a.state === 'CONFIRMED') {
      assert.ok(a.analysis.conditions.every((c) => c.met));
      assert.ok(a.analysis.setup!.riskPoints > 0);
      assert.equal(a.analysis.setup!.rr, 2);
    }
  });
}
test('scanner includes every evaluator, unavailable real-volume VWAP, stale blocks, transparent conflict', () => {
  const scan = scanMarket(snapshot);
  assert.equal(scan.candidates.length, 17);
  assert.equal(
    Object.values(scan.summary).reduce((s, n) => s + n, 0),
    17,
  );
  assert.equal(
    scan.candidates.find((c) => c.definition.id === 'vwap_recovery_v1')!.state,
    'UNAVAILABLE_DATA',
  );
  const stale = scanMarket({ ...snapshot, source: 'live' }, undefined, false);
  assert.ok(
    stale.candidates.every(
      (c) => c.state === 'UNAVAILABLE_DATA' && !c.analysis.setup,
    ),
  );
});
test('pattern fixtures: breakout, rejection support/resistance and false break are price rules', () => {
  const s = structuredClone(snapshot),
    f = calculateFeatures(s),
    base = f.frames['1m'];
  f.frames['5m'].emaFast = 110;
  f.frames['5m'].emaSlow = 100;
  Object.assign(base, {
    support: 100,
    resistance: 120,
    atr: 10,
    previous: { ...bars[0], open: 108, close: 110, low: 107, high: 115 },
    last: { ...bars[1], open: 118, close: 126, low: 117, high: 128 },
  });
  let rule = new RuleStrategy('breakout', 'test_breakout', 'fixture');
  assert.equal(rule.evaluate(s, f).state, 'CONFIRMED');
  Object.assign(base, {
    last: { ...bars[1], open: 106, close: 111, low: 94, high: 113 },
  });
  rule = new RuleStrategy('support', 'test_support', 'fixture');
  assert.equal(rule.evaluate(s, f).state, 'CONFIRMED');
  rule = new RuleStrategy('false-breakout', 'test_false', 'fixture');
  assert.equal(rule.evaluate(s, f).state, 'CONFIRMED');
  Object.assign(base, {
    previous: { ...bars[0], close: 110 },
    last: { ...bars[1], open: 114, close: 109, low: 107, high: 125 },
  });
  rule = new RuleStrategy('resistance', 'test_resistance', 'fixture');
  assert.equal(rule.evaluate(s, f).state, 'CONFIRMED');
});
test('watch state formation → trigger → confirmation, invalidation, expiry, illegal transitions, dedup and prefix replay', () => {
  const scan = scanMarket(snapshot),
    candidate = structuredClone(scan.candidates.find((c) => c.analysis.setup)!);
  candidate.state = 'FORMING';
  candidate.analysis.setup = undefined;
  candidate.analysis.conflicts = [];
  const fixture = {
    ...scan,
    opportunities: [candidate],
    candidates: [candidate],
    groups: [
      {
        primary: candidate.definition.id,
        participants: [candidate.definition.id],
      },
    ],
  };
  let watches = advanceWatches([], fixture);
  assert.equal(watches[0].state, 'FORMING');
  const next = structuredClone(fixture);
  next.asOf += 60;
  next.candidates[0].state = 'WAITING_TRIGGER';
  watches = advanceWatches(watches, next);
  assert.equal(watches[0].state, 'WAITING_TRIGGER');
  next.asOf += 60;
  next.candidates[0].state = 'CONFIRMED';
  watches = advanceWatches(watches, next);
  assert.equal(watches[0].state, 'CONFIRMED');
  assert.throws(() =>
    transitionWatch(watches[0], 'OPEN_PAPER', next.asOf, 'invalid'),
  );
  const expired = advanceWatches(watches, {
    ...next,
    asOf: watches[0].validUntil,
    opportunities: [],
  });
  assert.equal(expired[0].state, 'EXPIRED');
  const invalid = advanceWatches(watches, {
    ...next,
    asOf: next.asOf + 60,
    candidates: [{ ...candidate, state: 'REJECTED' }],
    opportunities: [],
  });
  assert.equal(invalid[0].state, 'INVALIDATED');
  const evaluator = strategyRegistry.find(
    (x) =>
      x.definition.id ===
      scan.candidates.find((c) => c.analysis.setup)!.definition.id,
  )!;
  const twin = {
    ...evaluator,
    definition: { ...evaluator.definition, id: 'twin' },
    evaluate(s: any, f: any) {
      const c = evaluator.evaluate(s, f);
      return { ...c, definition: this.definition };
    },
  };
  const grouped = scanMarket(snapshot, [evaluator, twin]);
  assert.equal(grouped.opportunities.length, 1);
  assert.equal(grouped.groups[0].participants.length, 2);
  const prefix = scanMarket(snapshotOf(bars.slice(0, 180)));
  assert.deepEqual(prefix, scanMarket(snapshotOf(bars.slice(0, 180))));
});
test('PAPER next-bar entry, adverse stop precedence, target, financial result and actual fill R denominator', () => {
  const a = scanMarket(snapshot).candidates.find(
    (c) => c.analysis.setup,
  )!.analysis;
  const p = makeProposal(a, {
    mode: 'PAPER',
    source: 'replay',
    symbol: 'WIN',
    quantity: 1,
    max: 1,
    pointValue: 0.2,
    currency: 'BRL',
    cursor: 180,
    asOf: snapshot.asOf,
    liveAuthorized: false,
  });
  const first = {
    ...bars[180],
    timestamp: p.asOf,
    open: p.entry,
    high: p.tp + 5,
    low: p.sl - 5,
    close: p.entry,
  };
  const stop = paperExecution(p, [first])!;
  assert.equal(stop.exit, p.sl);
  assert.equal(stop.exitReason, 'STOP');
  assert.equal(stop.resultR, -1);
  assert.equal(stop.resultBRL, stop.resultPoints! * 0.2);
  const target = paperExecution(p, [{ ...first, low: p.entry - 5 }])!;
  assert.equal(target.exitReason, 'TARGET');
  assert.equal(target.resultR, 2);
  assert.equal(paperExecution(p, bars.slice(0, 180)), null);
});
test('additive DB scanner persistence, recovery, decisions, hypothetical journal and PAPER never commands', async () => {
  const db = new PGlite(),
    original = globalThis.fetch;
  try {
    await db.exec(
      'create role anon;create role authenticated;create role service_role bypassrls;',
    );
    for (const file of [
      '20261003035402_mt5_bridge.sql',
      '20261003042050_human_approval.sql',
      '20261003124510_multi_strategy_scanner.sql',
    ])
      await db.exec(readFileSync('supabase/migrations/' + file, 'utf8'));
    await db.exec('set role service_role');
    globalThis.fetch = async (url, init: any) => {
      const name = new URL(String(url)).pathname.split('/').pop(),
        args = Object.values(JSON.parse(init.body));
      try {
        const r = await db.query<any>(
          `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`,
          args,
        );
        return Response.json(r.rows[0]?.result ?? null);
      } catch (e) {
        throw e;
      }
    };
    const env = {
      TRADE_SUPABASE_URL: 'https://fixture.invalid',
      TRADE_SUPABASE_SERVICE_KEY: 'test',
      TRADE_EXECUTION_ENABLED: 'false',
    };
    const saved = await runScanner(env, 'replay', 180, 'test-run');
    assert.equal(saved.asOf, snapshot.asOf);
    assert.ok(saved.watches.length);
    assert.equal(saved.scan.candidates.length, 17);
    const recovered = await runScanner(env, 'replay', 180, 'test-run');
    assert.equal(recovered.watches.length, saved.watches.length);
    await assert.rejects(runScanner(env, 'replay', 179, 'test-run'));
    const proposals = (
      await db.query<any>('select * from trade_operation_proposals')
    ).rows;
    assert.ok(proposals.length);
    const selected = proposals[0];
    await db.query(
      "select trade_confirm('focoos-admin',$1,'discard',null,1,'',15000)",
      [selected.id],
    );
    const execution = paperExecution(selected.payload, bars.slice(0, 420));
    assert.ok(execution);
    await db.query("select trade_hypothetical_observe('focoos-admin',$1,$2)", [
      selected.id,
      execution,
    ]);
    assert.equal(
      (await db.query<any>('select * from trade_human_decisions')).rows[0]
        .decision,
      'DESCARTADA',
    );
    const another = proposals[1] || {
      ...selected,
      id: crypto.randomUUID(),
      payload: {
        ...selected.payload,
        id: crypto.randomUUID(),
        setupWatchId: 'other',
        setup: { ...selected.payload.setup, id: 'other' },
      },
    };
    if (!proposals[1]) {
      another.payload.id = another.id;
      await db.query(
        "select trade_propose('focoos-admin','xp-mt5-primary',$1)",
        [another.payload],
      );
    }
    await db.query(
      "select trade_confirm('focoos-admin',$1,'confirm',null,1,'',15000)",
      [another.id],
    );
    assert.equal(
      (await db.query('select * from trade_bridge_commands')).rows.length,
      0,
    );
    assert.ok(
      (await db.query('select * from trade_strategy_evaluations')).rows
        .length >= 17,
    );
    const m = (
      await db.query<any>(
        "select trade_strategy_metrics('focoos-admin') metrics",
      )
    ).rows[0].metrics;
    assert.ok(m.every((x: any) => x.expectancy === null));
    assert.equal(
      (
        await db.query<any>(
          "select has_function_privilege('anon','trade_scanner_read(text,text)','execute') allowed",
        )
      ).rows[0].allowed,
      false,
    );
  } finally {
    globalThis.fetch = original;
    await db.close();
  }
});
test('sliding window preserves PAPER entry, gap-before-fill cancels and opposition blocks proposals', () => {
  const a = scanMarket(snapshot).candidates.find(
      (c) => c.analysis.setup,
    )!.analysis,
    p = makeProposal(a, {
      mode: 'PAPER',
      source: 'replay',
      symbol: 'WIN',
      quantity: 1,
      max: 1,
      pointValue: 0.2,
      currency: 'BRL',
      cursor: 180,
      asOf: snapshot.asOf,
      liveAuthorized: false,
    });
  const bar = {
      ...bars[180],
      timestamp: p.asOf,
      open: p.entry,
      close: p.entry + 5,
      low: p.entry - 5,
      high: p.entry + 10,
    },
    open = paperExecution(p, [bar])!;
  const later = {
    ...bar,
    timestamp: bar.timestamp + 60,
    open: p.entry + 10,
    close: p.entry + 15,
    high: p.entry + 20,
  };
  const recovered = paperExecution(p, [later], open)!;
  assert.equal(recovered.entry, p.entry);
  assert.equal(recovered.openedAt, bar.timestamp);
  assert.equal(
    paperExecution(p, [{ ...bar, open: p.sl, low: p.sl - 5 }])!.status,
    'CANCELADA',
  );
  const base = strategyRegistry[0];
  const opposite = {
    ...base,
    definition: { ...base.definition, id: 'opposite' },
    evaluate(s: any, f: any) {
      const c = base.evaluate(s, f);
      c.definition = this.definition;
      c.analysis.setup!.direction = 'short';
      return c;
    },
  };
  const conflict = scanMarket(snapshot, [base, opposite]);
  assert.ok(conflict.candidates.every((c) => c.analysis.conflicts.length));
  assert.throws(() =>
    makeProposal(conflict.candidates[0].analysis, {
      mode: 'PAPER',
      source: 'replay',
      symbol: 'WIN',
      quantity: 1,
      max: 1,
      pointValue: 0.2,
      currency: 'BRL',
      cursor: 180,
      asOf: snapshot.asOf,
      liveAuthorized: false,
    }),
  );
});

test('confirmed watch cannot stay confirmed after conditions deteriorate', () => {
  const scan = scanMarket(snapshot),
    watches = advanceWatches([], scan),
    watch = watches.find((w) => w.state === 'CONFIRMED')!;
  const next = structuredClone(scan);
  next.asOf += 60;
  next.opportunities = [];
  next.candidates = next.candidates.map((c) =>
    c.definition.id === watch.candidate.definition.id
      ? {
          ...c,
          state: 'FORMING',
          analysis: { ...c.analysis, status: 'waiting', setup: undefined },
        }
      : c,
  );
  assert.equal(advanceWatches([watch], next)[0].state, 'INVALIDATED');
});
