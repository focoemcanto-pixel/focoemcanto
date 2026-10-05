import type { StrategyCandidate } from './types';

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
