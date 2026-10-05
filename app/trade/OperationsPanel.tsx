'use client';
import { useEffect, useState, useRef } from 'react';
import type { Proposal } from '../../trade/bridge/approval';
import { remainingPositionRiskBRL } from '../../trade/core/risk-engine';
import RealSessionPanel from './RealSessionPanel';
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
  realComplete,
  realStrategy,
  strategyNames = {},
  executionMode = 'PAPER',
  onModeChange = () => {},
}: {
  executionMode?: 'PAPER' | 'REAL';
  onModeChange?: (mode: 'PAPER' | 'REAL') => void;
  source: 'replay' | 'mt5';
  cursor: number;
  complete: boolean;
  setupId?: string;
  paperComplete?: boolean;
  paperSetupId?: string;
  realComplete?: boolean;
  realStrategy?: string;
  strategyNames?: Record<string, string>;
}) {
  const mode = executionMode,
    setMode = onModeChange;
  const dialog = useRef<HTMLDialogElement>(null);
  const [readiness, setReadiness] = useState<any>(null),
    [finalConfirmation, setFinalConfirmation] = useState<any>(null);
  useEffect(() => {
    if (finalConfirmation && dialog.current && !dialog.current.open)
      dialog.current.showModal();
    else if (!finalConfirmation) dialog.current?.close();
  }, [finalConfirmation]);
  const [quantity, setQuantity] = useState(1),
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
    const status = await fetch('/api/trade/execution-status', {
      cache: 'no-store',
    });
    const statusData = await status.json();
    setReadiness(status.ok ? statusData.real : null);
    setLoadError('');
  }
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active)
        load().catch((e) => {
          if (active) {
            setLoadError(e.message);
            setReadiness(null);
          }
        });
    };
    refresh();
    const t = setInterval(refresh, 2000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [source, cursor]);
  async function action(
    action: string,
    id?: string,
    extra: Record<string, unknown> = {},
  ) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/trade/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          id,
          source,
          cursor,
          mode,
          quantity,
          strategy: p?.setup.strategy || (mode==='REAL'?realStrategy:undefined),
          ...extra,
        }),
      });
      const d = await r.json();
      if (!r.ok) { if(d.gates)setReadiness((old:any)=>({...old,gates:d.gates,canExecute:false})); throw new Error(d.error); }
      if (action === 'prepare-real') setFinalConfirmation(d);
      if (action === 'confirm') setFinalConfirmation(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na operação');
      if (mode === 'REAL') {
        setFinalConfirmation(null);
      }
    } finally {
      setBusy(false);
    }
  }
  const activeComplete =
    mode === 'PAPER' ? (paperComplete ?? complete) : (realComplete ?? complete);
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
  const riskBlocked =
    row?.state === 'BLOQUEADA POR RISCO' || p?.proposalState === 'RISK_BLOCKED';
  const ready = readiness?.canExecute === true && source === 'mt5',
    preview = !!p && p.mode !== mode;
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
            {preview
              ? 'HIPÓTESE PAPER · PRÉVIA PARA REAL'
              : priority === 'proposal'
                ? 'SETUP CONFIRMADO · PROPOSTA PRONTA'
                : priority === 'paper'
                  ? `ACOMPANHAMENTO ${mode}`
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
      <div
        className="trade-execution-selector"
        role="group"
        aria-label="Modo de execução"
      >
        <button
          aria-pressed={mode === 'PAPER'}
          onClick={() => {
            setMode('PAPER');
            setSelectedId('');
            setFinalConfirmation(null);
          }}
        >
          PAPER<small>OPERACIONAL</small>
        </button>
        <button
          aria-pressed={mode === 'REAL'}
          onClick={() => {
            setMode('REAL');
            setSelectedId('');
            setFinalConfirmation(null);
          }}
        >
          REAL
          <small>
            {source !== 'mt5' || readiness?.state === 'UNAVAILABLE' || !readiness
              ? 'INDISPONÍVEL'
              : readiness?.armed
                ? 'ARMADO'
                : 'BLOQUEADO'}
          </small>
        </button>
      </div>
      <p className="trade-mode-banner" data-mode={mode}>
        {mode === 'PAPER'
          ? 'SIMULAÇÃO — SEM DINHEIRO REAL'
          : 'CONTA REAL — ORDENS PODEM ENVOLVER DINHEIRO REAL'}
      </p>
      {mode === 'REAL' && (
        <RealSessionPanel
          real={readiness}
          source={source}
          onChanged={() => load().catch(() => {})}
        />
      )}
      {mode === 'REAL' && (
        <details className="trade-real-checklist">
          <summary>
            {readiness?.status || 'REAL INDISPONÍVEL'} · checklist completo
            <span className="trade-real-gate-count">
              {readiness?.gates?.filter((g: any) => !g.ok).length ?? '—'}{' '}
              verificações bloqueadas · ver checklist
            </span>
          </summary>
          {source !== 'mt5' && (
            <p>Selecione XP / MetaTrader 5 para utilizar dados reais.</p>
          )}
          {(
            readiness?.gates || [
              {
                key: 'loading',
                label: 'Verificação server-side',
                ok: false,
                reason: 'Aguardando validação da persistência e dos gates.',
              },
            ]
          ).map((g: any) => (
            <div key={g.key} data-ok={g.ok}>
              <strong>
                {g.ok ? '✓' : '○'} {g.label}
              </strong>
              {!g.ok && <small>{g.reason}</small>}
            </div>
          ))}
        </details>
      )}
      <details
        className="trade-operation-ticket"
        open={mode === 'REAL' || priority !== 'history' || undefined}
      >
        <summary className="trade-history-ticket-label">
          {p ? 'Último ciclo · ver detalhes' : 'Configuração e histórico'}
        </summary>
        <details className="trade-operation-settings">
          <summary>{mode} · configuração e segurança</summary>
          <div className="trade-operation-controls">
            <label>
              Contratos{' '}
              <input
                aria-label="Quantidade de contratos"
                type="number"
                min="1"
                step="1"
                disabled={
                  !!p &&
                  p.mode === mode &&
                  row.state === 'AGUARDANDO CONFIRMAÇÃO'
                }
                max={readiness?.limits?.maxContracts || 1}
                value={p && p.mode === mode ? p.quantity : quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </label>
          </div>
        </details>
        <p className="trade-operation-caption">
          {mode === 'PAPER'
            ? 'Simulação, sem dinheiro real.'
            : 'XP / MetaTrader 5. Exige sessão REAL armada, proposta READY e sua confirmação final em cada ordem.'}
        </p>
        {rows.filter(
          (r) => r.payload.source === source && r.payload.mode === mode,
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
                  (r) => r.payload.source === source && r.payload.mode === mode,
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
                {preview
                  ? 'PRÉVIA DA MESMA HIPÓTESE PAPER'
                  : riskBlocked
                    ? 'PROPOSTA TÉCNICA · NÃO EXECUTÁVEL'
                    : row.state === 'CONFIRMADA'
                      ? x?.status || 'ENVIANDO'
                      : row.state}
              </h3>
            </div>
            <strong className="trade-operation-instrument">
              {p.direction === 'BUY' ? 'COMPRA' : 'VENDA'} · {p.symbol} ·{' '}
              {riskBlocked
                ? 'quantidade permitida: 0'
                : `${p.quantity} contrato(s)`}
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
              <dt>{riskBlocked ? 'Risco técnico' : 'Stop em pontos · risco total'}</dt>
              <dd>
                {num(p.riskPoints)} pts
                {!riskBlocked && ` · ${money(p.riskBRL)}`}
              </dd>
              <dt>{riskBlocked ? 'Potencial técnico' : 'Potencial estimado'}</dt>
              <dd>
                {num(p.potentialPoints)} pts
                {!riskBlocked && ` · ${money(p.potentialBRL)}`}
              </dd>
              {riskBlocked && (
                <>
                  <dt>Risco mínimo · 1 contrato</dt>
                  <dd>{money(p.riskPerContractBRL)}</dd>
                  <dt>Limite configurado</dt>
                  <dd>
                    {p.sizing?.maxRiskBRL != null
                      ? money(p.sizing.maxRiskBRL)
                      : 'ausente'}
                  </dd>
                </>
              )}
              <dt>Risco/retorno</dt>
              <dd>1 : {num(p.rr)}</dd>
              {p.sizing && !riskBlocked && (
                <>
                  <dt>Tamanho pelo risco</dt>
                  <dd>
                    {p.quantity} contrato(s) · {money(p.sizing.riskPerContractBRL)}{' '}
                    por contrato · limite {money(p.sizing.maxRiskBRL)}
                  </dd>
                </>
              )}
              <dt>Snapshot · validade</dt>
              <dd>
                {new Date(p.asOf * 1000).toLocaleTimeString('pt-BR')} · até{' '}
                {new Date(p.expiresAt).toLocaleTimeString('pt-BR')}
              </dd>
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
              {p.inspectionOnly && 'INSPEÇÃO REAL BLOQUEADA · SEM ENVIO AO BROKER. '}
              {p.pointValueSource === 'win-specification-paper' &&
                'PAPER: R$ 0,20 por ponto conforme especificação WIN. '}
              Preço de execução pode variar. Valores não incluem taxas nem
              slippage. Proposta válida até{' '}
              {new Date(p.expiresAt).toLocaleTimeString('pt-BR')}.
            </small>
            {riskBlocked && (
              <>
                <p className="trade-operation-error" role="status">
                  RISCO ACIMA DO LIMITE ·{' '}
                  {p.riskBlock?.message ||
                    'Proposta técnica não executável com o limite atual.'}
                </p>
                <div className="trade-operation-actions">
                  <button className="trade-primary" disabled>
                    {mode === 'PAPER' ? 'ENTRAR NO PAPER' : 'ENTRAR · ORDEM REAL'}
                  </button>
                </div>
                <p className="trade-operation-caption">
                  {row.hypothetical_execution?.exitTime
                    ? `Observação hipotética encerrada: ${row.hypothetical_execution.exitReason === 'STOP' ? 'stop' : 'alvo'} · ${num(row.hypothetical_execution.resultR)}R · MFE ${num(row.hypothetical_execution.mfeR)}R · MAE ${num(row.hypothetical_execution.maeR)}R · ${num(row.hypothetical_execution.durationMinutes)} min.`
                    : 'Em observação hipotética para estudo. Não é uma operação PAPER nem uma ordem.'}
                </p>
              </>
            )}
            {!preview && !riskBlocked && row.state === 'AGUARDANDO CONFIRMAÇÃO' && (
              <div className="trade-operation-actions">
                <button
                  className="trade-primary"
                  disabled={
                    busy ||
                    Date.now() > p.expiresAt ||
                    (mode === 'REAL' && !ready && !p.inspectionOnly)
                  }
                  onClick={() =>
                    action(mode === 'REAL' ? 'prepare-real' : 'confirm', p.id)
                  }
                >
                  {mode === 'PAPER' ? 'ENTRAR NO PAPER' : p.inspectionOnly ? 'REVISAR PROPOSTA REAL' : 'ENTRAR · ORDEM REAL'}
                </button>
                <button disabled={busy} onClick={() => action('discard', p.id)}>
                  NÃO ENTRAR
                </button>
              </div>
            )}
            {!preview && row.state === 'CONFIRMADA' && (
              <>
                <p>
                  {x?.uncertain
                    ? 'Entrega incerta. Não reenviar; aguarde reconciliação do MT5.'
                    : !x
                      ? 'Aguardando retorno efetivo do provedor.'
                      : ''}
                </p>
                {mode === 'REAL' && x?.protection && (
                  <p
                    className={x.protectionFault ? 'trade-operation-error' : ''}
                  >
                    Proteção SL/TP: {x.protection}
                  </p>
                )}
                {mode === 'REAL' && x?.retcodes?.length > 0 && (
                  <details>
                    <summary>Retorno efetivo do MT5</summary>
                    <p>{JSON.stringify(x.retcodes)}</p>
                  </details>
                )}
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
                          remainingPositionRiskBRL(
                            p.direction === 'BUY' ? 'long' : 'short',
                            x.position.price,
                            x.position.sl,
                            x.position.volume,
                            p.pointValue,
                          ),
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
      {mode === 'REAL' && (!p || preview || riskBlocked) && (
        <button
          className="trade-primary"
          disabled={busy || source !== 'mt5' || !activeComplete}
          onClick={() => action('propose')}
        >
          Preparar proposta REAL
        </button>
      )}
      <dialog
        className="trade-real-dialog"
        ref={dialog}
        onCancel={() => setFinalConfirmation(null)}
        onClose={() => setFinalConfirmation(null)}
      >
        {finalConfirmation && (
          <>
            <span className="trade-eyebrow">ÚLTIMA CONFIRMAÇÃO HUMANA</span>
            <h2>
              {finalConfirmation.inspectionOnly
                ? 'Confirmar operação REAL?'
                : 'VOCÊ ESTÁ PRESTES A ENVIAR UMA ORDEM REAL À XP'}
            </h2>
            <p>
              {finalConfirmation.inspectionOnly ? 'INSPEÇÃO REAL — esta tentativa será bloqueada. Nenhum comando será enviado à XP.' : 'Dinheiro real. Não é PAPER nem simulação. O servidor revalida tudo antes de enviar; qualquer mudança aborta. Aceite HTTP não confirma execução.'}
            </p>
            <strong className="trade-real-order-line" data-direction={finalConfirmation.proposal.direction}>
              {finalConfirmation.proposal.direction === 'BUY' ? 'COMPRA' : 'VENDA'} ·{' '}
              {finalConfirmation.proposal.symbol} ·{' '}
              {finalConfirmation.proposal.quantity} contrato(s)
            </strong>
            <dl>
              <dt>Entrada a mercado · referência</dt>
              <dd>{num(finalConfirmation.proposal.entry)}</dd>
              <dt>Stop loss</dt>
              <dd>{num(finalConfirmation.proposal.sl)}</dd>
              <dt>Take profit</dt>
              <dd>{num(finalConfirmation.proposal.tp)}</dd>
              <dt>Stop em pontos</dt>
              <dd>{num(finalConfirmation.proposal.riskPoints)} pts</dd>
              <dt>Risco por contrato</dt>
              <dd>{money(finalConfirmation.proposal.riskPerContractBRL ?? finalConfirmation.proposal.riskPoints * finalConfirmation.proposal.pointValue)}</dd>
              <dt>Risco máximo estimado</dt>
              <dd>{money(finalConfirmation.proposal.riskBRL)}</dd>
              <dt>Conta</dt><dd>{finalConfirmation.readiness?.gates?.find((g:any)=>g.key==='account')?.ok ? 'XP · identidade autorizada' : 'XP · identidade ainda bloqueada'}</dd>
              <dt>Potencial estimado</dt><dd>{money(finalConfirmation.proposal.potentialBRL)}</dd>
              <dt>Risco/retorno</dt><dd>1 : {num(finalConfirmation.proposal.rr)}</dd>
              <dt>Validade da confirmação</dt>
              <dd>
                {new Date(finalConfirmation.expiresAt).toLocaleTimeString(
                  'pt-BR',
                )}
              </dd>
            </dl>
            <button
              className="trade-primary"
              disabled={
                busy ||
                (!ready && !finalConfirmation.inspectionOnly) ||
                Date.now() > Date.parse(finalConfirmation.expiresAt)
              }
              onClick={() =>
                action('confirm', finalConfirmation.proposal.id, {
                  nonce: finalConfirmation.nonce,
                  confirmation: 'CONFIRMAR ORDEM REAL',
                })
              }
            >
              CONFIRMAR ORDEM REAL
            </button>
            <button onClick={() => setFinalConfirmation(null)}>
              CANCELAR
            </button>
          </>
        )}
      </dialog>
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
              {r.state === 'BLOQUEADA POR RISCO'
                ? 'PROPOSTA TÉCNICA · BLOQUEADA POR RISCO'
                : r.execution?.status || r.state}{' '}
              ·{' '}
              {new Date(r.created_at).toLocaleString('pt-BR')}
            </p>
            {r.hypothetical_execution?.exitTime && (
              <p>
                {r.state === 'BLOQUEADA POR RISCO'
                  ? 'Não executável pelo limite de risco.'
                  : 'Você não entrou.'}{' '}
                Resultado hipotético para estudo:{' '}
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
