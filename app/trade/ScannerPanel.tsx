'use client';
import { useEffect, useRef, useState, useId } from 'react';
import { observationGroups, marketReading } from './decision-view';
import type { ScannerResult, SetupWatch } from '../../trade/scanner/types';
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
    }>(),
    [error, setError] = useState(''),
    [stats, setStats] = useState<any[]>([]),
    [drawerOpen, setDrawerOpen] = useState(false),
    [search, setSearch] = useState('');
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
  const visible = feedAvailable ? grouped : [];
  const primary = visible[0];
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
      <h3>{reading.monitoring} estratégias monitoradas</h3>
      <p>
        {scan?.summary.CONFIRMED || 0} confirmada(s) ·{' '}
        {scan?.summary.WAITING_TRIGGER || 0} aguardando gatilho
      </p>
      <small>
        {reading.evaluated} avaliações, incluindo hipóteses sem dados. O motor
        continua trabalhando nos bastidores.
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
          <span className="trade-eyebrow">{labels[w.state]}</span>
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
          {missing?.label || 'Aguardar a proposta'}
          <small>{c.trigger}</small>
        </p>
        {!p && <p className="trade-observation-next">Aguardando estrutura válida para calcular entrada, stop e alvo.</p>}
        {p && (
          <div className="trade-projected-levels">
            <div>
              <small>PROJEÇÃO PRELIMINAR</small>
              <strong>{num(p.entry)}</strong>
            </div>
            <div>
              <small>STOP TÉCNICO</small>
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
              {reading.evaluated} estratégias avaliadas ·{' '}
              {scan?.summary.REJECTED || 0} descartadas · {reading.regime}
            </p>
          </div>
          <button onClick={closeDrawer} aria-label="Fechar detalhes do motor">
            ✕
          </button>
        </header>
        <p className="trade-drawer-note">
          Regras, indicadores e condições de cada hipótese. A primeira hipótese
          em foco representa o estado atual; não há ranking de rentabilidade.
        </p>
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
      {!primary && (
        <div className="trade-no-opportunity">
          <span className="trade-eyebrow">
            {scan?.summary.CONFIRMED && feedAvailable
              ? 'HIPÓTESE CONFIRMADA'
              : 'NENHUMA ENTRADA AGORA'}
          </span>
          <h3>
            {scan?.summary.CONFIRMED && feedAvailable
              ? 'Confira a proposta PAPER.'
              : 'Continuarei acompanhando.'}
          </h3>
          <p>
            {source === 'mt5' && !feedAvailable
              ? 'Feed antigo ou offline. Novas confirmações estão bloqueadas.'
              : `O motor acompanha ${reading.monitoring} estratégias. ${reading.regime}.`}
          </p>
        </div>
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
