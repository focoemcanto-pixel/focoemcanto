'use client';
import { useEffect, useState } from 'react';
import { oneRBRL, type RiskStatus } from '../../trade/bridge/risk-model';
const money = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
const blockedText: Record<string, string> = {
  RISK_SETTINGS_MISSING: 'NÃO CONFIGURADA · nenhuma entrada PAPER é liberada até salvar a gestão de risco',
  RISK_SETTINGS_UNAVAILABLE: 'INDISPONÍVEL · entradas PAPER bloqueadas (falha segura)',
  DAILY_LOSS_LIMIT_REACHED: 'PERDA MÁXIMA DIÁRIA ATINGIDA · novas entradas PAPER bloqueadas; scanner e LAB continuam',
  DAILY_TRADE_LIMIT_REACHED: 'MÁXIMO DE OPERAÇÕES DO DIA ATINGIDO · scanner e LAB continuam',
};
/**
 * GESTÃO DE RISCO (PAPER). Operational capital is a planning number, not the broker balance. The
 * backend validates and computes 1R; this form is only an input. Saving can never enable REAL.
 */
export default function RiskSettingsPanel({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState<RiskStatus | null>(null),
    [form, setForm] = useState({ capitalBRL: '', riskModel: 'PCT_CAPITAL', riskValue: '1', dailyLossUnit: 'R', dailyLossValue: '3', maxContracts: '1', maxTradesPerDay: '5' }),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(''),
    [busy, setBusy] = useState(false);
  const load = async () => {
    const r = await fetch('/api/trade/risk', { cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Gestão de risco indisponível');
    setStatus(d);
    const s = d.settings;
    if (s)
      setForm({
        capitalBRL: String(s.capitalBRL),
        riskModel: s.riskModel,
        riskValue: String(s.riskValue),
        dailyLossUnit: s.dailyLossUnit,
        dailyLossValue: String(s.dailyLossValue),
        maxContracts: String(s.maxContracts),
        maxTradesPerDay: String(s.maxTradesPerDay),
      });
  };
  useEffect(() => {
    load().catch((e) => setError(e.message));
    const t = setInterval(() => load().catch(() => {}), 30000);
    return () => clearInterval(t);
  }, []);
  const s = status?.settings,
    preview = oneRBRL(Number(form.capitalBRL) || 0, form.riskModel as any, Number(form.riskValue) || 0);
  const save = async () => {
    setBusy(true);
    setError('');
    setSaved('');
    try {
      const r = await fetch('/api/trade/risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Configuração recusada');
      setStatus(d);
      setSaved(`Versão ${d.settings.version} salva. Propostas já criadas mantêm o risco original.`);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Configuração recusada');
    } finally {
      setBusy(false);
    }
  };
  const field = (key: keyof typeof form, label: string, extra: Record<string, unknown> = {}) => (
    <label>
      {label}
      <input inputMode="decimal" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} {...extra} />
    </label>
  );
  return (
    <details className="trade-risk" open={!s} data-blocked={status?.blocked || undefined}>
      <summary>
        <span className="trade-eyebrow">GESTÃO DE RISCO · PAPER</span>
        <strong>{s ? `1R = ${money(s.oneRBRL)}` : 'NÃO CONFIGURADA'}</strong>
        {status?.blocked && <em role="status">{blockedText[status.blocked] || status.blocked}</em>}
      </summary>
      {s && (
        <dl className="trade-risk-current">
          <dt>Capital operacional</dt>
          <dd>{money(s.capitalBRL)}</dd>
          <dt>Modelo</dt>
          <dd>{s.riskModel === 'FIXED_BRL' ? `R$ fixo · ${money(s.riskValue)}` : `% do capital · ${num(s.riskValue)}%`}</dd>
          <dt>1R atual</dt>
          <dd>{money(s.oneRBRL)}</dd>
          <dt>Perda máxima diária</dt>
          <dd>
            {s.dailyLossUnit === 'R' ? `${num(s.dailyLossValue)}R · ` : ''}
            {money(s.dailyLossBRL)}
          </dd>
          <dt>Máximo de contratos</dt>
          <dd>{s.maxContracts}</dd>
          <dt>Máximo de operações/dia</dt>
          <dd>{s.maxTradesPerDay}</dd>
          <dt>Hoje (PAPER executado)</dt>
          <dd>
            {status!.tradesToday} operação(ões) · perda {money(status!.lossTodayBRL)}
            {status!.lossTodayR != null ? ` (${num(status!.lossTodayR)}R)` : ''} · risco em aberto {money(status!.openRiskBRL)} · restante{' '}
            {money(status!.dailyLossRemainingBRL)}
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
        {field('capitalBRL', 'Capital operacional (R$) — não é o saldo da corretora')}
        <label>
          Modelo de 1R
          <select value={form.riskModel} onChange={(e) => setForm({ ...form, riskModel: e.target.value })}>
            <option value="PCT_CAPITAL">% do capital</option>
            <option value="FIXED_BRL">Valor fixo em R$</option>
          </select>
        </label>
        {field('riskValue', form.riskModel === 'FIXED_BRL' ? '1R (R$)' : 'Risco por operação (% do capital)')}
        <label>
          Perda máxima diária em
          <select value={form.dailyLossUnit} onChange={(e) => setForm({ ...form, dailyLossUnit: e.target.value })}>
            <option value="R">R</option>
            <option value="BRL">R$</option>
          </select>
        </label>
        {field('dailyLossValue', form.dailyLossUnit === 'R' ? 'Perda máxima diária (R)' : 'Perda máxima diária (R$)')}
        {field('maxContracts', 'Máximo de contratos por operação', { inputMode: 'numeric' })}
        {field('maxTradesPerDay', 'Máximo de operações por dia', { inputMode: 'numeric' })}
        <p className="trade-risk-preview">
          1R calculado: <strong>{preview > 0 ? money(preview) : '—'}</strong> (confirmado pelo servidor ao salvar)
        </p>
        <button className="trade-primary" disabled={busy}>
          SALVAR GESTÃO DE RISCO
        </button>
        {error && <p className="trade-operation-error">{error}</p>}
        {saved && <p role="status">{saved}</p>}
        <small>
          O stop técnico nunca é aproximado para caber no risco. Esta configuração vale só para PAPER e não habilita REAL.
        </small>
      </form>
    </details>
  );
}
