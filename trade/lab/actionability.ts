/**
 * Price + time validity of a proposal against the CURRENT quote. Never chases price: a setup whose
 * market moved away is MISSED, not re-quoted. Parameters are versioned; changing them is a new version.
 */
export const actionabilityParameters = Object.freeze({
  version: 'actionability-v1',
  /** Max adverse-to-plan drift of the market price beyond the reference entry, in R of the technical risk. */
  maxChaseR: 0.25,
  /** Min reward/risk still available when entering at the current market price. */
  minRRAtMarket: 1.5,
});
export type Actionability = {
  status: 'ACTIONABLE' | 'MISSED' | 'INVALIDATED' | 'EXPIRED' | 'NO_QUOTE';
  reasons: string[];
  /** Market price the order would get now (BUY at ask, SELL at bid). */
  marketPrice: number | null;
  /** Positive = market moved in the trade direction beyond the reference entry (chasing). */
  driftPoints: number | null;
  driftR: number | null;
  rrAtMarket: number | null;
  version: string;
};
export function assessActionability(
  plan: { direction: 'BUY' | 'SELL'; entry: number; stop: number; target: number; expiresAt?: number },
  quote: { bid?: number | null; ask?: number | null } | null,
  nowMs = Date.now(),
  p = actionabilityParameters,
): Actionability {
  const base = { version: p.version };
  if (plan.expiresAt !== undefined && nowMs >= plan.expiresAt)
    return { ...base, status: 'EXPIRED', reasons: ['Validade da proposta encerrada.'], marketPrice: null, driftPoints: null, driftR: null, rrAtMarket: null };
  const sign = plan.direction === 'BUY' ? 1 : -1,
    price = plan.direction === 'BUY' ? quote?.ask : quote?.bid;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0)
    return { ...base, status: 'NO_QUOTE', reasons: ['Sem cotação atual: proposta não acionável.'], marketPrice: null, driftPoints: null, driftR: null, rrAtMarket: null };
  const risk = sign * (plan.entry - plan.stop),
    drift = sign * (price - plan.entry),
    riskAtMarket = sign * (price - plan.stop),
    rewardAtMarket = sign * (plan.target - price),
    rr = riskAtMarket > 0 ? rewardAtMarket / riskAtMarket : null,
    out = { ...base, marketPrice: price, driftPoints: drift, driftR: risk > 0 ? drift / risk : null, rrAtMarket: rr };
  if (riskAtMarket <= 0)
    return { ...out, status: 'INVALIDATED', reasons: ['Preço atual já está além do stop técnico.'] };
  if (rewardAtMarket <= 0)
    return { ...out, status: 'MISSED', reasons: ['Preço atual já atingiu/ultrapassou o alvo.'] };
  const reasons: string[] = [];
  if (risk > 0 && drift / risk > p.maxChaseR)
    reasons.push(`Preço se afastou ${Math.round(drift)} pts (${(drift / risk).toFixed(2)}R) da referência; limite ${p.maxChaseR}R. Não perseguir.`);
  if (rr !== null && rr < p.minRRAtMarket)
    reasons.push(`R/R no preço atual ${rr.toFixed(2)} < ${p.minRRAtMarket}.`);
  return reasons.length ? { ...out, status: 'MISSED', reasons } : { ...out, status: 'ACTIONABLE', reasons: [] };
}
