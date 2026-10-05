import { config, type BridgeEnv } from './config';
import { validateCandles } from '../core/providers';
export type Tick = {
  symbol: string;
  timeMsc: number;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  flags: number;
};
export type CommandAction =
  | 'BUY'
  | 'SELL'
  | 'CLOSE'
  | 'SLTP'
  | 'MODIFY'
  | 'CANCEL';
export type BrokerCommand = {
  id: string;
  action: CommandAction;
  symbol: string;
  volume: number;
  sl: number;
  tp: number;
  price: number;
  ticket: string;
  expiresAt: number;
  signature?: string;
  signatureVersion?: number;
  referencePrice?: number;
  maxRiskBRL?: number;
  maxLossBRL?: number;
  maxSlippagePoints?: number;
};
export interface BrokerExecutionProvider {
  submit(command: BrokerCommand): Promise<unknown>;
  state(): Promise<unknown>;
}
export function validateBatch(value: any, env: BridgeEnv) {
  const c = config(env);
  if (
    !value ||
    value.bridgeId !== c.bridgeId ||
    value.symbol !== c.symbol ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(value.session || '') ||
    !Number.isSafeInteger(value.batch) ||
    value.batch < 0
  )
    throw new Error('Identidade/batch inválido');
  if (
    !/^[a-f0-9]{64}$/.test(value.accountHash || '') ||
    (c.accountHash && value.accountHash !== c.accountHash)
  )
    throw new Error('Conta divergente');
  if (
    !Array.isArray(value.ticks) ||
    value.ticks.length > 1000 ||
    !Array.isArray(value.candles) ||
    value.candles.length > 2000 ||
    !Array.isArray(value.events) ||
    value.events.length > 200
  )
    throw new Error('Lote inválido');
  for (const tick of value.ticks)
    if (
      tick.symbol !== c.symbol ||
      !Number.isSafeInteger(tick.timeMsc) ||
      tick.timeMsc < 0 ||
      ![tick.bid, tick.ask, tick.last, tick.volume, tick.flags].every(
        Number.isFinite,
      ) ||
      [tick.bid, tick.ask, tick.last, tick.volume].some((n: number) => n < 0)
    )
      throw new Error('Tick inválido');
  validateCandles(value.candles);
  if (
    value.candles.some(
      (x: any) =>
        x.symbol !== c.symbol || x.timestamp + 60 > Date.now() / 1000 + 2,
    )
  )
    throw new Error('Candle não fechado/símbolo inválido');
  if (
    !value.state ||
    typeof value.state.connected !== 'boolean' ||
    typeof value.state.executionAllowed !== 'boolean' ||
    !Array.isArray(value.state.positions) ||
    !Array.isArray(value.state.orders) ||
    value.state.positions.length > 100 ||
    value.state.orders.length > 100
  )
    throw new Error('Estado inválido');
  for (const row of [...value.state.positions, ...value.state.orders]) {
    if (
      !/^\d{1,20}$/.test(row.ticket || '') ||
      typeof row.symbol !== 'string' ||
      !Number.isFinite(row.volume) ||
      row.volume < 0
    )
      throw new Error('Posição/ordem inválida');
  }
  if (!Number.isFinite(value.state.tickSize) || value.state.tickSize <= 0)
    throw new Error('Tick size inválido');
  for (const event of value.events)
    if (
      !/^[a-zA-Z0-9:_-]{1,120}$/.test(event.id || '') ||
      typeof event.kind !== 'string'
    )
      throw new Error('Evento inválido');
  return value;
}
export function validateCommand(value: any, env: BridgeEnv): BrokerCommand {
  const c = config(env);
  if (!c.execution || !c.accountHash)
    throw new Error('Execução real bloqueada');
  if (
    !value ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value.id || '') ||
    !['BUY', 'SELL', 'CLOSE', 'SLTP', 'MODIFY', 'CANCEL'].includes(
      value.action,
    ) ||
    value.symbol !== c.symbol
  )
    throw new Error('Comando inválido');
  if (
    ![value.volume, value.sl, value.tp, value.price, value.expiresAt].every(
      Number.isFinite,
    ) ||
    value.volume < 0 ||
    value.volume > c.maxContracts ||
    (['BUY', 'SELL', 'CLOSE'].includes(value.action) &&
      (!Number.isInteger(value.volume) || value.volume < 1)) ||
    [value.sl, value.tp, value.price].some((n: number) => n < 0)
  )
    throw new Error('Volume/preços inválidos');
  if (
    ['BUY', 'SELL'].includes(value.action) &&
    (value.sl <= 0 || value.tp <= 0)
  )
    throw new Error('SL e TP obrigatórios');
  if (
    !/^\d{1,20}$/.test(value.ticket || '') ||
    (!['BUY', 'SELL'].includes(value.action) && value.ticket === '0')
  )
    throw new Error('Ticket inválido');
  if (value.expiresAt <= Date.now() || value.expiresAt > Date.now() + 30000)
    throw new Error('Expiração máxima: 30 segundos');
  return value;
}
export function commandCanonical(c: BrokerCommand) {
  return [
    'CMD2',
    c.id,
    c.action,
    c.symbol,
    c.volume.toFixed(8),
    c.sl.toFixed(8),
    c.tp.toFixed(8),
    c.price.toFixed(8),
    c.ticket,
    c.expiresAt,
    (c.referencePrice || 0).toFixed(8),
    (c.maxRiskBRL || 0).toFixed(8),
    (c.maxLossBRL || 0).toFixed(8),
    (c.maxSlippagePoints || 0).toFixed(8),
  ].join('|');
}
export function commandWire(command: BrokerCommand | null) {
  if (command?.signatureVersion === 2) {
    if (!/^[a-f0-9]{64}$/.test(command.signature || ''))
      throw new Error('Comando sem assinatura');
    return 'OK\n' + commandCanonical(command) + '|' + command.signature + '\n';
  }
  if (!command) return 'OK\n';
  return (
    'OK\nCMD|' +
    [
      command.id,
      command.action,
      command.symbol,
      command.volume,
      command.sl,
      command.tp,
      command.price,
      command.ticket,
      command.expiresAt,
    ].join('|') +
    '\n'
  );
}
