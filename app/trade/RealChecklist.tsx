'use client';
/**
 * REAL checklist grouped by what each pending item needs: infrastructure (technical, fixable without
 * any risk decision), the operator's own decisions, deliberate session controls and per-order checks.
 * A risk decision not yet taken is never presented as a technical failure. Display only: the server
 * decides every gate.
 */
const groups: { kind: string; title: string; hint: string }[] = [
  { kind: 'TECHNICAL', title: 'Infraestrutura', hint: 'configuração técnica; nenhuma decisão de risco' },
  { kind: 'DECISION', title: 'Decisões do operador', hint: 'só você decide; nada é preenchido por suposição' },
  { kind: 'SESSION', title: 'Controles de sessão', hint: 'ação humana deliberada; nunca automática' },
  { kind: 'OPERATION', title: 'Por ordem', hint: 'revalidado no servidor a cada ordem' },
];
export default function RealChecklist({ gates }: { gates: any[] }) {
  return (
    <div className="trade-real-groups">
      {groups.map((grp) => {
        const list = gates.filter((g) => (g.kind || 'TECHNICAL') === grp.kind);
        if (!list.length) return null;
        const pending = list.filter((g) => !g.ok).length;
        return (
          <section key={grp.kind} data-kind={grp.kind} aria-label={grp.title}>
            <h4>
              {grp.title} <small>{pending ? `${pending} pendente(s) · ${grp.hint}` : 'tudo certo'}</small>
            </h4>
            <div role="list">
              {list.map((g) => (
                <div key={g.key} data-ok={g.ok} role="listitem">
                  <strong>
                    {g.ok ? '✓' : '○'} {g.label}
                  </strong>
                  {!g.ok && (
                    <>
                      <small>{g.action || g.reason}</small>
                      {(g.checks || []).filter((x: any) => !x.ok).length > 1 && (
                        <ul>
                          {g.checks
                            .filter((x: any) => !x.ok)
                            .map((x: any) => (
                              <li key={x.label} data-kind={x.kind}>
                                {x.kind === 'DECISION' ? 'Você decide · ' : ''}
                                {x.label}: {x.action}
                              </li>
                            ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
