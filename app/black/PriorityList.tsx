'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { blackConfig as config } from './black-config';
import { answer, firstTouchUtm, hubOrigin, loadDraft, loadFlow, saveDraft, saveFlow, signup, type ApiResult } from './campaign-client';
import { formatReais, groupHref, newToken, parseReais, type CampaignState, type StoredFlow } from './prelaunch-model';
import p from './prelaunch.module.css';

// Priority list: data (1 screen) → 5 questions (1 per screen) → confirmation + official group.
// Answers live in the HUB; the browser keeps a copy so refresh/back never lose progress.
const ERRORS: Record<string, string> = {
  invalid_phone: 'Confira o número do WhatsApp com DDD.', invalid_input: 'Confira seu nome e e-mail.', consent_required: 'Confirme o recebimento das informações da BLACK.',
  capture_closed: 'As inscrições da Lista Prioritária estão encerradas.', consent_outdated: 'O texto de consentimento foi atualizado. Recarregue a página.',
  too_many_requests: 'Muitas tentativas seguidas. Aguarde um instante e tente de novo.', network: 'Sem conexão com o servidor. Tente de novo.',
  unavailable: 'Não foi possível salvar agora. Tente de novo.', invalid_amount: 'Informe um valor em reais.', invalid_option: 'Escolha uma das opções.',
};
const message = (r: ApiResult) => ERRORS[r.error || ''] || ERRORS.unavailable;

export default function PriorityList({ open, onClose, state }: { open: boolean; onClose: () => void; state: CampaignState | null }) {
  const [flow, setFlow] = useState<StoredFlow | null>(null);
  const [step, setStep] = useState(0); // 0 = dados, 1..5 = perguntas, 6 = concluído
  const [draft, setDraft] = useState({ name: '', email: '', phone: '' });
  const [money, setMoney] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inflight = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const questions = state?.questions || [];
  const question = questions.find(q => q.n === step);

  useEffect(() => { // restore
    const stored = loadFlow();
    const d = loadDraft();
    setDraft({ name: d.name || '', email: d.email || '', phone: d.phone || '' });
    if (stored) { setFlow(stored); setStep(stored.completed ? 6 : Math.max(1, stored.step)); if (typeof stored.answers['5'] === 'number') setMoney(formatReais(String(Number(stored.answers['5']) / 100))); }
  }, []);
  useEffect(() => { if (open) requestAnimationFrame(() => heading.current?.focus({ preventScroll: true })); }, [open, step]);
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !inflight.current) onClose();
      if (e.key !== 'Tab' || !dialog.current) return;
      const controls = Array.from(dialog.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
        .filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { e.preventDefault(); heading.current?.focus({ preventScroll: true }); return; }
      if (e.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement as HTMLElement))) {
        e.preventDefault(); first.focus();
      }
    };
    const html = document.documentElement, previous = html.style.overflow;
    html.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey); html.style.overflow = previous;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  function persist(next: StoredFlow) { setFlow(next); saveFlow(next); }
  async function guarded<T>(fn: () => Promise<T>) { if (inflight.current) return; inflight.current = true; setBusy(true); setError(''); try { return await fn(); } finally { inflight.current = false; setBusy(false); } }

  const submitData = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); void guarded(async () => {
    const consent = (new FormData(e.currentTarget).get('consent') === 'on');
    if (!state) { setError(ERRORS.network); return; }
    if (!consent) { setError(ERRORS.consent_required); return; }
    const token = flow?.token || newToken(n => crypto.getRandomValues(new Uint8Array(n)));
    const r = await signup({ ...draft, consent: true, consent_version: state.consent_version, token, utm: firstTouchUtm(), landing_url: window.location.href.slice(0, 500), referrer: document.referrer.slice(0, 500), source: 'landing_black', website: (new FormData(e.currentTarget).get('website') || '') });
    if (!r.ok) { setError(message(r)); return; }
    const next: StoredFlow = { v: 1, token, step: r.next_step || 1, answers: flow?.answers || {}, completed: Boolean(r.completed), entryId: r.entry_id || null, groupAvailable: Boolean(r.group_available) };
    persist(next); if (next.completed) saveDraft(null); setStep(next.completed ? 6 : next.step);
  }); };

  const choose = (value: string | number) => void guarded(async () => {
    if (!flow || !question) return;
    const answers = { ...flow.answers, [String(question.n)]: value };
    persist({ ...flow, answers }); // keep the choice even if the network fails
    const r = await answer(flow.token, question.n, value);
    if (!r.ok) {
      if (r.error === 'invalid_token') { saveFlow(null); setFlow(null); setStep(0); setError('Confirme seus dados para continuar de onde parou.'); return; }
      setError(message(r)); return;
    }
    const target = r.completed ? 6 : Math.min(5, question.n + 1);
    const next = { ...flow, answers, step: target, completed: Boolean(r.completed), entryId: r.entry_id || flow.entryId, groupAvailable: Boolean(r.group_available) };
    persist(next);
    if (next.completed) saveDraft(null); // dados só ficam na sessão até a ficha terminar
    if (typeof value === 'string') await new Promise(resolve => setTimeout(resolve, 260)); // let the selection register visually
    setStep(target);
  });

  const submitMoney = (e: FormEvent) => { e.preventDefault(); const cents = parseReais(money); if (!cents) { setError(ERRORS.invalid_amount); return; } choose(cents); };
  if (!open) return null;
  const capture = state?.capture_open !== false;
  const group = groupHref(hubOrigin, flow?.entryId || null);
  return <div className={p.backdrop} role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !inflight.current) onClose(); }}>
    <div ref={dialog} className={p.sheet} role="dialog" aria-modal="true" aria-labelledby="lista-titulo" data-step={step}>
      <header className={p.sheetTop}>
        {step >= 2 && step <= 5 ? <button type="button" className={p.back} onClick={() => { setError(''); setStep(step - 1); }} disabled={busy}>← Voltar</button> : <span className={p.brand}>BLACK<b>FOCO</b><sup>26</sup></span>}
        {step >= 1 && step <= 5 ? <span className={p.counter} aria-live="polite">{step} de 5</span> : null}
        <button type="button" className={p.close} onClick={onClose} aria-label="Fechar" disabled={busy}>×</button>
      </header>
      {step >= 1 && step <= 5 ? <div className={p.progress} aria-hidden="true"><i style={{ width: `${(step / 5) * 100}%` }} /></div> : null}

      {step === 0 ? <form className={p.body} onSubmit={submitData} noValidate>
        <p className={p.kicker}>LISTA PRIORITÁRIA · ABERTURA {config.launch.opensAtLabel} · {config.launch.timeLabel}</p>
        <h2 id="lista-titulo" ref={heading} tabIndex={-1}>Entre primeiro na <em>BLACK FOCO 2026.</em></h2>
        {!capture ? <p className={p.note} role="status">As inscrições da Lista Prioritária estão encerradas.</p> : <>
          <label className={p.field} htmlFor="lista-nome"><span>Nome</span><input id="lista-nome" name="name" autoComplete="name" required minLength={2} maxLength={120} value={draft.name} onChange={e => { const d = { ...draft, name: e.target.value }; setDraft(d); saveDraft(d); }} /></label>
          <label className={p.field} htmlFor="lista-email"><span>E-mail</span><input id="lista-email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={200} value={draft.email} onChange={e => { const d = { ...draft, email: e.target.value }; setDraft(d); saveDraft(d); }} /></label>
          <label className={p.field} htmlFor="lista-whatsapp"><span>WhatsApp com DDD</span><input id="lista-whatsapp" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(71) 99999-9999" required maxLength={40} value={draft.phone} onChange={e => { const d = { ...draft, phone: e.target.value }; setDraft(d); saveDraft(d); }} /></label>
          <input className={p.honey} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
          <label className={p.consent} htmlFor="lista-consentimento"><input id="lista-consentimento" type="checkbox" name="consent" required defaultChecked={false} aria-describedby="lista-consentimento-texto" /><span id="lista-consentimento-texto">{state?.consent_text || 'Ao participar, você concorda em receber pelo WhatsApp informações relacionadas à BLACK FOCO 2026.'}</span></label>
          {error ? <p className={p.error} role="alert">{error}</p> : null}
          <button className={p.primary} type="submit" disabled={busy || !state}>{busy ? 'ENVIANDO…' : 'CONTINUAR'}<span aria-hidden="true">→</span></button>
          <p className={p.fine}>Depois, 5 perguntas rápidas. Leva menos de 1 minuto.</p>
        </>}
      </form> : null}

      {question && step >= 1 && step <= 5 ? <div className={p.body} key={step}>
        <p className={p.kicker}>PERGUNTA {step} DE 5</p>
        <h2 id="lista-titulo" ref={heading} tabIndex={-1}>{question.prompt}</h2>
        {question.type === 'choice' ? <div className={p.options} role="radiogroup" aria-labelledby="lista-titulo">
          {question.options!.map(o => { const selected = flow?.answers[String(step)] === o.key;
            return <button key={o.key} type="button" role="radio" aria-checked={selected} className={`${p.option} ${selected ? p.selected : ''}`} onClick={() => choose(o.key)} disabled={busy}><span>{o.label}</span><i aria-hidden="true" /></button>; })}
        </div> : <form onSubmit={submitMoney} className={p.moneyForm}>
          <label className={p.money}><span aria-hidden="true">R$</span><input aria-label="Valor em reais" inputMode="numeric" autoComplete="off" placeholder="0" value={money} onChange={e => setMoney(formatReais(e.target.value))} /></label>
          <p className={p.fine}>Responda com o valor que vier à sua cabeça. Não existe resposta certa.</p>
          <button className={p.primary} type="submit" disabled={busy || !parseReais(money)}>{busy ? 'ENVIANDO…' : 'CONCLUIR'}<span aria-hidden="true">→</span></button>
        </form>}
        {error ? <p className={p.error} role="alert">{error}</p> : null}
      </div> : null}
      {step >= 1 && step <= 5 && !question ? <div className={p.body}><h2 id="lista-titulo" ref={heading} tabIndex={-1}>Carregando a ficha…</h2>{error ? <p className={p.error} role="alert">{error}</p> : null}</div> : null}

      {step === 6 ? <div className={`${p.body} ${p.done}`}>
        <div className={p.seal} aria-hidden="true"><i /><b>✓</b></div>
        <p className={p.kicker}>INSCRIÇÃO CONFIRMADA</p>
        <h2 id="lista-titulo" ref={heading} tabIndex={-1}>Você está na Lista Prioritária <em>da BLACK FOCO 2026.</em></h2>
        <p className={p.lead}>Agora entre no grupo oficial da BLACK. É por lá que você receberá os principais avisos e informações da abertura.</p>
        {flow?.groupAvailable && group ? <a className={p.primary} href={group} target="_blank" rel="noopener">{config.launch.groupCta}<span aria-hidden="true">↗</span></a>
          : <p className={p.note} role="status">O link do grupo oficial vai chegar no seu WhatsApp.</p>}
        <p className={p.fine}>Aula especial + abertura em {config.launch.opensAtLong}, às {config.launch.timeLabel} ({config.launch.timeZoneLabel}).</p>
      </div> : null}
    </div>
  </div>;
}
