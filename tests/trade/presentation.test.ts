import test from 'node:test';
import assert from 'node:assert/strict';
import {
  observationGroups,
  marketReading,
} from '../../app/trade/decision-view';
import { scanMarket, advanceWatches } from '../../trade/scanner/engine';
import { snapshotOf, generateMockCandles } from '../../trade/core/providers';
import type { SetupWatch } from '../../trade/scanner/types';
const scan = scanMarket(snapshotOf(generateMockCandles().slice(0, 180)));
test('presentation groups convergent rules without changing scanner evaluations or masking opposite direction', () => {
  const original = structuredClone(scan),
    w = advanceWatches([], scan).find((w) => w.state === 'FORMING')!;
  const twin: SetupWatch = {
    ...structuredClone(w),
    id: 'twin',
    state: 'WAITING_TRIGGER',
    candidate: {
      ...structuredClone(w.candidate),
      definition: { ...w.candidate.definition, id: 'twin' },
    },
  };
  const opposite = {
    ...structuredClone(w),
    id: 'opposite',
    candidate: {
      ...structuredClone(w.candidate),
      analysis: { ...w.candidate.analysis, trend: (w.candidate.analysis.trend==='down'?'up':'down') as 'up'|'down' },
    },
  };
  const grouped = observationGroups([w, twin, opposite], {
    ...scan,
    groups: [
      {
        primary: w.candidate.definition.id,
        participants: [w.candidate.definition.id, 'twin'],
      },
    ],
  });
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].watch.state, 'WAITING_TRIGGER');
  assert.ok(grouped[0].methods.includes('twin'));
  assert.ok(grouped.some((g) => g.watch.candidate.analysis.trend === 'down'));
  assert.deepEqual(scan, original);
});
test('market conclusion stays descriptive, empty states safe and all 17 definitions remain available', () => {
  assert.equal(marketReading().bias, 'Neutro');
  assert.equal(observationGroups([], scan).length, 0);
  assert.equal(marketReading(scan).evaluated, 17);
  assert.equal(marketReading(scan).monitoring, 15);
  assert.equal(marketReading(scan).bias, 'Alta');
  assert.equal(
    marketReading({ ...scan, regimes: ['TREND_UP', 'TREND_DOWN'] }).bias,
    'Neutro',
  );
  const watches = advanceWatches([], scan);
  assert.equal(
    observationGroups(
      watches.filter((w) => w.state === 'CONFIRMED'),
      scan,
    ).length,
    0,
    'proposals render separately, without duplicate observation cards',
  );
});
