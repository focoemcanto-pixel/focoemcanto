'use client';
import { useEffect, useState } from 'react';
import { blackConfig } from './black-config';
import { extractUtm, mergeFirstTouch, sanitizeStored, type CampaignState, type StoredFlow } from './prelaunch-model';

// Browser side of the priority list: HUB calls and local persistence. Every storage access is
// guarded (private mode, blocked storage); the HUB remains the source of truth.
const { campaign } = blackConfig.launch;
// Local QA can point the static build at a local HUB; production builds use the official origin.
export const hubOrigin = process.env.NEXT_PUBLIC_BLACK_HUB_ORIGIN || blackConfig.launch.hubOrigin;
const api = (path: string) => `${hubOrigin}/api/public/campanhas/${campaign}/${path}`;
const FLOW_KEY = 'black26:lista', DRAFT_KEY = 'black26:rascunho', UTM_KEY = 'black26:utm';

function read<T>(key: string, storage: () => Storage): T | null { try { const v = storage().getItem(key); return v ? JSON.parse(v) as T : null; } catch { return null; } }
function write(key: string, value: unknown, storage: () => Storage) { try { if (value == null) storage().removeItem(key); else storage().setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } }
const local = () => window.localStorage, session = () => window.sessionStorage;

export const loadFlow = () => sanitizeStored(read(FLOW_KEY, local));
export const saveFlow = (flow: StoredFlow | null) => write(FLOW_KEY, flow, local);
export const loadDraft = () => read<{ name?: string; email?: string; phone?: string }>(DRAFT_KEY, session) || {};
export const saveDraft = (draft: { name: string; email: string; phone: string } | null) => write(DRAFT_KEY, draft, session);

export function firstTouchUtm() {
  const current = extractUtm(window.location.search);
  const merged = mergeFirstTouch(read<Record<string, string>>(UTM_KEY, local), current);
  write(UTM_KEY, merged, local);
  return merged;
}

export type ApiResult = { ok: boolean; error?: string; entry_id?: string; next_step?: number; completed?: boolean; group_available?: boolean };
async function post(path: string, body: unknown): Promise<ApiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(api(path), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit', signal: controller.signal, cache: 'no-store' });
    return await res.json().catch(() => ({ ok: false, error: 'unavailable' }));
  } catch { return { ok: false, error: 'network' }; }
  finally { clearTimeout(timer); }
}
export const signup = (body: Record<string, unknown>) => post('inscricao', body);
export const resume = (token: string) => post('estado', { token });
export const answer = (token: string, question: number, value: string | number) => post('resposta', { token, question, value });

// Campaign state from the HUB (phase, consent text/version, questions). null while loading or on failure.
export function useCampaignState() {
  const [state, setState] = useState<CampaignState | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let controller: AbortController | null = null;
    const refresh = () => {
    if (document.visibilityState === 'hidden' || controller) return;
    controller = new AbortController();
    const timer = setTimeout(() => controller?.abort(), 8000);
    fetch(api('estado'), { signal: controller.signal, credentials: 'omit', cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(d => { if (alive && d?.ok) { setState(d as CampaignState); setFailed(false); } else if (alive) setFailed(true); })
      .catch(() => { if (alive) setFailed(true); })
      .finally(() => { clearTimeout(timer); controller = null; });
    };
    refresh();
    const interval = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { alive = false; controller?.abort(); clearInterval(interval); window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return { state, failed };
}
