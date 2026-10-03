import type { Candle, Timeframe, MarketSnapshot } from './types';
export const timeframeSeconds: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
};
/** Implementations must return only finalized candles <= asOf; keys stay on the server. */
export interface MarketDataProvider {
  readonly source: MarketSnapshot['source'];
  history(
    symbol: string,
    timeframe: Timeframe,
    asOf: number
  ): Promise<Candle[]>;
  subscribe?(symbol: string, onCandle: (candle: Candle) => void): () => void;
}
export function validateCandles(candles: Candle[]): void {
  candles.forEach((c, i) => {
    if (
      ![c.timestamp, c.open, c.high, c.low, c.close, c.volume].every(
        Number.isFinite
      ) ||
      c.volume < 0 ||
      c.high < Math.max(c.open, c.close) ||
      c.low > Math.min(c.open, c.close) ||
      c.low > c.high ||
      c.timeframe !== '1m' ||
      (i > 0 &&
        (c.timestamp <= candles[i - 1].timestamp ||
          c.symbol !== candles[0].symbol))
    )
      throw new Error('Candles inválidos, fora de ordem ou misturados.');
  });
}
/** Timestamps represent interval OPEN. Incomplete/gapped buckets are deliberately omitted. */
export function aggregateCandles(
  input: Candle[],
  timeframe: Timeframe,
  asOf: number
): Candle[] {
  const seconds = timeframeSeconds[timeframe];
  const buckets = new Map<number, Candle[]>();
  for (const c of input) {
    if (c.timestamp + 60 > asOf) continue;
    const bucket = Math.floor(c.timestamp / seconds) * seconds;
    if (bucket + seconds > asOf) continue;
    buckets.set(bucket, [...(buckets.get(bucket) || []), c]);
  }
  return [...buckets.entries()]
    .filter(
      ([start, cs]) =>
        cs.length === seconds / 60 &&
        cs.every((c, i) => c.timestamp === start + i * 60)
    )
    .map(([timestamp, cs]) => ({
      symbol: cs[0].symbol,
      timestamp,
      timeframe,
      open: cs[0].open,
      high: Math.max(...cs.map((c) => c.high)),
      low: Math.min(...cs.map((c) => c.low)),
      close: cs[cs.length - 1].close,
      volume: cs.reduce((s, c) => s + c.volume, 0),
    }));
}
export function generateMockCandles(count = 420, seed = 42): Candle[] {
  let value = seed >>> 0;
  const random = () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
  let price = 132000;
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const phase = i % 45;
    const regime = i < 270 ? 1 : -1;
    const delta =
      regime * (phase < 25 ? 35 : phase < 36 ? -43 : 50) +
      (random() - 0.5) * 30;
    const open = price;
    const close = Math.round((open + delta) / 5) * 5;
    const wick = (2 + Math.floor(random() * 5)) * 5;
    candles.push({
      symbol: 'WIN',
      timestamp: 1790769600 + i * 60,
      timeframe: '1m',
      open,
      close,
      high: Math.max(open, close) + wick,
      low: Math.min(open, close) - wick,
      volume: Math.round(100 + random() * 400 + (phase > 35 ? 450 : 0)),
    });
    price = close;
  }
  return candles;
}
export class MockMarketDataProvider implements MarketDataProvider {
  readonly source = 'mock' as const;
  protected readonly data: Candle[];
  constructor(count = 420, seed = 42) {
    this.data = generateMockCandles(count, seed);
  }
  async history(symbol: string, timeframe: Timeframe, asOf: number) {
    return aggregateCandles(
      this.data.filter((c) => c.symbol === symbol),
      timeframe,
      asOf
    );
  }
  get length() {
    return this.data.length;
  }
}
export class ReplayProvider implements MarketDataProvider {
  readonly source = 'replay' as const;
  private cursor = 0;
  constructor(private readonly data: Candle[]) {
    validateCandles(data);
  }
  get length() {
    return this.data.length;
  }
  get position() {
    return this.cursor;
  }
  reset() {
    this.cursor = 0;
  }
  next() {
    this.cursor = Math.min(this.cursor + 1, this.data.length);
    return this.visible();
  }
  seek(position: number) {
    if (
      !Number.isInteger(position) ||
      position < 0 ||
      position > this.data.length
    )
      throw new Error('Cursor inválido.');
    this.cursor = position;
  }
  visible() {
    return this.data.slice(0, this.cursor);
  }
  async history(symbol: string, timeframe: Timeframe, asOf: number) {
    return aggregateCandles(
      this.visible().filter((c) => c.symbol === symbol),
      timeframe,
      asOf
    );
  }
}
export function snapshotOf(
  visible: Candle[],
  source: MarketSnapshot['source'] = 'replay'
): MarketSnapshot {
  const asOf = visible.length ? visible[visible.length - 1].timestamp + 60 : 0;
  return {
    symbol: visible[0]?.symbol || 'WIN',
    asOf,
    source,
    tickSize: 5,
    candles: Object.fromEntries(
      Object.keys(timeframeSeconds).map((tf) => [
        tf,
        aggregateCandles(visible, tf as Timeframe, asOf),
      ])
    ) as MarketSnapshot['candles'],
  };
}
/** Incremental finalized-candle aggregation, reusable by both replay and a live adapter. */
export class CandleAggregator {
  private readonly series: Record<Timeframe, Candle[]> = {
    '1m': [],
    '5m': [],
    '15m': [],
    '1h': [],
  };
  private readonly buckets: Partial<
    Record<Timeframe, { candle: Candle; count: number }>
  > = {};
  private lastTimestamp = -Infinity;
  next(c: Candle, source: MarketSnapshot['source'] = 'replay'): MarketSnapshot {
    if (c.timestamp <= this.lastTimestamp)
      throw new Error('Feed fora de ordem.');
    this.lastTimestamp = c.timestamp;
    const asOf = c.timestamp + 60;
    for (const tf of Object.keys(timeframeSeconds) as Timeframe[]) {
      const seconds = timeframeSeconds[tf],
        start = Math.floor(c.timestamp / seconds) * seconds;
      let bucket = this.buckets[tf];
      if (!bucket || bucket.candle.timestamp !== start) {
        bucket = {
          candle: { ...c, timeframe: tf, timestamp: start },
          count: 1,
        };
        this.buckets[tf] = bucket;
      } else {
        bucket.candle = {
          ...bucket.candle,
          high: Math.max(bucket.candle.high, c.high),
          low: Math.min(bucket.candle.low, c.low),
          close: c.close,
          volume: bucket.candle.volume + c.volume,
        };
        bucket.count++;
      }
      if (start + seconds === asOf && bucket.count === seconds / 60)
        this.series[tf].push(bucket.candle);
    }
    return {
      symbol: c.symbol,
      asOf,
      source,
      tickSize: 5,
      candles: Object.fromEntries(
        Object.entries(this.series).map(([tf, cs]) => [tf, cs.slice()])
      ) as MarketSnapshot['candles'],
    };
  }
}
