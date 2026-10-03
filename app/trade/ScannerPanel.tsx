'use client';
import { useEffect, useRef, useState } from 'react';
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
}: {
  source: 'mt5' | 'replay';
  cursor: number;
  initial?: ScannerResult;
  library?: boolean;
}) {
  const [data, setData] = useState<{
      scan: ScannerResult;
      watches: SetupWatch[];
      scope: string;
      feedLive: boolean;
    }>(),
    [error, setError] = useState(''),
    [stats, setStats] = useState<any[]>([]);
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
    if (!library) return;
    let active = true;
    fetch('/api/trade/strategy-metrics')
      .then((r) => r.json())
      .then((d) => {
        if (active && Array.isArray(d)) setStats(d);
      });
    return () => {
      active = false;
    };
  }, [library, data?.scan.asOf]);
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
  if (library)
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
        {scan?.candidates.map((c) => {
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
                {c.definition.enabled ? 'RESEARCH · PAPER ATIVA' : 'DISABLED'} ·
                v{c.definition.version} · {c.definition.stage.toUpperCase()} ·{' '}
                {c.definition.timeframes.join(' + ')}
              </p>
              <p>Dados: {c.definition.requiredData.join(' · ')}</p>
              <p>Regimes: {c.definition.eligibleRegimes.join(', ')}</p>
              <p>{c.analysis.explanation}</p>
              <p>
                Observações {m?.detected || 0} · Confirmados {m?.confirmed || 0}{' '}
                · Entradas {m?.accepted || 0} · Recusas {m?.rejected || 0} ·
                Encerrados {m?.closed || 0}
              </p>
              <p>
                {m?.sampleStatus || 'DADOS INSUFICIENTES'}
                {m?.expectancy != null
                  ? ` · expectativa descritiva ${num(m.expectancy)}R · acerto ${num(m.winRate * 100)}%`
                  : ''}
              </p>
              <p>
                Acumulado PAPER: {num(m?.netR)}R · {num(m?.netPoints)} pts · R${' '}
                {num(m?.netMoney)}
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
  const watches = (data?.watches || []).filter((w) =>
    [
      'FORMING',
      'WAITING_TRIGGER',
      'CONFIRMED',
      'PROPOSED',
      'OPEN_PAPER',
    ].includes(w.state),
  );
  return (
    <section className="trade-scanner" aria-label="Setups em observação">
      <header>
        <span className="trade-eyebrow">LEITURA MULTI-ESTRATÉGIA · PAPER</span>
        <h2>Setups em observação</h2>
        <p>
          {scan?.candidates.length || 0} avaliadas ·{' '}
          {scan?.summary.REJECTED || 0} descartadas ·{' '}
          {(scan?.summary.INSUFFICIENT_DATA || 0) +
            (scan?.summary.UNAVAILABLE_DATA || 0)}{' '}
          sem dados · {scan?.summary.CONFIRMED || 0} confirmadas
        </p>
        <small>
          {scan?.regimes.join(' · ') || 'Aguardando dados'} · sem ranking de
          rentabilidade
        </small>
      </header>
      {source === 'mt5' && !data?.feedLive && (
        <p className="trade-operation-error">
          Feed antigo/OFFLINE: novas confirmações bloqueadas.
        </p>
      )}
      {error && (
        <p role="status" className="trade-operation-error">
          {error}
        </p>
      )}
      {!watches.length && (
        <p className="trade-operation-caption">
          Nenhuma hipótese ativa. O scanner informa na biblioteca por que cada
          regra foi descartada ou está aguardando dados.
        </p>
      )}
      {watches.map((w) => {
        const c = w.candidate,
          p = c.projected;
        return (
          <details className="trade-watch" key={w.id}>
            <summary>
              <div>
                <span className="trade-eyebrow">
                  {labels[w.state]} ·{' '}
                  {c.analysis.trend === 'down' ? 'VENDA' : 'COMPRA'}
                </span>
                <strong>{c.definition.name}</strong>
                <small>
                  {c.analysis.conditions.filter((x) => x.met).length}/
                  {c.analysis.conditions.length} condições ·{' '}
                  {time(w.detectedAt)} → {time(w.validUntil)}
                </small>
              </div>
            </summary>
            <p>{c.analysis.explanation}</p>
            <p>
              <b>Gatilho:</b> {c.trigger}
            </p>
            {w.participants.length > 1 && (
              <p>Confluências: {w.participants.map((x) => x.id).join(', ')}</p>
            )}
            {c.analysis.conditions.map((x) => (
              <p key={x.key}>
                {x.met ? '✓' : '○'} {x.label} · {x.detail}
              </p>
            ))}
            {p && (
              <dl>
                <dt>Região</dt>
                <dd>
                  {num(p.region[0])}–{num(p.region[1])}
                </dd>
                <dt>Entrada projetada</dt>
                <dd>{num(p.entry)}</dd>
                <dt>Invalidação</dt>
                <dd>{num(p.stop)}</dd>
                <dt>Alvo / R:R</dt>
                <dd>
                  {num(p.target)} · 1:{num(p.rr)}
                </dd>
              </dl>
            )}
            {c.analysis.conflicts.map((x) => (
              <p key={x} className="trade-operation-error">
                {x}
              </p>
            ))}
            {['FORMING', 'WAITING_TRIGGER'].includes(w.state) ? (
              <div className="trade-operation-actions">
                <button onClick={() => watchAction(w, 'follow')}>
                  ACOMPANHAR
                </button>
                <button onClick={() => watchAction(w, 'discard')}>
                  DESCARTAR OBSERVAÇÃO
                </button>
              </div>
            ) : (
              <p>Decida ENTRAR NO PAPER ou NÃO ENTRAR na mesa de operações.</p>
            )}
            <small>
              v{c.definition.version} · Não entrar antes da confirmação. Valores
              projetados podem mudar.
            </small>
          </details>
        );
      })}
      <details>
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
    </section>
  );
}
