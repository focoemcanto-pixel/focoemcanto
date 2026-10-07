'use client';
import { useEffect, useState, useRef } from 'react';
import RealChecklist from './RealChecklist';
import type { Proposal } from '../../trade/bridge/approval';
import { remainingPositionRiskBRL } from '../../trade/core/risk-engine';
import RealSessionPanel from './RealSessionPanel';
import RiskSettingsPanel from './RiskSettingsPanel';
import { entryWindow, serverSkew } from './decision-view';
import OpportunityCard from './OpportunityCard';
import { blockedNotices, departures, invalidationText, opportunityQueue, type Opportunity } from './opportunity';
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
    [selectedId, setSelectedId] = useState(''),
    [now, setNow] = useState(() => Date.now()),
    [confirmPaper, setConfirmPaper] = useState(false),
    [chosenQty, setChosenQty] = useState(1),
    [skew, setSkew] = useState(0);
  // One-second clock for the entry countdown; validity itself always comes from the backend expiresAt.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  async function load() {
    const r = await fetch(
      `/api/trade/operations?source=${source}&cursor=${cursor}`,
      { cache: 'no-store' },
    );
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setSkew(serverSkew(r.headers.get('Date'), Date.now()));
    setRows(d);
    const status = await fetch('/api/trade/execution-status', {
      cache: 'no-store',
    });
    const statusData = await status.json();
    // Always keep the readiness dimensions; on a failing REAL context show its real cause, never defaults.
    setReadiness(statusData?.real ? { ...statusData.real, dimensions: statusData.readiness ?? null } : null);
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
          // Only a new proposal takes the free quantity; a PAPER entry sends the chosen quantity explicitly.
          ...(action === 'propose' ? { quantity } : {}),
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
  // ── OPORTUNIDADE ATIVA ────────────────────────────────────────────────────────────────────────
  const [dismissedNotices, setDismissedNotices] = useState<Set<string>>(() => new Set()),
    [flash, setFlash] = useState<{ text: string; at: number } | null>(null),
    [cardError, setCardError] = useState(''),
    previousQueue = useRef<Opportunity[]>([]),
    journaled = useRef(new Set<string>());
  // REAL preview limit: only a policy materialized from GESTÃO DE RISCO · REAL counts (server is the authority).
  const realLimits = {
    maxRiskBRL:
      readiness?.limits?.riskSettingsVersion != null && readiness?.limits?.maxRiskBRL > 0
        ? Math.min(readiness.limits.maxRiskBRL, readiness.limits.riskCapBRL > 0 ? readiness.limits.riskCapBRL : Infinity)
        : null,
    maxContracts: Number(readiness?.limits?.maxContracts) || 1,
  };
  const queueOpts = { mode, source, nowMs: now, skewMs: skew, real: realLimits },
    queue = opportunityQueue(rows, queueOpts),
    notices = blockedNotices(rows, { ...queueOpts, dismissed: dismissedNotices });
  const post = async (body: Record<string, unknown>) => {
    const r = await fetch('/api/trade/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, cursor, ...body }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (d.gates) setReadiness((old: any) => ({ ...old, gates: d.gates, canExecute: false }));
      throw new Error(d.error || 'Operação bloqueada');
    }
    return d;
  };
  // Journal (best effort, deduplicated per proposal for one-shot kinds; the server dedupes too).
  const journal = (id: string, kind: string, reason?: string) => {
    const key = `${id}:${kind}`;
    if (/PRESENTED|EXPIRED|INVALIDATED/.test(kind) && journaled.current.has(key)) return;
    journaled.current.add(key);
    post({ action: 'event', id, kind, reason }).catch(() => {});
  };
  // Leaving the queue (time out or server invalidation) disables entry immediately and is recorded once.
  useEffect(() => {
    for (const d of departures(previousQueue.current, rows, queueOpts)) {
      journal(d.id, d.kind, d.reason);
      setFlash({ text: invalidationText[d.reason] || 'OPORTUNIDADE ENCERRADA.', at: Date.now() });
    }
    previousQueue.current = queue;
  }, [queue.map((o) => o.id).join(','), rows]);
  async function enterReal(o: Opportunity) {
    setBusy(true);
    setCardError('');
    try {
      // First click never sends: the server re-proposes under the REAL policy (all gates), then prepares the
      // nonce-bound final confirmation. Only CONFIRMAR ORDEM REAL can create a command.
      let row: any = o.row;
      if (row.payload.mode !== 'REAL')
        row = await post({ action: 'propose', mode: 'REAL', strategy: row.payload.setup.strategy });
      if (row.payload?.inspectionOnly || row.state !== 'AGUARDANDO CONFIRMAÇÃO' || row.payload?.proposalState === 'RISK_BLOCKED')
        throw new Error(
          row.payload?.riskBlock?.message ||
            (row.payload?.inspectionOnly ? 'REAL indisponível: há verificações pendentes no checklist REAL. Nada foi enviado.' : 'Proposta REAL não executável. Nada foi enviado.'),
        );
      const prepared = await post({ action: 'prepare-real', id: row.id, mode: 'REAL', strategy: row.payload.setup.strategy });
      setFinalConfirmation(prepared);
      journal(row.id, 'FINAL_CONFIRMATION_PRESENTED');
      await load();
    } catch (e) {
      setCardError(e instanceof Error ? e.message : 'REAL bloqueado. Nada foi enviado.');
    } finally {
      setBusy(false);
    }
  }
  async function confirmPaperCard(o: Opportunity) {
    setBusy(true);
    setCardError('');
    try {
      await post({ action: 'confirm', id: o.id, mode: 'PAPER', strategy: o.row.payload.setup.strategy, quantity: o.quantity });
      await load();
    } catch (e) {
      setCardError(e instanceof Error ? e.message : 'Entrada PAPER recusada');
    } finally {
      setBusy(false);
    }
  }
  async function discardCard(o: Opportunity) {
    setBusy(true);
    setCardError('');
    try {
      // The proposal's own mode: discarding the Copilot's proposal from the REAL view never creates a REAL record.
      await post({ action: 'discard', id: o.id, mode: o.row.payload.mode, strategy: o.row.payload.setup.strategy });
      setFlash({ text: 'OPORTUNIDADE DESCARTADA · decisão registrada; não conta como LOSS.', at: Date.now() });
      await load();
    } catch (e) {
      setCardError(e instanceof Error ? e.message : 'Falha ao descartar');
    } finally {
      setBusy(false);
    }
  }
  // Final confirmation TTL comes from the server (nonce expiresAt); once past it the dialog closes and nothing is sent.
  const confirmSeconds = finalConfirmation ? Math.max(0, Math.ceil((Date.parse(finalConfirmation.expiresAt) - (now + skew)) / 1000)) : 0;
  useEffect(() => {
    if (finalConfirmation && confirmSeconds <= 0) {
      journal(finalConfirmation.proposal.id, 'FINAL_CONFIRMATION_EXPIRED');
      setFlash({ text: 'CONFIRMAÇÃO EXPIRADA · nenhuma ordem enviada.', at: Date.now() });
      setFinalConfirmation(null);
    }
  }, [finalConfirmation, confirmSeconds]);
  const activeComplete =
    mode === 'PAPER' ? (paperComplete ?? complete) : (realComplete ?? complete);
  const activeSetupId = mode === 'PAPER' ? (paperSetupId ?? setupId) : setupId;
  const own = rows.filter(
      (r) => r.payload.source === source && r.payload.mode === mode,
    ),
    ownActive = own.some(
      (r) => (r.state === 'AGUARDANDO CONFIRMAÇÃO' && entryWindow(r.payload.expiresAt, now, skew).available) || (r.state === 'CONFIRMADA' && !r.execution?.exitTime),
    ),
    // ONE proposal, two destinations: in REAL mode the Copilot's proposal is shown with the REAL
    // destination (blocked until every REAL gate passes) instead of requiring a separate proposal.
    matching =
      mode === 'REAL' && !ownActive
        ? rows.filter((r) => r.payload.source === source && r.payload.mode === 'PAPER').concat(own)
        : own;
  const row =
      matching.find((r) => r.id === selectedId) ||
      matching.find(
        (r) =>
          r.state === 'AGUARDANDO CONFIRMAÇÃO' &&
          entryWindow(r.payload.expiresAt, now, skew).available,
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
  const entry = entryWindow(p?.expiresAt, now, skew),
    dailyBlocked = mode === 'PAPER' ? p?.riskSettings?.dailyBlocked ?? null : null,
    awaiting = row?.state === 'AGUARDANDO CONFIRMAÇÃO' && !riskBlocked,
    act = row?.actionability as { status: string; reasons: string[]; marketPrice: number | null } | undefined,
    priceOk = p?.source !== 'mt5' || act?.status === 'ACTIONABLE',
    notConfigured = p?.riskBlock?.code === 'RISK_LIMIT_NOT_CONFIGURED';
  const priority =
    awaiting && entry.available
      ? 'proposal'
      : row?.state === 'CONFIRMADA' && !x?.exitTime
        ? 'paper'
        : 'history';
  useEffect(() => setConfirmPaper(false), [row?.id, mode]);
  return (
    <section
      className="trade-operation"
      data-priority={priority}
      aria-label="Aprovação humana"
    >
      <OpportunityCard
        queue={finalConfirmation ? [] : queue}
        notices={notices}
        mode={mode}
        realReady={ready}
        realBlockedCount={readiness?.gates ? readiness.gates.filter((g: any) => !g.ok).length : null}
        busy={busy}
        error={cardError}
        strategyNames={strategyNames}
        flash={flash}
        onEnter={enterReal}
        onConfirmPaper={confirmPaperCard}
        onDiscard={discardCard}
        onEvent={journal}
        onDetails={(id) => {
          setSelectedId(id);
          document.querySelector('.trade-operation')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        onDismissNotice={(id) => setDismissedNotices((s) => new Set(s).add(id))}
      />
      <header className="trade-operation-header">
        <div>
          <span className="trade-eyebrow">
            {preview
              ? `PROPOSTA DO COPILOTO · DESTINO REAL${awaiting ? ` · ${entry.label}` : ''}`
              : priority === 'proposal'
                ? `SETUP CONFIRMADO · ${entry.label}`
                : awaiting
                  ? `SETUP CONFIRMADO · ${entry.label}`
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
      {mode === 'PAPER' && <RiskSettingsPanel onChanged={() => load().catch(() => {})} />}
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
              {readiness?.gates
                ? `${readiness.gates.filter((g: any) => !g.ok && g.kind === 'TECHNICAL').length} técnica(s) · ${readiness.gates.filter((g: any) => !g.ok && g.kind === 'DECISION').length} decisão(ões) sua(s) · ${readiness.gates.filter((g: any) => !g.ok && g.kind === 'SESSION').length} controle(s) de sessão`
                : '—'}{' '}
              · ver checklist
            </span>
          </summary>
          {source !== 'mt5' && (
            <p>Selecione XP / MetaTrader 5 para utilizar dados reais.</p>
          )}
          <RealChecklist
            gates={
              readiness?.gates || [
                {
                  key: 'loading',
                  label: 'Verificação server-side',
                  ok: false,
                  kind: 'TECHNICAL',
                  reason: 'Aguardando validação da persistência e dos gates.',
                },
              ]
            }
          />
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
              <dt>Risco/retorno</dt>
              <dd>1 : {num(p.rr)}</dd>
              {(() => {
                // Sizing as recorded in THIS proposal (immutable): later 1R changes never rewrite it.
                const oneR = p.riskSettings?.oneRBRL ?? p.sizing?.maxRiskBRL ?? null;
                return (
                  <>
                    <dt>1R configurado</dt>
                    <dd data-risk="one-r">
                      {oneR != null ? money(oneR) : 'não configurado'}
                      {p.riskSettings ? ` · gestão v${p.riskSettings.version}` : ''}
                    </dd>
                    <dt>Risco por contrato</dt>
                    <dd data-risk="per-contract">{money(p.riskPerContractBRL)}</dd>
                    <dt>Quantidade</dt>
                    <dd data-risk="quantity">{p.quantity} contrato(s)</dd>
                    <dt>Risco total</dt>
                    <dd data-risk="total">{money(p.riskBRL)}</dd>
                    <dt>Sobra do 1R</dt>
                    <dd data-risk="left">{oneR != null ? money(Math.max(0, oneR - p.riskBRL)) : '—'}</dd>
                    <dt>Potencial</dt>
                    <dd data-risk="potential">{money(p.potentialBRL)}</dd>
                    <dt>% do 1R utilizado</dt>
                    <dd data-risk="usage">
                      {oneR ? `${num((p.riskBRL / oneR) * 100)}%` : '—'}
                      {riskBlocked && p.riskPerContractBRL != null && oneR
                        ? ` · 1 contrato exigiria ${num((p.riskPerContractBRL / oneR) * 100)}% do 1R`
                        : ''}
                    </dd>
                  </>
                );
              })()}
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
                {!notConfigured && (
                  <p className="trade-operation-error" role="status" data-entry="risk-blocked">
                    BLOQUEADA POR RISCO ·{' '}
                    {p.riskBlock?.code === 'RISK_LIMIT_EXCEEDED'
                      ? `1 contrato arriscaria ${money(p.riskBlock.minimumRiskBRL)}. Seu limite por operação é ${money(p.riskBlock.maxRiskBRL)}. O stop técnico não é aproximado para caber.`
                      : p.riskBlock?.message || 'Proposta técnica não executável com o limite atual.'}
                  </p>
                )}
                <div className="trade-operation-actions">
                  <button className="trade-primary" disabled>
                    {mode === 'PAPER' ? 'ENTRAR EM PAPER' : 'ENTRAR REAL'}
                  </button>
                </div>
                <p className="trade-operation-caption">
                  {row.hypothetical_execution?.exitTime
                    ? `Observação hipotética encerrada: ${row.hypothetical_execution.exitReason === 'STOP' ? 'stop' : 'alvo'} · ${num(row.hypothetical_execution.resultR)}R · MFE ${num(row.hypothetical_execution.mfeR)}R · MAE ${num(row.hypothetical_execution.maeR)}R · ${num(row.hypothetical_execution.durationMinutes)} min.`
                    : 'Em observação hipotética para estudo. Não é uma operação PAPER nem uma ordem.'}
                </p>
              </>
            )}
            {!preview && awaiting && !entry.available && (
              <p className="trade-operation-error" role="status" data-entry="expired">
                ENTRADA EXPIRADA · não perseguir preço. O setup segue acompanhado no LAB como resultado HIPOTÉTICO.
              </p>
            )}
            {!preview && awaiting && entry.available && dailyBlocked && (
              <p className="trade-operation-error" role="status" data-entry="daily-blocked">
                {dailyBlocked === 'DAILY_LOSS_LIMIT_REACHED' ? 'PERDA MÁXIMA DIÁRIA ATINGIDA' : dailyBlocked === 'DAILY_TRADE_LIMIT_REACHED' ? 'MÁXIMO DE OPERAÇÕES DO DIA ATINGIDO' : 'GESTÃO DE RISCO BLOQUEIA ENTRADAS'} · nova entrada PAPER bloqueada. O setup segue no LAB como resultado HIPOTÉTICO.
              </p>
            )}
            {awaiting && entry.available && !priceOk && (
              <p className="trade-operation-error" role="status" data-entry={act?.status?.toLowerCase() || 'no_quote'}>
                {act?.status === 'MISSED'
                  ? 'ENTRADA PERDIDA · o preço se afastou da referência — não perseguir.'
                  : act?.status === 'INVALIDATED'
                    ? 'SETUP INVALIDADO · o preço passou do stop técnico.'
                    : act?.status === 'EXPIRED'
                      ? 'ENTRADA EXPIRADA · não perseguir preço.'
                      : 'SEM COTAÇÃO LIVE · o feed não está LIVE; nenhuma entrada é oferecida.'}{' '}
                {act?.reasons?.join(' ')} O setup segue acompanhado no LAB como resultado HIPOTÉTICO.
              </p>
            )}
            {!preview && awaiting && entry.available && priceOk && !dailyBlocked && mode === 'PAPER' && !confirmPaper && (
              <div className="trade-operation-actions">
                <span className="trade-operation-countdown" role="timer" aria-live="off" data-entry="available">
                  {entry.label}
                </span>
                <button
                  className="trade-primary"
                  disabled={busy || !entry.available}
                  onClick={() => {
                    setChosenQty(p.quantity);
                    setConfirmPaper(true);
                  }}
                >
                  ENTRAR EM PAPER
                </button>
                <button disabled={busy} onClick={() => action('discard', p.id)}>
                  NÃO ENTRAR
                </button>
              </div>
            )}
            {!preview && awaiting && entry.available && priceOk && !dailyBlocked && mode === 'PAPER' && confirmPaper && (
              <div className="trade-paper-confirm" role="group" aria-label="Confirmar entrada PAPER">
                <strong>
                  CONFIRMAR ENTRADA PAPER · {p.direction === 'BUY' ? 'COMPRA' : 'VENDA'} {p.symbol}
                </strong>
                <label>
                  Quantidade (máximo pelo risco: {p.quantity})
                  <input
                    aria-label="Quantidade da entrada PAPER"
                    type="number"
                    min={1}
                    step={1}
                    value={chosenQty}
                    onChange={(e) => setChosenQty(Math.trunc(Number(e.target.value)))}
                  />
                </label>
                {chosenQty > p.quantity && (
                  <p className="trade-operation-error" role="alert">
                    {chosenQty} contratos arriscariam {money(chosenQty * (p.riskPerContractBRL ?? 0))}, acima do seu limite de{' '}
                    {money(p.riskSettings?.oneRBRL ?? p.sizing?.maxRiskBRL ?? null)}.
                  </p>
                )}
                <p>
                  Risco {money(Math.max(0, Math.min(chosenQty, p.quantity)) * (p.riskPerContractBRL ?? 0))} · stop {num(p.sl)} · alvo {num(p.tp)} ·{' '}
                  {entry.label}. Simulação: nenhuma ordem é enviada à XP.
                </p>
                <div className="trade-operation-actions">
                  <button onClick={() => setConfirmPaper(false)} disabled={busy}>
                    CANCELAR
                  </button>
                  <button
                    className="trade-primary"
                    disabled={busy || !entry.available || chosenQty < 1 || chosenQty > p.quantity}
                    onClick={async () => {
                      await action('confirm', p.id, { quantity: chosenQty });
                      setConfirmPaper(false);
                    }}
                  >
                    CONFIRMAR ENTRADA PAPER
                  </button>
                </div>
              </div>
            )}
            {!preview && awaiting && entry.available && priceOk && !dailyBlocked && mode === 'REAL' && (
              <div className="trade-operation-actions">
                <span className="trade-operation-countdown" role="timer" aria-live="off" data-entry="available">
                  {entry.label}
                </span>
                <button
                  className="trade-primary"
                  disabled={busy || !entry.available || (!ready && !p.inspectionOnly)}
                  onClick={() => action('prepare-real', p.id)}
                >
                  {p.inspectionOnly ? 'REVISAR PROPOSTA REAL' : 'ENTRAR · ORDEM REAL'}
                </button>
                <button disabled={busy} onClick={() => action('discard', p.id)}>
                  NÃO ENTRAR
                </button>
              </div>
            )}
            {preview && mode === 'REAL' && awaiting && (
              <div className="trade-operation-actions" data-destination="real">
                <button className="trade-primary" disabled>
                  ENTRAR REAL
                </button>
                <small>
                  REAL INDISPONÍVEL ·{' '}
                  {readiness?.gates?.filter((g: any) => !g.ok).length ?? '—'} verificação(ões) bloqueada(s). A mesma
                  proposta continua disponível em PAPER.
                </small>
              </div>
            )}
            {notConfigured && mode === 'PAPER' && (
              <p className="trade-operation-error" role="status" data-entry="risk-missing">
                GESTÃO DE RISCO NÃO CONFIGURADA · sem 1R a proposta não é dimensionada.{' '}
                <button
                  onClick={() => {
                    const el = document.querySelector('.trade-risk') as HTMLDetailsElement | null;
                    if (el) {
                      el.open = true;
                      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }}
                >
                  CONFIGURAR AGORA
                </button>
              </p>
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
        // Not the operating path: the Copilot's proposal is the decision point. This is a REAL
        // inspection/audit tool (never sends while REAL is blocked).
        <details className="trade-real-inspection">
          <summary>Inspeção REAL · auditoria (sem envio)</summary>
          <p>
            Gera uma proposta REAL separada só para revisar gates, política e confirmação final. Com REAL bloqueado nenhuma ordem é
            enviada.
          </p>
          <button
            className="trade-primary"
            disabled={busy || source !== 'mt5' || !activeComplete}
            onClick={() => action('propose')}
          >
            Preparar proposta REAL
          </button>
        </details>
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
              <dd role="timer" data-seconds={confirmSeconds}>
                {new Date(finalConfirmation.expiresAt).toLocaleTimeString(
                  'pt-BR',
                )}{' '}
                · {confirmSeconds}s
              </dd>
            </dl>
            {!finalConfirmation.inspectionOnly && (
              <p className="trade-real-warning">
                Esta confirmação envia uma ORDEM REAL à XP / MetaTrader 5. O servidor revalida todos os gates; se
                qualquer um falhar, nada é enviado.
              </p>
            )}
            <button
              className="trade-primary"
              disabled={
                busy ||
                (!ready && !finalConfirmation.inspectionOnly) ||
                confirmSeconds <= 0
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
            <button
              onClick={() => {
                journal(finalConfirmation.proposal.id, 'FINAL_CONFIRMATION_CANCELLED');
                setFinalConfirmation(null);
              }}
            >
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
