/**
 * GESTÃO DE RISCO · REAL: capital operacional → 1R → materialized policy → sizing → EA, end to end on a
 * local Postgres (PGlite) through the same endpoint as the UI. No network, no MT5, no broker.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { realRiskLimit, realRiskCap } from '../../trade/bridge/config';
import { realReadiness } from '../../trade/bridge/real';
import { sizeProposal, type TechnicalProposal } from '../../trade/bridge/approval';

const bridge = 'xp-mt5-primary',
  account = 'a'.repeat(64);
const baseEnv = {
  TRADE_SUPABASE_URL: 'https://fixture.invalid',
  TRADE_SUPABASE_SERVICE_KEY: 'isolated-fixture-only',
  TRADE_EXECUTION_ENABLED: 'true',
  TRADE_ACCOUNT_HASH: account,
  TRADE_BRIDGE_TOKEN: 'isolated-test-fixture-token-32-characters',
  TRADE_MAX_CONTRACTS: '2',
  TRADE_MT5_SYMBOL: 'WINV26',
};
const settings = (over: Record<string, unknown> = {}) => ({
  capitalBRL: 2000,
  riskModel: 'PCT_CAPITAL',
  riskValue: 5,
  dailyLossUnit: 'R',
  dailyLossValue: 3,
  maxContracts: 1,
  maxOrdersPerSession: 3,
  maxOrdersPerDay: 5,
  maxSessionMinutes: 120,
  maxSlippagePoints: 50,
  maxNotionalBRL: 50000,
  enabled: true,
  rolloverConfirmed: true,
  ...over,
});

async function world(env: Record<string, string> = baseEnv) {
  const db = new PGlite(),
    original = globalThis.fetch;
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  // Every trade migration in order (the initial one needs Supabase auth, which no trade test loads).
  for (const m of readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql') && f !== '20261003021627_foco_trade_initial.sql').sort())
    await db.exec(readFileSync('supabase/migrations/' + m, 'utf8'));
  globalThis.fetch = (async (u: any, init: any) => {
    const url = new URL(String(u));
    assert.equal(url.hostname, 'fixture.invalid', 'no network beyond the local fixture');
    const name = url.pathname.split('/').pop()!;
    const args = Object.values(JSON.parse(String(init?.body)));
    try {
      const r = await db.query<any>(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args);
      return (r.rows[0]?.result ?? null) === null ? new Response(null, { status: 204 }) : Response.json(r.rows[0].result);
    } catch (e: any) {
      return Response.json({ code: 'P0001', message: String(e.message) }, { status: 400 });
    }
  }) as any;
  const now = Date.now();
  // XP balance R$10.000, free margin R$0,01: broker capacity, never the planning capital.
  await db.query(
    `insert into trade_bridge_state(bridge_id,symbol,session,account_hash,received_at,state,tick,kill_switch) values($1,'WINV26','s',$2,now(),$3,$4,true)`,
    [
      bridge,
      account,
      { connected: true, accountTradeMode: 2, expirationTime: Math.floor((now + 7 * 86400000) / 1000), balance: 10000, freeMargin: 0.01, localLimits: { maxRiskBRL: 0, maxLossBRL: 0, maxSlippagePoints: 0, maxContracts: 1, maxPositions: 1 } },
      { symbol: 'WINV26', timeMsc: now, bid: 206000, ask: 206005, last: 206005, volume: 1, flags: 0 },
    ],
  );
  const api = async (body?: unknown) => {
    const mod: any = await import('../../functions/api/trade/real-config');
    const r: Response =
      body === undefined
        ? await mod.onRequestGet({ env })
        : await mod.onRequestPost({ env, request: new Request('https://fixture.invalid/api/trade/real-config', { method: 'POST', body: JSON.stringify(body) }) });
    return { status: r.status, data: (await r.json()) as any };
  };
  const save = (over: Record<string, unknown> = {}) => api({ action: 'policy', confirmation: 'SALVAR CONFIGURAÇÃO REAL', settings: settings(over) });
  const one = async (sql: string) => (await db.query<any>(sql)).rows[0];
  const close = async () => {
    globalThis.fetch = original;
    await db.close();
  };
  return { db, api, save, one, close };
}

test('REAL 1R by % of capital materializes the enforced policy (R$2.000 × 5% = R$100, daily 3R = R$300)', async () => {
  const w = await world();
  try {
    const r = await w.save();
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(Number(r.data.settings.oneRBRL), 100);
    assert.equal(Number(r.data.settings.dailyLossBRL), 300);
    const p = await w.one('select * from trade_execution_policy');
    assert.equal(Number(p.max_risk_brl), 100);
    assert.equal(Number(p.max_daily_loss_brl), 300);
    assert.equal(Number(p.max_slippage_points), 50);
    assert.equal(Number(p.max_notional_brl), 50000);
    assert.equal(p.max_orders_per_session, 3);
    assert.equal(p.max_orders_per_day, 5);
    assert.equal(p.max_session_minutes, 120);
    assert.equal(p.max_contracts, 1);
    assert.equal(p.max_positions, 1);
    assert.equal(p.enabled, true);
    assert.equal(p.rollover_confirmed, true);
    // Account, symbol and contract come from the server/MT5, never from the client.
    assert.equal(p.account_hash, account);
    assert.equal(p.symbol, 'WINV26');
    assert.ok(p.contract_expires_at instanceof Date && p.contract_expires_at.getTime() > Date.now());
    assert.equal(Number(p.risk_settings_version), Number(r.data.settings.version));
  } finally {
    await w.close();
  }
});

test('changing capital recalculates a % 1R; a fixed 1R does not move with capital', async () => {
  const w = await world();
  try {
    assert.equal(Number((await w.save({ capitalBRL: 3000 })).data.settings.oneRBRL), 150);
    assert.equal(Number((await w.one('select max_risk_brl from trade_execution_policy')).max_risk_brl), 150);
    assert.equal(Number((await w.save({ riskModel: 'FIXED_BRL', riskValue: 100, capitalBRL: 2000 })).data.settings.oneRBRL), 100);
    assert.equal(Number((await w.save({ riskModel: 'FIXED_BRL', riskValue: 100, capitalBRL: 9000 })).data.settings.oneRBRL), 100);
    assert.equal(Number((await w.one('select max_risk_brl from trade_execution_policy')).max_risk_brl), 100);
  } finally {
    await w.close();
  }
});

test('capital operacional is independent of the XP balance/margin, which is reported apart', async () => {
  const w = await world();
  try {
    await w.save({ capitalBRL: 3000, riskValue: 2 });
    const g = await w.api();
    assert.equal(g.status, 200, JSON.stringify(g.data));
    assert.equal(Number(g.data.riskSettings.capitalBRL), 3000);
    assert.equal(g.data.brokerBalanceBRL, 10000);
    assert.equal(g.data.brokerFreeMarginBRL, 0.01);
    assert.equal(Number(g.data.riskSettings.oneRBRL), 60);
    assert.equal(g.data.policy.account_hash, undefined, 'account hash never leaves the server');
  } finally {
    await w.close();
  }
});

test('invalid REAL risk settings are refused and leave the policy untouched', async () => {
  const w = await world();
  try {
    await w.save();
    for (const [over, msg] of [
      [{ riskValue: 11 }, /10%/],
      [{ riskModel: 'FIXED_BRL', riskValue: 2500 }, /capital/],
      [{ dailyLossUnit: 'BRL', dailyLossValue: 50 }, /perda máxima diária/],
      [{ maxOrdersPerDay: 2 }, /operações por dia/],
      [{ maxSlippagePoints: 1 }, /Valor de configuração inválido|desvio/],
      [{ maxContracts: 3 }, /Valor de configuração inválido/],
    ] as const) {
      const r = await w.save(over);
      assert.equal(r.status, 409, JSON.stringify(over));
      assert.match(r.data.error, msg);
    }
    assert.equal(Number((await w.one('select max_risk_brl from trade_execution_policy')).max_risk_brl), 100);
    assert.equal(Number((await w.one('select count(*) n from trade_real_risk_settings_versions')).n), 1);
  } finally {
    await w.close();
  }
});

test('administrative ceiling: unset = none; set = 1R above it refused; invalid = REAL blocked', async () => {
  assert.equal(realRiskCap({}), null);
  assert.equal(realRiskCap({ TRADE_REAL_MAX_RISK_BRL: '80' }), 80);
  assert.equal(realRiskCap({ TRADE_REAL_MAX_RISK_BRL: 'abc' }), 0);
  const capped = await world({ ...baseEnv, TRADE_REAL_MAX_RISK_BRL: '80' });
  try {
    const r = await capped.save();
    assert.equal(r.status, 409);
    assert.match(r.data.error, /teto administrativo/);
    assert.equal((await capped.save({ riskValue: 4 })).status, 200); // 1R = R$80
  } finally {
    await capped.close();
  }
  const broken = await world({ ...baseEnv, TRADE_REAL_MAX_RISK_BRL: '-1' });
  try {
    assert.equal((await broken.save()).status, 409);
  } finally {
    await broken.close();
  }
});

test('effective limit = min(policy, EA, ceiling): the EA and the ceiling only tighten, never widen', () => {
  const ctx = (local: number) => ({ policy: { max_risk_brl: 100 }, bridge: { state: { localLimits: { maxRiskBRL: local } } } });
  assert.equal(realRiskLimit(ctx(100)).maxRiskBRL, 100);
  assert.equal(realRiskLimit(ctx(80)).maxRiskBRL, 80);
  assert.equal(realRiskLimit(ctx(150)).maxRiskBRL, 100);
  assert.equal(realRiskLimit(ctx(0)).maxRiskBRL, 100);
  assert.equal(realRiskLimit(ctx(150), { TRADE_REAL_MAX_RISK_BRL: '60' }).maxRiskBRL, 60);
  assert.equal(realRiskLimit(ctx(80), { TRADE_REAL_MAX_RISK_BRL: 'x' }).maxRiskBRL, null);
  assert.equal(realRiskLimit({ policy: {} , bridge: { state: { localLimits: { maxRiskBRL: 150 } } } }).maxRiskBRL, null);
  // The EA applies min(local input, limit sent by the backend) to risk, daily loss and slippage.
  const ea = readFileSync('mt5/FocoTradeBridge.mq5', 'utf8');
  assert.ok(ea.includes('MathAbs(riskProfit)>MathMin(MaxRiskBRL,remoteRisk)'));
  assert.ok(ea.includes('loss24hBRL+MathAbs(riskProfit)>=MathMin(MaxLoss24hBRL,remoteLoss)'));
  assert.ok(ea.includes('MathMin(MaxSlippagePoints,remoteSlip)'));
  assert.ok(ea.includes('volume>MathMin(MaxContracts,policyContracts)'));
});

test('sizing: riskPerContract = structural stop × point value; floor to whole contracts; 0 → RISK_BLOCKED; stop never moved', () => {
  const tp = (riskPoints: number): TechnicalProposal =>
    ({
      symbol: 'WINV26',
      direction: 'BUY',
      entry: 206000,
      sl: 206000 - riskPoints,
      tp: 206000 + 2 * riskPoints,
      riskPoints,
      potentialPoints: 2 * riskPoints,
      setup: { tickSize: 5 },
    }) as any;
  const size = (riskPoints: number, maxContracts = 1) =>
    sizeProposal(tp(riskPoints), { pointValue: 0.2, currency: 'BRL', maxContracts, maxRiskBRL: 100, maxRiskSource: 'policy.max_risk_brl' });
  const fits = size(350); // 350 pts × R$0,20 = R$70
  assert.equal(fits.riskPerContractBRL, 70);
  assert.equal(fits.proposalState, 'READY');
  assert.equal(fits.quantity, 1);
  const blocked = size(650); // R$130 > R$100
  assert.equal(blocked.proposalState, 'RISK_BLOCKED');
  assert.equal(blocked.quantity, 0);
  assert.equal(blocked.sl, 206000 - 650, 'structural stop kept');
  assert.equal(size(150, 2).quantity, 2); // floor(100/30)=3, capped by maxContracts=2
});

test('a policy typed outside GESTÃO DE RISCO · REAL is never enough: the policy gate stays a decision', () => {
  const now = Date.now();
  const policy = { enabled: true, max_risk_brl: 100, session_windows: [] } as any;
  const r = realReadiness({ bridge: { state: {} }, policy, authorizations: [] }, baseEnv as any, undefined, now);
  const g = r.gates.find((x: any) => x.key === 'policy')!;
  assert.equal(g.ok, false);
  assert.equal(g.kind, 'DECISION');
  assert.ok(g.checks!.some((c) => !c.ok && /Gestão de Risco REAL/.test(c.label)));
  const managed = realReadiness({ bridge: { state: {} }, policy: { ...policy, risk_settings_version: 3 }, authorizations: [] }, baseEnv as any, undefined, now);
  assert.equal(managed.gates.find((x: any) => x.key === 'policy')!.ok, true);
});

test('every save is versioned and audited (previous, new, owner, 1R); versions are append-only', async () => {
  const w = await world();
  try {
    await w.save();
    await w.save({ capitalBRL: 4000 });
    const v = (await w.db.query<any>('select * from trade_real_risk_settings_versions order by id')).rows;
    assert.equal(v.length, 2);
    assert.equal(Number(v[1].one_r_brl), 200);
    assert.equal(Number(v[1].previous_policy.max_risk_brl), 100);
    assert.equal(v[1].previous_policy.account_hash, undefined);
    assert.equal(v[1].owner_id, 'focoos-admin');
    const a = (await w.db.query<any>("select payload from trade_bridge_audit where action='real_risk_settings_saved' order by id")).rows;
    assert.equal(a.length, 2);
    assert.equal(Number(a[1].payload.previous.max_risk_brl), 100);
    assert.equal(Number(a[1].payload.new.max_risk_brl), 200);
    assert.equal(Number(a[1].payload.settings.capitalBRL), 4000);
    await assert.rejects(w.db.exec('update trade_real_risk_settings_versions set one_r_brl=1'), /append-only/);
    const g = await w.api();
    assert.equal(g.data.riskHistory.length, 2);
  } finally {
    await w.close();
  }
});

test('saving during an armed session disarms it and sets the kill switch; saving never creates a command', async () => {
  const w = await world();
  try {
    await w.save();
    await w.db.query(
      `insert into trade_real_sessions(bridge_id,owner_id,armed_at,expires_at,account_hash,symbol,bridge_session,policy_fingerprint,checklist) values($1,'focoos-admin',now(),now()+interval '1 hour',$2,'WINV26','s','f','{}')`,
      [bridge, account],
    );
    await w.db.exec(`update trade_bridge_state set kill_switch=false`);
    assert.equal((await w.save({ capitalBRL: 2500 })).status, 200);
    const s = await w.one('select disarmed_at,disarm_reason from trade_real_sessions');
    assert.ok(s.disarmed_at);
    assert.equal(s.disarm_reason, 'POLICY_CHANGED');
    assert.equal((await w.one('select kill_switch from trade_bridge_state')).kill_switch, true);
    assert.equal(Number((await w.one('select count(*) n from trade_bridge_commands')).n), 0);
    assert.equal(Number((await w.one('select count(*) n from trade_real_confirmations')).n), 0);
  } finally {
    await w.close();
  }
});

test('REAL and PAPER risk management are independent', async () => {
  const w = await world();
  try {
    await w.save();
    assert.equal(Number((await w.one('select count(*) n from trade_risk_settings_versions')).n), 0, 'REAL never writes PAPER');
    await w.db.query(`select trade_risk_settings_save('focoos-admin',$1)`, [
      { capitalBRL: 100, riskModel: 'PCT_CAPITAL', riskValue: 10, dailyLossUnit: 'BRL', dailyLossValue: 30, maxContracts: 1, maxTradesPerDay: 5 },
    ]);
    assert.equal(Number((await w.one('select max_risk_brl from trade_execution_policy')).max_risk_brl), 100, 'PAPER never writes REAL');
    assert.equal(Number((await w.one('select count(*) n from trade_real_risk_settings_versions')).n), 1);
  } finally {
    await w.close();
  }
});

test('a refused arm reports its reasons (ARM_BLOCKED) instead of a malformed-array error, and arms nothing', async () => {
  const w = await world();
  try {
    await w.save();
    await assert.rejects(
      w.db.query(`select trade_real_arm('focoos-admin',$1,60,$2,15000,false,'ARMAR SESSÃO REAL')`, [bridge, account]),
      (e: any) => /^ARM_BLOCKED/.test(e.message) && /BACKEND_EXECUTION_DISABLED/.test(e.message) && !/malformed/.test(e.message),
    );
    await w.db.exec('update trade_execution_policy set risk_settings_version=null');
    await assert.rejects(
      w.db.query(`select trade_real_arm('focoos-admin',$1,60,$2,15000,true,'ARMAR SESSÃO REAL')`, [bridge, account]),
      /POLICY_NOT_FROM_REAL_RISK_SETTINGS/,
    );
    assert.equal(Number((await w.one('select count(*) n from trade_real_sessions')).n), 0);
    assert.equal((await w.one('select kill_switch from trade_bridge_state')).kill_switch, true);
  } finally {
    await w.close();
  }
});
