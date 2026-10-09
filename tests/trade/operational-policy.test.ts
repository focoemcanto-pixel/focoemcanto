import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { policyComparison, policyWire, transportHealth } from '../../trade/bridge/operational-policy';
import { commandCanonical } from '../../trade/bridge/protocol';
import { signCommand } from '../../trade/bridge/real';
const account = 'a'.repeat(64), hash = 'b'.repeat(32), sid = '12345678-1234-1234-1234-123456789012';
const env = { TRADE_EXECUTION_ENABLED: 'true', TRADE_ACCOUNT_HASH: account, TRADE_BRIDGE_TOKEN: 'isolated-policy-test-token-32-characters' };
const ctx = (now = Date.now()): any => ({
  policyFingerprint: hash,
  policy: { account_hash: account, risk_settings_version: 3, max_risk_brl: 15, max_daily_loss_brl: 45, max_slippage_points: 50, max_contracts: 1, max_positions: 1, max_position_contracts: 1, max_notional_brl: 50000, max_orders_per_session: 3, max_orders_per_day: 5, max_session_minutes: 120 },
  bridge: { session: 'ea-identity', accountHash: account, killSwitch: true, receivedAt: new Date(now).toISOString(), state: { connected: true, policyProtocol: 1, localAccountAuthorized: true, localLimits: { maxRiskBRL: 15, maxLossBRL: 45, maxSlippagePoints: 50, maxContracts: 1, maxPositions: 1 }, policyReceipt: { version: 3, hash, validUntil: now + 15000 } } },
  session: { id: sid, active: false, armed_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 60000).toISOString() },
});
test('operational settings move independently of immutable local caps; larger policies never enlarge effective risk', () => {
  const c = ctx(), original = structuredClone(c.bridge.state.localLimits);
  for (const risk of [5, 15, 25]) {
    c.policy.max_risk_brl = risk;
    const row = policyComparison(c, env).rows.find(r => r.key === 'maxRiskBRL')!;
    assert.equal(row.effective, Math.min(risk, 15));
    assert.equal(row.capped, risk > 15);
    assert.deepEqual(c.bridge.state.localLimits, original);
  }
  c.bridge.state.localLimits.maxRiskBRL = 0;
  assert.equal(policyComparison(c, env).rows[0].effective, null);
});
test('POLICY2 binds every operational limit to account, bridge session, policy version/hash and expiring REAL session; cannot arm or send orders', async () => {
  const now = Date.now(), c = ctx(now);
  let line = (await policyWire(c, env, now)).trim(), f = line.split('|');
  assert.equal(f.length, 23);
  assert.equal(f[0], 'POLICY2'); assert.equal(f[1], '3'); assert.equal(f[2], hash); assert.equal(f[3], account); assert.equal(f[4], 'ea-identity');
  assert.deepEqual(f.slice(6,16), ['15.00000000','45.00000000','50.00000000','1','1','1','50000.00000000','3','5','120']);
  assert.equal(f[19], '0'); assert.ok(!line.includes('CMD')); assert.equal(c.bridge.killSwitch, true);
  assert.equal(f[22], createHmac('sha256', env.TRADE_BRIDGE_TOKEN).update(f.slice(0,22).join('|')).digest('hex'));
  c.bridge.killSwitch = false; c.session.active = true;
  f = (await policyWire(c, env, now)).trim().split('|');
  assert.equal(f[16], sid); assert.equal(f[19], '1'); assert.equal(Number(f[21]) - now, 15000);
  c.bridge.accountHash = 'c'.repeat(64); await assert.rejects(policyWire(c, env, now));
});
test('extended CMD2 signs policy and REAL-session identity; tampering invalidates the signature, legacy canonical remains compatible', async () => {
  const command: any = { id: sid, action: 'BUY', symbol: 'WINV26', volume: 1, sl: 200000, tp: 200100, price: 0, ticket: '0', expiresAt: Date.now()+10000, referencePrice: 200050, maxRiskBRL: 15, maxLossBRL: 45, maxSlippagePoints: 50 };
  assert.equal(commandCanonical(command).split('|').length, 14);
  Object.assign(command, { policyVersion: 3, policyHash: hash, realSessionId: sid });
  const signed = await signCommand(command, env);
  assert.equal(commandCanonical(signed).split('|').length, 18);
  assert.equal(signed.signature, createHmac('sha256', env.TRADE_BRIDGE_TOKEN).update(commandCanonical(signed)).digest('hex'));
  assert.notEqual(signed.signature, createHmac('sha256', env.TRADE_BRIDGE_TOKEN).update(commandCanonical({ ...signed, policyVersion: 4 })).digest('hex'));
});
test('transport distinguishes degraded recovery from OFFLINE and never turns old heartbeat into connected', () => {
  const now = Date.now(), b = ctx(now).bridge;
  assert.equal(transportHealth(b,15000,now).state, 'CONNECTED');
  b.state.transport = { consecutiveFailures: 1, lastStatus: 1003, lastNetworkError: 5203, lastFailureAt: now };
  assert.equal(transportHealth(b,15000,now).state,'DEGRADED');
  b.state.transport.consecutiveFailures=0;
  assert.equal(transportHealth(b,15000,now).state,'DEGRADED');
  assert.equal(transportHealth(b,15000,now+16000).state,'OFFLINE');
});
test('Postgres synchronization rejects stale policy/reconnect/failure, preserves caps and duplicate batch identity, and management changes disarm', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
    for (const m of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql') && f!=='20261003021627_foco_trade_initial.sql').sort()) await db.exec(readFileSync('supabase/migrations/'+m,'utf8'));
    const c = ctx(), bridge='xp-mt5-primary';
    await db.query(`insert into trade_bridge_state(bridge_id,symbol,session,account_hash,state,tick) values($1,'WINV26','ea-identity',$2,$3,$4)`,[bridge,account,c.bridge.state,{symbol:'WINV26',timeMsc:Date.now(),bid:200000,ask:200005}]);
    const settings = { capitalBRL:150,riskModel:'FIXED_BRL',riskValue:15,dailyLossUnit:'R',dailyLossValue:3,maxContracts:1,maxOrdersPerSession:3,maxOrdersPerDay:5,maxSessionMinutes:120,maxSlippagePoints:50,maxNotionalBRL:50000,enabled:true,rolloverConfirmed:true };
    const save = async (value=15)=>db.query(`select trade_real_risk_settings_save('focoos-admin',$1,$2,'WINV26',now()+interval '7 days',null,$3)`,[bridge,account,{...settings,riskValue:value}]);
    await save();
    const one = async (sql:string)=>(await db.query<any>(sql)).rows[0];
    assert.equal((await one(`select trade_policy_receipt_valid('${bridge}') ok`)).ok,false);
    await db.exec(`update trade_bridge_state set state=jsonb_set(state,'{policyReceipt}',(select jsonb_build_object('version',risk_settings_version,'hash',trade_policy_fingerprint(p),'validUntil',extract(epoch from now())*1000+15000) from trade_execution_policy p))`);
    assert.equal((await one(`select trade_policy_receipt_valid('${bridge}') ok`)).ok,true);
    await db.exec(`update trade_bridge_state set state=jsonb_set(state,'{transport}','{"consecutiveFailures":1}')`);
    assert.equal((await one(`select trade_policy_receipt_valid('${bridge}') ok`)).ok,false);
    await db.exec(`update trade_bridge_state set state=jsonb_set(state,'{transport}','{"consecutiveFailures":0}')`);
    await db.query(`insert into trade_real_sessions(bridge_id,owner_id,expires_at,account_hash,symbol,bridge_session,policy_fingerprint) values($1,'focoos-admin',now()+interval '1 hour',$2,'WINV26','ea-identity',(select trade_policy_fingerprint(p) from trade_execution_policy p))`,[bridge,account]);
    await save(10);
    assert.ok((await one('select disarmed_at from trade_real_sessions')).disarmed_at);
    assert.equal((await one('select kill_switch from trade_bridge_state')).kill_switch,true);
    assert.equal((await one(`select trade_policy_receipt_valid('${bridge}') ok`)).ok,false);
    assert.equal((await one(`select state->'localLimits' caps from trade_bridge_state`)).caps.maxRiskBRL,15);
    await db.exec(`update trade_bridge_state set state=state-'policyReceipt'`);
    assert.equal((await one(`select trade_policy_receipt_valid('${bridge}') ok`)).ok,false);
    const batch = {bridgeId:bridge,symbol:'WINV26',session:'ea-identity',batch:1,accountHash:account,ticks:[],candles:[],events:[],state:c.bridge.state};
    await db.query('select trade_bridge_exchange_v2($1,false,1,$2,15000)',[batch,account]);
    const duplicate:any=(await db.query<any>('select trade_bridge_exchange_v2($1,false,1,$2,15000) r',[batch,account])).rows[0].r;
    assert.equal(duplicate.duplicate,true);assert.equal(duplicate.command,null);
    assert.equal((await one('select count(*) n from trade_bridge_batches')).n,1);
  } finally { await db.close(); }
});
test('v2.08 exchange emits signed policy before a command, accepts transport diagnostics without changing durable identity, and fails closed without policy', async () => {
  const { onRequestPost } = await import('../../functions/api/trade/bridge/exchange');
  const c = ctx(), original = globalThis.fetch;
  const configured = { ...env, TRADE_SUPABASE_URL:'https://fixture.invalid', TRADE_SUPABASE_SERVICE_KEY:'fixture-only' };
  const batch = { bridgeId:'xp-mt5-primary',symbol:'WINV26',session:'ea-identity',batch:7,accountHash:account,ticks:[],candles:[],events:[],state:{...c.bridge.state,protocolVersion:2,executionAllowed:true,tickSize:5,positions:[],orders:[]} };
  let seen:any, unavailable=false;
  globalThis.fetch = (async (url:any,init:any)=>{
    const name=String(url).split('/').pop();
    if(name==='trade_operations_read')return Response.json([]);
    if(name==='trade_real_context')return Response.json(unavailable ? null : c);
    if(name==='trade_bridge_exchange_v2'){seen=JSON.parse(init.body).p_batch;return Response.json({command:null,duplicate:true});}
    throw new Error('unexpected fixture RPC '+name);
  }) as any;
  const request=()=>new Request('https://fixture.invalid/api/trade/bridge/exchange',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.TRADE_BRIDGE_TOKEN,'X-Foco-Transport':JSON.stringify({failures:2,consecutiveFailures:1,lastStatus:1003,lastNetworkError:5203,terminalBuild:6241,token:'must-not-persist'})},body:JSON.stringify(batch)});
  try {
    let r=await onRequestPost({env:configured,request:request()}),body=await r.text();
    assert.equal(r.status,200); assert.ok(body.startsWith('OK\nPOLICY2|'));assert.ok(!body.includes('CMD'));
    assert.equal(seen.batch,7);assert.equal(seen.session,batch.session);assert.deepEqual(seen.events,batch.events);assert.deepEqual(seen.ticks,batch.ticks);
    assert.equal(seen.state.transport.lastNetworkError,5203);assert.equal(seen.state.transport.token,undefined);assert.equal(batch.state.transport,undefined);
    unavailable=true;r=await onRequestPost({env:configured,request:request()});assert.equal(await r.text(),'OK\nPOLICY_UNAVAILABLE\n');
  } finally { globalThis.fetch=original; }
});
