'use client';
import { useEffect, useRef, useState } from 'react';
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
}: {
  source: 'replay' | 'mt5';
  cursor: number;
  complete: boolean;
  setupId?: string;
  paperComplete?: boolean;
  paperSetupId?: string;
}) {
  const [mode, setMode] = useState<'PAPER' | 'REAL'>('PAPER'),
    [quantity, setQuantity] = useState(1),
    [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    const r = await fetch(
      `/api/trade/operations?source=${source}&cursor=${cursor}`,
      { cache: 'no-store' },
    );
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setRows(d);
  }
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active)
        load().catch((e) => {
          if (active) setError(e.message);
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
  const attempted = useRef('');
  useEffect(() => {
    const key = `${source}:${mode}:${activeSetupId || ''}`;
    if (
      !activeComplete ||
      !activeSetupId ||
      attempted.current === key ||
      rows.some(
        (r) =>
          r.state === 'AGUARDANDO CONFIRMAÇÃO' &&
          r.payload.source === source &&
          r.payload.mode === mode,
      )
    )
      return;
    attempted.current = key;
    void action('propose');
  }, [source, mode, activeSetupId, activeComplete]);
  const row = rows.find(
      (r) => r.payload.source === source && r.payload.mode === mode,
    ),
    p: Proposal | undefined = row?.payload,
    x = row?.execution;
  return (
    <section className="trade-operation" aria-label="Aprovação humana">
      <header className="trade-operation-header"><div><span className="trade-eyebrow">MESA DE OPERAÇÕES</span><h2>{mode === 'PAPER' ? 'Treine sua decisão' : 'Sua decisão, sua operação'}</h2></div><span className="trade-operation-mode">{mode}</span></header>
      <div className="trade-operation-controls">
        <select
          aria-label="Modo de execução"
          value={mode}
          onChange={(e) => setMode(e.target.value as 'PAPER' | 'REAL')}
        >
          <option>PAPER</option>
          <option disabled={source !== 'mt5'}>REAL</option>
        </select>
        <label>
          Contratos{' '}
          <input
            aria-label="Quantidade de contratos"
            type="number"
            min="1"
            step="1"
            disabled={row?.state === 'AGUARDANDO CONFIRMAÇÃO'}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </label>
      </div>
      <p className="trade-operation-caption">
        {mode === 'PAPER'
          ? 'Simulação, sem dinheiro real.'
          : 'XP / MetaTrader 5. Exige estratégia autorizada e os dois gates de execução.'}
      </p>
      <button
        className="trade-operation-prepare"
        disabled={busy || !activeComplete}
        onClick={() => action('propose')}
      >
        Preparar proposta
      </button>
      {p && (
        <>
<div className="trade-operation-status"><span className="trade-operation-dot"/><h3>
            {row.state === 'CONFIRMADA' ? x?.status || 'ENVIANDO' : row.state}
</h3></div>
          <strong className="trade-operation-instrument">
            {p.direction} · {p.symbol} · {p.quantity} contrato(s)
          </strong>
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
<details className="trade-operation-reason"><summary>Por que este padrão foi identificado?</summary><p>{p.setup.explanation}</p></details>
          <small className="trade-operation-footnote">
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
                CONFIRMAR OPERAÇÃO
              </button>
              <button disabled={busy} onClick={() => action('discard', p.id)}>
                DESCARTAR
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
      {error && <p className="trade-operation-error" role="status">{error}</p>}
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
