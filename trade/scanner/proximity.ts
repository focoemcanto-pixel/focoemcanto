import type {
  DeskSummary,
  Hypothesis,
  HypothesisStage,
  StrategyCandidate,
} from './types';

export type ScannerProximity = {
  id: string;
  state: StrategyCandidate['state'];
  met: number;
  total: number;
  ratio: number;
  missing: string[];
  trigger: string;
};

/** Diagnostic ranking only. Never promotes a setup or creates a proposal. */
export function rankNearTrigger(candidates: StrategyCandidate[]): ScannerProximity[] {
  return candidates
    .filter((candidate) => ['FORMING', 'WAITING_TRIGGER', 'REJECTED'].includes(candidate.state))
    .map((candidate) => {
      const conditions = candidate.analysis.conditions || [];
      const met = conditions.filter((condition) => condition.met).length;
      const total = conditions.length;
      return {
        id: candidate.definition.id,
        state: candidate.state,
        met,
        total,
        ratio: total ? met / total : 0,
        missing: conditions.filter((condition) => !condition.met).map((condition) => condition.label),
        trigger: candidate.trigger,
      };
    })
    .filter((candidate) => candidate.total > 0 && candidate.met > 0)
    .sort((a, b) => b.ratio - a.ratio || b.met - a.met)
    .slice(0, 5);
}

const conditionWeights: Record<string, number> = {
  data: 10,
  context: 20,
  pattern: 25,
  trigger: 30,
  risk: 15,
};
const stageOrder: HypothesisStage[] = [
  'CONFIRMED',
  'WAITING_TRIGGER',
  'FORMING',
  'FAR',
  'REJECTED',
  'WARMING_UP',
  'UNAVAILABLE_DATA',
  'DISABLED',
];
/** Below this score a forming hypothesis is shown as far from its trigger, not as a setup in formation. */
export const farScoreThreshold = 50;
const clock = (n: number) =>
  new Date(n * 1000).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });

function scoreFactors(candidate: StrategyCandidate) {
  const p = candidate.projected,
    reference = p ? Math.abs(p.entry - p.stop) : null,
    proximity = candidate.proximity;
  return (candidate.analysis.conditions || []).map((condition) => {
    const weight = conditionWeights[condition.key] ?? 15;
    let points = condition.met ? weight : 0,
      detail = condition.detail;
    if (
      !condition.met &&
      condition.key === 'trigger' &&
      proximity?.distancePoints != null &&
      reference
    ) {
      // Partial credit shrinks linearly to zero at one technical risk unit away.
      points =
        Math.round(
          weight * Math.max(0, 1 - proximity.distancePoints / reference) * 10,
        ) / 10;
      detail = `${proximity.label}: ${proximity.distancePoints} pts do gatilho; 0 pontos a ${reference} pts (1 risco técnico).`;
    }
    return { key: condition.key, label: condition.label, points, weight, detail };
  });
}

/**
 * Turns every candidate into a visible hypothesis with an explained stage. Diagnostic only:
 * it never confirms, promotes or proposes anything; CONFIRMED comes from the rules alone.
 */
export function buildHypotheses(
  candidates: StrategyCandidate[],
  feedBlocked: boolean,
): Hypothesis[] {
  const list = candidates.map((c) => {
    const conditions = c.analysis.conditions || [],
      met = conditions.filter((x) => x.met).length,
      total = conditions.length,
      blockers: Hypothesis['blockers'] = [];
    let stage: HypothesisStage;
    if (c.state === 'DISABLED') {
      stage = 'DISABLED';
      blockers.push({ code: 'DISABLED', message: 'Estratégia desativada.' });
    } else if (c.state === 'UNAVAILABLE_DATA') {
      stage = 'UNAVAILABLE_DATA';
      blockers.push(
        feedBlocked && !c.definition.unavailableReason
          ? { code: 'FEED_NOT_LIVE', message: c.reasons[0] || 'Feed antigo ou offline.' }
          : { code: 'DATA_UNAVAILABLE', message: c.reasons[0] || 'Dado indisponível.' },
      );
    } else if (c.state === 'INSUFFICIENT_DATA') {
      stage = 'WARMING_UP';
      blockers.push({
        code: 'WARMING_UP',
        message:
          c.warmup?.frames
            .filter((f) => f.have < f.need)
            .map(
              (f) =>
                `${f.timeframe === '1m' ? 'M1' : f.timeframe === '5m' ? 'M5' : 'M15'} ${f.have}/${f.need} barras da sessão atual`,
            )
            .join(' · ') || 'Indicadores ainda aquecendo na sessão atual.',
      });
    } else if (c.state === 'REJECTED') {
      stage = 'REJECTED';
      if (c.reasons.some((r) => r.startsWith('Regime incompatível')))
        blockers.push({
          code: 'REGIME_MISMATCH',
          message: `Regime atual ${c.regime.join(', ')} fora de ${c.definition.eligibleRegimes.join(', ')}.`,
        });
      if (c.analysis.rejectionReasons?.length)
        blockers.push({
          code: c.analysis.rejectionReasons.some((r) => /STOP|RISK|RISCO|stop|risco/.test(r))
            ? 'RISK_OUT_OF_BOUNDS'
            : 'INVALID_LEVELS',
          message: c.analysis.rejectionReasons.join(' '),
        });
      if (!blockers.length)
        blockers.push({
          code: 'CONTEXT_NOT_MET',
          message:
            conditions.find((x) => x.key === 'context' && !x.met)?.detail ||
            c.reasons[0] ||
            'Contexto da regra ausente.',
        });
    } else if (c.state === 'CONFIRMED') {
      stage = 'CONFIRMED';
      if (c.analysis.conflicts.length)
        blockers.push({
          code: 'DIRECTION_CONFLICT',
          message: c.analysis.conflicts[0],
        });
    } else if (c.state === 'WAITING_TRIGGER') stage = 'WAITING_TRIGGER';
    else stage = 'FORMING';
    const evaluable = !['WARMING_UP', 'UNAVAILABLE_DATA', 'DISABLED'].includes(stage),
      factors = evaluable ? scoreFactors(c) : [],
      weights = factors.reduce((n, f) => n + f.weight, 0),
      score = weights
        ? Math.round((100 * factors.reduce((n, f) => n + f.points, 0)) / weights)
        : 0;
    if (stage === 'FORMING' && score < farScoreThreshold) stage = 'FAR';
    const setup = c.analysis.setup,
      projection = setup
        ? { entry: setup.entry, stop: setup.stop, target: setup.targets[0] }
        : c.projected
          ? { entry: c.projected.entry, stop: c.projected.stop, target: c.projected.target }
          : null;
    const why =
      stage === 'CONFIRMED'
        ? `Todas as ${total} condições obrigatórias satisfeitas no fechamento de ${clock(c.detectedAt)}.`
        : stage === 'WARMING_UP'
          ? `Aguardando barras da sessão atual${c.warmup?.readyAt ? `; previsto a partir de ${clock(c.warmup.readyAt)}` : ''}. Sessões anteriores não são usadas.`
          : stage === 'FAR'
            ? `${met}/${total} condições; pontuação ${score}/100 abaixo de ${farScoreThreshold}. Estrutura distante do gatilho.`
            : c.analysis.explanation;
    return {
      id: c.definition.id,
      version: c.definition.version,
      name: c.definition.name,
      stage,
      direction:
        setup?.direction ??
        (evaluable && c.analysis.trend !== 'neutral'
          ? c.analysis.trend === 'down'
            ? 'short'
            : 'long'
          : null),
      met,
      total,
      missing: conditions.filter((x) => !x.met).map((x) => x.label),
      blockers,
      factors,
      score,
      rank: 0,
      why,
      trigger: c.trigger,
      projection,
      validUntil: c.validUntil,
      warmup: c.warmup,
    } satisfies Hypothesis;
  });
  list.sort(
    (a, b) =>
      stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage) ||
      b.score - a.score ||
      b.met - a.met,
  );
  list.forEach((h, i) => (h.rank = i + 1));
  return list;
}

export function deskSummary(
  hypotheses: Hypothesis[],
  candidates: StrategyCandidate[],
  feedBlocked: boolean,
): DeskSummary {
  const awaitingData = candidates.filter((c) => c.definition.unavailableReason).length,
    disabled = candidates.filter((c) => !c.definition.enabled).length,
    warming = hypotheses.filter((h) => h.stage === 'WARMING_UP'),
    ready = warming
      .map((h) => h.warmup?.readyAt)
      .filter((n): n is number => typeof n === 'number'),
    operational = candidates.length - awaitingData - disabled,
    count = (stage: HypothesisStage) => hypotheses.filter((h) => h.stage === stage).length,
    nearest = hypotheses
      .filter((h) => ['WAITING_TRIGGER', 'FORMING', 'FAR'].includes(h.stage) && h.met > 0)
      .sort((a, b) => b.score - a.score || b.met - a.met)
      .slice(0, 3)
      .map((h) => h.id);
  const coverage = {
    registered: candidates.length,
    operational,
    awaitingData,
    warmingUp: warming.length,
    nextReadyAt: ready.length ? Math.min(...ready) : null,
  };
  const base = { nearest, coverage };
  if (feedBlocked)
    return {
      ...base,
      verdict: 'FEED_NOT_LIVE',
      headline: 'FEED ANTIGO OU OFFLINE',
      detail: 'Nenhuma hipótese nova pode ser confirmada sem feed LIVE.',
    };
  if (hypotheses.some((h) => h.stage === 'CONFIRMED' && h.blockers.some((b) => b.code === 'DIRECTION_CONFLICT')))
    return {
      ...base,
      verdict: 'CONFLICT',
      headline: 'CONFLITO COMPRA × VENDA',
      detail: 'Hipóteses confirmadas em direções opostas. Nenhuma proposta é gerada.',
    };
  if (count('CONFIRMED'))
    return {
      ...base,
      verdict: 'CONFIRMED',
      headline: 'SETUP CONFIRMADO',
      detail: `${count('CONFIRMED')} hipótese(s) com todas as condições obrigatórias.`,
    };
  if (count('WAITING_TRIGGER'))
    return {
      ...base,
      verdict: 'WAITING_TRIGGER',
      headline: 'AGUARDANDO GATILHO',
      detail: `${count('WAITING_TRIGGER')} hipótese(s) com estrutura pronta aguardando o fechamento de gatilho.`,
    };
  if (count('FORMING'))
    return {
      ...base,
      verdict: 'FORMING',
      headline: 'SETUP EM FORMAÇÃO',
      detail: `${count('FORMING')} hipótese(s) em formação. Ainda não é recomendação de entrada.`,
    };
  if (operational > 0 && warming.length === operational)
    return {
      ...base,
      verdict: 'WARMING_UP',
      headline: 'AQUECENDO DADOS',
      detail: 'As estratégias operacionais aguardam barras suficientes da sessão atual.',
    };
  return {
    ...base,
    verdict: 'NOTHING',
    headline: 'NENHUMA ENTRADA AGORA',
    detail: `${operational - warming.length} estratégia(s) avaliadas sem setup em formação.`,
  };
}
