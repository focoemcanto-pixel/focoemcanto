import { decisionSnapshot, sessionKey } from './market-context';
import { validateLevels } from './invariants';
import type { Analysis, Candle, MarketSnapshot, Strategy } from './types';
export const pullbackParameters = Object.freeze({
  contextFastPeriod: 4,
  contextSlowPeriod: 8,
  contextSlopeBars: 2,
  minContextSeparationPoints: 20,
  structureLookbackBars: 10,
  minImpulsePoints: 150,
  pullbackMinRatio: 0.12,
  pullbackMaxRatio: 0.75,
  supportTolerancePoints: 65,
  reactionBodyMinPoints: 15,
  confirmationCloses: 2,
  triggerBufferTicks: 1,
  stopBufferTicks: 2,
  minStopPoints: 20,
  maxStopPoints: 650,
  targetR: 2,
  cooldownMinutes: 15,
});
export type PullbackParameters = {
  readonly [K in keyof typeof pullbackParameters]: number;
};
export function ema(values: number[], period: number) {
  let e = values[0] || 0;
  return values.map((v, i) => {
    e = i === 0 ? v : (v * 2) / (period + 1) + e * (1 - 2 / (period + 1));
    return e;
  });
}
export class TrendPullbackConfirmation implements Strategy<PullbackParameters> {
  readonly id = 'trend_pullback_confirmation_v1';
  readonly version = '1.1.0';
  readonly stage = 'paper' as const;
  readonly liveAuthorized = false;
  constructor(readonly parameters: PullbackParameters = pullbackParameters) {
    const p = parameters;
    if (
      Object.values(p).some((v) => !Number.isFinite(v) || v < 0) ||
      p.contextFastPeriod >= p.contextSlowPeriod ||
      p.pullbackMinRatio >= p.pullbackMaxRatio ||
      p.pullbackMaxRatio >= 1 ||
      p.minStopPoints >= p.maxStopPoints ||
      p.confirmationCloses < 2 ||
      p.targetR <= 0 ||
      ![
        p.contextFastPeriod,
        p.contextSlowPeriod,
        p.contextSlopeBars,
        p.structureLookbackBars,
        p.confirmationCloses,
        p.triggerBufferTicks,
        p.stopBufferTicks,
      ].every(Number.isInteger)
    )
      throw new Error('Parâmetros inválidos.');
  }
  evaluate(s: MarketSnapshot): Analysis {
    s = decisionSnapshot(s);
    const p = this.parameters,
      context = s.candles['15m'],
      structure = s.candles['5m'].slice(-p.structureLookbackBars),
      minutes = s.candles['1m'];
    const fast = ema(
        context.map((c) => c.close),
        p.contextFastPeriod,
      ),
      slow = ema(
        context.map((c) => c.close),
        p.contextSlowPeriod,
      );
    const enough =
      context.length >= p.contextSlowPeriod + p.contextSlopeBars &&
      structure.length >= p.structureLookbackBars &&
      minutes.length >= p.confirmationCloses + 1;
    const separation = (fast.at(-1) || 0) - (slow.at(-1) || 0),
      slope = (fast.at(-1) || 0) - (fast.at(-1 - p.contextSlopeBars) || 0);
    const trend =
      enough &&
      Math.abs(separation) >= p.minContextSeparationPoints &&
      separation * slope > 0
        ? separation > 0
          ? 'up'
          : 'down'
        : 'neutral';
    const sign = trend === 'down' ? -1 : 1;
    const project = (c: Candle) => ({
      high: sign === 1 ? c.high : -c.low,
      low: sign === 1 ? c.low : -c.high,
      close: sign * c.close,
    });
    const pre = structure.slice(0, -1).map(project);
    const peak = pre.length ? Math.max(...pre.map((c) => c.high)) : 0;
    const peakIndex = pre.findIndex((c) => c.high === peak);
    const base =
      peakIndex > 0
        ? Math.min(...pre.slice(0, peakIndex).map((c) => c.low))
        : peak;
    const impulse = peak - base;
    const retracement = pre.slice(peakIndex + 1);
    const bottom = retracement.length
      ? Math.min(...retracement.map((c) => c.low))
      : peak;
    const ratio = impulse > 0 ? (peak - bottom) / impulse : 0;
    const supportProjected = pre[0]?.low || 0;
    // Relevant region: fast context EMA, known impulse midpoint or origin. Pick the nearest known level.
    const candidates = [sign * (fast.at(-1) || 0), base, base + impulse * 0.5];
    const regionProjected =
      candidates.sort(
        (a, b) => Math.abs(a - bottom) - Math.abs(b - bottom),
      )[0] || supportProjected;
    const last = minutes.at(-1),
      prev = minutes.at(-2),
      reaction = minutes.at(-1 - p.confirmationCloses);
    const contextMet = trend !== 'neutral',
      structureMet =
        contextMet && peakIndex > 0 && impulse >= p.minImpulsePoints;
    const pullback =
      structureMet &&
      retracement.length > 0 &&
      ratio >= p.pullbackMinRatio &&
      ratio <= p.pullbackMaxRatio;
    const region =
      pullback &&
      Math.abs(bottom - regionProjected) <= p.supportTolerancePoints;
    const reacts =
      !!reaction &&
      region &&
      sign * (reaction.close - reaction.open) >= p.reactionBodyMinPoints;
    const confirmationCandles = minutes.slice(-1 - p.confirmationCloses, -1);
    const confirmation =
      reacts &&
      confirmationCandles.length === p.confirmationCloses &&
      confirmationCandles.every(
        (c, i) =>
          i === 0 || sign * (c.close - confirmationCandles[i - 1].close) > 0,
      );
    const trigger =
      confirmation &&
      !!last &&
      !!prev &&
      sign * last.close >
        project(prev).high + p.triggerBufferTicks * s.tickSize;
    const entry = last?.close || 0;
    const stop =
      sign *
      (Math.min(bottom, reaction ? project(reaction).low : bottom) -
        p.stopBufferTicks * s.tickSize);
    const risk = sign * (entry - stop);
    const riskMet =
      trigger && risk >= p.minStopPoints && risk <= p.maxStopPoints;
    const conditions = [
      {
        key: 'context',
        label: 'Contexto · tendência 15m',
        met: contextMet,
        detail: enough
          ? `EMA ${p.contextFastPeriod}/${p.contextSlowPeriod}: separação ${Math.round(separation)} pts; inclinação ${Math.round(slope)} pts.`
          : 'Aguardar 150 minutos de candles fechados para formar o contexto.',
      },
      {
        key: 'structure',
        label: 'Estrutura · impulso 5m',
        met: structureMet,
        detail: `Impulso conhecido de ${Math.round(impulse)} pts; mínimo ${p.minImpulsePoints}.`,
      },
      {
        key: 'pullback',
        label: 'Pullback · retração 5m',
        met: pullback,
        detail: `Retração ${(ratio * 100).toFixed(1)}%; faixa ${(p.pullbackMinRatio * 100).toFixed(0)}–${p.pullbackMaxRatio * 100}%.`,
      },
      {
        key: 'region',
        label: 'Região · teste de suporte/resistência',
        met: region,
        detail: `Distância da região: ${Math.round(Math.abs(bottom - regionProjected))} pts; tolerância ${p.supportTolerancePoints}.`,
      },
      {
        key: 'reaction',
        label: 'Reação · candle direcional 1m',
        met: reacts,
        detail: `Corpo direcional mínimo de ${p.reactionBodyMinPoints} pts, após teste da região.`,
      },
      {
        key: 'confirmation',
        label: 'Confirmação · continuidade 1m',
        met: confirmation,
        detail: `${p.confirmationCloses} fechamentos sequenciais na direção da reação.`,
      },
      {
        key: 'trigger',
        label: 'Gatilho · supera candle anterior',
        met: trigger,
        detail: `Fechamento além da máxima/mínima anterior + ${p.triggerBufferTicks * s.tickSize} pts.`,
      },
      {
        key: 'risk',
        label: 'Setup · risco técnico válido',
        met: riskMet,
        detail: `Stop deve estar entre ${p.minStopPoints} e ${p.maxStopPoints} pts; alvo ${p.targetR}R.`,
      },
    ];
    const conflicts: string[] = [];
    if (contextMet && last && sign * (last.close - (slow.at(-1) || 0)) < 0)
      conflicts.push(
        'Preço 1m está do lado oposto da média lenta de contexto.',
      );
    const complete = conditions.every((c) => c.met) && conflicts.length === 0;
    const missing = conditions.filter((c) => !c.met).map((c) => c.label);
    const result: Analysis = {
      strategy: this.id,
      version: this.version,
      stage: this.stage,
      status: complete ? 'complete' : 'waiting',
      trend,
      conditions,
      missing,
      conflicts,
      explanation: complete
        ? 'As regras candidatas estão satisfeitas neste fechamento. Isso descreve uma hipótese para estudo; não prevê o próximo candle.'
        : `Aguardar: ${missing[0] || 'resolver conflito de contexto'}. Um candle isolado não completa esta hipótese.`,
    };
    if (enough) {
      const lows = structure.map((c) => c.low),
        highs = structure.map((c) => c.high);
      result.support = Math.min(...lows);
      result.resistance = Math.max(...highs);
      result.region = [
        sign * regionProjected - p.supportTolerancePoints,
        sign * regionProjected + p.supportTolerancePoints,
      ];
    }
    const invalid = validateLevels({direction:sign===1?'BUY':'SELL',entry,stop,target:entry+sign*risk*p.targetR,rr:p.targetR},s.tickSize,p);
    if (enough && invalid.length) {
      result.rejectionReasons = invalid;
      result.explanation = `SETUP DESCARTADO: ${invalid.join(' ')}`;
    }
    if (!enough) result.explanation = `Aguardando estrutura atual e contínua: M15 ${context.length}/${p.contextSlowPeriod+p.contextSlopeBars}, M5 ${structure.length}/${p.structureLookbackBars}. Sessões anteriores e lacunas não são usadas como stop.`;
    if (enough && region && invalid.length === 0 && result.region)
      result.projected = {
        entry,
        stop,
        target: entry + sign * risk * p.targetR,
        rr: p.targetR,
        region: result.region,
      };
    if (complete && last)
      result.setup = {
        id: `${this.id}:${this.version}:${s.symbol}:${last.timestamp}`,
        symbol:s.symbol,
        tickSize:s.tickSize,
        riskRules:{minStopPoints:p.minStopPoints,maxStopPoints:p.maxStopPoints,targetR:p.targetR},
        session:sessionKey(s.asOf-1),
        strategy: this.id,
        version: this.version,
        timestamp: s.asOf,
        direction: sign === 1 ? 'long' : 'short',
        entry,
        stop,
        targets: [entry + sign * risk * p.targetR],
        riskPoints: risk,
        potentialPoints: risk * p.targetR,
        rr: p.targetR,
        conditions,
        conflicts,
        explanation: `Contexto ${trend === 'up' ? 'de alta' : 'de baixa'}, impulso, retração e teste de região conhecidos. Dois candles reagem e o último fecha além do candle anterior. A perda de ${stop} invalida a hipótese; alvo de referência usa ${p.targetR} vezes a distância técnica.`,
      };
    return result;
  }
}
export const strategyFamilies = [
  'Continuação após pullback',
  'Breakout',
  'Breakout + reteste',
  'Continuação após consolidação',
  'Rejeição em suporte/resistência',
  'Falso rompimento',
  'Rompimento de estrutura',
  'Momentum + volume',
  'VWAP',
  'Médias móveis',
  'RSI',
  'MACD',
  'Padrões de candle',
  'Confluências',
];
