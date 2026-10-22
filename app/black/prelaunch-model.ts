import { blackConfig } from './black-config';
// Pure rules for the PRE-LAUNCH flow (testable without a browser).
export type Phase = 'pre_launch' | 'open';
export type Question = { n: number; type: 'choice' | 'money'; prompt: string; options?: { key: string; label: string }[] };
export type CampaignState = { phase: 'pre_launch' | 'open' | 'ended'; capture_open: boolean; consent_text: string; consent_version: string; questions: Question[]; opens_at?: string | null };
export type StoredFlow = { v: 1; token: string; step: number; answers: Record<string, string | number>; completed: boolean; entryId: string | null; groupAvailable: boolean };

// OPEN only when the HUB explicitly says so; an ended campaign shows the closed state of the
// pre-launch layout (no checkout), and any failure falls back to the build-time default.
export function resolvePhase(remote: Pick<CampaignState, 'phase'> | null | undefined, fallback: Phase): Phase {
  if (!remote) return fallback;
  return remote.phase === 'open' ? 'open' : 'pre_launch';
}

// Whole reais typed by the visitor ("1.500", "R$ 1500,00") → cents. No price ranges are offered.
export function parseReais(input: string): number | null {
  const clean = String(input || '').replace(/[R$\s]/g, '');
  if (!clean) return null;
  const normalized = /,\d{1,2}$/.test(clean) ? clean.replace(/\./g, '').replace(',', '.') : clean.replace(/[.,]/g, '');
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 1 || value > 1_000_000) return null;
  return Math.round(value * 100);
}
export const formatReais = (digits: string) => {
  const n = Number(String(digits).replace(/\D/g, '').slice(0, 7));
  return n ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(n) : '';
};

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'] as const;
export function extractUtm(search: string) {
  const params = new URLSearchParams(search);
  const out: Record<string, string> = {};
  for (const key of UTM_KEYS) { const v = params.get(key)?.trim(); if (v) out[key] = v.slice(0, 200); }
  return out;
}
// First touch wins: a later visit without UTM never erases the original origin.
export const mergeFirstTouch = (stored: Record<string, string> | null, current: Record<string, string>) =>
  stored && Object.keys(stored).length ? stored : current;

export function sanitizeStored(raw: unknown): StoredFlow | null {
  const s = raw as StoredFlow;
  if (!s || s.v !== 1 || typeof s.token !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(s.token)) return null;
  const step = Number.isInteger(s.step) && s.step >= 0 && s.step <= 6 ? s.step : 0;
  const answers: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(s.answers || {})) if (/^[1-5]$/.test(k) && (typeof v === 'string' || typeof v === 'number')) answers[k] = v;
  return { v: 1, token: s.token, step, answers, completed: Boolean(s.completed), entryId: typeof s.entryId === 'string' ? s.entryId : null, groupAvailable: Boolean(s.groupAvailable) };
}

export function newToken(random: (n: number) => Uint8Array) {
  const bytes = random(32);
  let text = '';
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const groupHref = (hubOrigin: string, entryId: string | null) => entryId ? `${hubOrigin}/api/public/campanhas/grupo/${entryId}?s=landing` : null;

// FAQ shown before the opening: no price, payment, guarantee or checkout answers.
export const PRELAUNCH_FAQ_KEEP = new Set(['O que exatamente está incluído?', 'Quanto tempo dura cada acesso?', 'O Foco em Harmonia é vitalício?', 'Preciso usar tudo ao mesmo tempo?', 'Posso acessar pelo celular?']);
export const PRELAUNCH_FAQ_EXTRA = [
  { question: 'Quando a BLACK FOCO 2026 abre?', answer: `A aula especial e abertura da BLACK FOCO 2026 acontecem em ${blackConfig.launch.opensAtLong}, quinta-feira, às ${blackConfig.launch.timeLabel}, ${blackConfig.launch.timeZoneLabel}. A oferta será apresentada e liberada durante a transmissão. Quem está na Lista Prioritária recebe os avisos pelo grupo oficial e pelo WhatsApp.` },
  { question: 'O que é a Lista Prioritária?', answer: 'É a lista de quem quer acompanhar a BLACK FOCO 2026 de perto. Você informa nome, e-mail e WhatsApp, responde 5 perguntas rápidas e entra no grupo oficial da BLACK.' },
  { question: 'Vou receber mensagens de outros assuntos?', answer: 'Não. Ao entrar na lista, você concorda em receber pelo WhatsApp somente informações relacionadas à BLACK FOCO 2026. Para não receber mais, basta responder SAIR.' },
];
