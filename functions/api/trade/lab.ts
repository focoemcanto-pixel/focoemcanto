import {
  rpc,
  persistenceFailure,
  PersistenceError,
  type BridgeEnv,
} from '../../../trade/bridge/config';
import { labAnalytics, funnel, labParameters, type LabObservation } from '../../../trade/lab/analytics';
import { actionabilityParameters } from '../../../trade/lab/actionability';
import { outcomeParameters } from '../../../trade/lab/outcome';
const owner = 'focoos-admin'; // Existing admin-session middleware, never client supplied.
/** Maps a stored observation to the analytics input (objective fields only; no secrets exist here). */
export function toLabObservation(o: any): LabObservation {
  const s = o.snapshot || {};
  return {
    id: o.id,
    source: o.source,
    strategyId: o.strategyId,
    version: o.version,
    direction: o.direction,
    confirmedAt: Number(o.confirmedAt),
    lifecycle: o.lifecycle,
    outcome: o.outcome || null,
    paper: o.paper || null,
    features: {
      hourBRT: s.session?.hourBRT ?? null,
      weekday: s.session?.weekday ?? null,
      regimes: Array.isArray(s.regimes) ? s.regimes : [],
      rr: typeof s.rr === 'number' ? s.rr : null,
      trend5m: s.derived?.trend5m ?? null,
    },
  };
}
const startOfTodayBRT = (now = Date.now()) => {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(now));
  return Math.floor(Date.parse(`${d}T00:00:00-03:00`) / 1000);
};
/** LAB: data → deterministic statistics. Read-only; can never enable REAL. */
export async function onRequestGet({ request, env }: { request: Request; env: BridgeEnv }) {
  try {
    const u = new URL(request.url),
      days = Math.max(1, Math.min(365, Number(u.searchParams.get('days')) || 90)),
      since = Math.floor(Date.now() / 1000) - days * 86400,
      today = startOfTodayBRT();
    const data = await rpc(env, 'trade_lab_read', { p_owner: owner, p_since: since });
    const rows = (data?.observations || []) as any[],
      observations = rows.map(toLabObservation),
      todayRows = observations.filter((o) => o.confirmedAt >= today && o.source === 'LIVE');
    const todayDetected = (await rpc(env, 'trade_lab_read', { p_owner: owner, p_since: today }))?.detected ?? 0;
    return Response.json(
      {
        generatedAt: new Date().toISOString(),
        windowDays: days,
        models: { lab: labParameters, actionability: actionabilityParameters, outcome: outcomeParameters },
        today: funnel(todayRows, todayDetected),
        analytics: labAnalytics(observations),
        registry: data?.registry || [],
        periods: data?.periods || [],
        recent: rows.slice(0, 60),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return Response.json(persistenceFailure(e), { status: 503 });
  }
}
/** User annotation on an observation. Kept apart from automatic objective data. */
export async function onRequestPost({ request, env }: { request: Request; env: BridgeEnv }) {
  try {
    const body: any = await request.json();
    if (body.action !== 'note' || typeof body.id !== 'string' || typeof body.note !== 'string' || !body.note.trim())
      throw new Error('Anotação inválida');
    await rpc(env, 'trade_setup_note_add', { p_owner: owner, p_id: body.id.slice(0, 300), p_note: body.note.trim().slice(0, 4000) });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      e instanceof PersistenceError ? persistenceFailure(e) : { error: e instanceof Error ? e.message : 'Falha' },
      { status: 409 },
    );
  }
}
