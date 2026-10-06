'use client';
import { useEffect, useRef, useState } from 'react';
import RealChecklist from './RealChecklist';
const money = (v: number | null | undefined) =>
  v == null
    ? 'ausente'
    : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const clock = (v?: string | null) =>
  v ? new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
const reasons: Record<string, string> = {
  EXPIRED: 'sessão expirou',
  KILL_SWITCH: 'execução bloqueada (kill switch)',
  BRIDGE_OFFLINE: 'bridge MT5 offline',
  FEED_STALE: 'feed antigo/offline',
  BRIDGE_RESTARTED: 'EA/MT5 reiniciado',
  ACCOUNT_CHANGED: 'conta diferente',
  SYMBOL_CHANGED: 'símbolo diferente',
  POLICY_CHANGED: 'policy alterada',
  EA_EXECUTION_DISABLED: 'EA sem permissão de execução',
  DAILY_LOSS_LIMIT: 'perda diária máxima atingida',
  RECONCILIATION_PENDING: 'reconciliação pendente',
  CHECK_FAILED: 'verificação indisponível',
  MANUAL: 'bloqueada por você',
  REARMED: 'substituída por nova sessão',
};
/**
 * REAL session control. Three explicit states: INDISPONÍVEL (static configuration missing),
 * BLOQUEADO (can be armed) and ARMADO (temporary). Arming never sends an order.
 */
export default function RealSessionPanel({
  real,
  source,
  onChanged,
}: {
  real: any;
  source: 'replay' | 'mt5';
  onChanged: () => Promise<void> | void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [arming, setArming] = useState(false),
    [minutes, setMinutes] = useState(60),
    [acknowledged, setAcknowledged] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [, tick] = useState(0);
  useEffect(() => {
    if (arming && dialog.current && !dialog.current.open) dialog.current.showModal();
    else if (!arming) dialog.current?.close();
  }, [arming]);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);
  const state: 'ARMED' | 'BLOCKED' | 'UNAVAILABLE' =
    source !== 'mt5' ? 'UNAVAILABLE' : real?.state || 'UNAVAILABLE';
  // Readiness dimensions (single source): CONNECTED EA with execution DISABLED is not "disconnected".
  const d = real?.dimensions ?? null,
    label = (v: string | undefined, fallback: unknown) =>
      v === 'CONNECTED' ? 'CONECTADO' : v === 'DISCONNECTED' ? 'DESCONECTADO' : v === 'UNKNOWN' ? 'DESCONHECIDO' : fallback ? 'CONECTADO' : 'DESCONECTADO';
  const o = real?.overview || {},
    limits = real?.limits || {},
    max = o.maxSessionMinutes || 120,
    durations = [15, 30, 60, 120, 240, 480].filter((m) => m <= max);
  const post = async (url: string, body: unknown) => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Operação recusada pelo servidor');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha');
      return false;
    } finally {
      setBusy(false);
      await onChanged();
    }
  };
  const missing = (real?.armingGates || []).filter((g: any) => !g.ok);
  return (
    <section className="trade-real-session" data-state={state} aria-label="Sessão REAL">
      <div className="trade-real-session-head">
        <span className="trade-eyebrow">SESSÃO REAL</span>
        <strong>
          {state === 'ARMED'
            ? 'REAL ARMADO'
            : source === 'mt5' && real?.status
              ? real.status
              : state === 'BLOCKED'
                ? 'REAL BLOQUEADO'
                : 'REAL INDISPONÍVEL'}
        </strong>
        {state === 'ARMED' && (
          <small>
            Armado às {clock(real.session?.armedAt)} · expira às{' '}
            {clock(real.session?.expiresAt)}. Depois volta a BLOQUEADO
            sozinho.
          </small>
        )}
        {state === 'BLOCKED' && (
          <small>
            {real?.session?.reason
              ? `Última sessão encerrada: ${reasons[real.session.reason] || real.session.reason}. Nunca é rearmada automaticamente.`
              : 'Nenhuma sessão armada. Ordens REAL impossíveis até armar.'}
          </small>
        )}
        {state === 'UNAVAILABLE' && (
          <small>
            {source !== 'mt5'
              ? 'Selecione XP / MetaTrader 5.'
              : real?.pendingTechnical || real?.pendingDecisions
                ? `${real.pendingTechnical?.length ? `Infraestrutura pendente: ${real.pendingTechnical.map((g: any) => g.label).join(' · ')}. ` : 'Infraestrutura pronta. '}${real.pendingDecisions?.length ? `Aguardando suas decisões: ${real.pendingDecisions.map((g: any) => g.label).join(' · ')}.` : ''}`
                : `Motivo: ${missing.filter((g: any) => g.scope === 'static').map((g: any) => g.label).join(' · ') || 'configuração REAL incompleta'}.`}
          </small>
        )}
      </div>
      <dl className="trade-real-overview">
        <dt>Conta</dt>
        <dd>
          {o.accountMatches
            ? 'fingerprint confere (EA, backend e política)'
            : o.accountHashConfigured === false
              ? 'TRADE_ACCOUNT_HASH não configurado no backend'
              : o.bridgeAccountMatches === false
                ? 'fingerprint do EA diverge do backend'
                : o.bridgeAccountMatches
                  ? 'EA = backend · falta vincular à política'
                  : 'fingerprint não confere / não configurado'}
          {o.localFingerprintMatches === false ? ' · ExpectedAccountFingerprint do EA vazio/divergente' : ''}
          {o.accountTradeMode === 2 ? ' · conta REAL' : o.accountTradeMode == null ? '' : ' · conta não-REAL'}
          {o.freeMarginBRL != null ? ` · margem livre ${money(o.freeMarginBRL)}` : ''}
        </dd>
        <dt>Símbolo</dt>
        <dd>{o.symbol || '—'}</dd>
        <dt>Feed (dados de mercado)</dt>
        <dd data-readiness="market">
          {d?.marketData ?? o.feedStatus ?? 'DESCONHECIDO'}
          {(d?.feedAgeMs ?? o.feedAgeMs) != null && ` · ${Math.max(0, Math.round((d?.feedAgeMs ?? o.feedAgeMs) / 1000))}s`}
        </dd>
        <dt>Bridge</dt>
        <dd data-readiness="bridge">{label(d?.bridgeTransport, o.bridgeConnected)}</dd>
        <dt>EA</dt>
        <dd data-readiness="ea">
          {label(d?.ea, o.bridgeConnected)}
          {d?.eaVersion ? ` · v${d.eaVersion}` : ''}
        </dd>
        <dt>Execução no EA</dt>
        <dd data-readiness="ea-execution">
          {d ? (d.eaExecution === 'ENABLED' ? 'HABILITADA' : d.eaExecution === 'DISABLED' ? 'DESABILITADA' : 'DESCONHECIDA') : o.eaExecutionAllowed ? 'HABILITADA' : 'DESABILITADA'}
          {o.eaExecutionAllowed !== true && o.eaExecutionGate
            ? ` · ${[
                !o.eaExecutionGate.input && 'EnableExecution=false',
                !o.eaExecutionGate.terminalAlgoTrading && 'botão Algo Trading desligado',
                !o.eaExecutionGate.eaAlgoTrading && "'Permitir Algo Trading' desmarcado no EA",
                !o.eaExecutionGate.accountTradeAllowed && 'conta sem negociação',
                !o.eaExecutionGate.accountExpertAllowed && 'corretora não permite EA',
              ]
                .filter(Boolean)
                .join(' · ')}`
            : o.eaExecutionAllowed !== true && o.bridgeConnected
              ? ' · EnableExecution=true não basta: permissões do MT5 bloqueadas (detalhe no EA v2.07)'
              : ''}
        </dd>
        <dt>Sessão REAL · kill switch</dt>
        <dd data-readiness="session">
          {d?.realSession === 'ARMED' ? 'ARMADA' : d?.realSession === 'NOT_ARMED' ? 'NÃO ARMADA' : 'DESCONHECIDA'} · kill switch{' '}
          {d?.killSwitch === 'OFF' ? 'LIBERADO' : 'ATIVO'}
        </dd>
        {real?.error && (
          <>
            <dt>Erro do contexto REAL</dt>
            <dd className="trade-operation-error" data-readiness="error">
              {real.error.error} · {real.error.code}
              {real.error.operation ? ` · ${real.error.operation}` : ''}
              {real.error.httpStatus ? ` · HTTP ${real.error.httpStatus}` : ''}
            </dd>
          </>
        )}
        <dt>Policy</dt>
        <dd>{o.policyLoaded ? 'carregada' : 'não salva · aguardando seus limites (conta, símbolo e contrato vêm do servidor)'}</dd>
        <dt>Limite por operação</dt>
        <dd>{limits.maxRiskBRL == null ? 'você decide (ausente)' : money(limits.maxRiskBRL)}</dd>
        <dt>Contratos máx · perda diária máx</dt>
        <dd>
          {limits.maxContracts ?? '—'} · {money(limits.maxDailyLossBRL)}
          {o.loss24hBRL != null && ` (24h: ${money(o.loss24hBRL)})`}
        </dd>
        <dt>Exposição máx</dt>
        <dd>
          {limits.maxPositionContracts ?? '—'} contrato(s) ·{' '}
          {money(limits.maxNotionalBRL)}
        </dd>
        <dt>Posições · ordens pendentes</dt>
        <dd>
          {o.positions ?? '—'} · {o.orders ?? '—'}
        </dd>
        <dt>Kill switch</dt>
        <dd>{o.killSwitch === false ? 'liberado nesta sessão' : 'ATIVO · novas ordens bloqueadas'}</dd>
        <dt>Estratégias autorizadas</dt>
        <dd>{o.authorizedStrategies?.length ? o.authorizedStrategies.join(', ') : 'nenhuma'}</dd>
      </dl>
      <div className="trade-operation-actions">
        {state === 'ARMED' ? (
          <button
            className="trade-danger"
            disabled={busy}
            onClick={() => post('/api/trade/kill', { enabled: true })}
          >
            BLOQUEAR EXECUÇÃO
          </button>
        ) : (
          <button
            className="trade-primary"
            disabled={busy || state !== 'BLOCKED'}
            onClick={() => {
              setAcknowledged(false);
              setMinutes(durations.includes(60) ? 60 : durations[0] || 15);
              setArming(true);
            }}
          >
            ARMAR SESSÃO REAL
          </button>
        )}
      </div>
      {state === 'ARMED' && (
        <p className="trade-operation-caption">
          BLOQUEAR EXECUÇÃO impede novas ordens, desarma a sessão e cancela
          comandos ainda na fila. Não fecha posições abertas nem cancela ordens
          que já chegaram à corretora: gerencie-as no MT5.
        </p>
      )}
      {error && (
        <p className="trade-operation-error" role="status">
          {error}
        </p>
      )}
      <dialog
        className="trade-real-dialog"
        ref={dialog}
        onCancel={() => setArming(false)}
        onClose={() => setArming(false)}
      >
        {arming && (
          <>
            <span className="trade-eyebrow">ARMAR SESSÃO REAL</span>
            <h2>Armar a sessão REAL?</h2>
            <p>
              Armar NÃO envia ordem. Durante a sessão, cada ordem ainda exige
              proposta READY, seu clique e a confirmação final.
            </p>
            <div className="trade-real-checklist">
              <RealChecklist gates={real?.armingGates || []} />
            </div>
            <label>
              Duração{' '}
              <select
                aria-label="Duração da sessão REAL"
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              >
                {durations.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </label>
            <label className="trade-real-ack">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />{' '}
              Entendo que, armada, a sessão permite que EU envie ordens com
              dinheiro real na XP após a confirmação final de cada uma.
            </label>
            <button
              className="trade-primary"
              disabled={busy || !acknowledged || !real?.canArm}
              onClick={async () => {
                if (
                  await post('/api/trade/real-session', {
                    action: 'arm',
                    minutes,
                    confirmation: 'ARMAR SESSÃO REAL',
                  })
                )
                  setArming(false);
              }}
            >
              CONFIRMAR ARMAMENTO
            </button>
            <button onClick={() => setArming(false)}>CANCELAR</button>
          </>
        )}
      </dialog>
      <RealConfig source={source} onChanged={onChanged} />
    </section>
  );
}

/** One-time static configuration: risk policy and per-version live authorization. */
function RealConfig({
  source,
  onChanged,
}: {
  source: 'replay' | 'mt5';
  onChanged: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false),
    [data, setData] = useState<any>(null),
    [form, setForm] = useState<Record<string, any>>({}),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const load = async () => {
    const r = await fetch('/api/trade/real-config', { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMessage(d.error || 'Configuração indisponível');
    setData(d);
    const p = d.policy || {};
    setForm({
      maxRiskBRL: p.max_risk_brl ?? '',
      maxDailyLossBRL: p.max_daily_loss_brl ?? '',
      maxSlippagePoints: p.max_slippage_points ?? '',
      maxContracts: p.max_contracts ?? 1,
      maxNotionalBRL: p.max_notional_brl ?? '',
      maxOrdersPerSession: p.max_orders_per_session ?? '',
      maxOrdersPerDay: p.max_orders_per_day ?? '',
      maxSessionMinutes: p.max_session_minutes ?? 120,
      rolloverConfirmed: p.rollover_confirmed === true && p.symbol === d.symbol,
      enabled: p.enabled === true,
    });
  };
  useEffect(() => {
    if (open && source === 'mt5') load();
  }, [open, source]);
  const send = async (body: unknown) => {
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch('/api/trade/real-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Configuração recusada');
      setMessage('Salvo. Qualquer sessão REAL armada foi desarmada.');
      await load();
      await onChanged();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falha');
    } finally {
      setBusy(false);
    }
  };
  const field = (key: string, label: string, step = 'any') => (
    <label key={key}>
      {label}
      <input
        type="number"
        step={step}
        value={form[key] ?? ''}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <details className="trade-real-config" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Configuração REAL · uma vez</summary>
      {source !== 'mt5' ? (
        <p>Selecione XP / MetaTrader 5.</p>
      ) : !data ? (
        <p>{message || 'Carregando…'}</p>
      ) : (
        <>
          <p className="trade-operation-caption">
            Conta: {data.accountConfigured ? (data.bridgeAccountMatches ? 'TRADE_ACCOUNT_HASH confere com o EA' : 'TRADE_ACCOUNT_HASH diverge do EA') : 'TRADE_ACCOUNT_HASH ausente no backend'} ·
            modo {data.accountTradeMode === 2 ? 'REAL' : data.accountTradeMode ?? '—'} · símbolo{' '}
            {data.symbol} · execução backend{' '}
            {data.executionBackendEnabled ? 'habilitada' : 'desabilitada (TRADE_EXECUTION_ENABLED)'}
          </p>
          <div className="trade-real-config-grid">
            {field('maxRiskBRL', 'Limite de risco por operação (R$)')}
            {field('maxDailyLossBRL', 'Perda máxima diária (R$)')}
            {field('maxSlippagePoints', 'Desvio máximo (pontos)')}
            {field('maxContracts', `Contratos máximos (≤ ${data.maxContractsCap})`, '1')}
            {field('maxNotionalBRL', 'Exposição nocional máxima (R$)')}
            {field('maxOrdersPerSession', 'Ordens por sessão', '1')}
            {field('maxOrdersPerDay', 'Ordens por dia', '1')}
            {field('maxSessionMinutes', 'Duração máxima da sessão armada (min)', '1')}
          </div>
          <label className="trade-real-ack">
            <input
              type="checkbox"
              checked={!!form.rolloverConfirmed}
              onChange={(e) => setForm({ ...form, rolloverConfirmed: e.target.checked })}
            />{' '}
            Confirmo que {data.symbol} é o contrato vigente
            {data.contractExpiresAt ? ` (vencimento MT5 ${new Date(data.contractExpiresAt).toLocaleDateString('pt-BR')})` : ''}.
          </label>
          <label className="trade-real-ack">
            <input
              type="checkbox"
              checked={!!form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />{' '}
            Permitir sessões REAL nesta conta (ainda exige armar e confirmar cada ordem).
          </label>
          <button
            disabled={busy}
            onClick={() =>
              send({ action: 'policy', policy: form, confirmation: 'SALVAR CONFIGURAÇÃO REAL' })
            }
          >
            SALVAR CONFIGURAÇÃO REAL
          </button>
          <h4>Estratégias autorizadas para REAL (por versão)</h4>
          {data.strategies.map((s: any) => {
            const a = data.authorizations.find(
              (x: any) => x.strategy_id === s.id && x.version === s.version,
            );
            const on = a?.live_authorized === true && a?.stage === 'live-monitoring';
            return (
              <div key={s.id} className="trade-real-authorization">
                <span>
                  {s.name} · v{s.version} · {on ? 'AUTORIZADA' : 'não autorizada'}
                </span>
                <button
                  disabled={busy}
                  onClick={() =>
                    send({
                      action: 'authorize',
                      strategy: s.id,
                      version: s.version,
                      authorized: !on,
                      confirmation: 'AUTORIZAR ESTRATÉGIA REAL',
                    })
                  }
                >
                  {on ? 'Revogar' : 'Autorizar'}
                </button>
              </div>
            );
          })}
          {message && <p role="status">{message}</p>}
        </>
      )}
    </details>
  );
}
