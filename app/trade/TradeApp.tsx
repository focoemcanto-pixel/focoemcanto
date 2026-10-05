'use client';
import dynamic from 'next/dynamic';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import ScannerPanel from './ScannerPanel';
import type { ScannerResult } from '../../trade/scanner/types';
import OperationsPanel from './OperationsPanel';
import type { runReplay } from '../../trade/core/engine';
import type { Timeframe, Setup, Analysis } from '../../trade/core/types';
const Chart = dynamic(() => import('./Chart'), {
  ssr: false,
  loading: () => (
    <div className="trade-chart trade-skeleton">Preparando gráfico…</div>
  ),
});
type State = Omit<ReturnType<typeof runReplay>, 'source'> & {
  source: 'replay' | 'live';
  scanner?: ScannerResult;
  paperAnalysis?: Analysis;
  feed?: {
    symbol: string;
    status: string;
    ageMs: number | null;
    maxAgeMs: number;
    receivedAt: string | null;
    lastTick: {
      timeMsc: number;
      last: number;
      bid: number;
      ask: number;
      volume: number;
    } | null;
    executionEnabled: boolean;
    killSwitch: boolean;
    positionsCount: number;
    ordersCount: number;
  };
};
type Mode = 'Copiloto' | 'Professor' | 'Replay';
const format = (n: number | undefined) =>
  n === undefined
    ? '—'
    : n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const time = (t: number) =>
  new Date(t * 1000).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
function Glyph({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    chart: (
      <>
        <path d="M4 18V6m5 9V3m6 17V9m5 5V5" />
        <path d="M2 10h4m1-3h4m2 8h4m1-6h4" />
      </>
    ),
    brain: (
      <>
        <path d="M9 4a3 3 0 0 0-5 3 4 4 0 0 0 0 7 3 3 0 0 0 5 4m6-14a3 3 0 0 1 5 3 4 4 0 0 1 0 7 3 3 0 0 1-5 4M9 4v16m6-16v16M9 8H6m9 4h4M9 15H6" />
      </>
    ),
    play: <path d="m8 5 10 7-10 7Z" />,
    pause: <path d="M8 5v14m8-14v14" />,
    step: <path d="m5 5 10 7-10 7Zm13 0v14" />,
    reset: (
      <>
        <path d="M5 7a8 8 0 1 1-1 8M5 3v5h5" />
      </>
    ),
    book: (
      <>
        <path d="M3 4h6l3 3 3-3h6v15h-6l-3 2-3-2H3ZM12 7v14" />
      </>
    ),
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    logout: <path d="M10 4H4v16h6m3-4 4-4-4-4m-5 4h13" />,
    check: <path d="m5 12 4 4 10-10" />,
    bolt: <path d="m13 2-8 12h6l-1 8 9-12h-6Z" />,
  };
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.chart}
    </svg>
  );
}
function SetupCard({ setup }: { setup: Setup }) {
  return (
    <div className="trade-setup">
      <div className="trade-eyebrow">SETUP COMPLETO · PAPER</div>
      <h3>
        {setup.direction === 'long' ? 'Hipótese de alta' : 'Hipótese de baixa'}{' '}
        <span>{time(setup.timestamp)}</span>
      </h3>
      <dl>
        <div>
          <dt>Referência</dt>
          <dd>{format(setup.entry)}</dd>
        </div>
        <div>
          <dt>Invalidação</dt>
          <dd>{format(setup.stop)}</dd>
        </div>
        <div>
          <dt>Alvo</dt>
          <dd>{format(setup.targets[0])}</dd>
        </div>
        <div>
          <dt>Risco / retorno</dt>
          <dd>1 : {setup.rr.toFixed(1)}</dd>
        </div>
        <div>
          <dt>Stop técnico</dt>
          <dd>{format(setup.riskPoints)} pts</dd>
        </div>
        <div>
          <dt>Potencial</dt>
          <dd>{format(setup.potentialPoints)} pts</dd>
        </div>
      </dl>
      <p>{setup.explanation}</p>
      <small>
        {setup.strategy} · v{setup.version}
      </small>
      {setup.conflicts.map((c) => (
        <p key={c}>{c}</p>
      ))}
    </div>
  );
}
export default function TradeApp() {
  const [mode, setMode] = useState<Mode>('Copiloto'),
    [tf, setTf] = useState<Timeframe>('1m'),
    [cursor, setCursor] = useState(180),
    [state, setState] = useState<State>(),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [authed, setAuthed] = useState(true),
    [bottom, setBottom] = useState('Estratégias'),
    [question, setQuestion] = useState(''),
    [asking, setAsking] = useState(false),
    [chat, setChat] = useState<
      { role: string; text: string; provider?: string }[]
    >([]),
    [learning, setLearning] = useState(false),
    [learnAnswer, setLearnAnswer] = useState(''),
    [learnTrend, setLearnTrend] = useState('neutral'),
    [revealed, setRevealed] = useState(false),
    [note, setNote] = useState(''),
    [journal, setJournal] = useState<any[]>([]),
    [journalStatus, setJournalStatus] = useState(''),
    [saving, setSaving] = useState(false),
    [runStatus, setRunStatus] = useState(''),
    [savingRun, setSavingRun] = useState(false),
    [savedRuns, setSavedRuns] = useState<any[]>([]);
  const [source, setSource] = useState<'replay' | 'mt5'>('replay');
  const [pulse, setPulse] = useState(0);
  const [executionMode, setExecutionMode] = useState<'PAPER' | 'REAL'>('PAPER');
  useEffect(() => {
    if (source !== 'mt5') return;
    const timer = setInterval(() => setPulse((p) => p + 1), 2000);
    return () => clearInterval(timer);
  }, [source]);
  const requestId = useRef(0);
  const latestCursor = useRef(cursor);
  latestCursor.current = cursor;
  const redirect = useCallback(() => {
    window.location.href = '/admin/login/?next=%2Ftrade%2F';
  }, []);
  // The /trade/ route is already protected server-side by Pages middleware.
  // Avoid blocking the entire UI on a redundant client-side session probe.
  // Protected Trade APIs still enforce auth and redirect on 401.
  useEffect(() => {
    if (!authed) return;
    const id = ++requestId.current;
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/trade/evaluate?cursor=${cursor}&source=${source}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (r) => {
        if (r.status === 401) {
          redirect();
          throw new Error('Sessão expirada.');
        }
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Erro na análise.');
        if (id === requestId.current) {
          setState(d);
          setError('');
        }
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          setError(e.message);
          setPlaying(false);
        }
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
    return () => controller.abort();
  }, [cursor, authed, redirect, source, pulse]);
  useEffect(() => {
    if (!playing || loading || source === 'mt5') return;
    const timer = setTimeout(
      () =>
        setCursor((c) => {
          if (c >= 420) {
            setPlaying(false);
            return c;
          }
          return c + 1;
        }),
      1000 / speed,
    );
    return () => clearTimeout(timer);
  }, [playing, loading, cursor, speed]);
  useEffect(() => {
    if (bottom !== 'Diário' || !authed) return;
    fetch('/api/trade/journal', { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setJournal(d.records);
        setJournalStatus(
          d.limited
            ? 'Mostrando as primeiras 100 notas.'
            : 'Notas salvas no servidor.',
        );
      })
      .catch((e) => setJournalStatus(e.message));
  }, [bottom, authed]);
  const ask = async (text: string) => {
    if (asking || !text.trim()) return;
    setPlaying(false);
    setAsking(true);
    setQuestion('');
    setChat((c) => [...c, { role: 'Você', text }]);
    try {
      const r = await fetch('/api/trade/professor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, cursor, source }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setChat((c) => [
        ...c,
        { role: 'Professor', text: d.answer, provider: d.provider },
      ]);
    } catch (e) {
      setChat((c) => [...c, { role: 'Professor', text: (e as Error).message }]);
    } finally {
      setAsking(false);
    }
  };
  const saveNote = async (e: FormEvent) => {
    e.preventDefault();
    if (source === 'mt5') {
      setJournalStatus(
        'O diário desta tela está associado ao replay. Selecione Replay para salvar.',
      );
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const r = await fetch('/api/trade/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, cursor }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setJournal((j) => [d.record, ...j]);
      setNote('');
      setJournalStatus('Nota salva.');
    } catch (e) {
      setJournalStatus((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const saveRun = async () => {
    if (source === 'mt5') return;
    setSavingRun(true);
    try {
      const r = await fetch('/api/trade/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cursor }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setSavedRuns((rows) => [d.record, ...rows]);
      setRunStatus('Execução salva no servidor.');
    } catch (e) {
      setRunStatus((e as Error).message);
    } finally {
      setSavingRun(false);
    }
  };
  useEffect(() => {
    if (bottom !== 'Resultados' || !authed) return;
    fetch('/api/trade/runs', { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setSavedRuns(d.records);
      })
      .catch((e) => setRunStatus(e.message));
  }, [bottom, authed]);
  const analysis =
      state?.scanner?.opportunities.find((c) => c.state === 'CONFIRMED')
        ?.analysis ||
      state?.scanner?.opportunities.find((c) => c.state === 'WAITING_TRIGGER')
        ?.analysis ||
      state?.analyses[0],
    candles = state?.snapshot.candles[tf] || [],
    last = state?.snapshot.candles['1m'].at(-1),
    hide = learning && !revealed;
  const satisfied = analysis?.conditions.filter((c) => c.met).length || 0;
  const changeMode = (m: Mode) => {
    setMode(m);
    setLearning(false);
    setRevealed(false);
  };
  if (!authed)
    return (
      <main className="trade-app trade-loading">
        <div className="trade-wordmark">
          foco<span>trade</span>
          <i />
        </div>
        <p>{error || 'Verificando acesso FocoOS…'}</p>
        <a href="/admin/login/?next=%2Ftrade%2F">Entrar no FocoOS</a>
      </main>
    );
  const feed = source === 'mt5' ? state?.feed : undefined;
  const feedAge = feed?.lastTick ? Date.now() - feed.lastTick.timeMsc : null;
  const live =
    !!feed &&
    feed.status === 'LIVE' &&
    feedAge !== null &&
    feedAge >= -2000 &&
    feedAge <= (feed.maxAgeMs || 15000) &&
    !error;
  return (
    <main className="trade-app ft-relative">
      <header className="trade-header">
        <a href="/trade/" className="trade-wordmark">
          foco<span>trade</span>
          <i />
        </a>
        <div className="trade-divider" />
        <span className="trade-header-caption">CLAREZA ANTES DA DECISÃO</span>
        <nav aria-label="Modos">
          {(['Copiloto', 'Professor', 'Replay'] as Mode[]).map((m) => (
            <button
              key={m}
              className={mode === m ? 'active' : ''}
              onClick={() => changeMode(m)}
            >
              <Glyph
                name={
                  m === 'Copiloto'
                    ? 'bolt'
                    : m === 'Professor'
                      ? 'book'
                      : 'play'
                }
              />
              {m}
            </button>
          ))}
        </nav>
        <div className="trade-account">
          <span className="trade-badge" data-execution-mode={executionMode}>
            {executionMode === 'PAPER' ? 'PAPER LAB' : 'EXECUÇÃO REAL'}
          </span>
          <button
            title="Sair da sessão FocoOS"
            onClick={async () => {
              await fetch('/api/admin/session', { method: 'DELETE' });
              redirect();
            }}
            aria-label="Sair"
          >
            <Glyph name="logout" />
          </button>
        </div>
      </header>
      <div className="trade-source trade-feed-source">
        <select
          aria-label="Fonte de mercado"
          value={source}
          onChange={(e) => {
            setSource(e.target.value as 'replay' | 'mt5');
            setState(undefined);
            setPlaying(false);
            setChat([]);
            setRevealed(false);
          }}
        >
          <option value="replay">Mock / Replay</option>
          <option value="mt5">XP / MetaTrader 5</option>
        </select>
        <span>
          <i />{' '}
          {source === 'mt5' ? (live ? 'LIVE' : feed?.status === 'STALE' ? 'STALE' : 'OFFLINE') : 'REPLAY'}
        </span>
        <p>
          {source === 'mt5'
            ? `${feed?.symbol || 'MT5'} · último dado ${feed?.lastTick ? new Date(feed.lastTick.timeMsc).toLocaleTimeString('pt-BR') : 'aguardando'} · idade ${feedAge === null ? '—' : Math.max(0, Math.round(feedAge / 1000)) + 's'} · Bid ${format(feed?.lastTick?.bid)} / Ask ${format(feed?.lastTick?.ask)} / Last ${format(feed?.lastTick?.last)} · posições ${feed?.positionsCount || 0} / ordens ${feed?.ordersCount || 0} · execução ${feed?.executionEnabled ? 'configurada' : 'bloqueada'}`
            : 'Laboratório de estratégias · dados simulados'}
        </p>
        {source === 'mt5' && (
          <button
            onClick={async () => {
              const r = await fetch('/api/trade/kill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: true }),
              });
              if (!r.ok)
                setError('Não foi possível confirmar o bloqueio no servidor');
              else setPulse((p) => p + 1);
            }}
          >
            Bloquear execução
          </button>
        )}
      </div>
      <section className="trade-workspace">
        <div className="trade-market">
          <div className="trade-instrument">
            <div>
              <label htmlFor="trade-symbol" className="trade-eyebrow">
                CONTRATO EM ESTUDO
              </label>
              <div className="trade-instrument-name">
                <select id="trade-symbol" aria-label="Ativo">
                  <option>
                    {source === 'mt5' ? feed?.symbol || 'MT5' : 'WIN'}
                  </option>
                </select>
                <span>
                  Mini Índice · {source === 'mt5' ? 'XP / MT5' : 'simulação'}
                </span>
              </div>
            </div>
            <div className="trade-quote">
              <strong>
                {source === 'mt5'
                  ? live
                    ? format(feed?.lastTick?.last || feed?.lastTick?.bid)
                    : '—'
                  : format(last?.close)}
              </strong>
              <small>
                {source === 'mt5'
                  ? live
                    ? 'Último tick recebido'
                    : 'Feed antigo/offline · preço ao vivo oculto'
                  : last
                    ? `${time(last.timestamp + 60)} · último fechamento 1m`
                    : 'Aguardando primeiro candle'}
              </small>
            </div>
            <div className="trade-market-stat">
              <small>VOLUME 1m</small>
              <strong>{format(last?.volume)}</strong>
            </div>
            <div className="trade-market-stat">
              <small>CONTEXTO 15m</small>
              <strong>
                {hide
                  ? 'Análise oculta'
                  : analysis?.trend === 'up'
                    ? 'Alta'
                    : analysis?.trend === 'down'
                      ? 'Baixa'
                      : 'Indefinido'}
              </strong>
            </div>
          </div>
          <div className="trade-chart-toolbar">
            <div className="trade-timeframes">
              {(['1m', '5m', '15m', '1h'] as Timeframe[]).map((t) => (
                <button
                  key={t}
                  className={tf === t ? 'active' : ''}
                  onClick={() => setTf(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="trade-chart-legend">
              <span>
                <i className="support" />
                Estrutura 5m
              </span>
              <span>
                <i />
                EMA 4 · gráfico
              </span>
            </div>
            <span className="trade-eyebrow">CANDLES FECHADOS</span>
          </div>
          <div className="trade-chart-wrap">
            <Chart
              candles={candles}
              analysis={analysis}
              timeframe={tf}
              hideAnalysis={hide}
              trendPoints={state?.trendLines[tf] || []}
            />
            {!candles.length && (
              <div className="trade-empty-chart">
                {tf === '1h'
                  ? 'Revele pelo menos 60 minutos para formar um candle 1h.'
                  : 'Avance o replay para revelar candles fechados.'}
              </div>
            )}
            {loading && <span className="trade-sync">Calculando…</span>}
          </div>
          <div className="trade-player">
            <div className="trade-player-label">
              <Glyph name="play" />
              <div>
                <strong>Replay de mercado</strong>
                <small>{state?.marketStatus || 'Preparando sessão'}</small>
              </div>
            </div>
            <div
              className="trade-player-controls"
              style={source === 'mt5' ? { display: 'none' } : undefined}
            >
              <button
                onClick={() => {
                  setPlaying(false);
                  setCursor(0);
                  setRevealed(false);
                }}
                aria-label="Voltar ao início"
                title="Voltar ao início"
              >
                <Glyph name="reset" />
              </button>
              <button
                className="trade-play"
                onClick={() => setPlaying(!playing)}
                disabled={cursor === 420}
                aria-label={playing ? 'Pausar' : 'Reproduzir'}
              >
                <Glyph name={playing ? 'pause' : 'play'} />
              </button>
              <button
                onClick={() => {
                  setPlaying(false);
                  setCursor((c) => Math.min(420, c + 1));
                }}
                disabled={loading || cursor === 420}
                aria-label="Próximo candle"
                title="Próximo candle"
              >
                <Glyph name="step" />
              </button>
              <select
                aria-label="Velocidade do replay"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                {[0.5, 1, 2, 5, 10].map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
            </div>
            <div
              className="trade-progress"
              style={source === 'mt5' ? { display: 'none' } : undefined}
            >
              <progress max={420} value={cursor} />
              <small>{cursor} / 420 candles</small>
            </div>
          </div>
          {error && (
            <div className="trade-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <aside className="trade-side">
          {mode === 'Professor' ? (
            <>
              <div className="trade-panel-heading">
                <div className="trade-panel-icon">
                  <Glyph name="book" />
                </div>
                <div>
                  <h2>Professor</h2>
                  <p>Entenda o que o gráfico diz.</p>
                </div>
              </div>
              {!hide && (
                <ScannerPanel
                  source={source}
                  cursor={cursor}
                  initial={state?.scanner}
                  professor
                />
              )}
              <button
                className="trade-learn-button"
                onClick={() => {
                  setPlaying(false);
                  setLearning(!learning);
                  setRevealed(false);
                  setLearnAnswer('');
                }}
              >
                {' '}
                {learning
                  ? 'Voltar à conversa'
                  : 'Testar minha leitura do mercado'}{' '}
                <Glyph name="arrow" />
              </button>
              {learning ? (
                <div className="trade-learning">
                  <span className="trade-eyebrow">SUA LEITURA PRIMEIRO</span>
                  <h3>Qual a tendência?</h3>
                  <p>
                    Onde está o suporte? Isso é impulso ou pullback? Existe
                    confirmação?
                  </p>
                  <label className="trade-learning-choice">
                    Minha leitura da tendência
                    <select
                      aria-label="Minha leitura da tendência"
                      value={learnTrend}
                      onChange={(e) => setLearnTrend(e.target.value)}
                    >
                      <option value="up">Alta</option>
                      <option value="down">Baixa</option>
                      <option value="neutral">Indefinida</option>
                    </select>
                  </label>
                  <textarea
                    value={learnAnswer}
                    onChange={(e) => setLearnAnswer(e.target.value)}
                    placeholder="Descreva sua leitura antes de revelar a análise…"
                    aria-label="Sua leitura do mercado"
                  />
                  <button
                    className="trade-primary"
                    disabled={!learnAnswer.trim()}
                    onClick={() => setRevealed(true)}
                  >
                    Comparar com o motor
                  </button>
                  {revealed && (
                    <div className="trade-learning-result">
                      <strong>Sua resposta</strong>
                      <p>{learnAnswer}</p>
                      <strong>
                        {learnTrend === analysis?.trend
                          ? 'Sua leitura da tendência coincide com o motor.'
                          : 'A tendência que você escolheu diverge do motor.'}
                      </strong>
                      <p>{analysis?.conditions[0]?.detail}</p>
                      <strong>Leitura do motor</strong>
                      <p>
                        Tendência:{' '}
                        {analysis?.trend === 'up'
                          ? 'alta'
                          : analysis?.trend === 'down'
                            ? 'baixa'
                            : 'indefinida'}
                        . Suporte: {format(analysis?.support)}.
                      </p>
                      <p>{analysis?.explanation}</p>
                      {analysis?.conditions.map((c) => (
                        <p key={c.key}>
                          {c.label}: {c.met ? 'satisfeita' : 'pendente'}.{' '}
                          {c.detail}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="trade-prompts">
                    {[
                      'Por que ainda não entrar?',
                      'Onde está o suporte?',
                      'Qual foi o gatilho?',
                      'Por que esse stop está aqui?',
                    ].map((q) => (
                      <button key={q} disabled={asking} onClick={() => ask(q)}>
                        {q}
                        <Glyph name="arrow" />
                      </button>
                    ))}
                  </div>
                  <div className="trade-chat" aria-live="polite">
                    {chat.length === 0 ? (
                      <div className="trade-chat-intro">
                        <Glyph name="brain" />
                        <p>
                          Faça uma pergunta sobre o candle atual. Os números vêm
                          do motor; o Professor explica.
                        </p>
                        <small>
                          Professor contextual por regras disponível. IA usa a
                          chave do servidor quando configurada.
                        </small>
                      </div>
                    ) : (
                      chat.map((m, i) => (
                        <div
                          key={i}
                          className={`trade-message ${m.role === 'Você' ? 'user' : ''}`}
                        >
                          <strong>
                            {m.role}
                            {m.provider && (
                              <small>
                                {m.provider === 'ai'
                                  ? 'IA'
                                  : 'Explicação por regras'}
                              </small>
                            )}
                          </strong>
                          <p>{m.text}</p>
                        </div>
                      ))
                    )}
                    {asking && <p>Professor está preparando a explicação…</p>}
                  </div>
                  <form
                    className="trade-chat-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      ask(question);
                    }}
                  >
                    <input
                      aria-label="Pergunta ao Professor"
                      value={question}
                      maxLength={1000}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="Pergunte sobre este contexto…"
                    />
                    <button
                      disabled={asking || !question.trim()}
                      aria-label="Enviar pergunta"
                    >
                      <Glyph name="arrow" />
                    </button>
                  </form>
                </>
              )}
            </>
          ) : (
            <>
              <div className="trade-panel-heading">
                <div className="trade-panel-icon">
                  <Glyph name="bolt" />
                </div>
                <div>
                  <h2>{mode === 'Replay' ? 'Laboratório' : 'Copiloto'}</h2>
                  <p>
                    {mode === 'Replay'
                      ? 'O mesmo motor, candle a candle.'
                      : 'Clareza para a próxima decisão.'}
                  </p>
                </div>
                <span className="trade-live-dot" />
              </div>
              <div className="trade-decision-desk">
                <OperationsPanel
                  executionMode={executionMode}
                  onModeChange={setExecutionMode}
                  strategyNames={Object.fromEntries(
                    state?.scanner?.candidates.map((c) => [
                      c.definition.id,
                      c.definition.name,
                    ]) || [],
                  )}
                  source={source}
                  cursor={cursor}
                  complete={analysis?.status === 'complete'}
                  paperComplete={state?.paperAnalysis?.status === 'complete' || analysis?.status === 'complete'}
                  realComplete={state?.scanner?.candidates.some(c=>c.analysis.status==='complete' && c.analysis.conflicts.length===0)}
                  realStrategy={state?.scanner?.candidates.find(c=>c.analysis.status==='complete' && c.analysis.conflicts.length===0)?.definition.id}
                  setupId={analysis?.setup?.id}
                />
                <ScannerPanel
                  source={source}
                  cursor={cursor}
                  initial={state?.scanner}
                />
              </div>
            </>
          )}
        </aside>
      </section>
      {!hide && (
        <section className="trade-bottom">
          <nav aria-label="Painéis inferiores">
            {['Estratégias', 'Histórico de sinais', 'Resultados', 'Diário'].map(
              (t) => (
                <button
                  className={bottom === t ? 'active' : ''}
                  key={t}
                  onClick={() => setBottom(t)}
                >
                  {t}
                  {t === 'Histórico de sinais' && (
                    <span>{state?.signals.length || 0}</span>
                  )}
                </button>
              ),
            )}
          </nav>
          {bottom === 'Estratégias' && (
            <div className="trade-strategies">
              <ScannerPanel
                source={source}
                cursor={cursor}
                initial={state?.scanner}
                library
              />
            </div>
          )}
          {bottom === 'Histórico de sinais' && (
            <div className="trade-history">
              {state?.signals.length ? (
                state.signals.map((s) => <SetupCard key={s.id} setup={s} />)
              ) : (
                <div className="trade-empty">
                  <h3>Nenhum setup completo até este candle.</h3>
                  <p>
                    Continue o replay. O histórico só registra hipóteses que
                    satisfizeram todas as regras.
                  </p>
                </div>
              )}
            </div>
          )}
          {bottom === 'Resultados' && (
            <div className="trade-results">
              <p className="trade-operation-caption">
                Laboratório legado: backtest automático da hipótese inicial. As
                decisões humanas e métricas multi-estratégia ficam na mesa e na
                biblioteca. Amostras abaixo de 30 operações são insuficientes
                para avaliar desempenho.
              </p>
              <div className="trade-save-run">
                <button
                  className="trade-primary"
                  disabled={source === 'mt5' || savingRun || !cursor || loading}
                  onClick={saveRun}
                >
                  {savingRun ? 'Salvando…' : 'Salvar execução paper'}
                </button>
                <small aria-live="polite">{runStatus}</small>
              </div>
              <div className="trade-metrics">
                {[
                  ['Ocorrências', state?.metrics.occurrences],
                  ['Encerradas', state?.metrics.closed],
                  [
                    'Win rate',
                    (state?.metrics.closed || 0) >= 30
                      ? `${((state?.metrics.winRate || 0) * 100).toFixed(1)}%`
                      : 'DADOS INSUFICIENTES',
                  ],
                  [
                    'Expectativa',
                    (state?.metrics.closed || 0) >= 30
                      ? `${(state?.metrics.expectancy || 0).toFixed(2)}R`
                      : 'DADOS INSUFICIENTES',
                  ],
                  [
                    'Profit factor',
                    state?.metrics.profitFactor?.toFixed(2) || '—',
                  ],
                  ['Payoff', state?.metrics.payoff?.toFixed(2) || '—'],
                  [
                    'Drawdown',
                    `${(state?.metrics.drawdownR || 0).toFixed(2)}R`,
                  ],
                ].map(([k, v]) => (
                  <div key={String(k)}>
                    <small>{k}</small>
                    <strong>{v}</strong>
                  </div>
                ))}
              </div>
              <p className="trade-result-note">
                Mock sintético · entrada no próximo candle · stop primeiro se
                alvo e stop tocarem juntos · sem taxas ou slippage. Não usar
                estas métricas para autorizar a estratégia ao vivo.
              </p>
              <div className="trade-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Entrada</th>
                      <th>Estratégia</th>
                      <th>Referência / entrada</th>
                      <th>Stop</th>
                      <th>Alvo</th>
                      <th>Duração</th>
                      <th>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state?.trades.map((t) => (
                      <tr key={t.id}>
                        <td>{time(t.entryTimestamp)}</td>
                        <td>Pullback v{t.setup.version}</td>
                        <td>
                          {format(t.setup.entry)} / {format(t.entry)}
                        </td>
                        <td>{format(t.setup.stop)}</td>
                        <td>{format(t.setup.targets[0])}</td>
                        <td>
                          {t.durationMinutes === undefined
                            ? 'Em aberto'
                            : `${t.durationMinutes} min`}
                        </td>
                        <td>
                          {t.resultR === undefined
                            ? 'Aberta'
                            : `${t.resultR.toFixed(2)}R`}
                          {t.ambiguous ? ' · ambígua' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!state?.trades.length && (
                  <p className="trade-empty">
                    Ainda não há operações simuladas neste trecho.
                  </p>
                )}
              </div>
              {savedRuns.length > 0 && (
                <details>
                  <summary>Execuções salvas ({savedRuns.length})</summary>
                  {savedRuns.map((r) => (
                    <p key={r.id}>
                      Candle {r.cursor} ·{' '}
                      {new Date(r.createdAt).toLocaleString('pt-BR')} ·{' '}
                      {r.metrics.occurrences} operações ·{' '}
                      {r.metrics.netR.toFixed(2)}R · mock
                    </p>
                  ))}
                </details>
              )}
            </div>
          )}
          {bottom === 'Diário' && (
            <div className="trade-journal">
              <form onSubmit={saveNote}>
                <h3>Registre a sua leitura.</h3>
                <p>
                  O que você percebeu no candle {cursor}? Por que esperaria ou
                  descartaria a hipótese?
                </p>
                <textarea
                  aria-label="Nota do diário"
                  maxLength={3000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Contexto, percepção e aprendizado…"
                />
                <button
                  className="trade-primary"
                  disabled={saving || !note.trim()}
                >
                  {saving ? 'Salvando…' : 'Salvar no diário'}
                </button>
                <small aria-live="polite">{journalStatus}</small>
              </form>
              <div>
                {journal.map((r) => (
                  <article key={r.id}>
                    <small>
                      Candle {r.cursor} ·{' '}
                      {new Date(r.createdAt).toLocaleString('pt-BR')}
                    </small>
                    <p>{r.note}</p>
                  </article>
                ))}
                {!journal.length && <p>Suas notas aparecerão aqui.</p>}
              </div>
            </div>
          )}
        </section>
      )}
      <footer className="trade-footer">
        <span>
          FOCO TRADE <b>LAB</b>
        </span>
        <p>Copiloto educacional. Hipóteses explicáveis, execução humana.</p>
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          Gráfico por TradingView Lightweight Charts
        </a>
      </footer>
    </main>
  );
}
