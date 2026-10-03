import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateMockCandles,
  aggregateCandles,
  snapshotOf,
  ReplayProvider,
  MockMarketDataProvider,
  validateCandles,
} from '../../trade/core/providers';
import {
  runReplay,
  evaluateStrategies,
  metrics,
} from '../../trade/core/engine';
import {
  TrendPullbackConfirmation,
  pullbackParameters,
} from '../../trade/core/strategy';
import type { Strategy, PaperTrade } from '../../trade/core/types';
const data = generateMockCandles();
test('mock is deterministic, aligned and OHLC valid', () => {
  assert.deepEqual(data, generateMockCandles());
  validateCandles(data);
  assert.ok(
    data.every(
      (c) => c.timestamp % 60 === 0 && c.high >= c.close && c.low <= c.open
    )
  );
});
test('aggregation excludes future/incomplete/gapped buckets and conserves volume', () => {
  const result = aggregateCandles(data, '5m', data[6].timestamp + 60);
  assert.equal(result.length, 1);
  assert.equal(
    result[0].volume,
    data.slice(0, 5).reduce((s, c) => s + c.volume, 0)
  );
  assert.equal(result[0].open, data[0].open);
  assert.equal(result[0].close, data[4].close);
  assert.equal(
    aggregateCandles(
      data.filter((_, i) => i !== 2),
      '5m',
      data[4].timestamp + 60
    ).length,
    0
  );
});
test('all timeframes are finalized at snapshot cutoff', () => {
  const s = snapshotOf(data.slice(0, 183));
  const seconds = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600 };
  for (const [tf, candles] of Object.entries(s.candles)) {
    assert.ok(
      candles.every(
        (c) => c.timestamp + seconds[tf as keyof typeof seconds] <= s.asOf
      )
    );
  }
});
test('replay exposes only cursor prefix and resets exactly', async () => {
  const r = new ReplayProvider(data);
  assert.equal(r.visible().length, 0);
  r.next();
  assert.equal(r.visible().length, 1);
  r.seek(180);
  assert.equal(r.visible().at(-1)?.timestamp, data[179].timestamp);
  assert.equal((await r.history('WIN', '1h', Infinity)).length, 3);
  r.reset();
  assert.equal(r.position, 0);
  assert.throws(() => r.seek(-1));
  assert.throws(() => r.seek(421));
});
test('future mutation cannot change analysis, signals or results at any prior cursor', () => {
  const changed = data.map((c, i) =>
    i < 180
      ? { ...c }
      : { ...c, open: 1, high: 999999, low: 0, close: 999999, volume: 999999 }
  );
  assert.deepEqual(runReplay(data, 180), runReplay(changed, 180));
});
test('same final prefix yields same replay regardless of next/seek use', () => {
  const r = new ReplayProvider(data);
  for (let i = 0; i < 180; i++) r.next();
  assert.deepEqual(
    runReplay(r.visible(), 180).signals,
    runReplay(data, 180).signals
  );
});
test('candidate produces causal setup, clear risk and captured conditions', () => {
  const s = runReplay(data, 180),
    a = s.analyses[0];
  assert.equal(a.status, 'complete');
  assert.equal(a.stage, 'paper');
  assert.ok(a.setup);
  assert.equal(a.setup!.rr, pullbackParameters.targetR);
  assert.equal(a.setup!.riskPoints, a.setup!.entry - a.setup!.stop);
  assert.ok(a.conditions.every((c) => c.met));
  assert.equal(s.trades.length, 0, 'no same-bar entry');
  assert.equal(
    runReplay(data, 181).trades[0].entryTimestamp,
    data[180].timestamp
  );
});
test('short side works; historical setups remain unchanged as more candles arrive', () => {
  const end = runReplay(data, 420);
  assert.ok(end.signals.some((s) => s.direction === 'short'));
  assert.deepEqual(end.signals[0], runReplay(data, 180).signals[0]);
  assert.equal(new Set(end.signals.map((s) => s.id)).size, end.signals.length);
});
test('research/paper is denied in live and explanatory state remains', () => {
  const a = evaluateStrategies(
    data.slice(0, 180),
    [new TrendPullbackConfirmation()],
    'live'
  )[0];
  assert.equal(a.status, 'blocked');
  assert.equal(a.setup, undefined);
  assert.ok(a.conditions.length > 0);
});
test('opposite plugin signals explicitly report conflict', () => {
  const base = new TrendPullbackConfirmation();
  const opposite: Strategy = {
    id: 'opposite',
    version: '1',
    stage: 'paper',
    liveAuthorized: false,
    parameters: {},
    evaluate(s) {
      const a = base.evaluate(s);
      return {
        ...a,
        strategy: 'opposite',
        setup: a.setup
          ? { ...a.setup, id: 'opposite', direction: 'short' }
          : undefined,
      };
    },
  };
  const results = evaluateStrategies(data.slice(0, 180), [base, opposite]);
  assert.ok(
    results.every((a) => a.conflicts.some((c) => c.includes('opostas')))
  );
  assert.ok(results.every((a) => a.setup?.conflicts.length));
});
test('parameter validation prevents incoherent thresholds; stricter thresholds block setup', () => {
  assert.throws(
    () => new TrendPullbackConfirmation({ ...pullbackParameters, targetR: 0 })
  );
  const a = new TrendPullbackConfirmation({
    ...pullbackParameters,
    minImpulsePoints: 999999,
  }).evaluate(snapshotOf(data.slice(0, 180)));
  assert.equal(a.status, 'waiting');
  assert.ok(a.missing.some((m) => m.includes('impulso')));
});
test('backtest uses stop first for ambiguous bars and gap slippage', () => {
  const s = runReplay(data, 180).signals[0];
  const changed = data.map((c) => ({ ...c }));
  changed[180] = {
    ...changed[180],
    open: s.entry,
    high: s.targets[0] + 100,
    low: s.stop - 100,
    close: s.entry,
  };
  const trade = runReplay(changed, 181).trades[0];
  assert.equal(trade.outcome, 'stop');
  assert.equal(trade.resultR, -1);
  assert.equal(trade.ambiguous, true);
  changed[181] = {
    ...changed[181],
    open: s.stop - 50,
    high: s.stop + 5,
    low: s.stop - 100,
    close: s.stop - 60,
  };
  changed[180] = {
    ...data[180],
    open: s.entry,
    high: s.entry + 5,
    low: s.entry - 5,
    close: s.entry,
  };
  const gap = runReplay(changed, 182).trades[0];
  assert.ok(gap.resultR! < -1);
});
test('metrics avoid infinities for zero losses and exclude open trades', () => {
  const trade = runReplay(data, 181).trades[0];
  const m = metrics([
    { ...trade, resultR: 2, outcome: 'target' },
    { ...trade, id: 'loss', resultR: -1, outcome: 'stop' },
    { ...trade, id: 'open', resultR: undefined, outcome: 'open' },
  ] as PaperTrade[]);
  assert.equal(m.closed, 2);
  assert.equal(m.expectancy, 0.5);
  assert.equal(m.profitFactor, 2);
  assert.equal(m.drawdownR, 1);
  assert.equal(metrics([]).profitFactor, null);
});
test('provider interface can serve an as-of without leaking data beyond it', async () => {
  const provider = new MockMarketDataProvider();
  assert.equal(
    (await provider.history('WIN', '1m', data[4].timestamp + 60)).length,
    5
  );
  assert.equal((await provider.history('INVALID', '1m', Infinity)).length, 0);
});
test('invalid OHLC and mixed instruments rejected', () => {
  assert.throws(() => validateCandles([{ ...data[0], low: data[0].high + 1 }]));
  assert.throws(
    () => new ReplayProvider([data[0], { ...data[1], symbol: 'OTHER' }])
  );
});
test('incremental aggregator matches batch aggregation at each causal prefix', async () => {
  const { CandleAggregator } = await import('../../trade/core/providers');
  const aggregator = new CandleAggregator();
  data.forEach((c, i) =>
    assert.deepEqual(aggregator.next(c), snapshotOf(data.slice(0, i + 1)))
  );
});
