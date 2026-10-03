import type {
  Analysis,
  Candle,
  Metrics,
  PaperTrade,
  Strategy,
  MarketSnapshot,
} from './types';
import { snapshotOf, ReplayProvider, CandleAggregator } from './providers';
import { TrendPullbackConfirmation, pullbackParameters, ema } from './strategy';
export function evaluateStrategies(
  candles: Candle[],
  strategies: Strategy<any>[],
  source: 'replay' | 'live' = 'replay'
): Analysis[] {
  return evaluateSnapshot(snapshotOf(candles, source), strategies);
}
export function evaluateSnapshot(
  snapshot: MarketSnapshot,
  strategies: Strategy<any>[]
): Analysis[] {
  const source = snapshot.source;
  const analyses = strategies.map((strategy) => {
    const result = strategy.evaluate(snapshot);
    if (
      source === 'live' &&
      (strategy.stage !== 'live-monitoring' || !strategy.liveAuthorized)
    ) {
      return {
        ...result,
        status: 'blocked' as const,
        setup: undefined,
        explanation: 'Estratégia não autorizada para monitoramento ao vivo.',
      };
    }
    return result;
  });
  const directions = new Set(
    analyses.flatMap((a) => (a.setup ? [a.setup.direction] : []))
  );
  if (directions.size > 1)
    analyses.forEach((a) => {
      a.conflicts = [
        ...a.conflicts,
        'Estratégias completas apontam direções opostas.',
      ];
      if (a.setup) a.setup.conflicts = [...a.conflicts];
    });
  return analyses;
}
export function metrics(trades: PaperTrade[]): Metrics {
  const results = trades.flatMap((t) =>
    t.resultR === undefined ? [] : [t.resultR]
  );
  const wins = results.filter((x) => x > 0),
    losses = results.filter((x) => x < 0);
  const grossWin = wins.reduce((s, x) => s + x, 0),
    grossLoss = -losses.reduce((s, x) => s + x, 0);
  let equity = 0,
    peak = 0,
    drawdown = 0;
  results.forEach((r) => {
    equity += r;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak - equity);
  });
  return {
    occurrences: trades.length,
    closed: results.length,
    winRate: results.length ? wins.length / results.length : 0,
    payoff:
      wins.length && losses.length
        ? grossWin / wins.length / (grossLoss / losses.length)
        : null,
    expectancy: results.length ? equity / results.length : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : null,
    drawdownR: drawdown,
    netR: equity,
  };
}
/** Sequential loop. Entry at NEXT candle open, one position, worst-case stop if both barriers touched. */
export function runReplay(data: Candle[], cursor: number) {
  const replay = new ReplayProvider(data);
  replay.seek(cursor);
  const visible = replay.visible();
  const aggregator = new CandleAggregator();
  const strategy = new TrendPullbackConfirmation();
  const signals: NonNullable<Analysis['setup']>[] = [];
  const trades: PaperTrade[] = [];
  let pending: Analysis['setup'];
  let active: PaperTrade | undefined;
  let lastSignal = -Infinity;
  let previousComplete = false;
  for (let i = 0; i < visible.length; i++) {
    const c = visible[i];
    if (pending && !active) {
      const sign = pending.direction === 'long' ? 1 : -1;
      if (
        sign * (c.open - pending.stop) > 0 &&
        sign * (pending.targets[0] - c.open) > 0
      ) {
        active = {
          id: pending.id,
          setup: pending,
          entry: c.open,
          entryTimestamp: c.timestamp,
          outcome: 'open',
          conditions: pending.conditions,
        };
        trades.push(active);
      }
      pending = undefined;
    }
    if (active) {
      const sign = active.setup.direction === 'long' ? 1 : -1;
      const stopHit =
        sign === 1 ? c.low <= active.setup.stop : c.high >= active.setup.stop;
      const targetHit =
        sign === 1
          ? c.high >= active.setup.targets[0]
          : c.low <= active.setup.targets[0];
      if (stopHit || targetHit) {
        const stopExit =
          sign === 1
            ? Math.min(c.open, active.setup.stop)
            : Math.max(c.open, active.setup.stop);
        const exit = stopHit ? stopExit : active.setup.targets[0];
        active.exit = exit;
        active.exitTimestamp = c.timestamp + 60;
        active.resultR =
          (sign * (exit - active.entry)) /
          Math.abs(active.entry - active.setup.stop);
        active.durationMinutes =
          (active.exitTimestamp - active.entryTimestamp) / 60;
        active.outcome = stopHit ? 'stop' : 'target';
        active.ambiguous = stopHit && targetHit;
        active = undefined;
      }
    }
    const a = evaluateSnapshot(aggregator.next(c), [strategy])[0];
    const complete = a.status === 'complete';
    if (
      complete &&
      !previousComplete &&
      a.setup &&
      c.timestamp - lastSignal >= pullbackParameters.cooldownMinutes * 60
    ) {
      signals.push(a.setup);
      lastSignal = c.timestamp;
      if (!active) pending = a.setup;
    }
    previousComplete = complete;
  }
  const trendLines = Object.fromEntries(
    Object.entries(snapshotOf(visible).candles).map(([tf, cs]) => {
      const values = ema(
        cs.map((c) => c.close),
        pullbackParameters.contextFastPeriod
      );
      return [
        tf,
        cs.map((c, i) => ({ timestamp: c.timestamp, value: values[i] })),
      ];
    })
  );
  return {
    trendLines,
    cursor,
    total: data.length,
    source: 'replay' as const,
    marketStatus:
      cursor === data.length
        ? 'Replay concluído'
        : 'Simulação • sem conexão B3',
    snapshot: snapshotOf(visible),
    analyses: evaluateStrategies(visible, [strategy]),
    signals,
    trades,
    metrics: metrics(trades),
    parameters: pullbackParameters,
  };
}
