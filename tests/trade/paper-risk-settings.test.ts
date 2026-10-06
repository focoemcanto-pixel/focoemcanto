/**
 * PAPER risk management: persisted 1R, quantity by risk, daily limits, immutable history, backend
 * authority. PGlite + local fixture only; no test can reach a broker, the XP or MT5.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { buildTechnicalProposal, sizeProposal } from '../../trade/bridge/approval';
import { oneRBRL, paperRiskPolicy } from '../../trade/bridge/risk-settings';
import { ruleStrategyVersion } from '../../trade/scanner/strategies';
import { runScanner } from '../../trade/scanner/service';
import type { Analysis } from '../../trade/core/types';
import { seedRisk } from './risk-fixture';

const migrations = readdirSync('supabase/migrations').filter((f) => f >= '20261003035402' && f.endsWith('.sql')).sort();
const owner = 'focoos-admin';
async function world() {
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
  const risk = await import('../../functions/api/trade/risk');
  const post = (body: any) => ops.onRequestPost({ env: env as any, request: new Request('https://fixture.invalid/api/trade/operations', { method: 'POST', body: JSON.stringify(body) }) });
  const read = async (cursor: number) => (await (await ops.onRequestGet({ env: env as any, request: new Request(`https://fixture.invalid/api/trade/operations?source=replay&cursor=${cursor}`) })).json()) as any[];
  const saveRisk = (body: any) => risk.onRequestPost({ env: env as any, request: new Request('https://fixture.invalid/api/trade/risk', { method: 'POST', body: JSON.stringify(body) }) });
  const status = async () => (await (await risk.onRequestGet({ env: env as any })).json()) as any;
  const safety = async () => {
    // PAPER never creates a bridge command; REAL orders sent = 0; REAL gates untouched.
    assert.equal((await q('select count(*)::int n from trade_bridge_commands'))[0].n, 0);
    assert.equal((await q('select count(*)::int n from trade_execution_policy where enabled'))[0].n, 0);
    assert.equal((await q('select count(*)::int n from trade_real_sessions'))[0].n, 0);
    assert.ok(!called.some((n) => /trade_bridge_enqueue|trade_real_session_arm|trade_bridge_kill|trade_real_policy/.test(n)), called.join(','));
  };
  const close = async () => {
    globalThis.fetch = original;
    await db.close();
  };
  return { db, env, q, post, read, saveRisk, status, safety, close };
}
const base = { capitalBRL: 5000, riskModel: 'PCT_CAPITAL', riskValue: 1, dailyLossUnit: 'R', dailyLossValue: 3, maxContracts: 5, maxTradesPerDay: 10 };

/** A WIN technical proposal whose 1-contract risk is riskPoints × R$0,20. Stop is the technical stop. */
function technical(riskPoints: number) {
  const asOf = 1_791_200_000,
    entry = 210000,
    stop = entry - riskPoints,
    conditions = [{ key: 'trigger', label: 'Gatilho', met: true, detail: 'fixture' }];
  const a: Analysis = {
    strategy: 'ema_continuation_v1', version: ruleStrategyVersion, stage: 'paper', status: 'complete', trend: 'up', conditions, missing: [], conflicts: [], explanation: 'fixture',
    setup: {
      id: `ema_continuation_v1:${ruleStrategyVersion}:WINV26:${asOf}`, strategy: 'ema_continuation_v1', version: ruleStrategyVersion, symbol: 'WINV26', tickSize: 5,
      riskRules: { minStopPoints: 20, maxStopPoints: 5000, targetR: 2 }, timestamp: asOf, direction: 'long', entry, stop, targets: [entry + 2 * riskPoints],
      riskPoints, potentialPoints: 2 * riskPoints, rr: 2, conditions, conflicts: [], explanation: 'fixture',
    },
  };
  return buildTechnicalProposal(a, { mode: 'PAPER', source: 'mt5', symbol: 'WINV26', cursor: asOf, asOf, liveAuthorized: false }, asOf * 1000);
}
const size = (riskPoints: number, oneR: number, maxContracts = 5) => {
  const policy = paperRiskPolicy({ settings: { version: 1, configHash: 'h'.repeat(32), oneRBRL: oneR, maxContracts } as any, blocked: null } as any);
  return sizeProposal(technical(riskPoints), { pointValue: 0.2, currency: 'BRL', pointValueSource: 'win', maxContracts: policy.maxContracts, maxRiskBRL: policy.maxRiskBRL, maxRiskSource: policy.source });
};

test('1R: capital R$5.000 × 1% = R$50, computed by the backend; fixed model uses the value', async () => {
  assert.equal(oneRBRL(5000, 'PCT_CAPITAL', 1), 50);
  const w = await world();
  try {
    const s = await seedRisk(w.db, base);
    assert.equal(Number(s.oneRBRL), 50);
    assert.equal(Number(s.dailyLossBRL), 150); // 3R
    assert.match(s.configHash, /^[0-9a-f]{32}$/);
    const f = await seedRisk(w.db, { ...base, riskModel: 'FIXED_BRL', riskValue: 80, dailyLossUnit: 'BRL', dailyLossValue: 200 });
    assert.equal(Number(f.oneRBRL), 80);
    assert.equal(Number(f.dailyLossBRL), 200);
  } finally {
    await w.close();
  }
});

test('quantity by risk: 40/50 → 1; 66/50 → RISK_BLOCKED; 40/100 → 2 (3 = R$120 not allowed); maxContracts caps; stop never moves', () => {
  const a = size(200, 50); // R$40 per contract
  assert.equal(a.riskPerContractBRL, 40);
  assert.equal(a.quantity, 1);
  assert.equal(a.riskBRL, 40);
  const b = size(330, 50); // R$66 per contract
  assert.equal(b.proposalState, 'RISK_BLOCKED');
  assert.equal(b.quantity, 0);
  assert.equal(b.riskBlock?.code, 'RISK_LIMIT_EXCEEDED');
  const c = size(200, 100);
  assert.equal(c.quantity, 2);
  assert.equal(c.riskBRL, 80);
  assert.ok(3 * c.riskPerContractBRL! > 100); // 3 contracts would be R$120 > 1R
  const d = size(200, 1000, 3); // budget allows 25, configuration allows 3
  assert.equal(d.quantity, 3);
  // The technical stop/entry/target are never adjusted to fit the budget.
  for (const p of [a, b, c, d]) {
    assert.equal(p.entry, 210000);
    assert.equal(p.sl, 210000 - (p === b ? 330 : 200));
    assert.equal(p.tp, 210000 + 2 * (p === b ? 330 : 200));
  }
  // No settings → no quantity (no hardcoded fallback).
  const none = sizeProposal(technical(200), { pointValue: 0.2, currency: 'BRL', ...paperRiskPolicy({ settings: null, blocked: 'RISK_SETTINGS_MISSING' } as any), maxRiskSource: 'gestão de risco não configurada' });
  assert.equal(none.proposalState, 'RISK_BLOCKED');
  assert.equal(none.riskBlock?.code, 'RISK_LIMIT_NOT_CONFIGURED');
});

test('daily limit: LIVE_DETECTED/hypothetical never consume it; a PAPER loss does; reaching it blocks new PAPER only', async () => {
  const w = await world();
  try {
    await seedRisk(w.db, { ...base, riskModel: 'FIXED_BRL', riskValue: 100, dailyLossValue: 3 }); // limit R$300
    // Hypothetical losses: a LIVE observation that hit the stop and a RISK_BLOCKED proposal observed hypothetically.
    await w.q(`insert into trade_setup_observations(id,owner_id,scope,source,symbol,strategy_id,version,config_hash,direction,watch_id,detected_at,confirmed_at,market_as_of,snapshot,outcome,outcome_status)
      values('obs:h','${owner}','mt5:x','LIVE','WINV26','s','1','h','BUY','w',1,1,1,'{}','{"status":"STOP_FIRST","resultR":-1}','STOP_FIRST')`);
    await w.q(`insert into trade_operation_proposals(id,owner_id,bridge_id,payload,state,expires_at,hypothetical_execution)
      values(gen_random_uuid(),'${owner}','b','{"mode":"PAPER","riskBRL":0}','DESCARTADA',now(),'{"exitTime":1,"resultBRL":-999,"hypothetical":true}')`);
    let s = await w.status();
    assert.deepEqual([s.tradesToday, s.lossTodayBRL, s.blocked], [0, 0, null]);
    // A PAPER trade actually executed today and closed at a loss consumes the PAPER limit.
    await w.q(`insert into trade_operation_proposals(id,owner_id,bridge_id,payload,state,expires_at,confirmed_at,execution)
      values(gen_random_uuid(),'${owner}','b','{"mode":"PAPER","source":"mt5","riskBRL":100}','CONFIRMADA',now(),now(),'{"exitTime":1,"resultBRL":-320,"resultR":-1.6}')`);
    s = await w.status();
    assert.equal(s.tradesToday, 1);
    assert.equal(s.lossTodayBRL, 320);
    assert.equal(s.lossTodayR, 3.2);
    assert.equal(s.blocked, 'DAILY_LOSS_LIMIT_REACHED');
    const gate = (await w.q('select public.trade_paper_entry_check($1,$2,$3) g', [owner, 40, s.settings.version]))[0].g;
    assert.equal(gate.allowed, false);
    assert.equal(gate.code, 'DAILY_LOSS_LIMIT_REACHED');

    // Scanner, hypotheses and the LAB keep working while new PAPER entries are blocked.
    const r: any = await runScanner(w.env as any, 'replay', 30, 'blocked-day');
    assert.ok(r.scan.candidates.length > 0);
    const obs = (await w.q("select count(*)::int n from trade_setup_observations where source='REPLAY'"))[0].n;
    assert.ok(obs > 0, 'LAB observations still recorded');
    const tp = r.technicalProposals.find((t: any) => t.proposal.proposalState === 'READY');
    assert.ok(tp, JSON.stringify(r.proposalBlocks));
    assert.equal(tp.proposal.riskSettings.dailyBlocked, 'DAILY_LOSS_LIMIT_REACHED');
    const row = (await w.read(30)).find((x: any) => x.payload.setupObservationId === tp.observationId);
    const res = await w.post({ action: 'confirm', id: row.id, cursor: 30, mode: 'PAPER' });
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /DAILY_LOSS_LIMIT_REACHED/);
    assert.equal((await w.q('select state from trade_operation_proposals where id=$1', [row.id]))[0].state, 'AGUARDANDO CONFIRMAÇÃO');
    await w.safety();
  } finally {
    await w.close();
  }
});

test('daily trade count and "loss + open risk + new risk" are enforced by the backend', async () => {
  const w = await world();
  try {
    const s = await seedRisk(w.db, { ...base, riskModel: 'FIXED_BRL', riskValue: 100, dailyLossValue: 2, maxTradesPerDay: 2 }); // limit R$200
    await w.q(`insert into trade_operation_proposals(id,owner_id,bridge_id,payload,state,expires_at,confirmed_at,execution)
      values(gen_random_uuid(),'${owner}','b','{"mode":"PAPER","source":"mt5","riskBRL":100}','CONFIRMADA',now(),now(),'{"exitTime":1,"resultBRL":-60}')`);
    await w.q(`insert into trade_operation_proposals(id,owner_id,bridge_id,payload,state,expires_at,confirmed_at,execution)
      values(gen_random_uuid(),'${owner}','b','{"mode":"PAPER","source":"mt5","riskBRL":100}','CONFIRMADA',now(),now(),null)`);
    let g = (await w.q('select public.trade_paper_entry_check($1,$2,$3) g', [owner, 40, Number(s.version)]))[0].g;
    assert.equal(g.code, 'DAILY_TRADE_LIMIT_REACHED');
    await seedRisk(w.db, { ...base, riskModel: 'FIXED_BRL', riskValue: 100, dailyLossValue: 2, maxTradesPerDay: 10 });
    const v = (await w.status()).settings.version;
    g = (await w.q('select public.trade_paper_entry_check($1,$2,$3) g', [owner, 50, v]))[0].g;
    assert.equal(g.code, 'DAILY_LOSS_LIMIT_WOULD_EXCEED'); // 60 lost + 100 open + 50 new > 200
    g = (await w.q('select public.trade_paper_entry_check($1,$2,$3) g', [owner, 40, v]))[0].g;
    assert.equal(g.allowed, true);
  } finally {
    await w.close();
  }
});

test('a configuration change never rewrites history; old proposals keep their 1R and need re-sizing', async () => {
  const w = await world();
  try {
    await seedRisk(w.db, { ...base, riskModel: 'FIXED_BRL', riskValue: 100 });
    const r: any = await runScanner(w.env as any, 'replay', 30, 'history');
    const tp = r.technicalProposals.find((t: any) => t.proposal.proposalState === 'READY');
    assert.ok(tp, JSON.stringify(r.proposalBlocks));
    const row = (await w.read(30)).find((x: any) => x.payload.setupObservationId === tp.observationId);
    const v1 = row.payload.riskSettings;
    assert.equal(v1.oneRBRL, 100);
    // New version: 1R = R$500.
    const res = await w.saveRisk({ ...base, riskModel: 'FIXED_BRL', riskValue: 500 });
    assert.equal(res.status, 200, await res.clone().text());
    const after = (await w.q('select payload from trade_operation_proposals where id=$1', [row.id]))[0].payload;
    assert.deepEqual(after.riskSettings, v1);
    assert.equal(after.quantity, row.payload.quantity);
    assert.equal(after.riskBRL, row.payload.riskBRL);
    // Versions are append-only.
    await assert.rejects(w.q('update trade_risk_settings_versions set one_r_brl=1'));
    await assert.rejects(w.q('delete from trade_risk_settings_versions'));
    assert.equal((await w.q('select count(*)::int n from trade_risk_settings_versions'))[0].n, 2);
    // A proposal sized with the old version is not executed under the new one.
    const c = await w.post({ action: 'confirm', id: row.id, cursor: 30, mode: 'PAPER' });
    assert.equal(c.status, 409);
    assert.match((await c.json()).error, /RISK_SETTINGS_CHANGED/);
    await w.safety();
  } finally {
    await w.close();
  }
});

test('frontend manipulation cannot bypass the backend and saving settings can never enable REAL', async () => {
  const w = await world();
  try {
    await seedRisk(w.db, { ...base, riskModel: 'FIXED_BRL', riskValue: 100, maxContracts: 1 });
    const policyBefore = await w.q('select * from trade_execution_policy order by bridge_id');
    // Invalid or abusive values are refused by the database.
    for (const bad of [
      { ...base, riskValue: 50 }, // 50% of capital
      { ...base, capitalBRL: -1 },
      { ...base, riskModel: 'FIXED_BRL', riskValue: 6000 }, // 1R above capital
      { ...base, maxContracts: 999 },
      { ...base, maxTradesPerDay: 0 },
      { ...base, riskModel: 'MAGIC' },
      { ...base, capitalBRL: 'abc' },
    ]) {
      const r = await w.saveRisk(bad);
      assert.equal(r.status, 409, JSON.stringify(bad));
      assert.match((await r.json()).error, /RISK_SETTINGS_INVALID/);
    }
    // Forged fields are ignored: 1R is computed by the server, REAL switches do not exist here.
    const ok = await w.saveRisk({ ...base, oneRBRL: 999999, mode: 'REAL', executionEnabled: true, killSwitch: false, liveAuthorized: true });
    assert.equal(ok.status, 200, await ok.clone().text());
    const s = (await ok.json()).settings;
    assert.equal(s.oneRBRL, 50);
    assert.equal(s.mode, 'PAPER');
    assert.deepEqual(await w.q('select * from trade_execution_policy order by bridge_id'), policyBefore);
    // Confirm uses the stored proposal: a forged quantity/risk in the request changes nothing.
    await seedRisk(w.db, { ...base, riskModel: 'FIXED_BRL', riskValue: 100, maxContracts: 1 });
    const r: any = await runScanner(w.env as any, 'replay', 30, 'forge');
    const tp = r.technicalProposals.find((t: any) => t.proposal.proposalState === 'READY');
    const row = (await w.read(30)).find((x: any) => x.payload.setupObservationId === tp.observationId);
    // A forged larger quantity is refused with the explicit risk reason; forged risk/settings are ignored.
    const forged = await w.post({ action: 'confirm', id: row.id, cursor: 30, mode: 'PAPER', quantity: 99, riskBRL: 1, riskSettings: { version: 999 } });
    assert.equal(forged.status, 409);
    assert.match((await forged.json()).error, /QUANTITY_ABOVE_RISK: 99 contratos arriscariam R\$ [\d,]+, acima do seu limite de R\$ 100,00\./);
    const c = await w.post({ action: 'confirm', id: row.id, cursor: 30, mode: 'PAPER', riskBRL: 1, riskSettings: { version: 999 } });
    assert.equal(c.status, 200, await c.clone().text());
    const done = (await w.q('select payload from trade_operation_proposals where id=$1', [row.id]))[0].payload;
    assert.equal(done.quantity, row.payload.quantity);
    assert.ok(done.quantity <= 1);
    await w.safety();
  } finally {
    await w.close();
  }
});
