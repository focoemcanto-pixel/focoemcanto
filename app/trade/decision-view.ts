import type { ScannerResult, SetupWatch } from '../../trade/scanner/types';
export const watchPriority: Record<string, number> = {
  PROPOSED: 0,
  CONFIRMED: 1,
  WAITING_TRIGGER: 2,
  FORMING: 3,
  OPEN_PAPER: 4,
};
/** Display grouping consumes the scanner's groups; it never changes evaluations or strategy ranking. */
export function observationGroups(watches: SetupWatch[], scan?: ScannerResult) {
  const active = watches
    .filter((w) => ['FORMING', 'WAITING_TRIGGER'].includes(w.state))
    .sort(
      (a, b) =>
        watchPriority[a.state] - watchPriority[b.state] ||
        b.lastAsOf - a.lastAsOf,
    );
  const groups: { watch: SetupWatch; methods: string[] }[] = [];
  for (const w of active) {
    const scannerGroup = scan?.groups.find((g) =>
      g.participants.includes(w.candidate.definition.id),
    );
    const index = groups.findIndex(
      (g) =>
        g.watch.candidate.analysis.trend === w.candidate.analysis.trend &&
        scannerGroup?.participants.includes(g.watch.candidate.definition.id),
    );
    const methods = [
      w.candidate.definition.id,
      ...w.participants.map((p) => p.id),
    ];
    if (index >= 0)
      groups[index].methods = [
        ...new Set([...groups[index].methods, ...methods]),
      ];
    else
      groups.push({
        watch: w,
        methods: [
          ...new Set([...methods, ...(scannerGroup?.participants || [])]),
        ],
      });
  }
  return groups;
}
export function marketReading(scan?: ScannerResult) {
  const regimes = scan?.regimes || [];
  const up = regimes.includes('TREND_UP'),
    down = regimes.includes('TREND_DOWN');
  return {
    bias: up && !down ? 'Alta' : down && !up ? 'Baixa' : 'Neutro',
    regime:
      regimes
        .map(
          (r) =>
            (
              ({
                TREND_UP: 'Tendência de alta',
                TREND_DOWN: 'Tendência de baixa',
                RANGE: 'Lateral',
                EXPANSION: 'Expansão',
                CONTRACTION: 'Contração',
                HIGH_VOLATILITY: 'Volatilidade elevada',
                LOW_VOLATILITY: 'Volatilidade baixa',
                UNCERTAIN: 'Contexto indefinido',
              }) as Record<string, string>
            )[r] || r,
        )
        .join(' · ') || 'Aguardando leitura',
    evaluated: scan?.candidates.length || 0,
    monitoring:
      scan?.candidates.filter(
        (c) => c.definition.enabled && c.definition.stage === 'paper',
      ).length || 0,
  };
}
