/**
 * Copilot flow: setup → automatic proposal → risk sizing → PAPER/REAL destination, readiness truth and
 * conservative daily risk. PGlite + local fixture only; no broker, XP or MT5 can be reached.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { runScanner } from '../../trade/scanner/service';
import { oneRBRL } from '../../trade/bridge/risk-settings';
import { readinessDimensions } from '../../trade/bridge/readiness';
import { feedStatus } from '../../trade/bridge/mt5';
import { seedRisk } from './risk-fixture';

const migrations = readdirSync('supabase/migrations').filter((f) => f >= '20261003035402' && f.endsWith('.sql')).sort();
const owner = 'focoos-admin';
const BRT = 3 * 3600 * 1000; // production clock: XP wall time labelled as UTC
async function world(opts: { failing?: string[] } = {}) {
  const db = new PGlite(),
    original = globalThis.fetch,
    called: string[] = [];
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for (const m of migrations) await db.exec(readFileSync('supabase/migrations/' + m, 'utf8'));
  globalThis.fetch = (async (u: any, init: any) => {
    const url = new URL(String(u));
    assert.equal(url.hostname, 'fixture.invalid', 'no network beyond the local fixture');
    const name = url.pathname.split('/').pop()!;
    called.push(name);
    if (opts.failing?.includes(name)) return Response.json({ message: 'upstream timeout' }, { status: 504 });
    const args = Object.values(JSON.parse(String(init?.body)));
    try {
      const r = await db.query<any>(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args);
      return r.fields[0]?.dataTypeID === 2278 || (r.rows[0]?.result ?? null) === null ? new Response(null, { status: 204 }) : Response.json(r.rows[0].result); // PostgREST: void/null → 204
    } catch (e: any) {
      return Response.json({ code: 'P0001', message: String(e.message) }, { status: 400 });
    }
  }) as any;
  const env = { TRADE_SUPABASE_URL: 'https://fixture.invalid', TRADE_SUPABASE_SERVICE_KEY: 'fixture', TRADE_EXECUTION_ENABLED: 'false' };
  const q = async (sql: string, args: any[] = []) => (await db.query<any>(sql, args)).rows;
  const ops = await import('../../functions/api/trade/operations');
  const post = (body: any) => ops.onRequestPost({ env: env as any, request: new Request('https://fixture.invalid/api/trade/operations', { method: 'POST', body: JSON.stringify(body) }) });
  const read = async (source: string, cursor = 0) => (await (await ops.onRequestGet({ env: env as any, request: new Request(`https://fixture.invalid/api/trade/operations?source=${source}&cursor=${cursor}`) })).json()) as any[];
  /** Bridge heartbeat as the EA v2.06 sends it (connected, EnableExecution=false). */
  const bridge = async (ageMs: number, tick: { bid: number; ask: number }) => {
    const now = Date.now();
    await q('delete from trade_bridge_state');
    await q(
      `insert into trade_bridge_state(bridge_id,symbol,session,account_hash,received_at,state,tick,kill_switch) values('xp-mt5-primary','WINV26','s',$1,$2,$3,$4,true)`,
      ['a'.repeat(64), new Date(now - ageMs).toISOString(), { connected: true, executionAllowed: false, eaVersion: '2.06', positions: [], orders: [] }, { symbol: 'WINV26', timeMsc: now - ageMs - BRT, last: tick.bid, ...tick }],
    );
  };
  const pending = async (over: any = {}) => {
    const id = crypto.randomUUID();
    const payload = {
      id, mode: 'PAPER', source: 'mt5', symbol: 'WINV26', direction: 'BUY', entry: 210000, sl: 209800, tp: 210400, quantity: 2, riskBRL: 80, potentialBRL: 160,
      riskPerContractBRL: 40, pointValue: 0.2, riskPoints: 200, potentialPoints: 400, rr: 2, proposalState: 'READY', asOf: Math.floor(Date.now() / 1000) - 30,
      expiresAt: Date.now() + 60_000, setup: { id: 'x', strategy: 'ema_continuation_v1', version: '1.2.0', conditions: [] }, ...over,
    };
    await q(`insert into trade_operation_proposals(id,owner_id,bridge_id,payload,state,expires_at) values($1,$2,'xp-mt5-primary',$3,'AGUARDANDO CONFIRMAÇÃO',now()+interval '1 minute')`, [id, owner, payload]);
    return id;
  };
  const close = async () => {
    globalThis.fetch = original;
    await db.close();
  };
  return { db, env, q, post, read, bridge, pending, called, close };
}
const base = { capitalBRL: 10000, riskModel: 'PCT_CAPITAL', riskValue: 1, dailyLossUnit: 'R', dailyLossValue: 3, maxContracts: 5, maxTradesPerDay: 10 };

test('A/P: without risk settings no quantity is ever released, but setups and the LAB keep collecting', async () => {
  const w = await world();
  try {
    const r: any = await runScanner(w.env as any, 'replay', 30, 'no-risk');
    assert.ok(r.technicalProposals.length > 0, JSON.stringify(r.proposalBlocks));
    for (const t of r.technicalProposals) {
      assert.equal(t.proposal.quantity, 0);
      assert.equal(t.proposal.proposalState, 'RISK_BLOCKED');
      assert.equal(t.proposal.riskBlock.code, 'RISK_LIMIT_NOT_CONFIGURED');
    }
    assert.equal((await w.q('select count(*)::int n from trade_risk_settings_versions'))[0].n, 0); // nothing auto-created
    const obs = await w.q('select lifecycle from trade_setup_observations');
    assert.ok(obs.length > 0);
    assert.ok(obs.every((o: any) => o.lifecycle === 'BLOCKED_RISK'));
    // Once the user saves a configuration, the still-valid setup is re-sized automatically; the blocked
    // row stays as the study record (terminal by design).
    await seedRisk(w.db, { capitalBRL: 1000000, riskModel: 'PCT_CAPITAL', riskValue: 1, dailyLossUnit: 'R', dailyLossValue: 3, maxContracts: 1, maxTradesPerDay: 5 });
    const again: any = await runScanner(w.env as any, 'replay', 30, 'no-risk');
    assert.ok(again.technicalProposals.some((t: any) => t.proposal.proposalState === 'READY'), JSON.stringify(again.proposalBlocks));
    assert.ok((await w.q("select count(*)::int n from trade_operation_proposals where state='BLOQUEADA POR RISCO'"))[0].n > 0);
  } finally {
    await w.close();
  }
});

test('B/C/D/E: 1R by % or fixed value, recomputed on change; quantity = floor(1R / risk per contract)', async () => {
  assert.equal(oneRBRL(10000, 'PCT_CAPITAL', 1), 100);
  assert.equal(oneRBRL(10000, 'PCT_CAPITAL', 0.25), 25);
  assert.equal(oneRBRL(10000, 'PCT_CAPITAL', 1.5), 150);
  assert.equal(oneRBRL(10000, 'FIXED_BRL', 80), 80);
  const w = await world();
  try {
    assert.equal(Number((await seedRisk(w.db, base)).oneRBRL), 100);
    assert.equal(Number((await seedRisk(w.db, { ...base, riskValue: 2 })).oneRBRL), 200); // D: a new version, recomputed
    assert.equal(Number((await seedRisk(w.db, { ...base, riskModel: 'FIXED_BRL', riskValue: 80 })).oneRBRL), 80);
    assert.equal((await w.q('select count(*)::int n from trade_risk_settings_versions'))[0].n, 3);
  } finally {
    await w.close();
  }
  const { sizeProposal, buildTechnicalProposal } = await import('../../trade/bridge/approval');
  const conditions = [{ key: 't', label: 't', met: true, detail: '' }];
  const t = buildTechnicalProposal(
    { strategy: 's', version: '1', stage: 'paper', status: 'complete', trend: 'up', conditions, missing: [], conflicts: [], explanation: '',
      setup: { id: 'i', strategy: 's', version: '1', symbol: 'WINV26', tickSize: 5, riskRules: { minStopPoints: 20, maxStopPoints: 5000, targetR: 2 }, timestamp: 1, direction: 'long', entry: 210000, stop: 209810, targets: [210380], riskPoints: 190, potentialPoints: 380, rr: 2, conditions, conflicts: [], explanation: '' } } as any,
    { mode: 'PAPER', source: 'mt5', symbol: 'WINV26', cursor: 1, asOf: 1, liveAuthorized: false },
    1000,
  );
  const p = sizeProposal(t, { pointValue: 0.2, currency: 'BRL', maxContracts: 5, maxRiskBRL: 100, maxRiskSource: 'v' });
  assert.equal(p.riskPerContractBRL, 38);
  assert.equal(p.quantity, 2); // floor(100 / 38)
  assert.equal(p.riskBRL, 76); // 76% of 1R, R$24 left
  assert.equal(p.sl, 209810);
});

test('H/I: the user may reduce the suggested quantity, never exceed it; the choice is persisted', async () => {
  const w = await world();
  try {
    const s = await seedRisk(w.db, base); // 1R = 100
    await w.bridge(500, { bid: 210000, ask: 210005 });
    const id = await w.pending({ riskSettings: { version: Number(s.version), oneRBRL: 100 } });
    await assert.rejects(w.q('select public.trade_paper_quantity($1,$2,3) r', [owner, id]), /QUANTITY_ABOVE_RISK: 3 contratos arriscariam R\$ 120,00, acima do seu limite de R\$ 100,00\./);
    const rows = await w.q('select payload->>$2 q from trade_operation_proposals where id=$1', [id, 'quantity']);
    assert.equal(rows[0].q, '2'); // unchanged
    // Reduce 2 → 1 through the SQL authority, then the stored proposal carries both numbers.
    const reduced = (await w.q('select public.trade_paper_quantity($1,$2,1) r', [owner, id]))[0].r.payload;
    assert.deepEqual([reduced.quantity, reduced.riskBRL, reduced.sizing.suggestedQuantity, reduced.sizing.chosenQuantity], [1, 40, 2, 1]);
    await assert.rejects(w.q('select public.trade_paper_quantity($1,$2,2) r', [owner, id]).then(() => w.q('select public.trade_paper_quantity($1,$2,3) r', [owner, id])), /QUANTITY_ABOVE_RISK/);
    assert.equal((await w.q('select count(*)::int n from trade_bridge_commands'))[0].n, 0);
  } finally {
    await w.close();
  }
});

async function riskDay(run: (h: { trade: (payload: any, execution: any) => Promise<any>; gate: (risk: number) => Promise<any>; status: () => Promise<any> }) => Promise<void>) {
  const w = await world();
  try {
    const s = await seedRisk(w.db, { ...base, riskModel: 'FIXED_BRL', riskValue: 50, dailyLossValue: 3 }); // 1R 50, limit 150
    const v = Number(s.version);
    await run({
      trade: (payload, execution) =>
        w.q(`insert into trade_operation_proposals(id,owner_id,bridge_id,payload,state,expires_at,confirmed_at,execution) values(gen_random_uuid(),$1,'b',$2,'CONFIRMADA',now(),now(),$3)`, [owner, { mode: 'PAPER', source: 'mt5', ...payload }, execution]),
      gate: async (risk) => (await w.q('select public.trade_paper_entry_check($1,$2,$3) g', [owner, risk, v]))[0].g,
      status: async () => (await w.q('select public.trade_risk_status($1) s', [owner]))[0].s,
    });
  } finally {
    await w.close();
  }
}
test('H/W/AC: ENTRAR EM PAPER with a reduced quantity executes the simulation with that quantity; journal + LAB; refusals recorded', async () => {
  const w = await world();
  try {
    await seedRisk(w.db, { ...base, riskModel: 'FIXED_BRL', riskValue: 5000, maxContracts: 3, dailyLossValue: 1 });
    const r: any = await runScanner(w.env as any, 'replay', 30, 'reduce');
    const tp = r.technicalProposals.find((t: any) => t.proposal.proposalState === 'READY' && t.proposal.quantity > 1);
    assert.ok(tp, JSON.stringify(r.technicalProposals.map((t: any) => t.proposal.quantity)));
    const row = (await w.read('replay', 30)).find((x) => x.payload.setupObservationId === tp.observationId);
    const over = await w.post({ action: 'confirm', id: row.id, cursor: 30, mode: 'PAPER', quantity: tp.proposal.quantity + 1 });
    assert.equal(over.status, 409);
    assert.match((await over.json()).error, /QUANTITY_ABOVE_RISK/);
    const ok = await w.post({ action: 'confirm', id: row.id, cursor: 30, mode: 'PAPER', quantity: 1 });
    assert.equal(ok.status, 200, await ok.clone().text());
    await w.read('replay', 420);
    const done = (await w.q('select state, payload, execution from trade_operation_proposals where id=$1', [row.id]))[0];
    assert.equal(done.state, 'CONFIRMADA');
    assert.deepEqual([done.payload.quantity, done.payload.sizing.suggestedQuantity, done.payload.sizing.chosenQuantity], [1, tp.proposal.quantity, 1]);
    assert.equal(done.execution.quantity, 1);
    const journal = (await w.q('select kind from trade_operation_journal where proposal_id=$1 order by id', [row.id])).map((j: any) => j.kind);
    assert.ok(journal.includes('QUANTIDADE_ESCOLHIDA') && journal.includes('CONFIRMADA'), journal.join(','));
    const lab = (await w.q('select lifecycle from trade_setup_observations where id=$1', [tp.observationId]))[0];
    assert.ok(['PAPER_ACCEPTED', 'PAPER_ACTIVE', 'PAPER_CLOSED'].includes(lab.lifecycle));
    // A refusal by the risk gate is recorded in the journal and as a LAB event.
    await seedRisk(w.db, { ...base, riskModel: 'FIXED_BRL', riskValue: 5000, maxContracts: 3, dailyLossValue: 1, maxTradesPerDay: 1 });
    const other = (await w.read('replay', 30)).find((x) => x.state === 'AGUARDANDO CONFIRMAÇÃO');
    assert.ok(other, 'another pending proposal exists');
    {
      const refused = await w.post({ action: 'confirm', id: other.id, cursor: 30, mode: 'PAPER' });
      assert.equal(refused.status, 409);
      assert.ok((await w.q("select count(*)::int n from trade_operation_journal where proposal_id=$1 and kind='ENTRADA_RECUSADA'", [other.id]))[0].n >= 1);
    }
    assert.equal((await w.q('select count(*)::int n from trade_bridge_commands'))[0].n, 0);
  } finally {
    await w.close();
  }
});
test('J: open risk consumes the daily budget (A+B open, C fits at R$150, D does not)', () =>
  riskDay(async ({ trade, gate }) => {
    await trade({ riskBRL: 50 }, null);
    await trade({ riskBRL: 50 }, null);
    assert.equal((await gate(50)).allowed, true);
    await trade({ riskBRL: 50 }, null);
    assert.equal((await gate(50)).code, 'DAILY_LOSS_LIMIT_WOULD_EXCEED');
  }));
test('K: realized loss 100 + open risk 40 + new 20 = 160 > 150 → blocked', () =>
  riskDay(async ({ trade, gate }) => {
    await trade({ riskBRL: 50 }, { exitTime: 1, resultBRL: -100 });
    await trade({ riskBRL: 40 }, null);
    assert.equal((await gate(20)).code, 'DAILY_LOSS_LIMIT_WOULD_EXCEED');
    assert.equal((await gate(10)).allowed, true);
  }));
test('L: a later gain never restores the loss budget (policy GROSS_LOSSES_PLUS_OPEN_RISK_V1); replay never consumes it', () =>
  riskDay(async ({ trade, status }) => {
    await trade({ riskBRL: 50 }, { exitTime: 1, resultBRL: -100 });
    await trade({ riskBRL: 50 }, { exitTime: 2, resultBRL: 100 });
    await trade({ riskBRL: 50, source: 'replay' }, { exitTime: 3, resultBRL: -500 });
    const st = await status();
    assert.equal(Number(st.netPnlTodayBRL), 0);
    assert.equal(Number(st.lossBudgetConsumedBRL), 100);
    assert.equal(Number(st.dailyLossRemainingBRL), 50);
    assert.equal(Number(st.tradesToday), 2);
    assert.equal(st.policy, 'GROSS_LOSSES_PLUS_OPEN_RISK_V1');
  }));

test('N/O/AB: a risk change supersedes the pending proposal with a re-sized one; the old keeps its sizing; polling never duplicates', async () => {
  const w = await world();
  try {
    await seedRisk(w.db, { ...base, riskModel: 'FIXED_BRL', riskValue: 100, maxContracts: 1 });
    await runScanner(w.env as any, 'replay', 30, 'resize');
    await runScanner(w.env as any, 'replay', 30, 'resize'); // AB: same minute, no duplicate
    const before = await w.q("select id, payload from trade_operation_proposals where state='AGUARDANDO CONFIRMAÇÃO'");
    assert.ok(before.length > 0);
    const n0 = (await w.q('select count(*)::int n from trade_operation_proposals'))[0].n;
    await seedRisk(w.db, { ...base, riskModel: 'FIXED_BRL', riskValue: 200, maxContracts: 2 });
    await runScanner(w.env as any, 'replay', 30, 'resize');
    const old = await w.q('select state, payload from trade_operation_proposals where id=$1', [before[0].id]);
    assert.equal(old[0].state, 'EXPIRADA');
    assert.deepEqual(old[0].payload.riskSettings, before[0].payload.riskSettings); // history preserved
    const fresh = await w.q("select payload from trade_operation_proposals where state='AGUARDANDO CONFIRMAÇÃO' and payload->>'setupWatchId'=$1", [before[0].payload.setupWatchId]);
    assert.equal(fresh.length, 1);
    assert.equal(fresh[0].payload.riskSettings.oneRBRL, 200);
    assert.ok((await w.q("select count(*)::int n from trade_operation_journal where kind='SUBSTITUIDA_GESTAO_RISCO'"))[0].n >= 1);
    await runScanner(w.env as any, 'replay', 30, 'resize');
    assert.equal((await w.q('select count(*)::int n from trade_operation_proposals'))[0].n, n0 + before.length);
  } finally {
    await w.close();
  }
});

test('U/V: STALE feed → no entry offered nor accepted; a price that ran away → MISSED', async () => {
  const w = await world();
  try {
    const s = await seedRisk(w.db, base);
    const id = await w.pending({ riskSettings: { version: Number(s.version), oneRBRL: 100 } });
    // U: heartbeat 60 s old → STALE/OFFLINE → NO_QUOTE, never ACTIONABLE.
    await w.bridge(60_000, { bid: 210000, ask: 210005 });
    let row = (await w.read('mt5')).find((r) => r.id === id);
    assert.equal(row.actionability.status, 'NO_QUOTE');
    const refused = await w.post({ action: 'confirm', id, mode: 'PAPER', source: 'mt5' });
    assert.equal(refused.status, 409);
    // V: LIVE feed, but the ask already ran 500 points above the reference → MISSED (never chase).
    await w.bridge(300, { bid: 210495, ask: 210500 });
    row = (await w.read('mt5')).find((r) => r.id === id);
    assert.equal(row.actionability.status, 'MISSED');
    assert.equal((await w.q('select state from trade_operation_proposals where id=$1', [id]))[0].state, 'AGUARDANDO CONFIRMAÇÃO');
    assert.equal((await w.q('select count(*)::int n from trade_bridge_commands'))[0].n, 0);
  } finally {
    await w.close();
  }
});

test('Y/Z: header and readiness share one market-data truth; a connected EA with execution disabled is CONNECTED + DISABLED', () => {
  const env = { TRADE_EXECUTION_ENABLED: 'false' } as any,
    now = Date.now();
  for (const age of [500, 30_000, 600_000]) {
    const data = { receivedAt: new Date(now - age).toISOString(), killSwitch: true, state: { connected: true, executionAllowed: false, eaVersion: '2.06' }, tick: { symbol: 'WINV26', timeMsc: now - age } };
    const d = readinessDimensions(data, env, undefined, now);
    assert.equal(d.marketData, feedStatus(data, env, now).status);
  }
  const live = { receivedAt: new Date(now - 300).toISOString(), killSwitch: true, state: { connected: true, executionAllowed: false, eaVersion: '2.06' }, tick: { symbol: 'WINV26', timeMsc: now - 300 } };
  const d = readinessDimensions(live, env, { session: null, policy: { enabled: false }, authorizations: [] }, now);
  assert.deepEqual(
    [d.marketData, d.bridgeTransport, d.ea, d.eaExecution, d.backendExecution, d.realSession, d.policy, d.killSwitch, d.strategy],
    ['LIVE', 'CONNECTED', 'CONNECTED', 'DISABLED', 'DISABLED', 'NOT_ARMED', 'INVALID', 'ON', 'NOT_AUTHORIZED'],
  );
  // Unknown context is reported as UNKNOWN, never guessed as OFFLINE/disconnected.
  const u = readinessDimensions(live, env, null, now);
  assert.equal(u.realSession, 'UNKNOWN');
  assert.equal(u.ea, 'CONNECTED');
});

test('AA: a failing REAL context keeps LIVE/CONNECTED readiness and reports the real cause (code, operation, HTTP)', async () => {
  const w = await world({ failing: ['trade_real_context'] });
  try {
    await w.bridge(400, { bid: 210000, ask: 210005 });
    const { onRequestGet } = await import('../../functions/api/trade/execution-status');
    const r = await onRequestGet({ env: w.env as any });
    assert.equal(r.status, 503);
    const d: any = await r.json();
    assert.equal(d.readiness.marketData, 'LIVE');
    assert.equal(d.readiness.ea, 'CONNECTED');
    assert.equal(d.readiness.eaExecution, 'DISABLED');
    assert.equal(d.real.canExecute, false);
    assert.equal(d.real.error.operation, 'trade_real_context');
    assert.equal(d.real.error.httpStatus, 504);
    assert.match(d.real.gates[0].reason, /trade_real_context · HTTP 504/);
    // The light status RPC carries no candle history (the heavy payload behind the timeouts).
    const status = (await w.q("select public.trade_bridge_status('xp-mt5-primary') s"))[0].s;
    assert.deepEqual(status.candles, []);
    assert.equal(status.tick.symbol, 'WINV26');
  } finally {
    await w.close();
  }
});
