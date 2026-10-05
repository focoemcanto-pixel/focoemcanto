'use client';
import { useEffect, useState } from 'react';
const num = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: d });
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const r = (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : ''}${num(v)}R`);
const when = (s: number) =>
  new Date(s * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const datasetLabel: Record<string, string> = {
  LIVE_DETECTED: 'LIVE · todos os setups (hipotético)',
  PAPER_FORWARD: 'PAPER forward',
  REPLAY: 'REPLAY',
  BACKTEST: 'BACKTEST',
  REAL: 'REAL',
};
const lifecycleLabel: Record<string, string> = {
  CONFIRMED: 'confirmado',
  PROPOSED: 'proposto',
  BLOCKED_RISK: 'bloqueado por risco',
  MISSED: 'perdido (preço se afastou)',
  INVALIDATED: 'invalidado',
  EXPIRED: 'proposta expirada',
  IGNORED: 'ignorado',
  PAPER_ACCEPTED: 'PAPER aceito',
  PAPER_ACTIVE: 'PAPER ativo',
  PAPER_CLOSED: 'PAPER encerrado',
  CANCELLED: 'cancelado (conflito)',
};
const outcomeLabel: Record<string, string> = {
  OPEN: 'em acompanhamento',
  TARGET_FIRST: 'alvo primeiro',
  STOP_FIRST: 'stop primeiro',
  AMBIGUOUS: 'ambíguo',
  EXPIRED: 'sem desfecho no horizonte',
};

/** Single-series cumulative R with crosshair tooltip; the table below is the accessible view. */
function EquityCurve({ curve }: { curve: { at: number; cumR: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (curve.length < 2) return null;
  const w = 320,
    h = 96,
    pad = 6,
    values = [0, ...curve.map((p) => p.cumR)],
    lo = Math.min(...values),
    hi = Math.max(...values),
    span = hi - lo || 1,
    x = (i: number) => pad + (i / (curve.length - 1)) * (w - 2 * pad),
    y = (v: number) => pad + (1 - (v - lo) / span) * (h - 2 * pad),
    points = curve.map((p, i) => `${x(i)},${y(p.cumR)}`).join(' '),
    p = hover === null ? null : curve[hover];
  return (
    <figure className="trade-lab-chart">
      <figcaption>Resultado acumulado (R), em ordem cronológica</figcaption>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`Curva de R acumulado: ${curve.length} resultados, final ${r(curve.at(-1)!.cumR)}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect(),
            i = Math.round((((e.clientX - box.left) / box.width) * w - pad) / ((w - 2 * pad) / (curve.length - 1)));
          setHover(Math.max(0, Math.min(curve.length - 1, i)));
        }}
      >
        <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} className="trade-lab-zero" />
        <polyline points={points} className="trade-lab-line" />
        {p && (
          <>
            <line x1={x(hover!)} x2={x(hover!)} y1={pad} y2={h - pad} className="trade-lab-cross" />
            <circle cx={x(hover!)} cy={y(p.cumR)} r={4} className="trade-lab-dot" />
          </>
        )}
      </svg>
      <p className="trade-lab-tooltip" aria-live="polite">
        {p ? `${hover! + 1}º resultado · ${when(p.at)} · acumulado ${r(p.cumR)}` : `Final: ${r(curve.at(-1)!.cumR)} em ${curve.length} resultados`}
      </p>
    </figure>
  );
}
function Distribution({ histogram, n }: { histogram: { from: number; to: number; count: number }[]; n: number }) {
  const max = Math.max(1, ...histogram.map((b) => b.count));
  return (
    <figure className="trade-lab-chart">
      <figcaption>Distribuição dos resultados (R)</figcaption>
      <div className="trade-lab-bars" role="list">
        {histogram.map((b) => (
          <div key={b.from} role="listitem" title={`${b.from}R a ${b.to}R: ${b.count} de ${n}`}>
            <span style={{ height: `${(b.count / max) * 100}%` }} />
            <small>{b.from}</small>
          </div>
        ))}
      </div>
    </figure>
  );
}
function Segment({ title, rows }: { title: string; rows: any[] }) {
  if (!rows?.length) return null;
  return (
    <table className="trade-lab-table">
      <caption>{title}</caption>
      <thead>
        <tr>
          <th scope="col">Contexto</th>
          <th scope="col">N</th>
          <th scope="col">Expectativa</th>
          <th scope="col">Acerto</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.key} data-sufficient={s.sufficient}>
            <th scope="row">{s.key}</th>
            <td>{s.n}</td>
            <td>{s.sufficient ? r(s.expectancyR) : 'amostra insuficiente'}</td>
            <td>{s.sufficient ? pct(s.winRate) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * LAB: evidence base. DATA (observations) → STATISTICS (server, deterministic) → INTERPRETATION
 * (only what the numbers support). Nothing here can enable REAL execution.
 */
export default function LabPanel() {
  const [days, setDays] = useState(90),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [note, setNote] = useState<Record<string, string>>({});
  const load = async () => {
    try {
      const res = await fetch(`/api/trade/lab?days=${days}`, { cache: 'no-store' }),
        d = await res.json();
      if (!res.ok) throw new Error(d.error || 'LAB indisponível');
      setData(d);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'LAB indisponível');
    }
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [days]);
  if (!data) return <div className="trade-lab">{error ? <p className="trade-operation-error">{error}</p> : <p>Carregando LAB…</p>}</div>;
  const t = data.today,
    min = data.models.lab.minSample;
  return (
    <div className="trade-lab">
      <header className="trade-lab-head">
        <div>
          <span className="trade-eyebrow">LAB · BASE DE EVIDÊNCIA</span>
          <h3>Setups, resultados e estatística por estratégia</h3>
          <p>
            Todo setup confirmado é registrado e acompanhado até o desfecho, operado ou não.
            Versões e origens nunca se misturam. Com N &lt; {min}, não há conclusão.
          </p>
        </div>
        <label>
          Janela{' '}
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Janela de análise">
            {[7, 30, 90, 365].map((d) => (
              <option key={d} value={d}>
                {d} dias
              </option>
            ))}
          </select>
        </label>
      </header>
      {error && <p className="trade-operation-error">{error}</p>}
      <section aria-label="Hoje" className="trade-lab-funnel">
        <span className="trade-eyebrow">HOJE · XP/MT5 LIVE</span>
        <dl>
          <dt>Detectados</dt><dd>{t.detected}</dd>
          <dt>Confirmados</dt><dd>{t.confirmed}</dd>
          <dt>PAPER</dt><dd>{t.paper}</dd>
          <dt>Ignorados</dt><dd>{t.ignored}</dd>
          <dt>Bloqueados por risco</dt><dd>{t.blockedRisk}</dd>
          <dt>Perdidos / expirados</dt><dd>{t.missed} / {t.expired}</dd>
        </dl>
        <p>
          Desfechos (hipotéticos ou PAPER): {t.outcomes.targetFirst} alvo primeiro · {t.outcomes.stopFirst} stop primeiro ·{' '}
          {t.outcomes.ambiguous} ambíguo · {t.outcomes.expired} sem desfecho · {t.outcomes.open} em acompanhamento.
        </p>
      </section>
      <section aria-label="Estratégias" className="trade-lab-strategies">
        <span className="trade-eyebrow">ESTRATÉGIAS · POR VERSÃO E ORIGEM</span>
        {!data.analytics.groups.length && <p>Nenhum setup confirmado na janela. A base começa a crescer com o feed LIVE.</p>}
        {data.analytics.groups.map((g: any) => {
          const m = g.metrics,
            enough = m.n >= min;
          return (
            <details key={`${g.strategyId}|${g.version}|${g.dataset}`} className="trade-lab-card" data-status={g.status}>
              <summary>
                <strong>
                  {g.strategyId} <small>v{g.version}</small>
                </strong>
                <span>{datasetLabel[g.dataset] || g.dataset}</span>
                <em>{g.status}</em>
                <small>
                  {g.observations} setups · N={m.n} resolvidos{g.statuses.AMBIGUOUS ? ` · ${g.statuses.AMBIGUOUS} ambíguos` : ''}
                  {g.statuses.OPEN ? ` · ${g.statuses.OPEN} abertos` : ''}
                </small>
              </summary>
              <p className="trade-lab-reason">ESTATÍSTICA · {g.reason}</p>
              <dl className="trade-lab-metrics" data-enough={enough}>
                <dt>Expectativa</dt><dd>{r(m.expectancyR)}</dd>
                <dt>Profit factor</dt><dd>{num(m.profitFactor)}</dd>
                <dt>Acerto</dt><dd>{pct(m.winRate)} ({m.wins}/{m.n})</dd>
                <dt>R médio ganho / perda</dt><dd>{r(m.avgWinR)} / {r(m.avgLossR)}</dd>
                <dt>MFE / MAE médios</dt><dd>{num(m.avgMfeR)}R / {num(m.avgMaeR)}R</dd>
                <dt>Drawdown máx.</dt><dd>{num(m.maxDrawdownR)}R</dd>
                <dt>Sequência máx. de perdas</dt><dd>{m.maxLossStreak}</dd>
                <dt>Tempo médio</dt><dd>{num(m.avgMinutes, 0)} min</dd>
              </dl>
              {!enough && <p className="trade-lab-insufficient">AMOSTRA INSUFICIENTE · N={m.n} de {min}. Números descritivos, sem conclusão de desempenho.</p>}
              <EquityCurve curve={m.curve} />
              {m.n > 0 && <Distribution histogram={m.histogram} n={m.n} />}
              <details>
                <summary>Contextos (cada contexto precisa da própria amostra)</summary>
                <Segment title="Horário (BRT)" rows={g.segments.hour} />
                <Segment title="Direção" rows={g.segments.direction} />
                <Segment title="Regime (M5, determinístico)" rows={g.segments.regime} />
                <Segment title="Tendência M5" rows={g.segments.trend5m} />
                <Segment title="R/R planejado" rows={g.segments.rr} />
                <Segment title="Dia da semana" rows={g.segments.weekday} />
              </details>
              <details>
                <summary>Ver tabela de resultados</summary>
                <table className="trade-lab-table">
                  <thead><tr><th scope="col">#</th><th scope="col">Data</th><th scope="col">R acumulado</th></tr></thead>
                  <tbody>{m.curve.map((p: any, i: number) => <tr key={i}><td>{i + 1}</td><td>{when(p.at)}</td><td>{r(p.cumR)}</td></tr>)}</tbody>
                </table>
              </details>
            </details>
          );
        })}
      </section>
      <section aria-label="Setups recentes" className="trade-lab-recent">
        <span className="trade-eyebrow">SETUPS RECENTES · DADOS OBJETIVOS + SUAS NOTAS</span>
        {data.recent.map((o: any) => (
          <details key={o.id} className="trade-lab-obs">
            <summary>
              <strong>{o.direction === 'BUY' ? 'COMPRA' : 'VENDA'}</strong> {o.strategyId} v{o.version} · {o.source} · {when(o.confirmedAt)}
              <span>
                {lifecycleLabel[o.lifecycle] || o.lifecycle} · {outcomeLabel[o.outcome?.status || 'OPEN']}
                {o.outcome?.resultR != null && ` ${r(o.outcome.resultR)}`}
                {o.paper?.resultR != null && ` · PAPER ${r(o.paper.resultR)}`}
              </span>
            </summary>
            <div className="trade-lab-obs-body">
              <dl>
                <dt>AUTOMÁTICO · snapshot</dt>
                <dd>
                  ref. {num(o.snapshot.entry, 0)} · stop {num(o.snapshot.stop, 0)} · alvo {num(o.snapshot.target, 0)} · {num(o.snapshot.riskPoints, 0)} pts · R/R {num(o.snapshot.rr)}
                </dd>
                <dt>Contexto</dt>
                <dd>
                  {(o.snapshot.regimes || []).join(', ') || '—'} · M5 {o.snapshot.derived?.trend5m || '—'} · ATR M1 {num(o.snapshot.derived?.atr1m, 0)} · {o.snapshot.session?.hourBRT}h BRT
                </dd>
                <dt>Validade de preço na confirmação</dt>
                <dd>{o.actionability ? `${o.actionability.status}${o.actionability.reasons?.length ? ' · ' + o.actionability.reasons.join(' ') : ''}` : '—'}</dd>
                <dt>Desfecho</dt>
                <dd>
                  {outcomeLabel[o.outcome?.status || 'OPEN']} · MFE {num(o.outcome?.mfeR)}R · MAE {num(o.outcome?.maeR)}R · {o.outcome?.barsTracked ?? 0} min acompanhados
                  {o.outcome?.resolvedBy === 'TICKS' && ' · ordem provada por ticks'}
                </dd>
                {o.paper && (
                  <>
                    <dt>PAPER</dt>
                    <dd>
                      entrada {num(o.paper.entry, 0)} (planejada {num(o.paper.plannedEntry, 0)}, slippage {num(o.paper.slippagePoints, 0)} pts) · {o.paper.exitReason || 'aberto'} ·{' '}
                      {r(o.paper.resultR)} · MFE {num(o.paper.mfeR)}R · MAE {num(o.paper.maeR)}R · {num(o.paper.durationMinutes, 0)} min
                    </dd>
                  </>
                )}
                <dt>SUAS NOTAS</dt>
                <dd>{o.notes?.length ? o.notes.map((n: any, i: number) => <p key={i}>{n.note}</p>) : 'Nenhuma.'}</dd>
              </dl>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const text = (note[o.id] || '').trim();
                  if (!text) return;
                  const res = await fetch('/api/trade/lab', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'note', id: o.id, note: text }) });
                  if (res.ok) {
                    setNote({ ...note, [o.id]: '' });
                    load();
                  } else setError('Não foi possível salvar a anotação.');
                }}
              >
                <label>
                  Por que aceitei/recusei, como me senti, erro percebido
                  <textarea value={note[o.id] || ''} maxLength={4000} onChange={(e) => setNote({ ...note, [o.id]: e.target.value })} />
                </label>
                <button type="submit">Salvar anotação</button>
              </form>
            </div>
          </details>
        ))}
      </section>
      <details className="trade-lab-models">
        <summary>Critérios, modelos e versões</summary>
        <p>
          {data.models.lab.version}: AMOSTRA INSUFICIENTE com N &lt; {data.models.lab.minSample}; PROMISSORA com N ≥ {data.models.lab.promisingSample}, expectativa ≥{' '}
          {data.models.lab.promisingExpectancyR}R e profit factor ≥ {data.models.lab.promisingProfitFactor}; DEGRADANDO quando as últimas{' '}
          {data.models.lab.degradationWindow} têm expectativa negativa com a total positiva; senão EM OBSERVAÇÃO. Acerto sozinho nunca qualifica.
        </p>
        <p>
          {data.models.outcome.version}: barras M1 após a confirmação, horizonte {data.models.outcome.horizonBars} min; stop e alvo no mesmo candle = ambíguo, salvo prova por ticks.{' '}
          {data.models.actionability.version}: não persegue preço acima de {data.models.actionability.maxChaseR}R nem com R/R no mercado &lt; {data.models.actionability.minRRAtMarket}.
        </p>
        <p>Registry: {data.registry.length} versões de estratégia com hash de configuração.</p>
      </details>
    </div>
  );
}
