import type { Analysis } from '../core/types';
export const approvalPolicy = {
  proposalLifetimeMs: 30000,
  paperPointValue: 0.2,
  paperCurrency: 'BRL',
  magic: '706032601',
} as const;
export type Proposal = {
  id: string;
  mode: 'PAPER' | 'REAL';
  source: 'replay' | 'mt5';
  symbol: string;
  direction: 'BUY' | 'SELL';
  entryMethod: 'MARKET';
  entry: number;
  sl: number;
  tp: number;
  quantity: number;
  pointValue: number;
  pointValueSource?: string;
  riskPoints: number;
  riskBRL: number;
  potentialPoints: number;
  potentialBRL: number;
  rr: number;
  setup: NonNullable<Analysis['setup']>;
  asOf: number;
  expiresAt: number;
  cursor: number;
  inspectionOnly?: boolean;
  scope?: string;
  setupWatchId?: string;
};
export interface ExecutionApprovalProvider {
  approve(
    p: Proposal,
    intent?: { command: import('./protocol').BrokerCommand; nonce: string },
  ): Promise<unknown>;
}
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
  },
  now = Date.now(),
): Proposal {
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
    quantity: options.quantity,
    pointValue: options.pointValue,
    pointValueSource: options.pointValueSource,
    riskPoints: risk,
    riskBRL: risk * options.pointValue * options.quantity,
    potentialPoints: potential,
    potentialBRL: potential * options.pointValue * options.quantity,
    rr: potential / risk,
    setup: s,
    asOf: options.asOf,
    expiresAt: now + approvalPolicy.proposalLifetimeMs,
    cursor: options.cursor,
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
