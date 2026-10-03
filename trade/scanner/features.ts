import type { Candle, MarketSnapshot, Timeframe } from '../core/types';
import { ema } from '../core/strategy';
import type { Regime } from './types';
export const featureParameters = Object.freeze({
  emaFast: 9,
  emaSlow: 21,
  atr: 14,
  rsi: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  structure: 20,
  volume: 20,
  momentum: 5,
  trendSeparationAtr: 0.2,
  rangeAtr: 6,
  expansionRatio: 1.3,
  contractionRatio: 0.7,
});
export function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  let gain = 0,
    loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    gain += Math.max(0, d);
    loss += Math.max(0, -d);
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(0, d)) / period;
    loss = (loss * (period - 1) + Math.max(0, -d)) / period;
  }
  return loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
}
export function atr(cs: Candle[], period = 14): number | null {
  if (cs.length < period + 1) return null;
  const tr = cs
    .slice(1)
    .map((c, i) =>
      Math.max(
        c.high - c.low,
        Math.abs(c.high - cs[i].close),
        Math.abs(c.low - cs[i].close),
      ),
    );
  let a = tr.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (const v of tr.slice(period)) a = (a * (period - 1) + v) / period;
  return a;
}
export type FrameFeatures = {
  count: number;
  emaFast: number | null;
  emaSlow: number | null;
  previousFast: number | null;
  previousSlow: number | null;
  atr: number | null;
  previousAtr: number | null;
  rsi: number | null;
  previousRsi: number | null;
  macd: number | null;
  signal: number | null;
  previousMacd: number | null;
  previousSignal: number | null;
  support: number | null;
  resistance: number | null;
  volumeMean: number | null;
  volumeRatio: number | null;
  momentum: number | null;
  last?: Candle;
  previous?: Candle;
};
export type MarketFeatures = {
  frames: Record<Timeframe, FrameFeatures>;
  regimes: Regime[];
  vwap: null;
  openingRange: null;
  unavailable: Record<string, string>;
};
export function frameFeatures(cs: Candle[]): FrameFeatures {
  const p = featureParameters,
    closes = cs.map((c) => c.close),
    fast = ema(closes, p.emaFast),
    slow = ema(closes, p.emaSlow),
    mfast = ema(closes, p.macdFast),
    mslow = ema(closes, p.macdSlow),
    m = mfast.map((v, i) => v - mslow[i]),
    sig = ema(m, p.macdSignal),
    history = cs.slice(-p.structure - 1, -1),
    volumes = cs.slice(-p.volume - 1, -1),
    last = cs.at(-1);
  const ready = cs.length >= p.emaSlow + 1,
    macdReady = cs.length >= p.macdSlow + p.macdSignal;
  const mean =
    volumes.length === p.volume
      ? volumes.reduce((s, c) => s + c.volume, 0) / p.volume
      : null;
  return {
    count: cs.length,
    emaFast: ready ? fast.at(-1)! : null,
    emaSlow: ready ? slow.at(-1)! : null,
    previousFast: ready ? fast.at(-2)! : null,
    previousSlow: ready ? slow.at(-2)! : null,
    atr: atr(cs),
    previousAtr: atr(cs.slice(0, -p.atr)),
    rsi: rsi(closes),
    previousRsi: rsi(closes.slice(0, -1)),
    macd: macdReady ? m.at(-1)! : null,
    signal: macdReady ? sig.at(-1)! : null,
    previousMacd: macdReady ? m.at(-2)! : null,
    previousSignal: macdReady ? sig.at(-2)! : null,
    support:
      history.length === p.structure
        ? Math.min(...history.map((c) => c.low))
        : null,
    resistance:
      history.length === p.structure
        ? Math.max(...history.map((c) => c.high))
        : null,
    volumeMean: mean,
    volumeRatio: mean && last ? last.volume / mean : null,
    momentum:
      cs.length > p.momentum
        ? closes.at(-1)! - closes.at(-1 - p.momentum)!
        : null,
    last,
    previous: cs.at(-2),
  };
}
export function calculateFeatures(s: MarketSnapshot): MarketFeatures {
  const frames = Object.fromEntries(
    Object.entries(s.candles).map(([tf, cs]) => [
      tf,
      frameFeatures(
        cs.filter(
          (c) =>
            c.timestamp +
              ({ '1m': 60, '5m': 300, '15m': 900, '1h': 3600 } as const)[
                tf as Timeframe
              ] <=
            s.asOf,
        ),
      ),
    ]),
  ) as Record<Timeframe, FrameFeatures>;
  const f = frames['5m'],
    p = featureParameters,
    regimes: Regime[] = [];
  if (f.atr && f.emaFast !== null && f.emaSlow !== null && f.last) {
    const sep = f.emaFast - f.emaSlow;
    if (Math.abs(sep) > f.atr * p.trendSeparationAtr)
      regimes.push(sep > 0 ? 'TREND_UP' : 'TREND_DOWN');
    else if (
      f.support !== null &&
      f.resistance !== null &&
      f.resistance - f.support <= f.atr * p.rangeAtr
    )
      regimes.push('RANGE');
    if (f.previousAtr) {
      const ratio = f.atr / f.previousAtr;
      if (ratio >= p.expansionRatio)
        regimes.push('EXPANSION', 'HIGH_VOLATILITY');
      if (ratio <= p.contractionRatio)
        regimes.push('CONTRACTION', 'LOW_VOLATILITY');
    }
  }
  if (!regimes.length) regimes.push('UNCERTAIN');
  return {
    frames,
    regimes,
    vwap: null,
    openingRange: null,
    unavailable: {
      vwap: 'Feed não declara volume negociado confiável e cobertura integral da sessão. Tick volume não é volume financeiro.',
      openingRange:
        'Calendário/sessão B3 e cobertura integral da abertura ainda não validados.',
    },
  };
}
