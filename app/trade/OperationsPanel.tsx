'use client';
import { useEffect, useState } from 'react';
import type { Proposal } from '../../trade/bridge/approval';
const num = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const money = (v: number | null | undefined) =>
  v == null
    ? '—'
    : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export default function OperationsPanel({
  source,
  cursor,
  complete,
  setupId,
  paperComplete,
  paperSetupId,
  strategyNames = {},
}: {
  source: 'replay' | 'mt5';
  cursor: number;
  complete: boolean;
  setupId?: string;
  paperComplete?: boolean;
  paperSetupId?: string;
  strategyNames?: Record<string, string>;
}) {
  const [mode, setMode] = useState<'PAPER' | 'REAL'>('PAPER'),
    [quantity, setQuantity] = useState(1),
    [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState(''),
    [loadError, setLoadError] = useState(''),
    [busy, setBusy] = useState(false),
    [selectedId, setSelectedId] = useState('');
  async function load() {
    const r = await fetch(
      `/api/trade/operations?source=${source}&cursor=${cursor}`,
      { cache: 'no-store' },
    );
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setRows(d);
    setLoadError('');
  }
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active)
        load().catch((e) => {
          if (active) setLoadError(e.message);
        });
    };
    refresh();
    const t = setInterval(refresh, 2000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [source, cursor]);
  async function action(action: string, id?: string) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/trade/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id, source, cursor, mode, quantity }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na operação');
    } finally {
      setBusy(false);
    }
  }
  const activeComplete =
    mode === 'PAPER' ? (paperComplete ?? complete) : complete;
  const activeSetupId = mode === 'PAPER' ? (paperSetupId ?? setupId) : setupId;
  const matching = rows.filter(
    (r) => r.payload.source === source && r.payload.mode === mode,
  );
  const row =
      matching.find((r) => r.id === selectedId) ||
      matching.find(
        (r) =>
          r.state === 'AGUARDANDO CONFIRMAÇÃO' &&
          r.payload.expiresAt > Date.now(),
      ) ||
      matching.find(
        (r) => r.state === 'CONFIRMADA' && !r.execution?.exitTime,
      ) ||
      matching[0],
    p: Proposal | undefined = row?.payload,
    x = row?.execution;
  const priority =
    row?.state === 'AGUARDANDO CONFIRMAÇÃO' && p && p.expiresAt > Date.now()
      ? 'proposal'
      : row?.state === 'CONFIRMADA' && !x?.exitTime
        ? 'paper'
        : 'history';
  return (
    <section
      className="trade-operation"
      data-priority={priority}
      aria-label="Aprovação humana"
    >
      <header className="trade-operation-header">
        <div>
          <span className="trade-eyebrow">
            {priority === 'proposal'
              ? 'SETUP CONFIRMADO · PROPOSTA PRONTA'
              : priority === 'paper'
                ? 'ACOMPANHAMENTO PAPER'
                : 'MESA DE OPERAÇÕES'}
          </span>
          <h2>
            {mode === 'PAPER'
              ? priority === 'proposal'
                ? 'Sua decisão agora'
                : priority === 'paper'
                  ? 'Operação em acompanhamento'
                  : 'Diário PAPER'
              : 'Sua decisão, sua operação'}
          </h2>
        </div>
        <span className="trade-operation-mode">{mode}</span>
      </header>
      <details
        className="trade-operation-ticket"
        open={priority !== 'history' || undefined}
      >
        <summary className="trade-history-ticket-label">
          {p ? 'Último ciclo · ver detalhes' : 'Configuração e histórico'}
        </summary>
        <details className="trade-operation-settings">
          <summary>PAPER · configuração e segurança</summary>
          <div className="trade-operation-controls">
            <select
              aria-label="Modo de execução"
              value={mode}
              onChange={(e) => setMode(e.target.value as 'PAPER' | 'REAL')}
            >
              <option>PAPER</option>
              <option disabled>REAL · bloqueado</option>
            </select>
            <label>
              Contratos{' '}
              <input
                aria-label="Quantidade de contratos"
                type="number"
                min="1"
                step="1"
                disabled
                value={p?.quantity || quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </label>
          </div>
        </details>
        <p className="trade-operation-caption">
          {mode === 'PAPER'
            ? 'Simulação, sem dinheiro real.'
            : 'XP / MetaTrader 5. Exige estratégia autorizada e os dois gates de execução.'}
        </p>
        {rows.filter(
          (r) => r.payload.source === source && r.payload.mode === 'PAPER',
        ).length > 1 && (
          <label className="trade-proposal-picker">
            Propostas / posições
            <select
              aria-label="Proposta PAPER"
              value={row?.id || ''}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {rows
                .filter(
                  (r) =>
                    r.payload.source === source && r.payload.mode === 'PAPER',
                )
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {strategyNames[r.payload.setup.strategy] ||
                      r.payload.setup.strategy}{' '}
                    · {r.payload.direction} · {r.state}
                  </option>
                ))}
            </select>
          </label>
        )}
        {p && (
          <>
            <div className="trade-operation-status">
              <span className="trade-operation-dot" />
              <h3>
                {row.state === 'CONFIRMADA'
                  ? x?.status || 'ENVIANDO'
                  : row.state}
              </h3>
            </div>
            <strong className="trade-operation-instrument">
              {p.direction === 'BUY' ? 'COMPRA' : 'VENDA'} · {p.symbol} ·{' '}
              {p.quantity} contrato(s)
            </strong>
            <p className="trade-operation-method">
              Método: {strategyNames[p.setup.strategy] || p.setup.strategy}
            </p>
            <dl>
              <dt>Entrada a mercado · referência</dt>
              <dd>{num(p.entry)}</dd>
              <dt>Stop loss</dt>
              <dd>{num(p.sl)}</dd>
              <dt>Take profit</dt>
              <dd>{num(p.tp)}</dd>
              <dt>Risco estimado</dt>
              <dd>
                {num(p.riskPoints)} pts · {money(p.riskBRL)}
              </dd>
              <dt>Potencial estimado</dt>
              <dd>
                {num(p.potentialPoints)} pts · {money(p.potentialBRL)}
              </dd>
              <dt>Risco/retorno</dt>
              <dd>1 : {num(p.rr)}</dd>
            </dl>
            <details className="trade-operation-reason">
              <summary>Entender esta estratégia</summary>
              <p>
                {strategyNames[p.setup.strategy] || p.setup.strategy} · v
                {p.setup.version}
              </p>
              <p>{p.setup.explanation}</p>
              {p.setup.conditions.map((c) => (
                <p key={c.key}>
                  {c.met ? '✓' : '○'} {c.label}: {c.detail}
                </p>
              ))}
              <p>
                Stop em {num(p.sl)} invalida a hipótese; alvo de referência em{' '}
                {num(p.tp)} corresponde a {num(p.rr)}R.
              </p>
            </details>
            <small className="trade-operation-footnote">
              {p.pointValueSource === 'win-specification-paper' &&
                'PAPER: R$ 0,20 por ponto conforme especificação WIN. '}
              Preço de execução pode variar. Valores não incluem taxas nem
              slippage. Proposta válida até{' '}
              {new Date(p.expiresAt).toLocaleTimeString('pt-BR')}.
            </small>
            {row.state === 'AGUARDANDO CONFIRMAÇÃO' && (
              <div className="trade-operation-actions">
                <button
                  className="trade-primary"
                  disabled={busy || Date.now() > p.expiresAt}
                  onClick={() => action('confirm', p.id)}
                >
                  ENTRAR NO PAPER
                </button>
                <button disabled={busy} onClick={() => action('discard', p.id)}>
                  NÃO ENTRAR
                </button>
              </div>
            )}
            {row.state === 'CONFIRMADA' && (
              <>
                <p>
                  {x?.uncertain
                    ? 'Entrega incerta. Não reenviar; aguarde reconciliação do MT5.'
                    : !x
                      ? 'Aguardando retorno efetivo do provedor.'
                      : ''}
                </p>
                <dl>
                  <dt>Quantidade executada</dt>
                  <dd>{num(x?.filled)}</dd>
                  <dt>Preço de entrada efetivo</dt>
                  <dd>{num(x?.entry)}</dd>
                  <dt>Preço atual</dt>
                  <dd>{num(x?.position?.current)}</dd>
                  <dt>P&L aberto</dt>
                  <dd>{money(x?.position?.profit)}</dd>
                  <dt>Stop atual</dt>
                  <dd>{num(x?.position?.sl)}</dd>
                  <dt>Alvo atual</dt>
                  <dd>{num(x?.position?.tp)}</dd>
                  <dt>Risco até o stop</dt>
                  <dd>
                    {x?.position
                      ? money(
                          Math.abs(x.position.price - x.position.sl) *
                            p.pointValue *
                            x.position.volume,
                        )
                      : '—'}
                  </dd>
                </dl>
                {x?.feedLive === false && (
                  <p>Feed OFFLINE: preço atual e P&L ocultos.</p>
                )}
                {x?.exitTime && (
                  <p>
                    Posição encerrada · resultado {money(x.resultBRL)} ·{' '}
                    {num(x.resultR)}R
                  </p>
                )}
              </>
            )}
          </>
        )}
      </details>
      {(error || loadError) && (
        <p className="trade-operation-error" role="status">
          {error || loadError}
        </p>
      )}
      <details className="trade-operation-diary">
        <summary>Diário de operações · {rows.length} ciclos</summary>
        {rows.map((r) => (
          <article key={r.id}>
            <strong>
              {r.payload.mode} · {r.payload.direction} · {r.payload.symbol}
            </strong>
            <p>
              {r.execution?.status || r.state} ·{' '}
              {new Date(r.created_at).toLocaleString('pt-BR')}
            </p>
            {r.hypothetical_execution?.exitTime && (
              <p>
                Você não entrou. Resultado hipotético para estudo:{' '}
                {num(r.hypothetical_execution.resultR)}R ·{' '}
                {money(r.hypothetical_execution.resultBRL)}
              </p>
            )}
            {r.journal?.map((j: any) => (
              <p key={j.id}>
                {new Date(j.created_at).toLocaleTimeString('pt-BR')} · {j.kind}
              </p>
            ))}
          </article>
        ))}
      </details>
    </section>
  );
}
