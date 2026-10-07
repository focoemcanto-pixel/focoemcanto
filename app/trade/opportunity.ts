import { entryWindow } from './decision-view';
/**
 * OPORTUNIDADE ATIVA: pure selection rules for the global opportunity card (no React, no I/O).
 *
 * - Time always comes from the backend expiresAt (absolute) plus the server clock skew: minimizing,
 *   restoring, re-rendering or refreshing can never extend it.
 * - PAPER: a READY proposal awaiting confirmation, inside its validity and ACTIONABLE on the live quote.
 * - REAL: the same technical setup, sized with the REAL limit (policy, tightened by the EA). A setup blocked
 *   only by the PAPER 1R can still be a REAL opportunity, and vice versa. This is a preview: ENTRAR REAL
 *   re-proposes under the REAL policy server-side, which is the authority.
 * - Zero contracts (or no REAL limit) is never an opportunity: it becomes a small notice without entry.
 * - Several opportunities form ONE deterministic queue (earliest expiry first, then oldest, then id): a single
 *   card is shown; the others wait in the queue with their own expiry. Nothing is dropped silently.
 */
export type OpportunityRow = {
  id: string;
  state: string;
  created_at?: string;
  payload: any;
  actionability?: { status: string; reasons?: string[]; marketPrice?: number | null };
};
export type Opportunity = {
  id: string;
  row: OpportunityRow;
  mode: 'PAPER' | 'REAL';
  expiresAt: number;
  seconds: number;
  /** Contracts for the selected environment (REAL: preview from the REAL limit). */
  quantity: number;
  riskBRL: number;
  oneRBRL: number | null;
};
export type BlockedNotice = { id: string; row: OpportunityRow; minimumRiskBRL: number | null; maxRiskBRL: number | null };
export type RealLimits = { maxRiskBRL: number | null; maxContracts: number };
const AWAITING = 'AGUARDANDO CONFIRMAÇÃO',
  BLOCKED = 'BLOQUEADA POR RISCO';
const pos = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const riskBlocked = (r: OpportunityRow) => r.state === BLOCKED || r.payload?.proposalState === 'RISK_BLOCKED';
const perContract = (r: OpportunityRow) =>
  pos(r.payload?.riskPerContractBRL) ? r.payload.riskPerContractBRL : pos(r.payload?.riskPoints) && pos(r.payload?.pointValue) ? r.payload.riskPoints * r.payload.pointValue : null;
/** Technical validity shared by both environments (time + live price); null when still valid. */
function technicalBlock(r: OpportunityRow, nowMs: number, skewMs: number): string | null {
  if (r.payload?.inspectionOnly) return 'INSPECTION_ONLY';
  if (!entryWindow(r.payload?.expiresAt, nowMs, skewMs).available) return 'EXPIRED';
  if (r.payload?.source === 'mt5' && r.actionability?.status !== 'ACTIONABLE') return r.actionability?.status || 'NO_QUOTE';
  return null;
}
/** Contracts in the selected environment; 0 = blocked by risk. Never moves the stop. */
export function sizeFor(r: OpportunityRow, mode: 'PAPER' | 'REAL', real?: RealLimits): { quantity: number; oneRBRL: number | null } {
  if (mode === 'PAPER' || r.payload?.mode === 'REAL')
    return { quantity: riskBlocked(r) ? 0 : Number(r.payload?.quantity) || 0, oneRBRL: r.payload?.riskSettings?.oneRBRL ?? r.payload?.sizing?.maxRiskBRL ?? null };
  const limit = real && pos(real.maxRiskBRL) ? real.maxRiskBRL : null,
    each = perContract(r);
  if (limit === null || each === null) return { quantity: 0, oneRBRL: limit };
  return { quantity: Math.max(0, Math.min(Math.floor(limit / each + 1e-9), Math.max(0, Math.trunc(real!.maxContracts) || 0))), oneRBRL: limit };
}
/** Why a proposal is not (or no longer) an actionable opportunity in this environment; null when it is one. */
export function notActionable(r: OpportunityRow, nowMs: number, skewMs = 0, mode: 'PAPER' | 'REAL' = r.payload?.mode, real?: RealLimits): string | null {
  const copilotInReal = mode === 'REAL' && r.payload?.mode === 'PAPER';
  if (riskBlocked(r) && !copilotInReal) return 'RISK_BLOCKED';
  if (!(r.state === AWAITING || (copilotInReal && r.state === BLOCKED))) return r.state === 'EXPIRADA' ? 'EXPIRED' : 'NOT_AWAITING';
  const tech = technicalBlock(r, nowMs, skewMs);
  if (tech) return tech;
  return sizeFor(r, mode, real).quantity >= 1 ? null : 'RISK_BLOCKED';
}
export function opportunityQueue(
  rows: OpportunityRow[],
  opts: { mode: 'PAPER' | 'REAL'; source: string; nowMs: number; skewMs?: number; dismissed?: Set<string>; real?: RealLimits },
): Opportunity[] {
  const own = (r: OpportunityRow) => r.payload?.source === opts.source && (r.payload?.mode === opts.mode || (opts.mode === 'REAL' && r.payload?.mode === 'PAPER'));
  return rows
    .filter((r) => own(r) && !opts.dismissed?.has(r.id) && notActionable(r, opts.nowMs, opts.skewMs, opts.mode, opts.real) === null)
    // One card per setup: a REAL proposal of the same setup replaces the Copilot's PAPER one.
    .filter((r, _, all) => !(opts.mode === 'REAL' && r.payload.mode === 'PAPER' && all.some((o) => o !== r && o.payload?.mode === 'REAL' && o.payload?.setup?.id === r.payload?.setup?.id)))
    .map((r) => {
      const s = sizeFor(r, opts.mode, opts.real),
        each = perContract(r) ?? 0;
      return {
        id: r.id,
        row: r,
        mode: opts.mode,
        expiresAt: r.payload.expiresAt as number,
        seconds: entryWindow(r.payload.expiresAt, opts.nowMs, opts.skewMs).seconds,
        quantity: s.quantity,
        riskBRL: opts.mode === 'PAPER' || r.payload.mode === 'REAL' ? Number(r.payload.riskBRL) : each * s.quantity,
        oneRBRL: s.oneRBRL,
      };
    })
    .sort((a, b) => a.expiresAt - b.expiresAt || String(a.row.created_at ?? '').localeCompare(String(b.row.created_at ?? '')) || a.id.localeCompare(b.id));
}
/** Setups blocked by risk in this environment, still technically valid: small notices, never an entry. */
export function blockedNotices(
  rows: OpportunityRow[],
  opts: { mode: 'PAPER' | 'REAL'; source: string; nowMs: number; skewMs?: number; dismissed?: Set<string>; real?: RealLimits },
): BlockedNotice[] {
  return rows
    .filter((r) => r.payload?.source === opts.source && !opts.dismissed?.has(r.id))
    .filter((r) => (opts.mode === 'PAPER' ? r.payload?.mode === 'PAPER' && riskBlocked(r) : r.payload?.mode === 'PAPER' && (r.state === AWAITING || r.state === BLOCKED)))
    .filter((r) => entryWindow(r.payload?.expiresAt, opts.nowMs, opts.skewMs).available && sizeFor(r, opts.mode, opts.real).quantity < 1)
    .map((r) => ({
      id: r.id,
      row: r,
      minimumRiskBRL: perContract(r) ?? r.payload?.riskBlock?.minimumRiskBRL ?? null,
      maxRiskBRL: opts.mode === 'PAPER' ? r.payload?.riskBlock?.maxRiskBRL ?? null : opts.real?.maxRiskBRL ?? null,
    }));
}
/** "mm:ss" from whole seconds. */
export const clockLabel = (seconds: number) => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;
/**
 * Presentation state per opportunity: only open/minimized. It never stores time, so minimize/restore can't
 * change the deadline (which is always recomputed from expiresAt).
 */
export type CardView = Record<string, 'open' | 'minimized'>;
export const minimize = (v: CardView, id: string): CardView => ({ ...v, [id]: 'minimized' });
export const restore = (v: CardView, id: string): CardView => ({ ...v, [id]: 'open' });
/** Opportunities that left the queue between two evaluations, for auditing (expired vs invalidated). */
export function departures(
  before: Opportunity[],
  rows: OpportunityRow[],
  opts: { nowMs: number; skewMs?: number; mode: 'PAPER' | 'REAL'; real?: RealLimits },
) {
  const out: { id: string; kind: 'OPPORTUNITY_EXPIRED' | 'OPPORTUNITY_INVALIDATED'; reason: string }[] = [];
  for (const o of before) {
    const r = rows.find((x) => x.id === o.id) ?? { ...o.row, state: 'GONE' };
    const why = notActionable(r, opts.nowMs, opts.skewMs, opts.mode, opts.real);
    if (why === null) continue;
    out.push({ id: o.id, kind: why === 'EXPIRED' ? 'OPPORTUNITY_EXPIRED' : 'OPPORTUNITY_INVALIDATED', reason: why });
  }
  return out;
}
/** Sanitized, operator-facing reason for an opportunity that stopped being actionable. */
export const invalidationText: Record<string, string> = {
  EXPIRED: 'OPORTUNIDADE EXPIRADA · não perseguir preço.',
  MISSED: 'OPORTUNIDADE ENCERRADA · o preço se afastou da referência.',
  INVALIDATED: 'OPORTUNIDADE INVALIDADA · o preço passou do stop técnico.',
  NO_QUOTE: 'OPORTUNIDADE SUSPENSA · feed sem cotação LIVE.',
  RISK_BLOCKED: 'OPORTUNIDADE BLOQUEADA POR RISCO.',
  NOT_AWAITING: 'OPORTUNIDADE ENCERRADA NO SERVIDOR.',
  INSPECTION_ONLY: 'Proposta só de inspeção.',
};
