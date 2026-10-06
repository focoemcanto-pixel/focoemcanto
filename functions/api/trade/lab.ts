import {
  rpc,
  persistenceFailure,
  PersistenceError,
  type BridgeEnv,
} from '../../../trade/bridge/config';
import { labAnalytics, funnel, labParameters, riskSummary, type LabObservation } from '../../../trade/lab/analytics';
import { actionabilityParameters } from '../../../trade/lab/actionability';
import { outcomeParameters } from '../../../trade/lab/outcome';
import { performance, performanceParameters, toPerfRow, brtDate, type WatchCount } from '../../../trade/lab/performance';
import { executableAnalysis, executableParameters } from '../../../trade/lab/executable';
import { config } from '../../../trade/bridge/config';
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
    scope: o.scope,
    risk: o.risk
      ? {
          oneRBRL: o.risk.oneRBRL == null ? null : Number(o.risk.oneRBRL),
          riskBRL: o.risk.riskBRL == null ? null : Number(o.risk.riskBRL),
          riskPerContractBRL: o.risk.riskPerContractBRL == null ? null : Number(o.risk.riskPerContractBRL),
          suggestedQuantity: o.risk.suggestedQuantity == null ? null : Number(o.risk.suggestedQuantity),
          chosenQuantity: o.risk.chosenQuantity == null ? null : Number(o.risk.chosenQuantity),
          blockCode: o.risk.blockCode ?? null,
          riskSettingsVersion: o.risk.riskSettingsVersion == null ? null : Number(o.risk.riskSettingsVersion),
        }
      : null,
    refusals: Array.isArray(o.refusals) ? o.refusals : [],
    marketAsOf: typeof s.marketAsOf === 'number' ? s.marketAsOf : undefined,
    participants: Array.isArray(s.participantEvidence)
      ? s.participantEvidence
          .filter((x: any) => x?.state === 'CONFIRMED' && x.strategyId && x.version)
          .map((x: any) => ({ strategyId: x.strategyId, version: x.version, configHash: x.configHash }))
      : [],
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
const day = 86400;
const brtMidnight = (date: string) => Math.floor(Date.parse(`${date}T00:00:00-03:00`) / 1000);
/**
 * DESEMPENHO period → [from, to) on the market clock. "N pregões" = the N most recent BRT dates that
 * have scanner data (sessions, not calendar days). Custom = inclusive BRT dates.
 */
export async function performanceView(env: BridgeEnv, params: URLSearchParams, now = Date.now()) {
  const period = params.get('period') || 'today',
    dataset = (['LIVE_DETECTED', 'REPLAY', 'BACKTEST'].includes(params.get('dataset') || '') ? params.get('dataset') : 'LIVE_DETECTED') as 'LIVE_DETECTED' | 'REPLAY' | 'BACKTEST',
    nowS = Math.floor(now / 1000),
    today = brtDate(nowS),
    valid = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  let from: number,
    to = brtMidnight(today) + day,
    sessions: number | null = null,
    label: string;
  if (period === 'custom') {
    const a = valid(params.get('from')) || today,
      b = valid(params.get('to')) || a;
    from = brtMidnight(a < b ? a : b);
    to = brtMidnight(a < b ? b : a) + day;
    if (to - from > 366 * day) throw new Error('Período personalizado acima de 366 dias');
    label = `${a} a ${b}`;
  } else if (period === '5' || period === '20') {
    sessions = Number(period);
    from = brtMidnight(today) - (sessions === 5 ? 15 : 45) * day;
    label = `${sessions} pregões`;
  } else if (period === '30d') {
    from = brtMidnight(today) - 29 * day;
    label = '30 dias';
  } else {
    from = brtMidnight(today);
    label = 'Hoje';
  }
  const data = await rpc(env, 'trade_lab_performance', { p_owner: owner, p_from: from, p_to: to });
  let rows = [...(data?.observations || []), ...(data?.records || [])].map(toPerfRow),
    watches = ((data?.watches || []) as WatchCount[]).map((w) => ({ ...w, n: Number(w.n) }));
  if (sessions) {
    const source = dataset === 'LIVE_DETECTED' ? 'mt5' : dataset.toLowerCase(),
      dates = [...new Set([...watches.filter((w) => w.source === source).map((w) => w.date), ...rows.filter((r) => (r.source === 'LIVE' ? 'LIVE_DETECTED' : r.source) === dataset).map((r) => brtDate(r.confirmedAt))])]
        .sort()
        .reverse()
        .slice(0, sessions);
    rows = rows.filter((r) => dates.includes(brtDate(r.confirmedAt)));
    watches = watches.filter((w) => dates.includes(w.date));
    if (dates.length) from = brtMidnight(dates.at(-1)!);
  }
  const riskVersions = ((data?.riskVersions || []) as any[]).map((v) => ({
    version: Number(v.version),
    createdAt: Number(v.createdAt),
    oneRBRL: Number(v.oneRBRL),
    dailyLossBRL: Number(v.dailyLossBRL),
    maxTradesPerDay: Number(v.maxTradesPerDay),
    maxContracts: Number(v.maxContracts),
  }));
  // Real instrument metadata from the bridge (tick size/value, volume); signals use their own recorded value.
  const bridge = await rpc(env, 'trade_bridge_status', { p_bridge: config(env).bridgeId }).catch(() => null),
    st = bridge?.state || {},
    instrument = {
      tickSize: Number(st.tickSize) || 5,
      tickValue: Number(st.tickValue) || 1,
      volumeMin: Number(st.volumeMin) || 1,
      volumeStep: Number(st.volumeStep) || 1,
      volumeMax: Number(st.volumeMax) || 1,
    },
    latest = riskVersions.at(-1),
    current = latest
      ? { maxRiskBRL: latest.oneRBRL, maxContracts: latest.maxContracts, maxPositions: Number(st.localLimits?.maxPositions) || 1, maxNotionalBRL: null }
      : null;
  return {
    generatedAt: new Date(now).toISOString(),
    period: { key: period, label, from, to, sessions },
    models: { performance: performanceParameters, outcome: outcomeParameters, actionability: actionabilityParameters, executable: executableParameters },
    ...performance({ rows, watches, riskVersions }, dataset),
    executableRisk: {
      instrumentSource: bridge?.state ? 'MT5 (bridge)' : 'padrão WIN (bridge indisponível)',
      currentSource: latest ? `gestão de risco v${latest.version} (referência; não alterada)` : 'sem gestão de risco configurada',
      ...executableAnalysis(rows.filter((r) => (r.source === 'LIVE' ? 'LIVE_DETECTED' : r.source) === dataset), instrument, current),
    },
  };
}
/** LAB: data → deterministic statistics. Read-only; can never enable REAL. */
export async function onRequestGet({ request, env }: { request: Request; env: BridgeEnv }) {
  try {
    const u = new URL(request.url);
    if (u.searchParams.get('view') === 'performance')
      return Response.json(await performanceView(env, u.searchParams), { headers: { 'Cache-Control': 'no-store' } });
    const days = Math.max(1, Math.min(365, Number(u.searchParams.get('days')) || 90)),
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
        risk: riskSummary(observations),
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
