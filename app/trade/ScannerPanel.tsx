'use client';
import { useEffect, useRef, useState, useId } from 'react';
import { observationGroups, marketReading, entryWindow, serverSkew } from './decision-view';
import type { Proposal } from '../../trade/bridge/approval';
import type {
  Hypothesis,
  ScannerResult,
  SetupWatch,
} from '../../trade/scanner/types';
const stageLabel: Record<string, string> = {
  CONFIRMED: 'CONFIRMADO',
  WAITING_TRIGGER: 'AGUARDANDO GATILHO',
  FORMING: 'FORMANDO',
  FAR: 'LONGE DO GATILHO',
  REJECTED: 'REJEITADA',
  WARMING_UP: 'AQUECENDO DADOS',
  UNAVAILABLE_DATA: 'DADOS INDISPONÍVEIS',
  DISABLED: 'DESATIVADA',
};
const blockerLabel: Record<string, string> = {
  REGIME_MISMATCH: 'contexto incompatível',
  CONTEXT_NOT_MET: 'contexto da regra ausente',
  RISK_OUT_OF_BOUNDS: 'risco técnico fora dos limites',
  INVALID_LEVELS: 'níveis inválidos',
  FEED_NOT_LIVE: 'feed antigo ou offline',
  DATA_UNAVAILABLE: 'dado ainda não fornecido pelo feed',
  WARMING_UP: 'aguardando barras da sessão atual',
  DISABLED: 'desativada',
  DIRECTION_CONFLICT: 'conflito compra × venda',
};
const labels: Record<string, string> = {
  FORMING: 'EM FORMAÇÃO',
  WAITING_TRIGGER: 'AGUARDANDO GATILHO',
  CONFIRMED: 'CONFIRMADO',
  PROPOSED: 'PROPOSTA PRONTA',
  EXPIRED: 'EXPIRADO',
  INVALIDATED: 'INVALIDADO',
  REJECTED_BY_USER: 'RECUSADO',
  ACCEPTED: 'ACEITO NO PAPER',
  OPEN_PAPER: 'PAPER ABERTO',
  CLOSED_PAPER: 'PAPER ENCERRADO',
  RISK_BLOCKED: 'BLOQUEADA POR RISCO',
  INSUFFICIENT_DATA: 'DADOS INSUFICIENTES',
  UNAVAILABLE_DATA: 'DADOS INDISPONÍVEIS',
  REJECTED: 'DESCARTADA PELAS REGRAS',
};
const num = (n?: number | null) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const time = (n: number) =>
  new Date(n * 1000).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
  });
const clock = (n: number) =>
  new Date(n * 1000).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
const money = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** One short line saying why a hypothesis is where it is. */
function hypothesisReason(h: Hypothesis) {
  if (h.stage === 'WARMING_UP')
    return h.warmup?.readyAt
      ? `${h.warmup.frames
          .filter((f) => f.have < f.need)
          .map(
            (f) =>
              `${f.timeframe === '1m' ? 'M1' : f.timeframe === '5m' ? 'M5' : 'M15'} ${f.have}/${f.need}`,
          )
          .join(' · ')} · previsto ${clock(h.warmup.readyAt)}`
      : 'aguardando barras da sessão atual';
  if (h.blockers.length)
    return `motivo: ${blockerLabel[h.blockers[0].code] || h.blockers[0].code}`;
  if (h.stage === 'CONFIRMED') return 'todas as condições obrigatórias';
  return h.missing.length ? `falta: ${h.missing[0]}` : '';
}
export default function ScannerPanel({
  source,
  cursor,
  initial,
  library = false,
  professor = false,
}: {
  source: 'mt5' | 'replay';
  cursor: number;
  initial?: ScannerResult;
  library?: boolean;
  professor?: boolean;
}) {
  const [data, setData] = useState<{
      scan: ScannerResult;
      watches: SetupWatch[];
      scope: string;
      feedLive: boolean;
      proposalBlocks?: { setupWatchId: string; strategy: string; reason: string }[];
      technicalProposals?: {
        setupWatchId: string;
        strategy: string;
        proposal: Proposal;
        observationId?: string;
        actionability?: { status: string; reasons: string[]; driftPoints: number | null };
      }[];
      riskPolicy?: {
        paper: { maxRiskBRL: number | null; source: string };
        maxContracts: number;
        pointValue: number | null;
      };
    }>(),
    [error, setError] = useState(''),
    [stats, setStats] = useState<any[]>([]),
    [drawerOpen, setDrawerOpen] = useState(false),
    [search, setSearch] = useState(''),
    [now, setNow] = useState(() => Date.now()),
    [skew, setSkew] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const dialogId = useId(),
    openButton = useRef<HTMLButtonElement>(null),
    dialogRef = useRef<HTMLDivElement>(null);
  const run = useRef(''),
    last = useRef(cursor);
  useEffect(() => {
    if (library) return;
    if (!run.current) {
      run.current =
        sessionStorage.getItem('foco-scanner-run') || crypto.randomUUID();
      sessionStorage.setItem('foco-scanner-run', run.current);
    }
    if (cursor < last.current) {
      run.current = crypto.randomUUID();
      sessionStorage.setItem('foco-scanner-run', run.current);
      setData(undefined);
    }
    last.current = cursor;
    let active = true;
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const r = await fetch(
            `/api/trade/scanner?source=${source}&cursor=${cursor}&run=${run.current}`,
            { cache: 'no-store' },
          ),
          d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (active) {
          setSkew(serverSkew(r.headers.get('Date'), Date.now()));
          setData(d);
          setError('');
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : 'Scanner indisponível');
      } finally {
        pending = false;
      }
    };
    void load();
    const timer = setInterval(load, source === 'mt5' ? 3000 : 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [source, cursor, library]);
  useEffect(() => {
    if (!drawerOpen) return;
    let active = true;
    fetch('/api/trade/strategy-metrics')
      .then((r) => r.json())
      .then((d) => {
        if (active && Array.isArray(d)) setStats(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [drawerOpen, data?.scan.asOf]);
  const scan = data?.scan || initial;
  async function watchAction(w: SetupWatch, action: string) {
    const r = await fetch('/api/trade/scanner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: w.id, scope: data?.scope, action }),
    });
    if (!r.ok) setError('Não foi possível registrar a decisão.');
    else if (action === 'discard')
      setData((d) =>
        d
          ? {
              ...d,
              watches: d.watches.map((x) =>
                x.id === w.id ? { ...x, state: 'REJECTED_BY_USER' } : x,
              ),
            }
          : d,
      );
  }
  function renderLibrary() {
    return (
      <div className="trade-scanner-library">
        <header>
          <span className="trade-eyebrow">BIBLIOTECA DE ESTRATÉGIAS</span>
          <h3>Regras abertas. Hipóteses testáveis.</h3>
          <p>
            Todas candidatas de pesquisa/PAPER. DADOS INSUFICIENTES para afirmar
            vantagem.
          </p>
        </header>
        <input
          className="trade-library-search"
          aria-label="Buscar estratégias"
          placeholder="Buscar método ou indicador…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {scan?.candidates
          .filter((c) =>
            (
              c.definition.name +
              ' ' +
              c.definition.id +
              ' ' +
              c.definition.requiredData.join(' ')
            )
              .toLocaleLowerCase('pt-BR')
              .includes(search.toLocaleLowerCase('pt-BR')),
          )
          .map((c) => {
            const m = stats.find(
              (x) =>
                x.strategy === c.definition.id &&
                x.version === c.definition.version,
            );
            return (
              <details key={c.definition.id}>
                <summary>
                  <strong>{c.definition.name}</strong>
                  <span>{labels[c.state] || c.state}</span>
                </summary>
                <p>
                  {c.definition.enabled ? 'RESEARCH · PAPER ATIVA' : 'DISABLED'}{' '}
                  · v{c.definition.version} · {c.definition.stage.toUpperCase()}{' '}
                  · {c.definition.timeframes.join(' + ')}
                </p>
                <p>Dados: {c.definition.requiredData.join(' · ')}</p>
                <p>Regimes: {c.definition.eligibleRegimes.join(', ')}</p>
                <p>{c.analysis.explanation}</p>
                <p>
                  Observações {m?.detected || 0} · Confirmados{' '}
                  {m?.confirmed || 0} · Entradas {m?.accepted || 0} · Recusas{' '}
                  {m?.rejected || 0} · Encerrados {m?.closed || 0}
                </p>
                <p>
                  {m?.sampleStatus || 'DADOS INSUFICIENTES'}
                  {m?.expectancy != null
                    ? ` · expectativa descritiva ${num(m.expectancy)}R · acerto ${num(m.winRate * 100)}%`
                    : ''}
                </p>
                <p>
                  Acumulado PAPER: {num(m?.netR)}R · {num(m?.netPoints)} pts ·
                  R$ {num(m?.netMoney)}
                </p>
                <details>
                  <summary>Condições e parâmetros</summary>
                  {c.analysis.conditions.map((x) => (
                    <p key={x.key}>
                      {x.met ? '✓' : '○'} {x.label}: {x.detail}
                    </p>
                  ))}
                  <pre>{JSON.stringify(c.definition.parameters, null, 2)}</pre>
                </details>
              </details>
            );
          })}
      </div>
    );
  }

  const grouped = observationGroups(data?.watches || [], scan),
    reading = marketReading(scan);
  const feedAvailable =
    source === 'replay' ||
    (library
      ? !!initial &&
        initial.summary.UNAVAILABLE_DATA < initial.candidates.length
      : data?.feedLive === true);
  // A watch whose structure moved away (FAR) or was blocked stays in the history, not on the desk.
  const stageNow = (id: string) =>
    scan?.hypotheses?.find((h) => h.id === id)?.stage;
  const visible = feedAvailable
    ? grouped.filter((g) => {
        const stage = stageNow(g.watch.candidate.definition.id);
        return !stage || stage === 'FORMING' || stage === 'WAITING_TRIGGER';
      })
    : [];
  const primary = visible[0];
  const desk = feedAvailable ? scan?.desk : undefined,
    coverage = scan?.desk?.coverage,
    hypotheses = scan?.hypotheses || [],
    stageCount = (stage: string) =>
      feedAvailable ? hypotheses.filter((h) => h.stage === stage).length : 0,
    nearest = (desk?.nearest || [])
      .map((id) => hypotheses.find((h) => h.id === id))
      .filter((h): h is Hypothesis => !!h),
    confirmed = feedAvailable
      ? (scan?.candidates || []).filter(
          (c) => c.state === 'CONFIRMED' && c.analysis.setup,
        )
      : [];
  const focused =
    scan?.opportunities.find((c) => c.state === 'CONFIRMED') ||
    scan?.opportunities.find((c) => c.state === 'WAITING_TRIGGER') ||
    primary?.watch.candidate;
  function closeDrawer() {
    setDrawerOpen(false);
    openButton.current?.focus();
  }
  useEffect(() => {
    if (!drawerOpen) return;
    const prior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = dialogRef.current?.querySelector<HTMLElement>('button');
    first?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDrawer();
      }
      if (e.key === 'Tab') {
        const nodes = [
          ...(dialogRef.current?.querySelectorAll<HTMLElement>(
            'button, summary, select, input, [tabindex="0"]',
          ) || []),
        ].filter((x) => x.getClientRects().length > 0);
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = prior;
      document.removeEventListener('keydown', key);
    };
  }, [drawerOpen]);
  const motor = (
    <section className="trade-motor" aria-label="Motor de estratégias">
      <div className="trade-motor-top">
        <span className="trade-eyebrow">MOTOR DE ESTRATÉGIAS</span>
        <span className="trade-motor-state">
          {source === 'mt5' && !feedAvailable ? 'AGUARDANDO FEED' : 'ATIVO'}
        </span>
      </div>
      <h3>{coverage?.registered ?? reading.evaluated} estratégias cadastradas</h3>
      <p>
        {feedAvailable ? (coverage?.operational ?? 0) : 0} operacionais com os
        dados atuais · {coverage?.awaitingData ?? 0} aguardando dados adicionais
        {feedAvailable && coverage?.warmingUp
          ? ` · ${coverage.warmingUp} aquecendo${coverage.nextReadyAt ? ` (a partir de ${clock(coverage.nextReadyAt)})` : ''}`
          : ''}
      </p>
      <small>
        {scan?.summary.CONFIRMED || 0} confirmada(s) ·{' '}
        {scan?.summary.WAITING_TRIGGER || 0} aguardando gatilho ·{' '}
        {stageCount('FORMING')} em formação · {stageCount('FAR')} longe do
        gatilho · {scan?.summary.REJECTED || 0} rejeitada(s)
      </small>
      <button
        ref={openButton}
        className="trade-motor-link"
        onClick={() => setDrawerOpen(true)}
        aria-haspopup="dialog"
        aria-controls={dialogId}
      >
        {professor
          ? 'Ver raciocínio completo'
          : library
            ? 'Ver estratégias'
            : 'Ver análise'}
      </button>
    </section>
  );
  function card(group: (typeof grouped)[number], featured = false) {
    const w = group.watch,
      c = w.candidate,
      p = c.projected,
      missing = c.analysis.conditions.find((x) => !x.met);
    return (
      <article
        className={`trade-observation ${featured ? 'featured' : ''}`}
        key={w.id}
      >
        <div className="trade-observation-heading">
          <span className="trade-eyebrow">
            {w.state === 'FORMING' ? 'SETUP EM FORMAÇÃO' : labels[w.state]}
          </span>
          <strong className={c.analysis.trend === 'down' ? 'short' : 'long'}>
            {c.analysis.trend === 'down' ? 'VENDA' : 'COMPRA'}
          </strong>
        </div>
        <h3>{c.definition.name}</h3>
        <p className="trade-observation-progress">
          {c.analysis.conditions.filter((x) => x.met).length} de{' '}
          {c.analysis.conditions.length} condições confirmadas
        </p>
        <p className="trade-observation-next">
          <span>O QUE FALTA</span>
          {c.analysis.conditions
            .filter((x) => !x.met)
            .map((x) => x.label)
            .join(' · ') ||
            missing?.label ||
            'Aguardar a proposta'}
          <small>
            Gatilho: {c.trigger}
            {c.proximity?.level != null &&
              ` · ${c.proximity.label}: ${num(c.proximity.level)}`}
            {c.proximity?.distancePoints != null &&
              c.proximity.distancePoints > 0 &&
              ` (${num(c.proximity.distancePoints)} pts)`}
          </small>
        </p>
        <p className="trade-hypothesis-note">
          Ainda não é uma recomendação de entrada.
        </p>
        {!p && <p className="trade-observation-next">Aguardando estrutura válida para calcular entrada, stop e alvo.</p>}
        {p && (
          <div className="trade-projected-levels">
            <div>
              <small>PROJEÇÃO PRELIMINAR · REFERÊNCIA</small>
              <strong>{num(p.entry)}</strong>
            </div>
            <div>
              <small>INVALIDAÇÃO PRELIMINAR</small>
              <strong>{num(p.stop)}</strong>
            </div>
            <div>
              <small>ALVO</small>
              <strong>{num(p.target)}</strong>
            </div>
            <div>
              <small>RISCO / RETORNO</small>
              <strong>1 : {num(p.rr)}</strong>
            </div>
          </div>
        )}
        <div className="trade-observation-time">
          <span>Detectado {time(w.detectedAt)}</span>
          <span>Válido até {time(w.validUntil)}</span>
        </div>
        {group.methods.length > 1 && (
          <details className="trade-confluences">
            <summary>
              {group.methods.length} métodos convergem nesta região
            </summary>
            <p>
              {group.methods
                .map(
                  (id) =>
                    scan?.candidates.find((x) => x.definition.id === id)
                      ?.definition.name || id,
                )
                .join(' · ')}
            </p>
            <small>Confluência de regras; não comprova vantagem.</small>
          </details>
        )}
        <details
          className="trade-method-explanation"
          open={professor || undefined}
        >
          <summary>Entender esta estratégia</summary>
          <p>{c.analysis.explanation}</p>
          {c.analysis.conditions.map((x) => (
            <p key={x.key}>
              {x.met ? '✓' : '○'} {x.label}: {x.detail}
            </p>
          ))}
          <p>Gatilho: {c.trigger}</p>
          {!p && <p className="trade-observation-next">Aguardando estrutura válida para calcular entrada, stop e alvo.</p>}
        {p && (
            <p>
              Região {num(p.region[0])}–{num(p.region[1])}. Stop técnico{' '}
              {num(p.stop)}; alvo de referência {num(p.target)}. Os níveis
              descrevem uma hipótese.
            </p>
          )}
          <small>v{c.definition.version} · Pesquisa/PAPER</small>
        </details>
        {c.analysis.conflicts.map((x) => (
          <p key={x} className="trade-operation-error">
            {x}
          </p>
        ))}
        <div className="trade-operation-actions">
          <button
            className="trade-primary"
            onClick={() => watchAction(w, 'follow')}
          >
            ACOMPANHAR
          </button>
          <button onClick={() => watchAction(w, 'discard')}>DESCARTAR</button>
        </div>
      </article>
    );
  }
  const drawer = drawerOpen && (
    <div
      className="trade-drawer-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeDrawer();
      }}
    >
      <div
        ref={dialogRef}
        className="trade-engine-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogId + '-title'}
        id={dialogId}
      >
        <header className="trade-drawer-heading">
          <div>
            <span className="trade-eyebrow">POR TRÁS DA LEITURA</span>
            <h2 id={dialogId + '-title'}>
              {professor ? 'Raciocínio completo' : 'Detalhes do motor'}
            </h2>
            <p>
              {coverage?.registered ?? reading.evaluated} cadastradas ·{' '}
              {feedAvailable ? (coverage?.operational ?? 0) : 0} operacionais ·{' '}
              {coverage?.awaitingData ?? 0} aguardando dados · {reading.regime}
            </p>
          </div>
          <button onClick={closeDrawer} aria-label="Fechar detalhes do motor">
            ✕
          </button>
        </header>
        <p className="trade-drawer-note">
          Regras, indicadores e condições de cada hipótese. A ordem mostra a
          proximidade do gatilho com pontuação explicada; não é ranking de
          rentabilidade e nunca confirma um setup.
        </p>
        <section className="trade-diagnostics" aria-label="Diagnóstico das estratégias">
          <span className="trade-eyebrow">
            DIAGNÓSTICO · {hypotheses.length} ESTRATÉGIAS
          </span>
          {!feedAvailable && source === 'mt5' && (
            <p className="trade-operation-error">
              Feed antigo ou offline: nenhuma hipótese é avaliada.
            </p>
          )}
          {hypotheses.map((h) => (
            <details key={h.id} data-stage={h.stage}>
              <summary>
                <strong>{h.name}</strong>
                <span>
                  {h.total > 0 &&
                  !['WARMING_UP', 'UNAVAILABLE_DATA', 'DISABLED'].includes(h.stage)
                    ? `${h.met}/${h.total} · `
                    : ''}
                  {stageLabel[h.stage]}
                </span>
                <small>{hypothesisReason(h)}</small>
              </summary>
              <p>{h.why}</p>
              {h.blockers.map((b) => (
                <p key={b.code}>
                  {blockerLabel[b.code] || b.code}: {b.message}
                </p>
              ))}
              {h.factors.length > 0 && (
                <table>
                  <caption>
                    Pontuação {h.score}/100 · posição {h.rank}. Soma dos pontos
                    dividida pelos pesos aplicáveis; não é previsão de resultado.
                  </caption>
                  <tbody>
                    {h.factors.map((f) => (
                      <tr key={f.key}>
                        <th scope="row">{f.label}</th>
                        <td>
                          {num(f.points)} / {f.weight}
                        </td>
                        <td>{f.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {h.projection && (
                <p>
                  PROJEÇÃO PRELIMINAR (não é proposta): referência{' '}
                  {num(h.projection.entry)} · invalidação{' '}
                  {num(h.projection.stop)} · alvo {num(h.projection.target)} ·
                  válida até {clock(h.validUntil)}.
                </p>
              )}
              <p>Gatilho: {h.trigger}</p>
            </details>
          ))}
        </section>
        {renderLibrary()}
      </div>
    </div>
  );
  if (library)
    return (
      <>
        {motor}
        {drawer}
      </>
    );
  return (
    <section
      className="trade-decision-scanner"
      aria-label="Setups em observação"
    >
      {error && (
        <p role="status" className="trade-operation-error">
          {error}
        </p>
      )}
      {desk?.verdict === 'CONFLICT' && (
        <div className="trade-no-opportunity" data-verdict="CONFLICT">
          <span className="trade-eyebrow">{desk.headline}</span>
          <h3>Proposta bloqueada.</h3>
          <p className="trade-operation-error">{desk.detail}</p>
        </div>
      )}
      {desk?.verdict === 'CONFIRMED' &&
        confirmed.slice(0, 1).map((c) => {
          const setup = c.analysis.setup!,
            error = data?.proposalBlocks?.find(
              (x) => x.strategy === c.definition.id,
            ),
            tpEntry = data?.technicalProposals?.find(
              (x) => x.strategy === c.definition.id,
            ),
            tp = tpEntry?.proposal,
            act = tpEntry?.actionability,
            entry = entryWindow(tp?.expiresAt, now, skew),
            blocked = tp?.proposalState === 'RISK_BLOCKED',
            perContract =
              tp?.riskPerContractBRL ??
              (data?.riskPolicy?.pointValue
                ? setup.riskPoints * data.riskPolicy.pointValue
                : null),
            limit = tp?.sizing?.maxRiskBRL ?? null,
            source = tp?.sizing?.maxRiskSource;
          return (
            <article
              className="trade-observation featured"
              data-verdict="CONFIRMED"
              data-proposal={tp?.proposalState}
              key={setup.id}
            >
              <div className="trade-observation-heading">
                <span className="trade-eyebrow">SETUP CONFIRMADO</span>
                <strong className={setup.direction === 'short' ? 'short' : 'long'}>
                  {setup.direction === 'short' ? 'VENDA' : 'COMPRA'}
                </strong>
              </div>
              <h3>{c.definition.name}</h3>
              <p className="trade-observation-progress">
                {setup.conditions.length} de {setup.conditions.length} condições
                · v{c.definition.version} · {time(setup.timestamp)}
              </p>
              <div className="trade-projected-levels">
                <div>
                  <small>ENTRADA / REFERÊNCIA</small>
                  <strong>{num(setup.entry)}</strong>
                </div>
                <div>
                  <small>STOP TÉCNICO</small>
                  <strong>{num(setup.stop)}</strong>
                </div>
                <div>
                  <small>ALVO</small>
                  <strong>{num(setup.targets[0])}</strong>
                </div>
                <div>
                  <small>RISCO TÉCNICO · R/R</small>
                  <strong>
                    {num(setup.riskPoints)} pts · 1 : {num(setup.rr)}
                  </strong>
                </div>
              </div>
              {tp && (
                <div
                  className="trade-execution-status"
                  data-state={tp.proposalState}
                  role="status"
                >
                  <span>
                    PROPOSTA TÉCNICA · STATUS DE EXECUÇÃO
                  </span>
                  <strong>
                    {blocked
                      ? tp.riskBlock?.code === 'RISK_LIMIT_NOT_CONFIGURED'
                        ? 'NÃO EXECUTÁVEL · GESTÃO DE RISCO NÃO CONFIGURADA'
                        : 'NÃO EXECUTÁVEL COM O LIMITE ATUAL'
                      : act?.status === 'EXPIRED' || (act?.status === 'ACTIONABLE' && !entry.available)
                        ? 'ENTRADA EXPIRADA · não perseguir preço · setup segue acompanhado no LAB'
                        : act?.status === 'MISSED'
                          ? 'PERDIDA · preço se afastou da referência (não perseguir)'
                          : act?.status === 'INVALIDATED'
                            ? 'INVALIDADA · preço além do stop técnico'
                            : `${entry.label} · PAPER · ${tp.quantity} contrato(s)`}
                  </strong>
                  <small>
                    Risco mínimo · 1 contrato ={' '}
                    {perContract != null ? money(perContract) : '—'} · limite
                    configurado {limit != null ? money(limit) : 'ausente'}
                    {!blocked && ` · risco total ${money(tp.riskBRL)}`}
                  </small>
                  <details>
                    <summary>
                      {blocked ? 'Entender o bloqueio' : 'Entender o tamanho'}
                    </summary>
                    {blocked ? (
                      <>
                        <p>{tp.riskBlock?.message}</p>
                        <p>
                          Diferença:{' '}
                          {tp.riskBlock?.excessBRL != null
                            ? money(tp.riskBlock.excessBRL)
                            : '—'}{' '}
                          · quantidade permitida: 0.
                        </p>
                        <p>
                          A proposta técnica segue em observação hipotética para
                          estudo. Não é uma operação PAPER nem uma ordem.
                        </p>
                      </>
                    ) : (
                      <p>
                        {tp.sizing?.rule}. A quantidade se adapta ao risco; o
                        stop técnico não é alterado.
                      </p>
                    )}
                    <p>
                      1R (orçamento de risco por operação):{' '}
                      {source || '—'}. Configure em GESTÃO DE RISCO, na mesa PAPER.
                    </p>
                  </details>
                </div>
              )}
              {!tp && error && (
                <p className="trade-operation-error" role="status">
                  PROPOSTA TÉCNICA INDISPONÍVEL · {error.reason}
                </p>
              )}
              {!blocked && !error && (
                <p className="trade-observation-next">
                  <span>PRÓXIMO PASSO</span>
                  A proposta operacional está na mesa acima. A decisão de entrar
                  é sua.
                  <small>
                    Nenhuma ordem é enviada sem a sua confirmação.
                  </small>
                </p>
              )}
            </article>
          );
        })}
      {!primary && desk?.verdict !== 'CONFIRMED' && desk?.verdict !== 'CONFLICT' && (
        <div className="trade-no-opportunity" data-verdict={desk?.verdict}>
          <span className="trade-eyebrow">NENHUMA ENTRADA AGORA</span>
          <h3>Continuarei acompanhando.</h3>
          <p>
            {source === 'mt5' && !feedAvailable
              ? 'Feed antigo ou offline. Novas confirmações estão bloqueadas.'
              : desk?.verdict === 'WARMING_UP'
                ? `${desk.detail}${coverage?.nextReadyAt ? ` Primeiras estratégias a partir de ${clock(coverage.nextReadyAt)}.` : ''}`
                : `${desk?.detail || `O motor acompanha ${reading.monitoring} estratégias.`} ${reading.regime}.`}
          </p>
        </div>
      )}
      {nearest.length > 0 &&
        (!primary || nearest.some((h) => h.stage === 'FAR')) &&
        desk?.verdict !== 'CONFLICT' && (
          <section className="trade-nearest" aria-label="Hipóteses mais próximas">
            <span className="trade-eyebrow">
              {nearest.length > 1 ? 'MAIS PRÓXIMAS' : 'MAIS PRÓXIMA'}
            </span>
            <ol>
              {nearest.map((h) => (
                <li key={h.id} title={h.why}>
                  <strong>{h.name}</strong>
                  <span>
                    {h.met}/{h.total} condições · {stageLabel[h.stage]}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      {primary && card(primary, true)}
      {visible.length > 1 && (
        <details className="trade-other-opportunities">
          <summary>Outras observações · {visible.length - 1}</summary>
          {visible.slice(1).map((g) => card(g))}
        </details>
      )}
      <section className="trade-market-reading">
        <span className="trade-eyebrow">MERCADO AGORA</span>
        <div>
          <strong>
            {feedAvailable ? reading.bias : 'Sem leitura ao vivo'}
          </strong>
          <span>{reading.regime}</span>
        </div>
        {focused && <small>Hipótese em foco: {focused.definition.name}</small>}
      </section>
      {professor && (
        <details className="trade-professor-reasoning">
          <summary>Por que o motor chegou a esta leitura?</summary>
          <p>
            {scan?.summary.REJECTED || 0} descartadas ·{' '}
            {scan?.summary.FORMING || 0} em formação ·{' '}
            {scan?.summary.CONFIRMED || 0} confirmadas.
          </p>
          <p>
            {focused?.analysis.explanation ||
              'Nenhuma hipótese elegível neste momento.'}
          </p>
        </details>
      )}
      {motor}
      <details className="trade-watch-history">
        <summary>Histórico das observações</summary>
        {data?.watches
          .slice()
          .reverse()
          .map((w) => (
            <p key={w.id}>
              {time(w.detectedAt)} · {w.candidate.definition.name} ·{' '}
              {labels[w.state] || w.state}
            </p>
          ))}
      </details>
      {drawer}
    </section>
  );
}
