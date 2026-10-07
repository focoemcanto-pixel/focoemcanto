'use client';
import { useEffect, useRef, useState } from 'react';
import { clockLabel, minimize, restore, type BlockedNotice, type CardView, type Opportunity } from './opportunity';
const num = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
const money = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const NOTIFY_ASKED = 'focoTradeOpportunityNotifyAsked';
/**
 * OPORTUNIDADE ATIVA — global, high-visibility card for the head of the opportunity queue.
 * Time is never kept here: every second comes from the backend expiresAt via the queue. Minimize/restore only
 * switch presentation. ENTRAR never sends anything by itself: PAPER asks for a second click; REAL opens the
 * existing final confirmation (nonce/TTL) after the server re-proposes under the REAL policy.
 */
export default function OpportunityCard({
  queue,
  notices,
  mode,
  realReady,
  realBlockedCount,
  busy,
  error,
  strategyNames = {},
  flash,
  onEnter,
  onConfirmPaper,
  onDiscard,
  onEvent,
  onDetails,
  onDismissNotice,
}: {
  queue: Opportunity[];
  notices: BlockedNotice[];
  mode: 'PAPER' | 'REAL';
  realReady: boolean;
  realBlockedCount: number | null;
  busy: boolean;
  error?: string;
  strategyNames?: Record<string, string>;
  flash?: { text: string; at: number } | null;
  onEnter: (o: Opportunity) => void;
  onConfirmPaper: (o: Opportunity) => void;
  onDiscard: (o: Opportunity) => void;
  onEvent: (id: string, kind: string, reason?: string) => void;
  onDetails: (id: string) => void;
  onDismissNotice: (id: string) => void;
}) {
  const [view, setView] = useState<CardView>({}),
    [focusId, setFocusId] = useState(''),
    [paperStep, setPaperStep] = useState(''),
    [notify, setNotify] = useState<'unsupported' | 'default' | 'granted' | 'denied' | 'asked'>('unsupported'),
    presented = useRef(new Set<string>()),
    title = useRef<string | null>(null);
  const head = queue.find((o) => o.id === focusId) || queue[0],
    open = head && view[head.id] !== 'minimized';
  // Present each opportunity once (journal), and call the operator back only via a passive notification.
  useEffect(() => {
    for (const o of queue) {
      if (presented.current.has(o.id)) continue;
      presented.current.add(o.id);
      onEvent(o.id, 'OPPORTUNITY_PRESENTED');
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
          const p = o.row.payload,
            n = new Notification(`Oportunidade ${o.mode} · ${p.direction === 'BUY' ? 'COMPRA' : 'VENDA'} ${p.symbol}`, {
              body: `${o.quantity} contrato(s) · válida por ${clockLabel(o.seconds)}. Abra o Foco Trade para decidir.`,
              tag: `foco-trade-${o.id}`,
            });
          // Only brings the operator back to the app; it never executes anything.
          n.onclick = () => window.focus();
        }
      } catch {}
    }
  }, [queue.map((o) => o.id).join(',')]);
  // Discreet tab title while an opportunity is active; restored afterwards.
  useEffect(() => {
    if (title.current === null) title.current = document.title.replace(/^● OPORTUNIDADE [A-Z]+ · /, '');
    document.title = queue.length ? `● OPORTUNIDADE ${mode} · ${title.current}` : title.current;
  }, [queue.length, mode]);
  useEffect(
    () => () => {
      if (title.current !== null) document.title = title.current;
    },
    [],
  );
  useEffect(() => {
    try {
      if (typeof Notification === 'undefined') return setNotify('unsupported');
      setNotify(Notification.permission === 'default' && localStorage.getItem(NOTIFY_ASKED) ? 'asked' : (Notification.permission as any));
    } catch {
      setNotify('unsupported');
    }
  }, []);
  useEffect(() => setPaperStep(''), [head?.id, mode]);
  const askNotify = async () => {
    try {
      localStorage.setItem(NOTIFY_ASKED, '1');
    } catch {}
    try {
      setNotify((await Notification.requestPermission()) as any);
    } catch {
      setNotify('asked');
    }
  };
  const p = head?.row.payload,
    oneR = head?.oneRBRL ?? null,
    entryLabel = mode === 'PAPER' ? 'ENTRAR PAPER' : 'ENTRAR REAL',
    realDisabled = mode === 'REAL' && !realReady,
    urgent = !!head && head.seconds <= 10;
  return (
    <>
      {head && open && (
        <section className="trade-opportunity" data-mode={mode} data-urgent={urgent || undefined} role="alertdialog" aria-label={`Oportunidade ${mode}`}>
          <header>
            <span className="trade-opportunity-env" data-mode={mode}>
              {mode === 'PAPER' ? 'OPORTUNIDADE PAPER · SIMULAÇÃO' : 'OPORTUNIDADE REAL · DINHEIRO REAL'}
            </span>
            <span className="trade-opportunity-timer" role="timer" aria-live="off" data-seconds={head.seconds}>
              ENTRADA VÁLIDA POR <strong>{clockLabel(head.seconds)}</strong>
            </span>
          </header>
          <h2 data-direction={p.direction}>
            {p.direction === 'BUY' ? 'COMPRA' : 'VENDA'} · {p.symbol}
            <small>{head.quantity} contrato(s){mode === 'REAL' && p.mode === 'PAPER' ? ' · estimativa REAL, refeita no servidor ao entrar' : ''}</small>
          </h2>
          <p className="trade-opportunity-method">
            {strategyNames[p.setup?.strategy] || p.setup?.strategy} · v{p.setup?.version}
          </p>
          <dl>
            <dt>Entrada · referência</dt>
            <dd>{num(p.entry)}</dd>
            <dt>Stop técnico</dt>
            <dd>{num(p.sl)}</dd>
            <dt>Alvo</dt>
            <dd>{num(p.tp)}</dd>
            <dt>Risco</dt>
            <dd>
              {money(head.riskBRL)}
              {oneR != null ? ` / ${money(oneR)} do 1R` : ''}
            </dd>
            <dt>R/R</dt>
            <dd>1 : {num(p.rr)}</dd>
            <dt>Stop em pontos</dt>
            <dd>{num(p.riskPoints)} pts</dd>
          </dl>
          {queue.length > 1 && (
            <div className="trade-opportunity-queue" aria-label="Fila de oportunidades">
              <span>{queue.length} oportunidades · uma decisão por vez (a que expira primeiro está em foco)</span>
              {queue
                .filter((o) => o.id !== head.id)
                .map((o) => (
                  <button key={o.id} onClick={() => setFocusId(o.id)} disabled={busy}>
                    {o.row.payload.direction === 'BUY' ? 'COMPRA' : 'VENDA'} · {strategyNames[o.row.payload.setup?.strategy] || o.row.payload.setup?.strategy} ·{' '}
                    {clockLabel(o.seconds)}
                  </button>
                ))}
            </div>
          )}
          {mode === 'PAPER' && paperStep === head.id ? (
            <div className="trade-opportunity-actions">
              <p>
                Confirmar entrada PAPER de {head.quantity} contrato(s) · risco {money(head.riskBRL)}. Simulação: nenhuma ordem vai à XP.
              </p>
              <button onClick={() => setPaperStep('')} disabled={busy}>
                VOLTAR
              </button>
              <button className="trade-primary" disabled={busy || head.seconds <= 0} onClick={() => onConfirmPaper(head)}>
                CONFIRMAR ENTRADA PAPER
              </button>
            </div>
          ) : (
            <div className="trade-opportunity-actions">
              <button
                className="trade-primary"
                data-entry={mode === 'PAPER' ? 'paper' : 'real'}
                disabled={busy || head.seconds <= 0 || realDisabled}
                onClick={() => {
                  onEvent(head.id, 'ENTER_CLICKED');
                  if (mode === 'PAPER') setPaperStep(head.id);
                  else onEnter(head);
                }}
              >
                {entryLabel}
              </button>
              <button disabled={busy} onClick={() => onDiscard(head)}>
                DESCARTAR
              </button>
              <button
                onClick={() => {
                  setView((v) => minimize(v, head.id));
                  onEvent(head.id, 'OPPORTUNITY_MINIMIZED');
                }}
              >
                MINIMIZAR
              </button>
            </div>
          )}
          {realDisabled && (
            <p className="trade-opportunity-note">
              REAL ainda não disponível · {realBlockedCount ?? '—'} verificação(ões) pendente(s) no checklist REAL. Nada é enviado.
            </p>
          )}
          {mode === 'REAL' && !realDisabled && (
            <p className="trade-opportunity-note">ENTRAR REAL não envia ordem: abre a confirmação final, revalidada no servidor.</p>
          )}
          {error && (
            <p className="trade-operation-error" role="alert">
              {error}
            </p>
          )}
          {(notify === 'default' || notify === 'granted') && (
            <p className="trade-opportunity-note">
              {notify === 'granted' ? (
                'Alerta do navegador ativo: só chama você de volta, nunca executa.'
              ) : (
                <button className="trade-opportunity-link" onClick={askNotify}>
                  Ativar alerta do navegador para novas oportunidades
                </button>
              )}
            </p>
          )}
        </section>
      )}
      {head && !open && (
        <div className="trade-opportunity-chip" data-mode={mode} role="status">
          <strong>
            {mode} · {p.direction === 'BUY' ? 'COMPRA' : 'VENDA'} {p.symbol}
          </strong>
          <span>{head.quantity} contrato(s)</span>
          <span>{money(head.riskBRL)} risco</span>
          <span className="trade-opportunity-timer">{clockLabel(head.seconds)}</span>
          {queue.length > 1 && <span>+{queue.length - 1} na fila</span>}
          <button
            onClick={() => {
              setView((v) => restore(v, head.id));
              onEvent(head.id, 'OPPORTUNITY_RESTORED');
            }}
          >
            ABRIR
          </button>
        </div>
      )}
      {(notices.length > 0 || flash) && (
        <div className="trade-opportunity-notices" aria-live="polite">
          {flash && Date.now() - flash.at < 5000 && <p className="trade-opportunity-flash">{flash.text}</p>}
          {notices.slice(0, 3).map((n) => (
            <article key={n.id} className="trade-opportunity-notice">
              <span className="trade-eyebrow">SETUP IDENTIFICADO · BLOQUEADO POR RISCO</span>
              <strong>
                {n.row.payload.direction === 'BUY' ? 'COMPRA' : 'VENDA'} · {strategyNames[n.row.payload.setup?.strategy] || n.row.payload.setup?.strategy}
              </strong>
              <span>
                1 contrato: {money(n.minimumRiskBRL)} · seu 1R: {money(n.maxRiskBRL)} · stop técnico mantido
              </span>
              <div>
                <button onClick={() => onDetails(n.id)}>VER DETALHES</button>
                <button aria-label="Dispensar aviso" onClick={() => onDismissNotice(n.id)}>
                  ×
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
