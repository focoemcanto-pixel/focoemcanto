import { validateSetup } from '../core/invariants';
import { pullbackParameters } from '../core/strategy';
import type { Analysis } from '../core/types';
import { sizePosition } from '../core/risk-engine';
export const approvalPolicy = {
  proposalLifetimeMs: 30000,
  paperPointValue: 0.2,
  paperCurrency: 'BRL',
  magic: '706032601',
} as const;
export type ProposalState = 'READY' | 'RISK_BLOCKED';
/** Market levels only: what the setup says, independent of money available. */
export type TechnicalProposal = {
  id: string;
  mode: 'PAPER' | 'REAL';
  source: 'replay' | 'mt5';
  symbol: string;
  direction: 'BUY' | 'SELL';
  entryMethod: 'MARKET';
  entry: number;
  sl: number;
  tp: number;
  riskPoints: number;
  potentialPoints: number;
  rr: number;
  setup: NonNullable<Analysis['setup']>;
  asOf: number;
  expiresAt: number;
  cursor: number;
  inspectionOnly?: boolean;
  scope?: string;
  setupWatchId?: string;
};
export type ProposalSizing = {
  engine: 'risk-engine' | 'manual';
  maxRiskBRL: number | null;
  maxRiskSource: string;
  riskPerContractBRL: number;
  maxContracts: number;
  requestedQuantity: number | null;
  contracts: number;
  rule: string;
};
export type RiskBlock = {
  code: 'RISK_LIMIT_EXCEEDED' | 'RISK_LIMIT_NOT_CONFIGURED' | 'INVALID_RISK_INPUT';
  message: string;
  minimumRiskBRL: number;
  maxRiskBRL: number | null;
  excessBRL: number | null;
};
/** Technical proposal + risk sizing. RISK_BLOCKED keeps the technical levels and has quantity 0. */
export type Proposal = TechnicalProposal & {
  quantity: number;
  pointValue: number;
  pointValueSource?: string;
  riskBRL: number;
  potentialBRL: number;
  proposalState?: ProposalState;
  riskPerContractBRL?: number;
  sizing?: ProposalSizing;
  riskBlock?: RiskBlock;
};
export interface ExecutionApprovalProvider {
  approve(
    p: Proposal,
    intent?: { command: import('./protocol').BrokerCommand; nonce: string },
  ): Promise<unknown>;
}
/** A proposal may reach an execution provider only when sized to at least one contract. */
export function isExecutable(p: Pick<Proposal, 'proposalState' | 'quantity'>) {
  return (
    p.proposalState !== 'RISK_BLOCKED' &&
    Number.isInteger(p.quantity) &&
    p.quantity >= 1
  );
}
const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/**
 * Validates the setup and derives entry, technical stop, target, distances and R/R.
 * No budget, no quantity: the stop is where the structure says, never where money fits.
 */
export function buildTechnicalProposal(
  a: Analysis,
  options: {
    mode: Proposal['mode'];
    source: Proposal['source'];
    symbol: string;
    cursor: number;
    asOf: number;
    liveAuthorized: boolean;
    inspectionOnly?: boolean;
  },
  now = Date.now(),
): TechnicalProposal {
  const s = a.setup;
  if (
    a.status !== 'complete' ||
    !s ||
    a.conditions.some((c) => !c.met) ||
    a.conflicts.length
  )
    throw new Error('Condições incompletas ou conflitantes');
  if (
    options.mode === 'REAL' &&
    (options.source !== 'mt5' ||
      (!options.inspectionOnly && (!options.liveAuthorized ||
      a.stage !== 'live-monitoring')))
  )
    throw new Error('Estratégia não autorizada para operação real');
  const rules=s.riskRules || (s.strategy==='trend_pullback_confirmation_v1' ? pullbackParameters : {minStopPoints:s.tickSize || 5,maxStopPoints:Number.MAX_VALUE});
  const invalid=validateSetup(s,s.tickSize || 5,rules);
  if(s.symbol && s.symbol!==options.symbol)invalid.push('WRONG_SYMBOL: símbolo/contrato divergente.');
  if(s.timestamp!==options.asOf)invalid.push('STALE_SETUP: timestamp da hipótese divergente.');
  if(options.source==='mt5' && (now-options.asOf*1000>120000 || options.asOf*1000>now+2000))invalid.push('STALE_SETUP: estrutura antiga ou futura.');
  if(invalid.length)throw new Error('SETUP_REJECTED: '+invalid.join(' '));
  const sign = s.direction === 'long' ? 1 : -1,
    risk = (s.entry - s.stop) * sign,
    potential = (s.targets[0] - s.entry) * sign;
  if (
    ![s.entry, s.stop, s.targets[0], risk, potential].every(
      (n) => Number.isFinite(n) && n > 0,
    )
  )
    throw new Error('Níveis inválidos');
  return {
    id: crypto.randomUUID(),
    ...(options.inspectionOnly ? { inspectionOnly: true } : {}),
    mode: options.mode,
    source: options.source,
    symbol: options.symbol,
    direction: sign === 1 ? 'BUY' : 'SELL',
    entryMethod: 'MARKET',
    entry: s.entry,
    sl: s.stop,
    tp: s.targets[0],
    riskPoints: risk,
    potentialPoints: potential,
    rr: potential / risk,
    setup: s,
    asOf: options.asOf,
    expiresAt: now + approvalPolicy.proposalLifetimeMs,
    cursor: options.cursor,
  };
}
/**
 * Applies the central Risk Engine to a technical proposal. It may change quantity, financial
 * risk and eligibility; it never changes entry, stop or target. One contract above the limit
 * yields RISK_BLOCKED with quantity 0 — the technical proposal survives for study only.
 */
export function sizeProposal(
  tp: TechnicalProposal,
  options: {
    pointValue: number;
    currency: string;
    pointValueSource?: string;
    maxContracts: number;
    maxRiskBRL: number | null | undefined;
    maxRiskSource: string;
    requestedQuantity?: number;
  },
): Proposal {
  if (
    options.currency !== 'BRL' ||
    !Number.isFinite(options.pointValue) ||
    options.pointValue <= 0
  )
    throw new Error('Valor monetário do contrato indisponível');
  if (!Number.isInteger(options.maxContracts) || options.maxContracts < 1)
    throw new Error('Limite de contratos inválido');
  const requested = options.requestedQuantity;
  if (
    requested !== undefined &&
    (!Number.isInteger(requested) ||
      requested < 1 ||
      requested > options.maxContracts)
  )
    throw new Error('Quantidade inválida');
  const riskPerContractBRL = tp.riskPoints * options.pointValue,
    limit =
      typeof options.maxRiskBRL === 'number' &&
      Number.isFinite(options.maxRiskBRL) &&
      options.maxRiskBRL > 0
        ? options.maxRiskBRL
        : null;
  const sizing: ProposalSizing = {
    engine: 'risk-engine',
    maxRiskBRL: limit,
    maxRiskSource: limit === null ? 'not-configured' : options.maxRiskSource,
    riskPerContractBRL,
    maxContracts: options.maxContracts,
    requestedQuantity: requested ?? null,
    contracts: 0,
    rule: '',
  };
  const base = {
    ...tp,
    pointValue: options.pointValue,
    pointValueSource: options.pointValueSource,
    riskPerContractBRL,
  };
  const blocked = (riskBlock: RiskBlock): Proposal => ({
    ...base,
    quantity: 0,
    riskBRL: 0,
    potentialBRL: 0,
    proposalState: 'RISK_BLOCKED',
    sizing: { ...sizing, rule: riskBlock.message },
    riskBlock,
  });
  if (limit === null)
    return blocked({
      code: 'RISK_LIMIT_NOT_CONFIGURED',
      message: `Limite de risco por operação não configurado (${options.maxRiskSource}). Sem limite explícito nenhuma quantidade é liberada.`,
      minimumRiskBRL: riskPerContractBRL,
      maxRiskBRL: null,
      excessBRL: null,
    });
  const sized = sizePosition({
    entry: tp.entry,
    stop: tp.sl,
    instrument: {
      symbol: tp.symbol,
      tickSize: tp.setup.tickSize || 5,
      pointValue: options.pointValue,
      minContracts: 1,
      contractStep: 1,
      maxContracts: options.maxContracts,
    },
    // Per-trade cash limit only; capitalBase mirrors it because no percentage rule applies here.
    policy: {
      capitalBase: limit,
      riskPerTradeBRL: limit,
      maxContracts: options.maxContracts,
    },
  });
  if (!sized.allowed)
    return blocked(
      sized.reason === 'NO_TRADE_RISK_LIMIT'
        ? {
            code: 'RISK_LIMIT_EXCEEDED',
            message: `Risco mínimo de 1 contrato ${brl(riskPerContractBRL)} (${tp.riskPoints} pts × ${brl(options.pointValue)}) excede o limite de ${brl(limit)} em ${brl(riskPerContractBRL - limit)}. Stop técnico mantido; quantidade permitida: 0.`,
            minimumRiskBRL: riskPerContractBRL,
            maxRiskBRL: limit,
            excessBRL: riskPerContractBRL - limit,
          }
        : {
            code: 'INVALID_RISK_INPUT',
            message: 'Dados de risco inválidos para dimensionar a proposta.',
            minimumRiskBRL: riskPerContractBRL,
            maxRiskBRL: limit,
            excessBRL: null,
          },
    );
  const quantity = Math.min(requested ?? sized.contracts, sized.contracts);
  return {
    ...base,
    quantity,
    riskBRL: tp.riskPoints * options.pointValue * quantity,
    potentialBRL: tp.potentialPoints * options.pointValue * quantity,
    proposalState: 'READY',
    sizing: {
      ...sizing,
      contracts: sized.contracts,
      rule: `Limite ${brl(limit)} ÷ ${brl(riskPerContractBRL)} por contrato = ${sized.contracts} contrato(s) (máximo ${options.maxContracts})${requested !== undefined && requested < sized.contracts ? `; solicitado ${requested}` : ''}`,
    },
  };
}
/**
 * Manual-quantity wrapper kept for existing callers. With maxRiskBRL it delegates to sizeProposal;
 * production endpoints always pass an explicit limit.
 */
export function makeProposal(
  a: Analysis,
  options: {
    mode: Proposal['mode'];
    source: Proposal['source'];
    symbol: string;
    quantity: number;
    max: number;
    pointValue: number;
    currency: string;
    pointValueSource?: string;
    cursor: number;
    asOf: number;
    liveAuthorized: boolean;
    inspectionOnly?: boolean;
    maxRiskBRL?: number | null;
    maxRiskSource?: string;
  },
  now = Date.now(),
): Proposal {
  const tp = buildTechnicalProposal(a, options, now);
  if (options.maxRiskBRL !== undefined)
    return sizeProposal(tp, {
      pointValue: options.pointValue,
      currency: options.currency,
      pointValueSource: options.pointValueSource,
      maxContracts: options.max,
      maxRiskBRL: options.maxRiskBRL,
      maxRiskSource: options.maxRiskSource || 'caller',
      requestedQuantity: options.quantity,
    });
  if (
    !Number.isInteger(options.quantity) ||
    options.quantity < 1 ||
    options.quantity > options.max
  )
    throw new Error('Quantidade inválida');
  if (
    options.currency !== 'BRL' ||
    !Number.isFinite(options.pointValue) ||
    options.pointValue <= 0
  )
    throw new Error('Valor monetário do contrato indisponível');
  const riskPerContractBRL = tp.riskPoints * options.pointValue;
  return {
    ...tp,
    quantity: options.quantity,
    pointValue: options.pointValue,
    pointValueSource: options.pointValueSource,
    riskBRL: riskPerContractBRL * options.quantity,
    potentialBRL: tp.potentialPoints * options.pointValue * options.quantity,
    proposalState: 'READY',
    riskPerContractBRL,
    sizing: {
      engine: 'manual',
      maxRiskBRL: null,
      maxRiskSource: 'manual',
      riskPerContractBRL,
      maxContracts: options.max,
      requestedQuantity: options.quantity,
      contracts: options.quantity,
      rule: 'Quantidade informada manualmente; limites financeiros verificados pelos gates do modo',
    },
  };
}
export function executionView(
  proposal: Proposal,
  command: any,
  events: any[],
  positions: any[],
  live: boolean,
  orders: any[] = [],
) {
  const deals = events.filter(
    (e) =>
      e.commandId === proposal.id &&
      e.kind === 'observed' &&
      e.deal &&
      e.entry === 0,
  );
  const unique = [...new Map(deals.map((e) => [e.deal, e])).values()];
  const filled = unique.reduce((n, e) => n + Number(e.volume), 0);
  const entry = filled
    ? unique.reduce((n, e) => n + Number(e.volume) * Number(e.price), 0) /
      filled
    : null;
  const ids = new Set(unique.map((e) => e.position));
  const position = positions.find(
    (p) =>
      ids.has(p.identifier) &&
      p.magic === approvalPolicy.magic &&
      p.symbol === proposal.symbol,
  );
  let status =
    command?.state === 'queued'
      ? 'ENFILEIRADA'
      : command?.state === 'dispatch_unknown'
        ? 'RESULTADO INDETERMINADO'
        : 'ENVIANDO';
  if (filled > 0)
    status = filled + 1e-8 < proposal.quantity ? 'PARCIAL' : 'EXECUTADA';
  else if (
    command?.state === 'rejected' ||
    events.some((e) => e.commandId === proposal.id && e.orderState === 5)
  )
    status = 'REJEITADA';
  else if (
    ['cancelled', 'expired'].includes(command?.state) ||
    events.some(
      (e) => e.commandId === proposal.id && [2, 6].includes(e.orderState),
    )
  )
    status = 'CANCELADA';
  else if (command?.state === 'submitted') status = 'PENDENTE';
  const exits = events.filter(
    (e) =>
      e.commandId === proposal.id &&
      e.kind === 'observed' &&
      e.deal &&
      e.entry === 1,
  );
  const exitDeals = [...new Map(exits.map((e) => [e.deal, e])).values()];
  const closedVolume = exitDeals.reduce((n, e) => n + Number(e.volume), 0);
  const resultBRL = closedVolume
    ? exitDeals.reduce(
        (n, e) =>
          n +
          Number(e.profit || 0) +
          Number(e.commission || 0) +
          Number(e.swap || 0) +
          Number(e.fee || 0),
        0,
      ) +
      unique.reduce(
        (n, e) =>
          n +
          Number(e.commission || 0) +
          Number(e.swap || 0) +
          Number(e.fee || 0),
        0,
      )
    : null;
  const tag = 'FT' + proposal.id.replaceAll('-', '').slice(0, 24),
    orderIds = new Set(
      events
        .filter((e) => e.commandId === proposal.id && e.order)
        .map((e) => e.order),
    );
  const pendingOrders = orders.filter(
    (o) =>
      o.symbol === proposal.symbol &&
      o.magic === approvalPolicy.magic &&
      (orderIds.has(o.ticket) || o.comment === tag),
  );
  const terminalOrder = events.some(
    (e) =>
      e.commandId === proposal.id &&
      e.kind === 'order-state' &&
      [2, 4, 6].includes(e.orderState),
  );
  const closed =
    filled > 0 &&
    closedVolume >= filled &&
    !position &&
    pendingOrders.length === 0 &&
    (filled + 1e-8 >= proposal.quantity || terminalOrder);
  const actualRiskBRL =
    entry !== null
      ? Math.abs(entry - proposal.sl) * proposal.pointValue * filled
      : null;
  const protection = position
    ? !position.sl || !position.tp
      ? 'FALHA: POSIÇÃO SEM SL/TP'
      : Math.abs(position.sl - proposal.sl) > 1e-6 ||
          Math.abs(position.tp - proposal.tp) > 1e-6
        ? 'PROTEÇÃO DIVERGENTE DA PROPOSTA'
        : 'SL/TP CONFIRMADOS NO MT5'
    : null;
  return {
    status: closed ? 'ENCERRADA' : status,
    protection,
    protectionFault: !!position && protection !== 'SL/TP CONFIRMADOS NO MT5',
    retcodes: events
      .filter((e) => e.commandId === proposal.id && Number.isFinite(e.retcode))
      .map((e) => ({
        kind: e.kind,
        retcode: e.retcode,
        retcodeExternal: e.retcodeExternal ?? null,
      })),
    actualRiskBRL,
    pendingOrders,
    filled,
    entry,
    closed,
    resultBRL,
    resultR:
      closed && resultBRL !== null
        ? resultBRL / (actualRiskBRL || proposal.riskBRL)
        : null,
    exitTime: closed
      ? Math.max(...exitDeals.map((e) => e.timeMsc)) / 1000
      : null,
    position: position
      ? {
          ...position,
          current: live ? position.current : null,
          profit: live ? position.profit : null,
        }
      : null,
    feedLive: live,
    uncertain: command?.state === 'dispatch_unknown',
  };
}
