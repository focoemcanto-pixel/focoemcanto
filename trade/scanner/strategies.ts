import { validateLevels } from '../core/invariants';
import type { Analysis, MarketSnapshot, Condition } from '../core/types';
import {
  TrendPullbackConfirmation,
  pullbackParameters,
} from '../core/strategy';
import type { MarketFeatures } from './features';
import type {
  StrategyDefinition,
  StrategyEvaluator,
  StrategyCandidate,
} from './types';
/** Research thresholds, not optimized or evidence of an edge. Version changes required for rule changes. */
export const scannerParameters = Object.freeze({
  closedCandleMaxAgeSeconds: 120,
  structureBars: 20,
  emaFast: 9,
  emaSlow: 21,
  triggerBufferTicks: 1,
  stopBufferTicks: 2,
  minStopTicks: 4,
  maxStopAtr: 4,
  targetR: 2,
  lifetimeMinutes: 10,
  retestToleranceAtr: 0.25,
  wickBodyRatio: 1.5,
  momentumAtr: 1,
  relativeTickVolume: 1.2,
  consolidationAtr: 5,
  rsiLow: 30,
  rsiHigh: 70,
  minimumSamples: 30,
  dedupEntryTicks: 6,
  dedupStopTicks: 10,
});
type Kind =
  | 'breakout'
  | 'retest'
  | 'support'
  | 'resistance'
  | 'false-breakout'
  | 'reversal'
  | 'expansion'
  | 'range'
  | 'ema-continuation'
  | 'ema-cross'
  | 'momentum'
  | 'rsi'
  | 'macd'
  | 'confluence';
const definitions: [Kind, string, string][] = [
  ['breakout', 'structure_breakout_v1', 'Rompimento de estrutura / range'],
  ['retest', 'breakout_retest_v1', 'Rompimento + reteste'],
  ['support', 'support_rejection_v1', 'Rejeição de suporte'],
  ['resistance', 'resistance_rejection_v1', 'Rejeição de resistência'],
  ['false-breakout', 'false_breakout_v1', 'Falso rompimento'],
  ['reversal', 'structural_reversal_v1', 'Reversão estrutural'],
  ['expansion', 'consolidation_expansion_v1', 'Consolidação → expansão'],
  ['range', 'range_rejection_v1', 'Rejeição na borda do range'],
  ['ema-continuation', 'ema_continuation_v1', 'Continuação em EMA'],
  ['ema-cross', 'ema_cross_context_v1', 'Cruzamento EMA + contexto'],
  ['momentum', 'momentum_activity_v1', 'Momentum + atividade de ticks'],
  ['rsi', 'rsi_structure_recovery_v1', 'Recuperação RSI + estrutura'],
  ['macd', 'macd_structure_confirmation_v1', 'MACD + confirmação estrutural'],
  [
    'confluence',
    'structure_trend_activity_v1',
    'Estrutura + tendência + atividade',
  ],
];
function definition(id: string, name: string): StrategyDefinition {
  return {
    id,
    name,
    version: '1.1.0',
    stage: 'paper',
    liveAuthorized: false,
    timeframes: ['5m', '1m'],
    eligibleRegimes: [
      'TREND_UP',
      'TREND_DOWN',
      'RANGE',
      'EXPANSION',
      'CONTRACTION',
      'UNCERTAIN',
    ],
    ineligibleRegimes: [],
    requiredData: ['Candles fechados M1/M5', 'OHLC', 'tick size'],
    parameters: { ...scannerParameters },
    enabled: true,
  };
}
function condition(
  key: string,
  label: string,
  met: boolean,
  detail: string,
): Condition {
  return { key, label, met, detail };
}
export class RuleStrategy implements StrategyEvaluator {
  readonly definition: StrategyDefinition;
  constructor(
    readonly kind: Kind,
    id: string,
    name: string,
  ) {
    this.definition = definition(id, name);
    if (kind === 'momentum' || kind === 'confluence')
      this.definition.requiredData.push(
        'Volume de ticks relativo — proxy de atividade',
      );
    if (kind === 'range') this.definition.eligibleRegimes = ['RANGE'];
    if (
      kind === 'ema-continuation' ||
      kind === 'ema-cross' ||
      kind === 'confluence'
    )
      this.definition.eligibleRegimes = ['TREND_UP', 'TREND_DOWN'];
    if (kind === 'rsi')
      this.definition.requiredData.push('RSI14 + estrutura de preço');
    if (kind === 'macd')
      this.definition.requiredData.push('MACD12/26/9 + estrutura de preço');
  }
  evaluate(s: MarketSnapshot, f: MarketFeatures): StrategyCandidate {
    const d = this.definition,
      p = d.parameters,
      x = f.frames['1m'],
      ctx = f.frames['5m'],
      last = x.last,
      prev = x.previous,
      a = x.atr;
    const enough =
      !!last &&
      !!prev &&
      !!a &&
      x.support !== null &&
      x.resistance !== null &&
      ctx.emaFast !== null &&
      ctx.emaSlow !== null;
    let direction =
      ctx.emaFast !== null && ctx.emaSlow !== null && ctx.emaFast < ctx.emaSlow
        ? -1
        : 1;
    const lo = x.support || 0,
      hi = x.resistance || 0,
      buffer = p.triggerBufferTicks * s.tickSize,
      tol = (a || 0) * p.retestToleranceAtr;
    let context = false,
      pattern = false,
      trigger = false,
      region: [number, number] = [lo, hi],
      reason = '';
    if (enough && last && prev && a) {
      const up = ctx.emaFast! > ctx.emaSlow!,
        body = Math.abs(last.close - last.open),
        bull = last.close > last.open,
        bear = last.close < last.open;
      const lowReject =
        last.low <= lo + tol &&
        last.close > lo &&
        Math.min(last.open, last.close) - last.low >=
          Math.max(body, s.tickSize) * p.wickBodyRatio;
      const highReject =
        last.high >= hi - tol &&
        last.close < hi &&
        last.high - Math.max(last.open, last.close) >=
          Math.max(body, s.tickSize) * p.wickBodyRatio;
      const above = last.close > hi + buffer,
        below = last.close < lo - buffer;
      switch (this.kind) {
        case 'breakout':
          direction = last.close >= (hi + lo) / 2 ? 1 : -1;
          context = true;
          pattern =
            direction === 1 ? last.high >= hi - tol : last.low <= lo + tol;
          trigger = direction === 1 ? above : below;
          reason = `Fechar além da estrutura de 20 candles M1 + ${buffer} pts`;
          break;
        case 'retest': {
          const history = s.candles['1m'].slice(-p.structureBars - 2, -2),
            oldHigh = Math.max(...history.map((c) => c.high)),
            oldLow = Math.min(...history.map((c) => c.low));
          direction = prev.close > oldHigh ? 1 : -1;
          context = prev.close > oldHigh || prev.close < oldLow;
          const level = direction === 1 ? oldHigh : oldLow;
          region = [level - tol, level + tol];
          pattern =
            context &&
            (direction === 1
              ? last.low <= level + tol && last.close > level
              : last.high >= level - tol && last.close < level);
          trigger =
            pattern &&
            (direction === 1
              ? bull && last.close > prev.close
              : bear && last.close < prev.close);
          reason =
            'Retestar o nível rompido no candle anterior e fechar retomando a direção';
          break;
        }
        case 'support':
          direction = 1;
          context = true;
          pattern = lowReject;
          trigger = lowReject && bull && last.close > prev.close;
          region = [lo - tol, lo + tol];
          reason =
            'Rejeição por pavio inferior e fechamento comprador acima do fechamento anterior';
          break;
        case 'resistance':
          direction = -1;
          context = true;
          pattern = highReject;
          trigger = highReject && bear && last.close < prev.close;
          region = [hi - tol, hi + tol];
          reason =
            'Rejeição por pavio superior e fechamento vendedor abaixo do fechamento anterior';
          break;
        case 'false-breakout':
          direction = last.low < lo ? 1 : -1;
          context = true;
          pattern = last.low < lo - buffer || last.high > hi + buffer;
          trigger =
            direction === 1
              ? last.low < lo - buffer && last.close > lo && bull
              : last.high > hi + buffer && last.close < hi && bear;
          reason =
            'Extremo atravessa estrutura e fechamento retorna ao range na mesma barra';
          break;
        case 'reversal':
          direction = up ? -1 : 1;
          context = Math.abs(ctx.emaFast! - ctx.emaSlow!) > a * 0.2;
          pattern =
            direction === 1 ? last.high >= hi - tol : last.low <= lo + tol;
          trigger = direction === 1 ? above : below;
          reason =
            'Contexto EMA M5 contrário e fechamento M1 rompe a estrutura anterior';
          break;
        case 'expansion':
          direction = last.close >= (hi + lo) / 2 ? 1 : -1;
          context = hi - lo <= a * p.consolidationAtr;
          pattern = context && last.high - last.low > a;
          trigger = direction === 1 ? above : below;
          reason =
            'Range anterior ≤ 5 ATR, barra > ATR e fechamento fora do range';
          break;
        case 'range':
          direction = last.close < (hi + lo) / 2 ? 1 : -1;
          context = f.regimes.includes('RANGE');
          pattern = direction === 1 ? lowReject : highReject;
          trigger =
            pattern &&
            (direction === 1
              ? bull && last.close > prev.close
              : bear && last.close < prev.close);
          reason = 'Regime RANGE + rejeição da borda + fechamento de retomada';
          break;
        case 'ema-continuation':
          context = Math.abs(ctx.emaFast! - ctx.emaSlow!) > a * 0.2;
          pattern =
            x.emaFast !== null &&
            (direction === 1
              ? prev.low <= x.emaFast + tol
              : prev.high >= x.emaFast - tol);
          trigger =
            direction === 1
              ? last.close > prev.high + buffer
              : last.close < prev.low - buffer;
          region = [(x.emaFast || lo) - tol, (x.emaFast || hi) + tol];
          reason =
            'Pullback até EMA9 M1, contexto EMA9/21 M5 e fechamento além da barra anterior';
          break;
        case 'ema-cross':
          context = true;
          pattern =
            x.emaFast !== null &&
            x.emaSlow !== null &&
            (direction === 1
              ? x.previousFast! <= x.previousSlow! && x.emaFast > x.emaSlow
              : x.previousFast! >= x.previousSlow! && x.emaFast < x.emaSlow);
          trigger =
            pattern &&
            (direction === 1
              ? last.close > prev.high + buffer
              : last.close < prev.low - buffer);
          reason =
            'Cruzamento EMA9/21 M1 na direção M5 e rompimento do candle anterior';
          break;
        case 'momentum':
          context = x.volumeRatio !== null;
          pattern = context && Math.abs(x.momentum || 0) >= a * p.momentumAtr;
          direction = (x.momentum || 0) >= 0 ? 1 : -1;
          trigger =
            pattern &&
            x.volumeRatio! >= p.relativeTickVolume &&
            (direction === 1
              ? last.close > prev.high + buffer
              : last.close < prev.low - buffer);
          reason =
            'Deslocamento 5 barras ≥ ATR, atividade relativa ≥ 1,2 e quebra da barra anterior';
          break;
        case 'rsi':
          context = x.rsi !== null && x.previousRsi !== null;
          direction = x.previousRsi! < p.rsiLow ? 1 : -1;
          pattern =
            context &&
            (x.previousRsi! < p.rsiLow || x.previousRsi! > p.rsiHigh);
          trigger =
            pattern &&
            (direction === 1
              ? x.rsi! >= p.rsiLow && last.close > prev.high + buffer
              : x.rsi! <= p.rsiHigh && last.close < prev.low - buffer);
          reason =
            'RSI14 retorna da faixa 30/70 e preço confirma além do candle anterior';
          break;
        case 'macd':
          context = x.macd !== null;
          pattern =
            context &&
            (direction === 1
              ? x.previousMacd! <= x.previousSignal! && x.macd! > x.signal!
              : x.previousMacd! >= x.previousSignal! && x.macd! < x.signal!);
          trigger =
            pattern &&
            (direction === 1
              ? last.close > prev.high + buffer
              : last.close < prev.low - buffer);
          reason =
            'MACD12/26/9 cruza na direção M5 e preço confirma além do candle anterior';
          break;
        case 'confluence':
          context =
            x.volumeRatio !== null &&
            Math.abs(ctx.emaFast! - ctx.emaSlow!) > a * 0.2;
          pattern =
            direction === 1 ? last.high >= hi - tol : last.low <= lo + tol;
          trigger =
            (direction === 1 ? above : below) &&
            x.volumeRatio! >= p.relativeTickVolume;
          reason =
            'EMA M5 + rompimento de estrutura M1 + atividade relativa ≥ 1,2';
          break;
      }
    }
    const entry = last?.close || 0,
      stop =
        direction === 1
          ? Math.min(lo, last?.low || lo) - p.stopBufferTicks * s.tickSize
          : Math.max(hi, last?.high || hi) + p.stopBufferTicks * s.tickSize,
      risk = direction * (entry - stop),
      target = entry + direction * risk * p.targetR;
    const errors = a ? validateLevels({direction:direction===1?'BUY':'SELL',entry,stop,target,rr:p.targetR},s.tickSize,{minStopPoints:p.minStopTicks*s.tickSize,maxStopPoints:a*p.maxStopAtr,targetR:p.targetR}) : ['Dados insuficientes para risco'];
    const riskValid = !!a && errors.length===0;
    const conditions = [
      condition(
        'data',
        'Dados e timeframes fechados',
        enough,
        'M1: 22+ barras; M5: 22+ barras; indicadores adicionais exigem aquecimento próprio.',
      ),
      condition(
        'context',
        'Contexto compatível',
        context,
        'Contexto e elegibilidade conforme regras da estratégia.',
      ),
      condition(
        'pattern',
        'Estrutura / padrão',
        pattern,
        reason || 'Aguardar dados',
      ),
      condition(
        'trigger',
        'Gatilho em fechamento',
        trigger,
        reason || 'Aguardar dados',
      ),
      condition(
        'risk',
        'Risco técnico',
        riskValid,
        `Stop entre ${p.minStopTicks} ticks e ${p.maxStopAtr} ATR M1; alvo ${p.targetR}R.`,
      ),
    ];
    const complete = conditions.every((c) => c.met),
      state = !enough
        ? 'INSUFFICIENT_DATA'
        : !context
          ? 'REJECTED'
          : complete
            ? 'CONFIRMED'
            : pattern
              ? 'WAITING_TRIGGER'
              : 'FORMING';
    const analysis: Analysis = {
      strategy: d.id,
      version: d.version,
      stage: 'paper',
      status: complete ? 'complete' : 'waiting',
      trend: direction === 1 ? 'up' : 'down',
      conditions,
      missing: conditions.filter((c) => !c.met).map((c) => c.label),
      conflicts: [],
      support: enough ? lo : undefined,
      resistance: enough ? hi : undefined,
      region: enough ? region : undefined,
      rejectionReasons: enough && !riskValid ? errors : undefined,
      explanation: complete
        ? 'Regras candidatas satisfeitas. Hipótese PAPER sem vantagem comprovada.'
        : `Aguardar: ${conditions.find((c) => !c.met)?.detail}. Não entrar ainda.`,
    };
    if (complete)
      analysis.setup = {
        id: `${d.id}:${d.version}:${s.symbol}:${s.asOf}`,
        symbol:s.symbol,
        tickSize:s.tickSize,
        riskRules:{minStopPoints:p.minStopTicks*s.tickSize,maxStopPoints:(a || 0)*p.maxStopAtr,targetR:p.targetR},
        strategy: d.id,
        version: d.version,
        timestamp: s.asOf,
        direction: direction === 1 ? 'long' : 'short',
        entry,
        stop,
        targets: [target],
        riskPoints: risk,
        potentialPoints: risk * p.targetR,
        rr: p.targetR,
        conditions,
        conflicts: [],
        explanation:
          reason +
          ' Stop além da estrutura conhecida; alvo por múltiplo do risco. Não prevê o próximo candle.',
      };
    return {
      definition: d,
      state,
      analysis,
      reasons: conditions.filter((c) => !c.met).map((c) => c.detail),
      projected:
        enough && riskValid && pattern
          ? { entry, stop, target, rr: p.targetR, region }
          : undefined,
      trigger: reason || 'Aguardar dados',
      detectedAt: s.asOf,
      validUntil: s.asOf + p.lifetimeMinutes * 60,
      regime: f.regimes,
    };
  }
}
const original = new TrendPullbackConfirmation();
const pullback: StrategyEvaluator = {
  definition: {
    ...definition(original.id, 'Tendência + pullback + confirmação'),
    parameters: { ...pullbackParameters, lifetimeMinutes: 10 },
    timeframes: ['15m', '5m', '1m'],
  },
  evaluate(s, f) {
    const analysis = original.evaluate(s),
      p = analysis.setup;
    const enough = analysis.conditions[0].detail.indexOf('Aguardar')<0 && s.candles['5m'].length>=pullbackParameters.structureLookbackBars;
    return {
      definition: this.definition,
      state: !enough
        ? 'INSUFFICIENT_DATA'
        : analysis.rejectionReasons?.length ? 'REJECTED'
        : p
          ? 'CONFIRMED'
          : analysis.conditions.filter((c) => c.met).length >= 5
            ? 'WAITING_TRIGGER'
            : analysis.trend === 'neutral'
              ? 'REJECTED'
              : 'FORMING',
      analysis,
      reasons: analysis.rejectionReasons?.length ? analysis.rejectionReasons : analysis.missing,
      trigger: analysis.conditions.find((c) => c.key === 'trigger')!.detail,
      detectedAt: s.asOf,
      validUntil: s.asOf + 600,
      regime: f.regimes,
      projected: p
        ? {
            entry: p.entry,
            stop: p.stop,
            target: p.targets[0],
            rr: p.rr,
            region: analysis.region || [p.entry, p.entry],
          }
        : analysis.projected,
    };
  },
};
function unavailable(
  id: string,
  name: string,
  key: 'vwap' | 'openingRange',
): StrategyEvaluator {
  return {
    definition: {
      ...definition(id, name),
      stage: 'research',
      unavailableReason: key,
      requiredData:
        key === 'vwap'
          ? ['Volume real negociado', 'Sessão completa']
          : ['Calendário B3', 'Cobertura integral da abertura'],
    },
    evaluate(s, f) {
      const reason = f.unavailable[key];
      return {
        definition: this.definition,
        state: 'UNAVAILABLE_DATA',
        analysis: {
          strategy: id,
          version: '1.1.0',
          stage: 'research',
          status: 'blocked',
          trend: 'neutral',
          conditions: [],
          missing: [reason],
          conflicts: [],
          explanation: reason,
        },
        reasons: [reason],
        trigger: 'Indisponível',
        detectedAt: s.asOf,
        validUntil: s.asOf,
        regime: f.regimes,
      };
    },
  };
}
export const strategyRegistry: StrategyEvaluator[] = [
  pullback,
  ...definitions.map(([k, id, name]) => new RuleStrategy(k, id, name)),
  unavailable('vwap_recovery_v1', 'VWAP · rejeição / recuperação', 'vwap'),
  unavailable('opening_range_v1', 'Range inicial / abertura', 'openingRange'),
];
