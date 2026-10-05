'use client';
import { useEffect, useRef, useState } from 'react';
import { oneRBRL, type RiskStatus } from '../../trade/bridge/risk-model';
const money = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
/** Accepts "10.000,50", "10000.5" or "1,5". Empty or invalid → NaN (never a hidden default). */
const parse = (v: string) => {
  const t = v.trim().replace(/\s|R\$/g, '');
  if (!t) return NaN;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : NaN;
};
const blockedText: Record<string, string> = {
  RISK_SETTINGS_MISSING: 'Sem configuração nenhuma entrada PAPER é dimensionada. Scanner, setups e LAB continuam.',
  RISK_SETTINGS_UNAVAILABLE: 'Gestão de risco indisponível · entradas PAPER bloqueadas (falha segura).',
  DAILY_LOSS_LIMIT_REACHED: 'PERDA MÁXIMA DIÁRIA ATINGIDA · novas entradas PAPER bloqueadas; scanner e LAB continuam.',
  DAILY_TRADE_LIMIT_REACHED: 'MÁXIMO DE OPERAÇÕES DO DIA ATINGIDO · scanner e LAB continuam.',
};
const empty = { capitalBRL: '', riskModel: 'PCT_CAPITAL', riskValue: '', dailyLossUnit: 'R', dailyLossValue: '', maxContracts: '', maxTradesPerDay: '' };
/**
 * GESTÃO DE RISCO (PAPER). Nothing is prefilled: the user types capital, 1R rule and limits. The 1R
 * preview is recalculated on every keystroke but only "SALVAR CONFIGURAÇÃO" creates a new immutable
 * version (the backend validates and computes the authoritative 1R). Capital is a planning number,
 * not the broker balance. Saving can never enable REAL.
 */
export default function RiskSettingsPanel({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState<RiskStatus | null>(null),
    [form, setForm] = useState(empty),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(''),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [open, setOpen] = useState(false),
    editing = useRef(false);
  const fill = (s: any) =>
    setForm({
      capitalBRL: String(s.capitalBRL).replace('.', ','),
      riskModel: s.riskModel,
      riskValue: String(s.riskValue).replace('.', ','),
      dailyLossUnit: s.dailyLossUnit,
      dailyLossValue: String(s.dailyLossValue).replace('.', ','),
      maxContracts: String(s.maxContracts),
      maxTradesPerDay: String(s.maxTradesPerDay),
    });
  const load = async () => {
    const r = await fetch('/api/trade/risk', { cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Gestão de risco indisponível');
    setStatus(d);
    // First load: open automatically while nothing is configured; afterwards the user decides.
    setLoaded((was) => {
      if (!was && !d.settings) setOpen(true);
      return true;
    });
    // The periodic refresh never overwrites what the user is typing.
    if (d.settings && !editing.current) fill(d.settings);
  };
  useEffect(() => {
    load().catch((e) => {
      setError(e.message);
      setLoaded(true);
    });
    const t = setInterval(() => load().catch(() => {}), 30000);
    return () => clearInterval(t);
  }, []);
  const s = status?.settings,
    capital = parse(form.capitalBRL),
    value = parse(form.riskValue),
    daily = parse(form.dailyLossValue),
    maxC = parse(form.maxContracts),
    maxT = parse(form.maxTradesPerDay),
    oneR = capital > 0 && value > 0 ? oneRBRL(capital, form.riskModel as any, value) : NaN,
    dailyBRL = form.dailyLossUnit === 'R' ? daily * oneR : daily;
  const set = (k: keyof typeof empty, v: string) => {
    editing.current = true;
    setSaved('');
    setForm((f) => ({ ...f, [k]: v }));
  };
  const save = async () => {
    setBusy(true);
    setError('');
    setSaved('');
    try {
      const r = await fetch('/api/trade/risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capitalBRL: capital, riskModel: form.riskModel, riskValue: value, dailyLossUnit: form.dailyLossUnit, dailyLossValue: daily, maxContracts: maxC, maxTradesPerDay: maxT }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Configuração recusada');
      editing.current = false;
      setStatus(d);
      fill(d.settings);
      setSaved(`Versão ${d.settings.version} salva. Propostas já criadas mantêm o risco original; setups ainda válidos são recalculados.`);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^RISK_SETTINGS_INVALID:\s*/, '') : 'Configuração recusada');
    } finally {
      setBusy(false);
    }
  };
  const field = (key: keyof typeof empty, label: string, placeholder: string, mode: 'decimal' | 'numeric' = 'decimal') => (
    <label>
      {label}
      <input inputMode={mode} placeholder={placeholder} value={form[key]} onChange={(e) => set(key, e.target.value)} />
    </label>
  );
  const complete = [capital, value, daily, maxC, maxT].every((v) => Number.isFinite(v) && v > 0);
  return (
    <details className="trade-risk" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} data-blocked={status?.blocked || undefined}>
      <summary>
        <span className="trade-eyebrow">GESTÃO DE RISCO · PAPER</span>
        <strong>{!loaded ? 'Carregando…' : s ? `1R = ${money(s.oneRBRL)}` : 'GESTÃO DE RISCO NÃO CONFIGURADA'}</strong>
        {status?.blocked && <em role="status">{blockedText[status.blocked] || status.blocked}</em>}
      </summary>
      {s && (
        <dl className="trade-risk-current">
          <dt>Capital operacional</dt>
          <dd>{money(s.capitalBRL)}</dd>
          <dt>Risco por operação</dt>
          <dd>{s.riskModel === 'FIXED_BRL' ? `valor fixo · ${money(s.riskValue)}` : `${num(s.riskValue)}% do capital`}</dd>
          <dt>1R</dt>
          <dd>{money(s.oneRBRL)}</dd>
          <dt>Limite diário</dt>
          <dd>
            {s.dailyLossUnit === 'R' ? `${num(s.dailyLossValue)}R · ` : ''}
            {money(s.dailyLossBRL)}
          </dd>
          <dt>Máximo de operações/dia</dt>
          <dd>{s.maxTradesPerDay}</dd>
          <dt>Máximo de contratos</dt>
          <dd>{s.maxContracts}</dd>
          <dt>Hoje · PAPER LIVE</dt>
          <dd>
            {status!.tradesToday} operação(ões) · perdas consumidas {money(status!.lossTodayBRL)}
            {status!.lossTodayR != null ? ` (${num(status!.lossTodayR)}R)` : ''} · risco em aberto {money(status!.openRiskBRL)} · disponível{' '}
            {money(status!.dailyLossRemainingBRL)} · P&L líquido {money(status!.netPnlTodayBRL)}
          </dd>
          <dt>Versão</dt>
          <dd>
            v{s.version} · {s.configHash.slice(0, 8)}
          </dd>
        </dl>
      )}
      <form
        className="trade-risk-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {field('capitalBRL', 'Capital operacional (R$) — planejamento, não é o saldo da XP', 'ex.: 10.000,00')}
        <fieldset className="trade-risk-model">
          <legend>Como definir 1R?</legend>
          <label>
            <input type="radio" name="riskModel" checked={form.riskModel === 'PCT_CAPITAL'} onChange={() => set('riskModel', 'PCT_CAPITAL')} />
            Percentual do capital
          </label>
          <label>
            <input type="radio" name="riskModel" checked={form.riskModel === 'FIXED_BRL'} onChange={() => set('riskModel', 'FIXED_BRL')} />
            Valor fixo
          </label>
        </fieldset>
        {form.riskModel === 'PCT_CAPITAL'
          ? field('riskValue', 'Risco por operação (% do capital)', 'ex.: 1,00')
          : field('riskValue', '1R (R$)', 'ex.: 80,00')}
        <fieldset className="trade-risk-model">
          <legend>Limite de perda diária em</legend>
          <label>
            <input type="radio" name="dailyLossUnit" checked={form.dailyLossUnit === 'R'} onChange={() => set('dailyLossUnit', 'R')} />R
          </label>
          <label>
            <input type="radio" name="dailyLossUnit" checked={form.dailyLossUnit === 'BRL'} onChange={() => set('dailyLossUnit', 'BRL')} />
            R$
          </label>
        </fieldset>
        {field('dailyLossValue', form.dailyLossUnit === 'R' ? 'Limite de perda diária (R)' : 'Limite de perda diária (R$)', form.dailyLossUnit === 'R' ? 'ex.: 3' : 'ex.: 300,00')}
        {field('maxTradesPerDay', 'Máximo de operações por dia', 'ex.: 5', 'numeric')}
        {field('maxContracts', 'Máximo de contratos por operação', 'ex.: 3', 'numeric')}
        <div className="trade-risk-summary" aria-live="polite">
          <span className="trade-eyebrow">RESUMO ANTES DE SALVAR</span>
          <dl>
            <dt>Capital operacional</dt>
            <dd>{money(capital)}</dd>
            <dt>Risco por operação</dt>
            <dd>{form.riskModel === 'PCT_CAPITAL' ? (Number.isFinite(value) ? `${num(value)}%` : '—') : 'valor fixo'}</dd>
            <dt>SEU 1R</dt>
            <dd data-risk-preview="one-r">
              <strong>{money(oneR)}</strong>
            </dd>
            <dt>Limite diário</dt>
            <dd>
              {form.dailyLossUnit === 'R' && Number.isFinite(daily) ? `${num(daily)}R · ` : ''}
              {money(dailyBRL)}
            </dd>
            <dt>Máximo de operações</dt>
            <dd>{Number.isFinite(maxT) ? maxT : '—'}</dd>
            <dt>Máximo de contratos</dt>
            <dd>{Number.isFinite(maxC) ? maxC : '—'}</dd>
          </dl>
          <small>Calculado na tela enquanto você digita; o servidor confirma ao salvar.</small>
        </div>
        <button className="trade-primary" disabled={busy || !complete}>
          SALVAR CONFIGURAÇÃO
        </button>
        {error && (
          <p className="trade-operation-error" role="alert">
            {error}
          </p>
        )}
        {saved && <p role="status">{saved}</p>}
        <small>
          O stop técnico nunca é aproximado para caber no risco: a estrutura define o stop, o stop define o risco por contrato e o 1R
          define a quantidade. Esta configuração vale só para PAPER e não habilita REAL.
        </small>
      </form>
    </details>
  );
}
