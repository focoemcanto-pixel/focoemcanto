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
/**
 * Entry window of a READY proposal, from the BACKEND expiresAt (ms). A valid hypothesis is not an
 * entry: only a READY proposal inside its validity is "ENTRADA DISPONÍVEL"; afterwards it is expired
 * and never looks operable. `skewMs` aligns the local clock with the server's (Date header).
 */
export function entryWindow(expiresAtMs: number | undefined, nowMs: number, skewMs = 0) {
  const ms = typeof expiresAtMs === 'number' ? expiresAtMs - (nowMs + skewMs) : -1;
  return ms > 0
    ? { available: true as const, seconds: Math.ceil(ms / 1000), label: `ENTRADA DISPONÍVEL · ${Math.ceil(ms / 1000)}s` }
    : { available: false as const, seconds: 0, label: 'ENTRADA EXPIRADA · não perseguir preço' };
}
/** Server − local clock difference from an HTTP Date header (second precision); 0 when unknown. */
export function serverSkew(dateHeader: string | null, localNowMs: number) {
  const t = dateHeader ? Date.parse(dateHeader) : NaN;
  return Number.isFinite(t) && Math.abs(t - localNowMs) < 6 * 3600 * 1000 ? t - localNowMs : 0;
}
