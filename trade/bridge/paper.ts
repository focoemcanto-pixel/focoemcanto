import type { ExecutionApprovalProvider } from './approval';
import type { Candle } from '../core/types';
import type { Proposal } from './approval';
import { isExecutable } from './approval';
/** Causal execution model: market at next finalized bar open, adverse barrier wins. */
export function paperExecution(p: Proposal, candles: Candle[], previous?: any) {
  const next = candles.filter(
    (bar: Candle) => bar.symbol === p.symbol && bar.timestamp >= p.asOf,
  );
  if (previous?.exitTime) return previous;
  const first = next[0];
  if (first) {
    const sign = p.direction === 'BUY' ? 1 : -1;
    const entry = previous?.entry ?? first.open,
      openedAt = previous?.openedAt ?? first.timestamp;
    if (
      !previous?.entry &&
      (sign * (entry - p.sl) <= 0 || sign * (p.tp - entry) <= 0)
    )
      return {
        status: 'CANCELADA',
        filled: 0,
        entry: null,
        position: null,
        exit: null,
        exitTime: first.timestamp,
        exitReason: 'ENTRY_GAP_INVALIDATED',
        resultR: null,
        resultBRL: null,
        resultPoints: null,
        simulated: true,
      };
    let exit: number | null = null,
      exitTime: number | null = null,
      mfePoints: number = previous?.mfePoints ?? 0,
      maePoints: number = previous?.maePoints ?? 0;
    for (const bar of next.filter(
      (c) =>
        !previous?.lastBarTimestamp || c.timestamp > previous.lastBarTimestamp,
    )) {
      const stop = sign === 1 ? bar.low <= p.sl : bar.high >= p.sl,
        target = sign === 1 ? bar.high >= p.tp : bar.low <= p.tp,
        favorable = sign === 1 ? bar.high - entry : entry - bar.low,
        adverse = sign === 1 ? entry - bar.low : bar.high - entry;
      if (stop || target) {
        exit = stop
          ? sign === 1
            ? Math.min(p.sl, bar.open)
            : Math.max(p.sl, bar.open)
          : p.tp;
        exitTime = bar.timestamp;
        // Intrabar order is unknown: a stop bar counts the adverse fill, never its favorable extreme.
        if (stop) maePoints = Math.max(maePoints, sign * (entry - exit));
        else {
          mfePoints = Math.max(mfePoints, sign * (exit - entry));
          maePoints = Math.max(maePoints, adverse);
        }
        break;
      }
      mfePoints = Math.max(mfePoints, favorable);
      maePoints = Math.max(maePoints, adverse);
    }
    const riskPoints = Math.abs(entry - p.sl);
    const current = next[next.length - 1].close;
    return {
      status: 'EXECUTADA',
      filled: p.quantity,
      entry,
      position:
        exit === null
          ? {
              price: entry,
              current,
              profit: (current - entry) * sign * p.pointValue * p.quantity,
              sl: p.sl,
              tp: p.tp,
              volume: p.quantity,
            }
          : null,
      exit,
      exitTime,
      resultBRL:
        exit === null
          ? null
          : (exit - entry) * sign * p.pointValue * p.quantity,
      resultR:
        exit === null ? null : ((exit - entry) * sign) / Math.abs(entry - p.sl),
      resultPoints: exit === null ? null : (exit - entry) * sign,
      exitReason:
        exit === null
          ? null
          : (sign === 1 ? exit <= p.sl : exit >= p.sl)
            ? 'STOP'
            : 'TARGET',
      openedAt,
      closedAt: exitTime,
      mfePoints,
      maePoints,
      mfeR: riskPoints ? mfePoints / riskPoints : null,
      maeR: riskPoints ? maePoints / riskPoints : null,
      durationMinutes: exitTime === null ? null : (exitTime - openedAt) / 60,
      lastBarTimestamp: next[next.length - 1].timestamp,
      simulated: true,
    };
  }
  return null;
}

/**
 * Study-only observation of a RISK_BLOCKED technical proposal: same causal model, outcome in
 * points and R (MFE/MAE, duration). No quantity, no money, never a PAPER execution or an order.
 */
export function hypotheticalObservation(
  p: Proposal,
  candles: Candle[],
  previous?: any,
) {
  if (previous?.exitTime) return previous;
  const result = paperExecution({ ...p, quantity: 1 }, candles, previous);
  if (!result) return null;
  return {
    ...result,
    status: result.status === 'CANCELADA' ? 'CANCELADA' : 'OBSERVAÇÃO HIPOTÉTICA',
    filled: 0,
    position: null,
    resultBRL: null,
    hypothetical: true,
    reason: 'RISK_BLOCKED',
  };
}

/** PAPER approval never depends on live activation gates. */
export class PaperExecutionProvider implements ExecutionApprovalProvider {
  constructor(private env: import('./config').BridgeEnv) {}
  async approve(p: Proposal) {
    if (p.mode !== 'PAPER') throw new Error('Provider PAPER não executa REAL');
    if (!isExecutable(p))
      throw new Error('RISK_BLOCKED: proposta técnica sem quantidade executável.');
    const { config, rpc } = await import('./config'),
      c = config(this.env);
    return rpc(this.env, 'trade_confirm', {
      p_owner: 'focoos-admin',
      p_id: p.id,
      p_action: 'confirm',
      p_command: null,
      p_max: c.maxContracts,
      p_account: c.accountHash,
      p_max_age: c.maxAgeMs,
    });
  }
  observe(p: Proposal, candles: Candle[], previous?: any) {
    if (p.mode !== 'PAPER') throw new Error('Provider PAPER não executa REAL');
    if (!isExecutable(p))
      throw new Error('RISK_BLOCKED: use hypotheticalObservation.');
    return paperExecution(p, candles, previous);
  }
}
