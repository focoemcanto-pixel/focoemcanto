import { approvalPolicy } from './approval';
/** Explicit PAPER compatibility for the original EA; never used to authorize REAL. */
export function instrumentValue(symbol: string, mode: string, state?: any) {
  const value = Number(state?.tickValue) / Number(state?.tickSize);
  if (Number.isFinite(value) && value > 0 && state?.currency === 'BRL')
    return { pointValue: value, currency: 'BRL', source: 'mt5' };
  if (state?.currency && state.currency !== 'BRL')
    throw new Error('Moeda do contrato incompatível');
  if (mode === 'PAPER' && /^WIN(?:[GJMQVZ]\d{2})?$/.test(symbol))
    return {
      pointValue: approvalPolicy.paperPointValue,
      currency: approvalPolicy.paperCurrency,
      source: 'win-specification-paper',
    };
  throw new Error(
    'Metadados monetários indisponíveis. Atualize o EA; REAL permanece bloqueado.',
  );
}

export function instrumentSpecification(
  symbol: string,
  state?: any,
): import('../scanner/types').InstrumentSpecification {
  if (!/^WIN(?:[GJMQVZ]\d{2})?$/.test(symbol))
    throw new Error('Instrumento ainda não validado');
  const value = instrumentValue(symbol, 'PAPER', state),
    tickSize = Number(state?.tickSize) || 5;
  return {
    symbol,
    assetClass: 'index-future',
    tickSize,
    tickValue: value.pointValue * tickSize,
    pointValue: value.pointValue,
    minVolume: 1,
    volumeStep: 1,
    currency: 'BRL',
    session: { timezone: 'America/Sao_Paulo', open: '09:00', close: '18:25' },
    contractExpiration: null,
    rollover: { requiresValidation: true },
  };
}
