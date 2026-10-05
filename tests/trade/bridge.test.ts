import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { feedStatus } from '../../trade/bridge/mt5';
import {
  validateBatch,
  validateCommand,
  commandWire,
} from '../../trade/bridge/protocol';
import { authenticateBridge } from '../../trade/bridge/config';
import { onRequestPost as exchange } from '../../functions/api/trade/bridge/exchange';
const env = {
  TRADE_BRIDGE_TOKEN: 'unit-test-placeholder-32-characters-long',
  TRADE_EXECUTION_ENABLED: 'true',
  TRADE_ACCOUNT_HASH: 'a'.repeat(64),
};
const batch = (now = Date.now()) => ({
  bridgeId: 'xp-mt5-primary',
  symbol: 'WINV26',
  session: 'session-a',
  batch: 0,
  accountHash: 'a'.repeat(64),
  ticks: [
    {
      symbol: 'WINV26',
      timeMsc: now,
      bid: 130000,
      ask: 130005,
      last: 130000,
      volume: 1,
      flags: 6,
    },
  ],
  candles: [],
  events: [],
  state: {
    connected: true,
    executionAllowed: true,
    tickSize: 5,
    positions: [],
    orders: [],
  },
});
const command = () => ({
  id: crypto.randomUUID(),
  action: 'BUY',
  symbol: 'WINV26',
  volume: 1,
  sl: 129900,
  tp: 130200,
  price: 0,
  ticket: '0',
  expiresAt: Date.now() + 20000,
});
test('bridge credential is required; invalid batches never reach persistence', async () => {
  assert.equal(
    await authenticateBridge(new Request('https://test'), env),
    false,
  );
  assert.equal(
    await authenticateBridge(
      new Request('https://test', {
        headers: { Authorization: `Bearer ${env.TRADE_BRIDGE_TOKEN}` },
      }),
      env,
    ),
    true,
  );
  const r = await exchange({
    request: new Request('https://test/api/trade/bridge/exchange', {
      method: 'POST',
    }),
    env,
  });
  assert.equal(r.status, 401);
  assert.throws(() => validateBatch({ ...batch(), symbol: 'WDO' }, env));
  assert.throws(() =>
    validateBatch({ ...batch(), accountHash: 'b'.repeat(64) }, env),
  );
  assert.throws(() =>
    validateBatch(
      { ...batch(), ticks: [{ ...batch().ticks[0], last: NaN }] },
      env,
    ),
  );
});
test('price freshness requires both terminal and tick freshness; closed market is OFFLINE', () => {
  const now = Date.now(),
    b = batch(now);
  assert.equal(
    feedStatus(
      {
        state: b.state,
        tick: b.ticks[0],
        receivedAt: new Date(now).toISOString(),
      },
      env,
      now,
    ).status,
    'LIVE',
  );
  assert.equal(
    feedStatus(
      {
        state: b.state,
        tick: b.ticks[0],
        receivedAt: new Date(now).toISOString(),
      },
      env,
      now + 16000,
    ).status,
    'OFFLINE',
  );
  assert.equal(
    feedStatus(
      {
        state: b.state,
        tick: { ...b.ticks[0], timeMsc: now + 5000 },
        receivedAt: new Date(now).toISOString(),
      },
      env,
      now,
    ).status,
    'STALE',
  );
  assert.equal(feedStatus(null, env, now).status, 'OFFLINE');
});
test('explicit backend gate, account, quantity, expiry and protective prices required', () => {
  assert.throws(() => validateCommand(command(), {}));
  assert.throws(() => validateCommand({ ...command(), volume: 2 }, env));
  assert.throws(() => validateCommand({ ...command(), sl: 0 }, env));
  assert.throws(() =>
    validateCommand({ ...command(), expiresAt: Date.now() - 1 }, env),
  );
  const c = validateCommand(command(), env);
  assert.ok(commandWire(c).includes(`CMD|${c.id}|BUY|WINV26|1`));
});
test('Postgres bridge deduplicates batches/commands, quarantines lost responses, persists events and blocks client reads', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      'create role anon;create role authenticated;create role service_role bypassrls;',
    );
    await db.exec(
      readFileSync('supabase/migrations/20261003035402_mt5_bridge.sql', 'utf8'),
    );
    const b = batch(),
      c = command();
    const send = async (p: any) =>
      (
        await db.query<any>(
          'select public.trade_bridge_exchange($1,true,1,$2,15000) as result',
          [p, env.TRADE_ACCOUNT_HASH],
        )
      ).rows[0].result;
    await send(b);
    assert.equal(
      (await db.query<any>('select kill_switch from trade_bridge_state'))
        .rows[0].kill_switch,
      true,
    );
    await db.query('select public.trade_bridge_kill($1,false)', [b.bridgeId]);
    const enqueue = async (cmd: any) =>
      (
        await db.query<any>(
          'select public.trade_bridge_enqueue($1,$2,1,$3,15000) as result',
          [b.bridgeId, cmd, env.TRADE_ACCOUNT_HASH],
        )
      ).rows[0].result;
    await enqueue(c);
    await enqueue(c);
    await assert.rejects(enqueue({ ...c, tp: 130300 }), /Idempotency conflict/);
    const delivered = await send({ ...b, batch: 1 });
    assert.equal(delivered.command.id, c.id);
    assert.equal((await send({ ...b, batch: 1 })).command, null);
    assert.equal((await send({ ...b, batch: 2 })).command, null);
    await assert.rejects(enqueue(command()), /Unresolved command/);
    await assert.rejects(
      send({ ...b, session: 'second-ea', batch: 4 }),
      /session owns/,
    );
    await send({
      ...b,
      batch: 3,
      events: [
        { id: 'result', kind: 'submitted', commandId: c.id },
        {
          id: 'deal_1',
          kind: 'observed',
          commandId: c.id,
          deal: '1',
          volume: 1,
        },
      ],
    });
    assert.equal(
      (await db.query<any>('select state from trade_bridge_commands')).rows[0]
        .state,
      'observed',
    );
    await db.query('select public.trade_bridge_kill($1,true)', [b.bridgeId]);
    await assert.rejects(enqueue(command()), /gates closed/);
    await db.exec('set role authenticated');
    await assert.rejects(
      db.exec('select * from trade_bridge_ticks'),
      /permission denied/,
    );
    await assert.rejects(
      db.query('select public.trade_bridge_read($1)', [b.bridgeId]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
test('EA records durable intent before the only OrderSend and disables execution by default', () => {
  const s = readFileSync('mt5/FocoTradeBridge.mq5', 'utf8');
  assert.ok(s.includes('input bool EnableExecution=false'));
  assert.ok(
    s.indexOf('Save(prefix+"ledger.txt",ledger)') <
      s.indexOf('OrderSend(req,res)'),
  );
  assert.equal((s.match(/OrderSend\(req,res\)/g) || []).length, 1);
  assert.ok(s.includes('CopyTicksRange'));
  assert.ok(s.includes('OnTradeTransaction'));
});

test('live evaluation uses persisted MT5 candles, preserves authorization and never fabricates mock setups', async () => {
  const { onRequestGet } = await import('../../functions/api/trade/evaluate');
  const { generateMockCandles } = await import('../../trade/core/providers');
  const original = globalThis.fetch;
  const now = Date.now();
  const candles = generateMockCandles().map((c, i) => ({
    ...c,
    symbol: 'WINV26',
    timestamp: Math.floor(now / 60000) * 60 - (420 - i) * 60,
  }));
  globalThis.fetch = async () =>
    Response.json({
      state: batch().state,
      tick: batch(now).ticks[0],
      receivedAt: new Date(now).toISOString(),
      killSwitch: true,
      candles,
    });
  try {
    const r = await onRequestGet({
      request: new Request('https://test/api/trade/evaluate?source=mt5'),
      env: {
        ...env,
        TRADE_SUPABASE_URL: 'https://fixture.invalid',
        TRADE_SUPABASE_SERVICE_KEY: 'fixture',
      },
    });
    assert.equal(r.status, 200);
    const data: any = await r.json();
    assert.equal(data.source, 'live');
    assert.equal(data.feed.status, 'LIVE');
    assert.equal(data.snapshot.symbol, 'WINV26');
    assert.equal(data.snapshot.candles['1m'].length, 420);
    assert.equal(data.analyses[0].status, 'blocked');
    assert.equal(data.analyses[0].setup, undefined);
    assert.deepEqual(data.signals, []);
  } finally {
    globalThis.fetch = original;
  }
});

test('rollover never labels an old-contract tick as live for the new symbol', () => {
  const now = Date.now(),
    b = batch(now);
  assert.equal(
    feedStatus(
      {
        state: b.state,
        tick: b.ticks[0],
        receivedAt: new Date(now).toISOString(),
      },
      { ...env, TRADE_MT5_SYMBOL: 'WINZ26' },
      now,
    ).status,
    'OFFLINE',
  );
});

test('connected heartbeat with old ticks is STALE; candle gaps are visible without invented bars',async()=>{
 const {candleQuality}=await import('../../trade/bridge/mt5');const now=Date.now(),b=batch(now);
 const data={state:b.state,tick:{...b.ticks[0],timeMsc:now-60000},receivedAt:new Date(now).toISOString()};
 assert.equal(feedStatus(data,env,now).status,'STALE');
 assert.equal(feedStatus({...data,receivedAt:'invalid'},env,now).status,'OFFLINE');
 const cs=[{symbol:'WINV26',timestamp:60},{symbol:'WINV26',timestamp:180},{symbol:'WINV26',timestamp:180}];const quality=candleQuality(cs,'WINV26');assert.equal(quality.gaps,1);assert.equal(quality.duplicates,1);assert.equal(quality.candles,2);assert.equal(cs.length,3);
});
