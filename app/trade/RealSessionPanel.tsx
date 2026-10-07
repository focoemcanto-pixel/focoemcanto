'use client';
import { useEffect, useRef, useState } from 'react';
import RealChecklist from './RealChecklist';
import { oneRBRL } from '../../trade/bridge/risk-model';
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

/** Accepts "10.000,50", "10000.5" or "1,5". Empty or invalid → NaN (never a hidden default). */
const parse = (v: unknown) => {
  const t = String(v ?? '').trim().replace(/\s|R\$/g, '');
  if (!t) return NaN;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : NaN;
};
const brl = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const plain = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
// Operational starting points (editable). Capital and 1R are never prefilled: they are the operator's decision.
const starting = {
  capitalBRL: '',
  riskModel: 'PCT_CAPITAL',
  riskValue: '',
  dailyLossUnit: 'R',
  dailyLossValue: '3',
  maxContracts: '1',
  maxOrdersPerSession: '3',
  maxOrdersPerDay: '5',
  maxSessionMinutes: '120',
  maxSlippagePoints: '50',
  maxNotionalBRL: '50000',
  rolloverConfirmed: false,
  enabled: false,
};
type RealForm = typeof starting;
const fromSettings = (s: any, symbol: string, policy: any): RealForm => ({
  capitalBRL: String(s.capitalBRL).replace('.', ','),
  riskModel: s.riskModel,
  riskValue: String(s.riskValue).replace('.', ','),
  dailyLossUnit: s.dailyLossUnit,
  dailyLossValue: String(s.dailyLossValue).replace('.', ','),
  maxContracts: String(s.maxContracts),
  maxOrdersPerSession: String(s.maxOrdersPerSession),
  maxOrdersPerDay: String(s.maxOrdersPerDay),
  maxSessionMinutes: String(s.maxSessionMinutes),
  maxSlippagePoints: String(s.maxSlippagePoints).replace('.', ','),
  maxNotionalBRL: String(s.maxNotionalBRL).replace('.', ','),
  // Rollover confirmation is per contract: a new symbol needs a new explicit confirmation.
  rolloverConfirmed: s.rolloverConfirmed === true && s.symbol === symbol && policy?.rollover_confirmed === true,
  enabled: s.enabled === true && policy?.enabled === true,
});

/**
 * Static REAL configuration: GESTÃO DE RISCO · REAL (capital operacional → 1R → policy) and per-version live
 * authorization. Saving never arms REAL, never releases the kill switch and never sends an order; it disarms
 * any armed session. Capital operacional is a planning number, shown apart from the XP balance/margin.
 */
function RealConfig({
  source,
  onChanged,
}: {
  source: 'replay' | 'mt5';
  onChanged: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false),
    [data, setData] = useState<any>(null),
    [form, setForm] = useState<RealForm>(starting),
    [ack, setAck] = useState(false),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    editing = useRef(false);
  const load = async () => {
    const r = await fetch('/api/trade/real-config', { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMessage(d.error || 'Configuração indisponível');
    setData(d);
    if (!editing.current) setForm(d.riskSettings ? fromSettings(d.riskSettings, d.symbol, d.policy) : starting);
  };
  useEffect(() => {
    if (open && source === 'mt5') load();
  }, [open, source]);
  const send = async (body: unknown, done: string) => {
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch('/api/trade/real-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String(d.error || 'Configuração recusada').replace(/^REAL_RISK_SETTINGS_INVALID:\s*/, ''));
      editing.current = false;
      setAck(false);
      setMessage(done);
      await load();
      await onChanged();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falha');
    } finally {
      setBusy(false);
    }
  };
  const set = (k: keyof RealForm, v: string | boolean) => {
    editing.current = true;
    setAck(false);
    setForm((f) => ({ ...f, [k]: v }));
  };
  const capital = parse(form.capitalBRL),
    value = parse(form.riskValue),
    oneR = capital > 0 && value > 0 ? oneRBRL(capital, form.riskModel as any, value) : NaN,
    daily = parse(form.dailyLossValue),
    dailyBRL = form.dailyLossUnit === 'R' ? daily * oneR : daily,
    numbers = {
      maxContracts: parse(form.maxContracts),
      maxOrdersPerSession: parse(form.maxOrdersPerSession),
      maxOrdersPerDay: parse(form.maxOrdersPerDay),
      maxSessionMinutes: parse(form.maxSessionMinutes),
      maxSlippagePoints: parse(form.maxSlippagePoints),
      maxNotionalBRL: parse(form.maxNotionalBRL),
    },
    complete = [capital, value, daily, ...Object.values(numbers)].every((v) => Number.isFinite(v) && v > 0);
  const field = (key: keyof RealForm, label: string, placeholder: string, mode: 'decimal' | 'numeric' = 'decimal') => (
    <label>
      {label}
      <input inputMode={mode} placeholder={placeholder} value={String(form[key])} onChange={(e) => set(key, e.target.value)} />
    </label>
  );
  const s = data?.riskSettings;
  return (
    <details className="trade-real-config" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Configuração REAL · gestão de risco e estratégias</summary>
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
          <section className="trade-risk" data-mode="REAL">
            <span className="trade-eyebrow">GESTÃO DE RISCO · REAL</span>
            <strong>{s ? `1R = ${brl(Number(s.oneRBRL))} · versão ${s.version}` : 'GESTÃO DE RISCO REAL NÃO CONFIGURADA · aguardando sua configuração'}</strong>
            <dl className="trade-risk-current">
              <dt>Capital operacional (planejamento)</dt>
              <dd>{s ? brl(Number(s.capitalBRL)) : '—'}</dd>
              <dt>Saldo / margem da corretora (XP)</dt>
              <dd className="trade-kv-prose">
                {brl(data.brokerBalanceBRL)} / margem livre {brl(data.brokerFreeMarginBRL)} · capacidade de execução; sem margem a XP recusa
                a ordem mesmo dentro do 1R.
              </dd>
              {data.riskCapBRL != null && (
                <>
                  <dt>Teto administrativo de 1R</dt>
                  <dd>{data.riskCapBRL > 0 ? brl(data.riskCapBRL) : 'inválido · REAL bloqueado'}</dd>
                </>
              )}
            </dl>
            <form
              className="trade-risk-form"
              onSubmit={(e) => {
                e.preventDefault();
                send(
                  {
                    action: 'policy',
                    confirmation: 'SALVAR CONFIGURAÇÃO REAL',
                    settings: { ...numbers, capitalBRL: capital, riskModel: form.riskModel, riskValue: value, dailyLossUnit: form.dailyLossUnit, dailyLossValue: daily, rolloverConfirmed: form.rolloverConfirmed, enabled: form.enabled },
                  },
                  'Gestão REAL salva e política REAL atualizada. Qualquer sessão REAL armada foi desarmada; nenhuma ordem foi enviada.',
                );
              }}
            >
              {field('capitalBRL', 'Capital operacional (R$) — planejamento, não é o saldo da XP', 'ex.: 2.000,00')}
              <fieldset className="trade-risk-model">
                <legend>Como definir 1R?</legend>
                <label>
                  <input type="radio" name="realRiskModel" checked={form.riskModel === 'PCT_CAPITAL'} onChange={() => set('riskModel', 'PCT_CAPITAL')} />
                  Percentual do capital
                </label>
                <label>
                  <input type="radio" name="realRiskModel" checked={form.riskModel === 'FIXED_BRL'} onChange={() => set('riskModel', 'FIXED_BRL')} />
                  Valor fixo
                </label>
              </fieldset>
              {form.riskModel === 'PCT_CAPITAL'
                ? field('riskValue', 'Risco por operação (% do capital, até 10%)', 'ex.: 5')
                : field('riskValue', '1R (R$)', 'ex.: 100,00')}
              <fieldset className="trade-risk-model">
                <legend>Perda máxima diária em</legend>
                <label>
                  <input type="radio" name="realDailyUnit" checked={form.dailyLossUnit === 'R'} onChange={() => set('dailyLossUnit', 'R')} />R
                </label>
                <label>
                  <input type="radio" name="realDailyUnit" checked={form.dailyLossUnit === 'BRL'} onChange={() => set('dailyLossUnit', 'BRL')} />
                  R$
                </label>
              </fieldset>
              {field('dailyLossValue', form.dailyLossUnit === 'R' ? 'Perda máxima diária (R)' : 'Perda máxima diária (R$)', form.dailyLossUnit === 'R' ? 'ex.: 3' : 'ex.: 300,00')}
              {field('maxOrdersPerSession', 'Máximo de operações por sessão', 'ex.: 3', 'numeric')}
              {field('maxOrdersPerDay', 'Máximo de operações por dia', 'ex.: 5', 'numeric')}
              {field('maxSessionMinutes', 'Duração máxima da sessão armada (min)', 'ex.: 120', 'numeric')}
              {field('maxContracts', `Máximo de contratos por operação (até ${data.maxContractsCap})`, 'ex.: 1', 'numeric')}
              <label>
                Máximo de posições simultâneas
                <input value="1" disabled readOnly />
              </label>
              {field('maxSlippagePoints', 'Desvio máximo aceito entre a proposta e a execução (pontos)', 'ex.: 50')}
              {field('maxNotionalBRL', 'Exposição máxima (valor nocional: preço × R$ por ponto × contratos, em R$)', 'ex.: 50.000,00')}
              <label className="trade-real-ack">
                <input type="checkbox" checked={form.rolloverConfirmed} onChange={(e) => set('rolloverConfirmed', e.target.checked)} /> Confirmo que{' '}
                {data.symbol} é o contrato vigente
                {data.contractExpiresAt ? ` (vencimento MT5 ${new Date(data.contractExpiresAt).toLocaleDateString('pt-BR')})` : ''}. Um novo contrato exige nova confirmação.
              </label>
              <label className="trade-real-ack">
                <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Permitir sessões REAL nesta conta (ainda
                exige estratégia autorizada, armar a sessão e confirmar cada ordem duas vezes).
              </label>
              <div className="trade-risk-summary" aria-live="polite">
                <span className="trade-eyebrow">RESUMO ANTES DE SALVAR</span>
                <dl>
                  <dt>Capital operacional</dt>
                  <dd>{brl(capital)}</dd>
                  <dt>Risco por operação</dt>
                  <dd>{form.riskModel === 'PCT_CAPITAL' ? (Number.isFinite(value) ? `${plain(value)}% do capital` : '—') : 'valor fixo'}</dd>
                  <dt>SEU 1R REAL</dt>
                  <dd data-risk-preview="real-one-r">
                    <strong>{brl(oneR)}</strong>
                  </dd>
                  <dt>Perda máxima diária</dt>
                  <dd>
                    {brl(dailyBRL)}
                    {form.dailyLossUnit === 'R' && Number.isFinite(daily) ? ` · ${plain(daily)}R` : ''}
                  </dd>
                  <dt>Contratos / posições</dt>
                  <dd>
                    {plain(numbers.maxContracts)} / 1
                  </dd>
                  <dt>Operações por sessão / dia</dt>
                  <dd>
                    {plain(numbers.maxOrdersPerSession)} / {plain(numbers.maxOrdersPerDay)}
                  </dd>
                  <dt>Sessão</dt>
                  <dd>{plain(numbers.maxSessionMinutes)} min</dd>
                  <dt>Desvio máximo</dt>
                  <dd>{plain(numbers.maxSlippagePoints)} pts</dd>
                  <dt>Exposição máxima</dt>
                  <dd>{brl(numbers.maxNotionalBRL)}</dd>
                </dl>
                <small>Calculado na tela; o servidor recalcula o 1R, grava uma nova versão auditada e gera a política REAL.</small>
              </div>
              <label className="trade-real-ack">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Revisei o resumo: estes passam a ser os limites
                REAL. Salvar desarma qualquer sessão armada e não envia ordem.
              </label>
              <button className="trade-primary" disabled={busy || !complete || !ack}>
                SALVAR CONFIGURAÇÃO REAL
              </button>
              <small>
                A estrutura define o stop; o stop define o risco por contrato; o 1R define a quantidade (arredondada para baixo). Se 1 contrato
                excede o 1R, a proposta fica BLOQUEADA POR RISCO — o stop nunca é aproximado. O EA aplica o menor entre os limites dele e os da
                política: ele só aperta, nunca amplia. Esta gestão é só do REAL; a do PAPER continua separada.
              </small>
            </form>
            {data.riskHistory?.length > 0 && (
              <details>
                <summary>Histórico da gestão REAL</summary>
                <ul>
                  {data.riskHistory.map((h: any) => (
                    <li key={h.version}>
                      v{h.version} · {new Date(h.createdAt).toLocaleString('pt-BR')} · capital {brl(Number(h.capitalBRL))} ·{' '}
                      {h.riskModel === 'FIXED_BRL' ? 'fixo' : `${plain(Number(h.riskValue))}%`} · 1R {brl(Number(h.oneRBRL))} · diário{' '}
                      {brl(Number(h.dailyLossBRL))} · {h.enabled ? 'sessões permitidas' : 'sessões não permitidas'}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
          <h4>Estratégias autorizadas para REAL (por versão) · decisão sua</h4>
          {data.strategies.map((st: any) => {
            const a = data.authorizations.find(
              (x: any) => x.strategy_id === st.id && x.version === st.version,
            );
            const on = a?.live_authorized === true && a?.stage === 'live-monitoring';
            return (
              <div key={st.id} className="trade-real-authorization">
                <span>
                  {st.name} · v{st.version} · {on ? 'AUTORIZADA' : 'não autorizada'}
                </span>
                <button
                  disabled={busy}
                  onClick={() =>
                    send(
                      {
                        action: 'authorize',
                        strategy: st.id,
                        version: st.version,
                        authorized: !on,
                        confirmation: 'AUTORIZAR ESTRATÉGIA REAL',
                      },
                      on ? 'Autorização revogada.' : 'Estratégia autorizada para REAL.',
                    )
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
