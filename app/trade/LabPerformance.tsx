'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
/**
 * DESEMPENHO DAS ESTRATÉGIAS. Answers "se eu tivesse seguido as entradas válidas, teria ganhado ou
 * perdido?" from the persisted LAB data only (server computes; nothing is kept in the browser).
 * Progressive disclosure: Resumo → Estratégias → Evolução → Dias → Drill-down → Diagnóstico.
 */
const num = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: d }));
const pct = (v: number | null | undefined) => (v == null ? '—' : `${num(v * 100, 1)}%`);
const r = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${num(v)}R`);
const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const pf = (m: { profitFactor: number | null; wins: number; losses: number }) =>
  m.profitFactor != null ? num(m.profitFactor) : m.wins > 0 && m.losses === 0 ? '∞' : '—';
const hhmm = (s: number) =>
  new Date(s * 1000).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
const dm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const periods = [
  ['today', 'Hoje'],
  ['5', '5 pregões'],
  ['20', '20 pregões'],
  ['30d', '30 dias'],
  ['custom', 'Personalizado'],
] as const;
const datasets = [
  ['LIVE_DETECTED', 'LIVE DETECTED'],
  ['PAPER_FORWARD', 'PAPER FORWARD'],
  ['REPLAY', 'REPLAY'],
  ['BACKTEST', 'BACKTEST'],
] as const;
const outcomeText: Record<string, string> = {
  TARGET_FIRST: 'ALVO',
  STOP_FIRST: 'STOP',
  AMBIGUOUS: 'AMBÍGUO',
  EXPIRED: 'SEM DESFECHO',
  OPEN: 'AGUARDANDO',
};
const stageText: Record<string, string> = {
  EXECUTABLE: 'executável',
  LEGACY: 'legado (antes da gestão de risco)',
  BLOCKED_RISK: 'bloqueada por risco',
  MISSED: 'MISSED',
  INVALIDATED: 'invalidada',
  CANCELLED: 'cancelada (conflito)',
  PENDING: 'confirmada, sem proposta',
};
const verdictTone = (v: string) => (v === 'POSITIVO' ? 'good' : v === 'NEGATIVO' ? 'bad' : 'neutral');

function Curve({ curve }: { curve: { at: number; cumR: number; strategyId: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!curve.length) return <p className="trade-perf-muted">Sem resultados decididos (alvo ou stop) no período.</p>;
  const pts = [{ at: curve[0].at, cumR: 0, strategyId: '' }, ...curve],
    w = 560,
    h = 140,
    pad = 10,
    vals = pts.map((p) => p.cumR),
    lo = Math.min(0, ...vals),
    hi = Math.max(0, ...vals),
    span = hi - lo || 1,
    x = (i: number) => pad + (i / Math.max(1, pts.length - 1)) * (w - 2 * pad),
    y = (v: number) => pad + (1 - (v - lo) / span) * (h - 2 * pad),
    p = hover === null ? null : pts[hover];
  return (
    <figure className="trade-lab-chart">
      <figcaption>Resultado acumulado em R (executáveis, uma vez por oportunidade, na ordem em que o desfecho ocorreu)</figcaption>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`R acumulado: ${curve.length} resultados, final ${r(curve.at(-1)!.cumR)}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect(),
            i = Math.round((((e.clientX - box.left) / box.width) * w - pad) / ((w - 2 * pad) / Math.max(1, pts.length - 1)));
          setHover(Math.max(0, Math.min(pts.length - 1, i)));
        }}
      >
        <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} className="trade-lab-zero" />
        <polyline points={pts.map((q, i) => `${x(i)},${y(q.cumR)}`).join(' ')} className="trade-lab-line" />
        {p && (
          <>
            <line x1={x(hover!)} x2={x(hover!)} y1={pad} y2={h - pad} className="trade-lab-cross" />
            <circle cx={x(hover!)} cy={y(p.cumR)} r={4} className="trade-lab-dot" />
          </>
        )}
      </svg>
      <p className="trade-lab-tooltip" aria-live="polite">
        {p && hover! > 0
          ? `${hover}º resultado · ${hhmm(p.at)} · ${p.strategyId} · acumulado ${r(p.cumR)}`
          : `Final: ${r(curve.at(-1)!.cumR)} em ${curve.length} resultados`}
      </p>
    </figure>
  );
}
function Tile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="trade-perf-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}
function SegmentTable({ title, seg, min }: { title: string; seg: { unknown: number; rows: any[] } | undefined; min: number }) {
  if (!seg || (!seg.rows.length && !seg.unknown)) return null;
  return (
    <table className="trade-lab-table">
      <caption>
        {title}
        {seg.unknown ? ` · ${seg.unknown} sem o dado no snapshot (não reconstruído)` : ''}
      </caption>
      <thead>
        <tr>
          <th scope="col">Segmento</th>
          <th scope="col">N</th>
          <th scope="col">W/L</th>
          <th scope="col">Resultado</th>
          <th scope="col">Expectancy</th>
        </tr>
      </thead>
      <tbody>
        {seg.rows.map((s) => (
          <tr key={s.key} data-sufficient={s.sufficient}>
            <th scope="row">{s.key}</th>
            <td>{s.n}</td>
            <td>
              {s.wins}/{s.losses}
            </td>
            <td>{r(s.resultR)}</td>
            <td>{s.sufficient ? r(s.expectancyR) : `amostra insuficiente (N<${min})`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function LabPerformance() {
  const [period, setPeriod] = useState('today'),
    [dataset, setDataset] = useState('LIVE_DETECTED'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [focus, setFocus] = useState<{
      kind: 'strategy' | 'day';
      key: string;
      label: string;
    } | null>(null),
    [showAll, setShowAll] = useState(false);
  const apiDataset = dataset === 'PAPER_FORWARD' ? 'LIVE_DETECTED' : dataset;
  const load = async () => {
    try {
      const q = new URLSearchParams({
        view: 'performance',
        period,
        dataset: apiDataset,
      });
      if (period === 'custom') {
        if (!from) return;
        q.set('from', from);
        q.set('to', to || from);
      }
      const res = await fetch(`/api/trade/lab?${q}`, { cache: 'no-store' }),
        d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Desempenho indisponível');
      setData(d);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Desempenho indisponível');
    }
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [period, apiDataset, from, to]);
  const drill = useMemo(() => {
    if (!data) return [];
    let rows = data.rows as any[];
    if (focus?.kind === 'day') rows = rows.filter((x) => x.date === focus.key);
    if (focus?.kind === 'strategy') {
      const g = data.strategies.find((s: any) => `${s.strategyId}@${s.version}` === focus.key);
      rows = rows.filter((x) => g?.ids.includes(x.id));
    }
    return showAll ? rows : rows.filter((x) => x.stage === 'EXECUTABLE');
  }, [data, focus, showAll]);
  const min = data?.parameters?.minSample ?? 30;
  const paperMode = dataset === 'PAPER_FORWARD';
  return (
    <section className="trade-perf" aria-label="Desempenho das estratégias">
      <header className="trade-perf-head">
        <div>
          <span className="trade-eyebrow">LAB · DESEMPENHO DAS ESTRATÉGIAS</span>
          <h3>Se você tivesse seguido as entradas válidas, teria ganhado ou perdido?</h3>
        </div>
        <div className="trade-perf-filters">
          <div role="group" aria-label="Período" className="trade-perf-seg">
            {periods.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={period === k} onClick={() => setPeriod(k)}>
                {label}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <span className="trade-perf-dates">
              <input type="date" aria-label="De" value={from} onChange={(e) => setFrom(e.target.value)} />
              <input type="date" aria-label="Até" value={to} onChange={(e) => setTo(e.target.value)} />
            </span>
          )}
          <label>
            Dataset{' '}
            <select value={dataset} onChange={(e) => setDataset(e.target.value)} aria-label="Dataset">
              {datasets.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      {error && <p className="trade-operation-error">{error}</p>}
      {!data ? (
        <p>{period === 'custom' && !from ? 'Escolha as datas.' : 'Carregando desempenho…'}</p>
      ) : paperMode ? (
        <PaperForward data={data} min={min} />
      ) : (
        <>
          <Answer data={data} min={min} />
          <Summary data={data} />
          <Funnel f={data.funnel} />
          <section className="trade-perf-block" aria-label="Estratégias">
            <span className="trade-eyebrow">ESTRATÉGIAS · POR VERSÃO (NUNCA MISTURADAS)</span>
            <Strategies data={data} min={min} onPick={(key, label) => setFocus({ kind: 'strategy', key, label })} />
          </section>
          <section className="trade-perf-block" aria-label="Evolução">
            <span className="trade-eyebrow">EVOLUÇÃO DA AMOSTRA</span>
            <Curve curve={data.executable.curve} />
            <dl className="trade-perf-inline">
              <dt>Drawdown máximo</dt>
              <dd>{num(data.executable.maxDrawdownR)}R</dd>
              <dt>Sequência máx. de perdas</dt>
              <dd>{data.executable.maxLossStreak}</dd>
              <dt>Sequência máx. de ganhos</dt>
              <dd>{data.executable.maxWinStreak}</dd>
            </dl>
          </section>
          <section className="trade-perf-block" aria-label="Desempenho por pregão">
            <span className="trade-eyebrow">DESEMPENHO POR PREGÃO</span>
            <table className="trade-lab-table trade-perf-click">
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Trades</th>
                  <th scope="col">W</th>
                  <th scope="col">L</th>
                  <th scope="col">Sem desf.</th>
                  <th scope="col">Resultado R</th>
                  <th scope="col">Bloq. risco</th>
                </tr>
              </thead>
              <tbody>
                {data.byDay.map((d: any) => (
                  <tr key={d.date} aria-selected={focus?.kind === 'day' && focus.key === d.date}>
                    <th scope="row">
                      <button
                        type="button"
                        onClick={() =>
                          setFocus({
                            kind: 'day',
                            key: d.date,
                            label: dm(d.date),
                          })
                        }
                      >
                        {dm(d.date)}
                      </button>
                    </th>
                    <td>{d.opportunities}</td>
                    <td>{d.wins}</td>
                    <td>{d.losses}</td>
                    <td>{d.neither}</td>
                    <td>{r(d.resultR)}</td>
                    <td>{d.blocked}</td>
                  </tr>
                ))}
                {!data.byDay.length && (
                  <tr>
                    <td colSpan={7}>Nenhum pregão com dados no período.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
          <section className="trade-perf-block" aria-label="Drill-down">
            <span className="trade-eyebrow">
              DRILL-DOWN · {focus ? focus.label : 'todas do período'}
              {focus && (
                <button type="button" className="trade-perf-link" onClick={() => setFocus(null)}>
                  limpar filtro
                </button>
              )}
            </span>
            <label className="trade-perf-toggle">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> incluir não executáveis (bloqueadas, MISSED,
              invalidadas)
            </label>
            <Drill rows={drill} />
          </section>
          <details className="trade-perf-block">
            <summary>
              <span className="trade-eyebrow">DIAGNÓSTICO</span> bloqueadas por risco · invalidadas/expiradas · MFE/MAE · reentradas ·
              duplicadas/correlacionadas · segmentos · RAW vs gestão de risco · PAPER
            </summary>
            <Diagnostics data={data} min={min} />
          </details>
        </>
      )}
    </section>
  );
}
function Answer({ data, min }: { data: any; min: number }) {
  const s = data.executable;
  return (
    <section className="trade-perf-answer" data-tone={verdictTone(s.verdict)} aria-label="Resposta direta">
      <span className="trade-eyebrow">SE VOCÊ TIVESSE SEGUIDO TODAS AS ENTRADAS VÁLIDAS · {data.period.label.toUpperCase()}</span>
      <strong>{s.resultR == null ? 'Sem resultado' : r(s.resultR)}</strong>
      <em>{s.verdict}</em>
      {s.tags.filter((t: string) => t !== s.verdict).length > 0 && <small>{s.tags.filter((t: string) => t !== s.verdict).join(' · ')}</small>}
      <p>
        N={s.n} ({s.wins} alvo, {s.losses} stop) em {s.opportunities} oportunidade(s) executável(is)
        {s.duplicates ? ` (${s.records} propostas; ${s.duplicates} duplicata(s) econômica(s) contada(s) uma vez)` : ''}. {s.neither} sem desfecho
        {s.neitherMarkedR != null ? ` (marcado a mercado ${r(s.neitherMarkedR)}, fora do resultado)` : ''}, {s.ambiguous} ambígua(s), {s.open} aguardando.{' '}
        {s.reason}
      </p>
      <p>
        {s.brl.valueBRL != null
          ? `Equivalente: ${brl(s.brl.valueBRL)} (${s.brl.covered}/${s.brl.total} resultados com versão de gestão de risco ${s.brl.versions.map((v: number) => `v${v}`).join(', ')}; cada um com o 1R da própria proposta).`
          : 'R$: indisponível — nenhuma proposta do período tem versão de gestão de risco configurada; o 1R atual nunca é aplicado ao passado.'}{' '}
        Custos: {data.costs.status}.
      </p>
      {data.legacy.records > 0 && (
        <p>
          À parte (não somado): {data.legacy.records} proposta(s) LEGADO anteriores à gestão de risco · {data.legacy.wins} alvo, {data.legacy.losses} stop,{' '}
          {data.legacy.neither} sem desfecho · {r(data.legacy.resultR)}.
        </p>
      )}
      <small>
        Só entram oportunidades que chegaram ao estado executável. Invalidadas e expiradas antes da entrada não são perda; MISSED não é trade; bloqueadas por
        risco ficam na análise contrafactual separada. Com N &lt; {min} não há conclusão.
      </small>
    </section>
  );
}
function Summary({ data }: { data: any }) {
  const s = data.executable,
    f = data.funnel;
  return (
    <section className="trade-perf-tiles" aria-label="Resumo do período">
      <Tile label="Oportunidades analisadas" value={f.confirmed} hint={`${f.detected} detectadas`} />
      <Tile label="Executáveis" value={s.opportunities} hint={s.duplicates ? `${s.records} propostas` : undefined} />
      <Tile label="Wins" value={s.wins} />
      <Tile label="Losses" value={s.losses} />
      <Tile label="Ambíguas" value={s.ambiguous} />
      <Tile label="Sem desfecho" value={s.neither} hint={s.open ? `${s.open} aguardando` : undefined} />
      <Tile label="Win rate" value={pct(s.winRate)} hint="só com expectancy, PF e N" />
      <Tile label="Resultado" value={r(s.resultR)} />
      <Tile label="Expectancy" value={r(s.expectancyR)} />
      <Tile label="Profit factor" value={pf(s)} />
      <Tile label="Drawdown máx." value={`${num(s.maxDrawdownR)}R`} />
      <Tile label="MFE / MAE médios" value={`${num(s.avgMfeR)} / ${num(s.avgMaeR)}R`} />
    </section>
  );
}
function Funnel({ f }: { f: any }) {
  const main = [
    ['Detectadas', f.detected],
    ['Confirmadas', f.confirmed],
    ['Propostas', f.proposed],
    ['Executáveis', f.executable],
    ['Operadas (PAPER)', f.operated],
    ['Resultado conhecido', f.resultKnown],
  ];
  return (
    <section className="trade-perf-block" aria-label="Funil das oportunidades">
      <span className="trade-eyebrow">FUNIL DAS OPORTUNIDADES</span>
      <ol className="trade-perf-funnel">
        {main.map(([k, v]) => (
          <li key={k as string}>
            <span>{k}</span>
            <strong>{v}</strong>
          </li>
        ))}
      </ol>
      <dl className="trade-perf-inline">
        <dt>Invalidadas antes da confirmação</dt>
        <dd>{f.invalidatedBeforeConfirmation}</dd>
        <dt>Expiradas antes da confirmação</dt>
        <dd>{f.expiredBeforeConfirmation}</dd>
        <dt>Invalidadas/canceladas após confirmar</dt>
        <dd>{f.invalidatedAfterConfirmation}</dd>
        <dt>Propostas expiradas sem entrada</dt>
        <dd>{f.expiredAfterProposal}</dd>
        <dt>MISSED</dt>
        <dd>{f.missed}</dd>
        <dt>Bloqueadas por risco</dt>
        <dd>{f.blockedRisk}</dd>
        {f.legacy > 0 && (
          <>
            <dt>Legado (fora do resultado)</dt>
            <dd>{f.legacy}</dd>
          </>
        )}
      </dl>
      {f.proposalRecords > 0 && (
        <p className="trade-perf-muted">
          {f.proposalRecords} registro(s) vêm de propostas anteriores à ativação do LAB: níveis e desfecho objetivos, sem snapshot de contexto (segmentos = dado
          insuficiente).
        </p>
      )}
    </section>
  );
}
function Strategies({ data, min, onPick }: { data: any; min: number; onPick: (key: string, label: string) => void }) {
  const byName = new Map<string, any[]>();
  for (const g of data.strategies) byName.set(g.strategyId, [...(byName.get(g.strategyId) || []), g]);
  const ranked = [...byName].sort(
    (a, b) => Math.max(...b[1].map((g: any) => g.resultR ?? -Infinity)) - Math.max(...a[1].map((g: any) => g.resultR ?? -Infinity)),
  );
  if (!ranked.length) return <p className="trade-perf-muted">Nenhuma oportunidade executável no período.</p>;
  return (
    <table className="trade-lab-table trade-perf-click">
      <thead>
        <tr>
          <th scope="col">Estratégia</th>
          <th scope="col">Versão</th>
          <th scope="col">N</th>
          <th scope="col">W</th>
          <th scope="col">L</th>
          <th scope="col">Win rate</th>
          <th scope="col">Resultado R</th>
          <th scope="col">Expectancy</th>
          <th scope="col">PF</th>
          <th scope="col">MFE/MAE</th>
          <th scope="col">Leitura</th>
        </tr>
      </thead>
      <tbody>
        {ranked.flatMap(([name, versions]) =>
          versions.map((g: any, i: number) => (
            <tr key={`${g.strategyId}@${g.version}`} data-sufficient={g.n >= min}>
              <th scope="row">
                {i === 0 ? (
                  <button type="button" onClick={() => onPick(`${g.strategyId}@${g.version}`, `${name} v${g.version}`)}>
                    {name}
                  </button>
                ) : (
                  ''
                )}
              </th>
              <td>
                <button type="button" onClick={() => onPick(`${g.strategyId}@${g.version}`, `${name} v${g.version}`)}>
                  v{g.version}
                </button>
              </td>
              <td>
                <strong>{g.n}</strong>
                {g.neither ? <small> +{g.neither} s/d</small> : null}
              </td>
              <td>{g.wins}</td>
              <td>{g.losses}</td>
              <td>{pct(g.winRate)}</td>
              <td>{r(g.resultR)}</td>
              <td>{r(g.expectancyR)}</td>
              <td>{pf(g)}</td>
              <td>
                {num(g.avgMfeR)}/{num(g.avgMaeR)}
              </td>
              <td>
                {g.tags.join(' · ') || g.verdict}
                {g.asParticipant ? ` · ${g.asParticipant} como participante` : ''}
              </td>
            </tr>
          )),
        )}
      </tbody>
    </table>
  );
}
function Drill({ rows }: { rows: any[] }) {
  if (!rows.length) return <p className="trade-perf-muted">Nenhuma oportunidade para este filtro.</p>;
  return (
    <div className="trade-perf-scroll">
      <table className="trade-lab-table">
        <thead>
          <tr>
            <th scope="col">Horário</th>
            <th scope="col">Estratégia</th>
            <th scope="col">Versão</th>
            <th scope="col">Dir.</th>
            <th scope="col">Entrada</th>
            <th scope="col">Stop</th>
            <th scope="col">Alvo</th>
            <th scope="col">R/R</th>
            <th scope="col">Outcome</th>
            <th scope="col">R</th>
            <th scope="col">MFE</th>
            <th scope="col">MAE</th>
            <th scope="col">Status</th>
            <th scope="col">Dataset</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id}>
              <td>
                {dm(x.date)} {hhmm(x.at)}
              </td>
              <td>{x.strategyId}</td>
              <td>v{x.version}</td>
              <td>{x.direction === 'BUY' ? 'COMPRA' : 'VENDA'}</td>
              <td>{num(x.entry, 0)}</td>
              <td>{num(x.stop, 0)}</td>
              <td>{num(x.target, 0)}</td>
              <td>{num(x.rr)}</td>
              <td>
                {outcomeText[x.outcome] || x.outcome}
                {x.expiredBy === 'SESSION_END' ? ' (fim do pregão)' : ''}
              </td>
              <td>{x.outcome === 'EXPIRED' && x.resultR != null ? `(${r(x.resultR)})` : r(x.resultR)}</td>
              <td>{num(x.mfeR)}</td>
              <td>{num(x.maeR)}</td>
              <td>
                {stageText[x.stage] || x.stage}
                {x.attempt > 1 ? ` · ${x.attempt}ª entrada` : ''}
              </td>
              <td>
                {x.dataset}
                {x.origin === 'PROPOSAL_RECORD' ? ' · registro de proposta' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function PaperForward({ data, min }: { data: any; min: number }) {
  const p = data.paperForward,
    live = data.executable;
  return (
    <section className="trade-perf-block" aria-label="PAPER forward">
      <span className="trade-eyebrow">PAPER FORWARD · OPERAÇÕES PAPER QUE VOCÊ ACEITOU</span>
      {p.trades === 0 ? (
        <p>Nenhuma operação PAPER no período. Esta será a principal evidência antes de qualquer discussão sobre REAL.</p>
      ) : (
        <section className="trade-perf-tiles">
          <Tile label="Trades PAPER" value={p.trades} hint={p.openTrades ? `${p.openTrades} abertos` : undefined} />
          <Tile label="Wins" value={p.wins} />
          <Tile label="Losses" value={p.losses} />
          <Tile label="Win rate" value={pct(p.winRate)} />
          <Tile label="Resultado R" value={r(p.resultR)} />
          <Tile label="Resultado R$" value={brl(p.resultBRL)} />
          <Tile label="Expectancy" value={r(p.expectancyR)} />
          <Tile label="PF" value={pf(p)} />
          <Tile label="Drawdown" value={`${num(p.maxDrawdownR)}R`} />
        </section>
      )}
      <p className="trade-perf-muted">{p.n < min ? `AMOSTRA INSUFICIENTE · N=${p.n} de ${min}.` : p.reason}</p>
      <table className="trade-lab-table">
        <caption>LIVE DETECTED (qualidade dos sinais, hipotético) vs PAPER FORWARD (resultado operacional) — nunca somados</caption>
        <thead>
          <tr>
            <th scope="col">Dataset</th>
            <th scope="col">N</th>
            <th scope="col">Win rate</th>
            <th scope="col">Resultado</th>
            <th scope="col">Expectancy</th>
            <th scope="col">PF</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">LIVE DETECTED · executáveis</th>
            <td>{live.n}</td>
            <td>{pct(live.winRate)}</td>
            <td>{r(live.resultR)}</td>
            <td>{r(live.expectancyR)}</td>
            <td>{pf(live)}</td>
          </tr>
          <tr>
            <th scope="row">PAPER FORWARD</th>
            <td>{p.n}</td>
            <td>{pct(p.winRate)}</td>
            <td>{r(p.resultR)}</td>
            <td>{r(p.expectancyR)}</td>
            <td>{pf(p)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
function Diagnostics({ data, min }: { data: any; min: number }) {
  const b = data.blocked,
    rc = data.riskConstrained,
    c = data.correlation,
    seg = data.segments;
  return (
    <div className="trade-perf-diag">
      <section aria-label="Bloqueadas pela gestão de risco">
        <h4>Bloqueadas pela gestão de risco (contrafactual)</h4>
        <dl className="trade-perf-inline">
          <dt>Quantidade</dt>
          <dd>
            {b.opportunities}
            {b.records !== b.opportunities ? ` (${b.records} propostas)` : ''}
          </dd>
          <dt>TARGET_FIRST</dt>
          <dd>{b.targetFirst}</dd>
          <dt>STOP_FIRST</dt>
          <dd>{b.stopFirst}</dd>
          <dt>NEITHER</dt>
          <dd>{b.neither}</dd>
          <dt>AMBIGUOUS</dt>
          <dd>{b.ambiguous}</dd>
          <dt>Aguardando</dt>
          <dd>{b.open}</dd>
          <dt>Resultado hipotético</dt>
          <dd>{r(b.hypotheticalR)}</dd>
          <dt>Excesso médio sobre o 1R</dt>
          <dd>{brl(b.avgExcessBRL)}</dd>
        </dl>
        <p className="trade-perf-muted">{b.note}</p>
      </section>
      <section aria-label="Invalidadas e expiradas">
        <h4>Invalidadas e expiradas por estratégia (não são perdas)</h4>
        <div className="trade-perf-scroll">
          <table className="trade-lab-table">
            <thead>
              <tr>
                <th scope="col">Estratégia</th>
                <th scope="col">Detectadas</th>
                <th scope="col">Confirmadas</th>
                <th scope="col">Invalidadas antes</th>
                <th scope="col">Taxa</th>
                <th scope="col">Executáveis</th>
                <th scope="col">Propostas expiradas</th>
                <th scope="col">Vida média</th>
                <th scope="col">Depois (W/L/s.d.)</th>
              </tr>
            </thead>
            <tbody>
              {data.funnelByStrategy.map((s: any) => (
                <tr key={`${s.strategyId}@${s.version}`}>
                  <th scope="row">
                    {s.strategyId} v{s.version}
                  </th>
                  <td>{s.detected}</td>
                  <td>{s.confirmed}</td>
                  <td>{s.invalidatedBeforeConfirmation}</td>
                  <td>{pct(s.invalidationRate)}</td>
                  <td>{s.executable}</td>
                  <td>{s.expiredProposals}</td>
                  <td>{s.avgProposalLifetimeMin == null ? '—' : `${num(s.avgProposalLifetimeMin, 1)} min`}</td>
                  <td>
                    {s.afterExpiry.wins}/{s.afterExpiry.losses}/{s.afterExpiry.neither}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-label="MFE e MAE">
        <h4>MFE / MAE (análise; stop e alvo não mudam)</h4>
        <table className="trade-lab-table">
          <thead>
            <tr>
              <th scope="col">Estratégia</th>
              <th scope="col">N</th>
              <th scope="col">MFE médio</th>
              <th scope="col">MAE médio</th>
              <th scope="col">Stops que chegaram a +0,5R / +0,8R / +1R</th>
            </tr>
          </thead>
          <tbody>
            {data.strategies.map((g: any) => (
              <tr key={`${g.strategyId}@${g.version}`} data-sufficient={g.n >= min}>
                <th scope="row">
                  {g.strategyId} v{g.version}
                </th>
                <td>{g.n}</td>
                <td>{num(g.avgMfeR)}R</td>
                <td>{num(g.avgMaeR)}R</td>
                <td>{g.stopTrades.n ? g.stopTrades.reached.map((x: any) => `${x.count}/${g.stopTrades.n}`).join(' · ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="trade-perf-muted">
          Período: stops com MFE médio {num(data.executable.stopTrades.avgMfeR)}R antes do stop;{' '}
          {data.executable.stopTrades.reached.map((x: any) => `${pct(x.share)} chegaram a +${num(x.thresholdR)}R`).join(', ')}. Distribuição MFE:{' '}
          {data.executable.mfeDistribution.map((x: any) => `${num(x.from)}${x.to == null ? '+' : `–${num(x.to)}`}R: ${x.count}`).join(' · ')}. Hipóteses
          (breakeven, parcial, trailing) exigem estudo separado; nada é aplicado.
        </p>
      </section>
      <section aria-label="Reentradas">
        <h4>Reentradas · resultado por número da tentativa (mesma estratégia, mesmo pregão)</h4>
        <SegmentTable title="Tentativa" seg={{ unknown: 0, rows: data.reentries.byAttempt }} min={min} />
        <p className="trade-perf-muted">
          Tempo médio desde a entrada anterior: {num(data.reentries.avgMinutesSincePreviousEntry, 1)} min · desde o último stop:{' '}
          {num(data.reentries.avgMinutesSincePreviousStop, 1)} min · {data.reentries.reentriesAfterStop} reentrada(s) após stop. Nenhum cooldown é criado a
          partir disso.
        </p>
      </section>
      <section aria-label="Duplicadas e correlacionadas">
        <h4>Oportunidades duplicadas / exposição correlacionada</h4>
        <p className="trade-perf-muted">
          Mesma oportunidade econômica = mesmo ativo, direção, candle de confirmação e entrada/stop/alvo idênticos: conta uma vez no resultado; cada estratégia
          mantém o crédito. Cluster = mesma direção com confirmações a até {c.windowSeconds / 60} min uma da outra.
        </p>
        <ul className="trade-perf-list">
          {data.duplicates.map((d: any) => (
            <li key={d.ids.join()}>
              {hhmm(d.at)} {d.direction === 'BUY' ? 'COMPRA' : 'VENDA'} {num(d.entry, 0)}/{num(d.stop, 0)}/{num(d.target, 0)} · {stageText[d.stage]} ·{' '}
              {d.strategies.join(' + ')}
            </li>
          ))}
          {!data.duplicates.length && <li>Nenhuma duplicata econômica no período.</li>}
        </ul>
        <p className="trade-perf-muted">
          {c.clusters.length} cluster(s) correlacionado(s) · {c.opportunitiesInClusters} oportunidades em clusters · maior cluster {c.maxClusterSize} · pico de{' '}
          {c.peakSimultaneousR}R simultâneos se todas fossem aceitas. Medição apenas; o dimensionamento não muda.
        </p>
        <ul className="trade-perf-list">
          {c.clusters.map((k: any) => (
            <li key={k.ids.join()}>
              {hhmm(k.start)}–{hhmm(k.end)} {k.direction === 'BUY' ? 'COMPRA' : 'VENDA'} × {k.size} · {k.strategies.join(', ')} · {r(k.resultR)}
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Segmentos">
        <h4>Segmentação (somente features registradas no snapshot; cada segmento precisa da própria amostra)</h4>
        <SegmentTable title="Horário (BRT)" seg={seg.hour} min={min} />
        <SegmentTable title="Dia da semana" seg={seg.weekday} min={min} />
        <SegmentTable title="Direção" seg={seg.direction} min={min} />
        <SegmentTable title="Tendência M5 na confirmação (WITH/COUNTER/NEUTRAL)" seg={seg.trend} min={min} />
        <SegmentTable title="R/R planejado" seg={seg.rr} min={min} />
        <SegmentTable title="Risco técnico por contrato ÷ 1R da proposta" seg={seg.riskBucket} min={min} />
        <SegmentTable title="Sinais detectados nos 5 min anteriores" seg={seg.signalsLast5m} min={min} />
      </section>
      <section aria-label="RAW vs gestão de risco">
        <h4>RAW (todas as executáveis) vs RISK-CONSTRAINED (respeitando a gestão de risco, em ordem cronológica)</h4>
        {rc.available || rc.source ? (
          <dl className="trade-perf-inline">
            <dt>RAW</dt>
            <dd>
              {r(rc.raw.resultR)} · N={rc.raw.n}
            </dd>
            <dt>Com gestão de risco</dt>
            <dd>
              {r(rc.constrained.resultR)} · N={rc.constrained.n} · {rc.constrained.taken} entradas
            </dd>
            <dt>Puladas por limite diário / máx. operações</dt>
            <dd>
              {rc.skipped.dailyLoss} / {rc.skipped.maxTrades}
            </dd>
            <dt>Fonte</dt>
            <dd>{rc.source === 'CURRENT_SETTINGS' ? `configuração atual v${rc.fallbackVersion} aplicada como simulação` : 'snapshot de cada proposta'}</dd>
          </dl>
        ) : (
          <p className="trade-perf-muted">
            DADO INSUFICIENTE: nenhuma versão de gestão de risco (1R, limite diário, máx. operações) existia para estas propostas. RAW: {r(rc.raw.resultR)} (N=
            {rc.raw.n}).
          </p>
        )}
      </section>
      <section aria-label="PAPER forward">
        <PaperForward data={data} min={min} />
      </section>
      <section aria-label="Critérios">
        <h4>Critérios e modelos</h4>
        <p className="trade-perf-muted">
          {data.parameters.version} · {data.models.outcome.version} (horizonte {data.models.outcome.horizonBars} min; LIVE encerra no fim do pregão{' '}
          {data.models.outcome.sessionCloseBRT} BRT marcando a mercado = SEM DESFECHO) · {data.models.actionability.version}. N &lt; {min} = AMOSTRA
          INSUFICIENTE. Win rate nunca qualifica sozinho. Mudança de estratégia: dados → hipótese → replay/backtest → validação fora da amostra → PAPER forward
          → comparação → aprovação humana → nova versão.
        </p>
      </section>
    </div>
  );
}
