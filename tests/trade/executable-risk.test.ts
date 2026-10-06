/**
 * Executable risk (R vs R$): integer sizing from the real structural stop, signal vs economic
 * opportunity, chronological simulation and the 06/10/2026 regression (real LIVE_DETECTED levels and
 * outcomes up to 11:45 BRT; no account data). Analysis only: nothing here changes a limit or REAL.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { contractsFor, executableAnalysis, opportunitiesOf, pointValueOf, simulate } from '../../trade/lab/executable';
import type { PerfRow } from '../../trade/lab/performance';

const WIN = { tickSize: 5, tickValue: 1, volumeMin: 1, volumeStep: 1, volumeMax: 25000 };
const at = (hhmm: string) => Date.parse(`2026-10-06T${hhmm}:00-03:00`) / 1000;
let seq = 0;
function sig(time: string, strategyId: string, direction: 'BUY' | 'SELL', entry: number, stop: number, target: number, status: string, resultR: number | null, resultPoints: number | null, exit: string | null, extra: Partial<PerfRow> = {}): PerfRow {
  const t = at(time);
  return {
    id: `s${++seq}`,
    origin: 'OBSERVATION',
    source: 'LIVE',
    scope: 'mt5:WINV26:xp-mt5-primary',
    symbol: 'WINV26',
    strategyId,
    version: '1.2.0',
    direction,
    confirmedAt: t,
    marketAsOf: t,
    lifecycle: 'BLOCKED_RISK',
    proposalState: 'RISK_BLOCKED',
    actionability: 'ACTIONABLE',
    outcome: status === 'OPEN' ? null : { status, resultR, resultPoints, mfeR: 0, maeR: 0, exitTimestamp: exit ? at(exit) : null },
    paper: null,
    entry,
    stop,
    target,
    rr: 2,
    riskPoints: Math.abs(entry - stop),
    pointValue: 0.2,
    features: { trend5m: null, regimes: [] },
    participants: [],
    cluster: null,
    proposal: null,
    ...extra,
  };
}
// Real 06/10 LIVE_DETECTED signals closed by 11:45 BRT: [time, _, strategy, dir, entry, stop, target, outcome, R, points, exit].
const real0610: [string, number, string, 'BUY' | 'SELL', number, number, number, string, number, number, string][] = [
  ['09:22', 0, 'momentum_activity_v1', 'SELL', 207580, 208735, 205270, 'STOP_FIRST', -1, -1155, '09:56'],
  ['09:23', 0, 'momentum_activity_v1', 'SELL', 207190, 208440, 204690, 'STOP_FIRST', -1, -1250, '09:40'],
  ['09:57', 0, 'structure_breakout_v1', 'BUY', 208700, 207945, 210210, 'STOP_FIRST', -1, -755, '10:42'],
  ['09:57', 0, 'consolidation_expansion_v1', 'BUY', 208700, 207945, 210210, 'STOP_FIRST', -1, -755, '10:42'],
  ['10:00', 0, 'false_breakout_v1', 'SELL', 208605, 208855, 208105, 'STOP_FIRST', -1, -250, '10:10'],
  ['10:03', 0, 'momentum_activity_v1', 'SELL', 208275, 208855, 207115, 'STOP_FIRST', -1, -580, '10:10'],
  ['10:05', 0, 'support_rejection_v1', 'BUY', 208295, 208100, 208685, 'TARGET_FIRST', 2, 390, '10:10'],
  ['10:11', 0, 'momentum_activity_v1', 'BUY', 208750, 208100, 210050, 'TARGET_FIRST', 2, 1300, '10:16'],
  ['10:12', 0, 'structure_breakout_v1', 'BUY', 209050, 208100, 210950, 'STOP_FIRST', -1, -950, '10:39'],
  ['10:13', 0, 'structure_breakout_v1', 'BUY', 209185, 208100, 211355, 'STOP_FIRST', -1, -1085, '10:39'],
  ['10:14', 0, 'resistance_rejection_v1', 'SELL', 209100, 209350, 208600, 'STOP_FIRST', -1, -250, '10:14'],
  ['10:15', 0, 'consolidation_expansion_v1', 'BUY', 209350, 208100, 211850, 'STOP_FIRST', -1, -1250, '10:39'],
  ['10:15', 0, 'structure_breakout_v1', 'BUY', 209350, 208100, 211850, 'STOP_FIRST', -1, -1250, '10:39'],
  ['10:18', 0, 'false_breakout_v1', 'SELL', 209855, 210175, 209215, 'TARGET_FIRST', 2, 640, '10:19'],
  ['10:19', 0, 'rsi_structure_recovery_v1', 'SELL', 209565, 210175, 208345, 'TARGET_FIRST', 2, 1220, '10:32'],
  ['11:10', 0, 'ema_continuation_v1', 'SELL', 207305, 207620, 206675, 'TARGET_FIRST', 2, 630, '11:12'],
  ['11:12', 0, 'ema_cross_context_v1', 'SELL', 206910, 207620, 205490, 'TARGET_FIRST', 2, 1420, '11:22'],
  ['11:12', 0, 'ema_continuation_v1', 'SELL', 206910, 207620, 205490, 'TARGET_FIRST', 2, 1420, '11:22'],
  ['11:22', 0, 'support_rejection_v1', 'BUY', 205740, 205580, 206060, 'STOP_FIRST', -1, -160, '11:22'],
  ['11:37', 0, 'false_breakout_v1', 'SELL', 206665, 206875, 206245, 'TARGET_FIRST', 2, 420, '11:40'],
  ['11:38', 0, 'ema_continuation_v1', 'SELL', 206530, 206875, 205840, 'TARGET_FIRST', 2, 690, '11:43'],
];
const day = () => real0610.map((x) => sig(x[0], x[2], x[3], x[4], x[5], x[6], x[7], x[8], x[9], x[10]));

test('riskPerContractBRL comes from real instrument metadata; contracts are integers floor(limit/risk); the stop is never moved', () => {
  assert.equal(pointValueOf(WIN), 0.2, 'WIN: tick 5 points = R$1 → R$0,20 per point per contract');
  const [o] = opportunitiesOf([sig('10:00', 'x', 'SELL', 208605, 208855, 208105, 'STOP_FIRST', -1, -250, '10:10')], WIN);
  assert.equal(o.riskPerContractBRL, 50);
  assert.equal(o.stop, 208855, 'structural stop unchanged');
  assert.equal(contractsFor(10, 50, WIN, 10), 0, 'R$10 cannot carry a R$50 stop: blocked, never shrunk');
  assert.equal(contractsFor(50, 50, WIN, 10), 1);
  assert.equal(contractsFor(149.99, 50, WIN, 10), 2, 'floor, never rounded up');
  assert.equal(contractsFor(300, 50, WIN, 1), 1, 'capped by MaxContracts');
  assert.equal(contractsFor(300, 50, { ...WIN, volumeStep: 2, volumeMin: 2 }, 10), 6, 'aligned to the volume step');
  assert.equal(contractsFor(150, 50, { ...WIN, volumeStep: 2, volumeMin: 2 }, 10), 2);
  assert.equal(contractsFor(90, 50, { ...WIN, volumeStep: 2, volumeMin: 2 }, 10), 0, 'below volumeMin = 0');
});

test('06/10 regression: the hypothesis "21 closed, 9 targets, 12 stops, +6R, −R$312 with 1 WIN per signal" is reproduced from the real records', () => {
  const rows = day();
  assert.equal(rows.length, 21);
  const a = executableAnalysis(rows, WIN, { maxRiskBRL: 10, maxContracts: 1, maxPositions: 1 });
  assert.deepEqual([a.signals.count, a.signals.targets, a.signals.stops, a.signals.resultR, a.signals.resultBRL], [21, 9, 12, 6, -312]);
  // Per economic opportunity (convergent signals counted once): 18 trades.
  assert.deepEqual([a.opportunities.count, a.opportunities.convergent, a.opportunities.targets, a.opportunities.stops, a.opportunities.resultR, a.opportunities.resultBRL], [18, 3, 8, 10, 6, -195]);
  // R positive while money is negative → explicit alert, for signals and opportunities.
  assert.deepEqual(
    a.alerts.filter((x) => x.scope.startsWith('Sinais') || x.scope.startsWith('Oportunidades')).map((x) => [x.resultR, x.resultBRL]),
    [
      [6, -312],
      [6, -195],
    ],
  );
  // With the configured 1R = R$10 nothing was executable (every structural stop costs more than R$10).
  assert.deepEqual([a.current!.eligible, a.current!.executed, a.current!.resultBRL], [0, 0, 0]);
});

test('06/10 sensitivity: eligibility grows with the limit; simulation is chronological with MaxPositions=1 and never picks a limit', () => {
  const a = executableAnalysis(day(), WIN, { maxRiskBRL: 10, maxContracts: 1, maxPositions: 1 });
  const s = Object.fromEntries(a.sensitivity.map((x) => [x.limits.maxRiskBRL, x]));
  assert.deepEqual(a.sensitivity.map((x) => x.limits.maxRiskBRL), [10, 25, 50, 75, 100, 125, 150, 200, 250, 300]);
  for (let k = 1; k < a.sensitivity.length; k++) assert.ok(a.sensitivity[k].eligible >= a.sensitivity[k - 1].eligible, 'eligibility is monotone');
  assert.equal(s[10].eligible, 0);
  assert.equal(s[25].eligible, 0);
  assert.equal(s[300].eligible, 18, 'every 06/10 stop fits R$300');
  for (const x of a.sensitivity) {
    assert.equal(x.eligible + x.blockedByRisk, 18);
    assert.equal(x.executed + x.skipped.positions, x.eligible, 'eligible = executed + skipped by an open position');
    assert.ok(x.contracts === x.executed, 'MaxContracts=1 → one contract per executed trade');
  }
  assert.equal('best' in (a as any), false, 'no automatic choice of limit');
});

test('signal vs opportunity: convergent strategies on the same candle and levels are one trade with several participants', () => {
  const rows = [
    sig('12:44', 'consolidation_expansion_v1', 'SELL', 205815, 206500, 204445, 'STOP_FIRST', -1, -685, '12:48'),
    sig('12:44', 'momentum_activity_v1', 'SELL', 205815, 206500, 204445, 'STOP_FIRST', -1, -685, '12:48'),
    sig('12:44', 'structure_breakout_v1', 'SELL', 205815, 206500, 204445, 'STOP_FIRST', -1, -685, '12:48'),
    sig('12:46', 'ema_continuation_v1', 'SELL', 205700, 206500, 204100, 'STOP_FIRST', -1, -800, '12:48'),
  ];
  const opps = opportunitiesOf(rows, WIN);
  assert.equal(opps.length, 2);
  assert.equal(opps[0].strategies.length, 3);
  assert.equal(opps[1].convergentWith, 1, 'a different trade in the same direction 2 minutes later is flagged as convergent exposure');
  const a = executableAnalysis(rows, WIN, null);
  assert.equal(a.signals.resultBRL, -685 * 0.2 * 3 - 160);
  assert.equal(a.opportunities.resultBRL, -137 - 160, 'money counted per trade, not per signal');
  assert.equal(a.strategies.find((x) => x.strategy === 'momentum_activity_v1@1.2.0')!.resultBRL, -137, 'each participating strategy keeps its credit');
});

test('chronological simulation: MaxPositions blocks overlapping entries; an unresolved trade keeps its slot; no re-ordering', () => {
  const rows = [
    sig('10:00', 'a', 'BUY', 1000, 900, 1200, 'TARGET_FIRST', 2, 200, '10:30'),
    sig('10:10', 'b', 'BUY', 1010, 960, 1110, 'STOP_FIRST', -1, -50, '10:20'), // overlaps the first
    sig('10:40', 'c', 'SELL', 1100, 1150, 1000, 'OPEN', null, null, null),
    sig('11:00', 'd', 'SELL', 1090, 1140, 990, 'TARGET_FIRST', 2, 100, '11:10'), // first still open
  ];
  const opps = opportunitiesOf(rows, WIN),
    one = simulate(opps, WIN, { maxRiskBRL: 100, maxContracts: 1, maxPositions: 1 });
  assert.deepEqual([one.executed, one.skipped.positions, one.unresolved, one.resultBRL], [2, 2, 1, 40]);
  const two = simulate(opps, WIN, { maxRiskBRL: 100, maxContracts: 1, maxPositions: 2 });
  assert.deepEqual([two.executed, two.resultBRL], [4, 40 - 10 + 20]);
  // Risk: the first trade (R$20/contract) fits R$20; the others (R$10) too; R$9 blocks everything.
  assert.equal(simulate(opps, WIN, { maxRiskBRL: 9, maxContracts: 1, maxPositions: 5 }).skipped.risk, 4);
  // Integer sizing multiplies money, not R.
  const big = simulate(opps.slice(0, 1), WIN, { maxRiskBRL: 100, maxContracts: 10, maxPositions: 1 });
  assert.deepEqual([big.contracts, big.resultR, big.resultBRL], [5, 2, 200]);
});
