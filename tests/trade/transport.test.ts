import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as exchange } from '../../functions/api/trade/bridge/exchange';
const env = {
  TRADE_BRIDGE_TOKEN: 'isolated-transport-fixture-token-32-characters',
  TRADE_SUPABASE_URL: 'https://fixture.invalid',
  TRADE_SUPABASE_SERVICE_KEY: 'never-log-service-key',
  TRADE_EXECUTION_ENABLED: 'false',
};
const batch = () => ({
  bridgeId: 'xp-mt5-primary',
  symbol: 'WINV26',
  session: 'fixture',
  batch: 0,
  accountHash: 'a'.repeat(64),
  ticks: [
    {
      symbol: 'WINV26',
      timeMsc: 1,
      bid: 135000,
      ask: 135005,
      last: 135000,
      volume: 1,
      flags: 0,
    },
  ],
  candles: [],
  events: [],
  state: {
    protocolVersion: 2,
    connected: true,
    executionAllowed: false,
    tickSize: 5,
    positions: [],
    orders: [],
  },
});
const request = (b: any, token = env.TRADE_BRIDGE_TOKEN) =>
  new Request('https://fixture.invalid/api/trade/bridge/exchange', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: typeof b === 'string' ? b : JSON.stringify(b),
  });
test('transport auth rejects bad token with stage authenticate before persistence', async () => {
  const r = await exchange({ env, request: request(batch(), 'wrong') });
  assert.equal(r.status, 401);
  assert.equal(((await r.json()) as any).stage, 'authenticate');
});
for (const [name, change, code] of [
  ['symbol', (b: any) => (b.symbol = 'WDO'), 'BRIDGE_SYMBOL_MISMATCH'],
  [
    'account',
    (b: any) => (b.accountHash = 'invalid'),
    'BRIDGE_ACCOUNT_MISMATCH',
  ],
  ['tick', (b: any) => (b.ticks[0].volume = -1), 'BRIDGE_TICK_INVALID'],
  [
    'unclosed candle',
    (b: any) =>
      (b.candles = [
        {
          symbol: b.symbol,
          timeframe: '1m',
          timestamp: Math.floor(Date.now() / 1000),
          open: 1,
          close: 1,
          high: 1,
          low: 1,
          volume: 1,
        },
      ]),
    'BRIDGE_CANDLE_UNCLOSED_OR_SYMBOL',
  ],
  ['tick size', (b: any) => (b.state.tickSize = 0), 'BRIDGE_TICK_SIZE_INVALID'],
] as const)
  test(
    'transport diagnosis identifies ' + name + ' without exposing secrets',
    async () => {
      const original = globalThis.fetch,
        log = console.error;
      globalThis.fetch = async () => Response.json(null);
      console.error = () => {};
      try {
        const b = batch();
        change(b);
        const r = await exchange({ env, request: request(b) }),
          d: any = await r.json();
        assert.equal(r.status, 400);
        assert.equal(d.stage, 'validateBatch');
        assert.equal(d.errorCode, code);
        const s = JSON.stringify(d);
        assert.ok(!s.includes(env.TRADE_BRIDGE_TOKEN));
        assert.ok(!s.includes(env.TRADE_SUPABASE_SERVICE_KEY));
        assert.ok(!s.includes('a'.repeat(64)));
      } finally {
        globalThis.fetch = original;
        console.error = log;
      }
    },
  );
test('parse error cannot echo raw token or fingerprint from invalid JSON', async () => {
  const original = globalThis.fetch,
    log = console.error;
  globalThis.fetch = async () => Response.json(null);
  console.error = () => {};
  try {
    const r = await exchange({
      env,
      request: request('{' + env.TRADE_BRIDGE_TOKEN),
    });
    const d: any = await r.json();
    assert.equal(d.stage, 'parse');
    assert.equal(d.error, 'JSON inválido');
    assert.ok(!JSON.stringify(d).includes(env.TRADE_BRIDGE_TOKEN));
  } finally {
    globalThis.fetch = original;
    console.error = log;
  }
});
test('disarmed valid v2 uses exact RPC signature and ignores any returned command; old ticks allowed on Sunday', async () => {
  const original = globalThis.fetch,
    seen: any[] = [];
  globalThis.fetch = async (u, init) => {
    const name = String(u).split('/').pop();
    const args = JSON.parse(String(init?.body));
    seen.push({ name, args });
    return Response.json(
      name === 'trade_operations_read'
        ? []
        : { command: { signatureVersion: 2 } },
    );
  };
  try {
    const r = await exchange({ env, request: request(batch()) });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), 'OK\n');
    const rpc = seen.find((x) => x.name === 'trade_bridge_exchange_v2');
    assert.equal(rpc.args.p_execution, false);
    assert.equal(
      rpc.args.p_batch.state.backendDiagnostics.executionExplicitlyDisabled,
      true,
    );
    assert.deepEqual(Object.keys(rpc.args), [
      'p_batch',
      'p_execution',
      'p_max',
      'p_account',
      'p_max_age',
    ]);
  } finally {
    globalThis.fetch = original;
  }
});
test('missing v2 RPC reports stage and schema code without echoing database error', async () => {
  const original = globalThis.fetch,
    log = console.error;
  globalThis.fetch = async (u) =>
    String(u).endsWith('trade_bridge_exchange_v2')
      ? Response.json(
          { code: 'PGRST202', message: env.TRADE_SUPABASE_SERVICE_KEY },
          { status: 404 },
        )
      : Response.json([]);
  console.error = () => {};
  try {
    const r = await exchange({ env, request: request(batch()) });
    const d: any = await r.json();
    assert.equal(r.status, 400);
    assert.equal(d.stage, 'trade_bridge_exchange_v2');
    assert.equal(d.errorCode, 'SCHEMA_MISSING');
    assert.equal(d.rpcCode, 'PGRST202');
    assert.ok(!JSON.stringify(d).includes(env.TRADE_SUPABASE_SERVICE_KEY));
  } finally {
    globalThis.fetch = original;
    console.error = log;
  }
});

test('v1 pending upgrade preserves batch/session/watermark/events and accepts v2 unchanged', async () => {
  const { upgradePendingTransport } = await import(
    '../../trade/bridge/transport-recovery'
  );
  const legacy: any = batch();
  delete legacy.state.protocolVersion;
  legacy.events = [{ id: 'deal_1', kind: 'observed' }];
  const current = {
    bridgeId: legacy.bridgeId,
    symbol: legacy.symbol,
    accountHash: legacy.accountHash,
    state: batch().state,
  };
  const original = structuredClone(legacy);
  const next = upgradePendingTransport(legacy, current);
  assert.equal(next.changed, true);
  assert.deepEqual(legacy, original);
  for (const k of [
    'bridgeId',
    'symbol',
    'accountHash',
    'batch',
    'session',
    'ticks',
    'candles',
    'events',
  ])
    assert.deepEqual(next.pending[k], legacy[k]);
  assert.equal(next.pending.state.protocolVersion, 2);
  assert.equal(next.pending.state.executionAllowed, false);
  assert.equal(upgradePendingTransport(next.pending, current).changed, false);
  assert.throws(
    () =>
      upgradePendingTransport(
        { ...legacy, accountHash: 'b'.repeat(64) },
        current,
      ),
    /IDENTITY/,
  );
  assert.throws(
    () =>
      upgradePendingTransport(legacy, {
        ...current,
        state: { ...current.state, executionAllowed: true },
      }),
    /NOT_READY/,
  );
});

test('v2 API/Postgres persists heartbeat and historical feed once across retry with execution false', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { readFileSync } = await import('node:fs');
  const db = new PGlite(),
    original = globalThis.fetch;
  try {
    await db.exec(
      'create role anon;create role authenticated;create role service_role bypassrls;',
    );
    for (const file of [
      '20261003035402_mt5_bridge.sql',
      '20261003042050_human_approval.sql',
      '20261003124510_multi_strategy_scanner.sql',
      '20261004210552_real_execution_safety.sql',
      '20261005000359_real_execution_fail_closed.sql',
    ])
      await db.exec(readFileSync('supabase/migrations/' + file, 'utf8'));
    await db.exec('set role service_role');
    let dbFailure='';
    globalThis.fetch = async (u, init) => {
      assert.equal(new URL(String(u)).hostname, 'fixture.invalid');
      const name = String(u).split('/').pop()!;
      assert.match(name, /^trade_[a-z0-9_]+$/);
      const args = Object.values(JSON.parse(String(init?.body)));
      try{const r = await db.query<any>(
        `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as result`,
        args,
      );
      return Response.json(r.rows[0].result);}catch(e:any){dbFailure=e.message;return Response.json({code:e.code},{status:400});}
    };
    const b: any = batch();
    b.candles = [
      {
        symbol: b.symbol,
        timeframe: '1m',
        timestamp: 1000,
        open: 135000,
        high: 135010,
        low: 134990,
        close: 135005,
        volume: 3,
      },
    ];
    for (let i = 0; i < 2; i++) {
      const r = await exchange({ env, request: request(b) });
      assert.equal(r.status, 200,dbFailure);
      assert.equal(await r.text(), 'OK\n');
    }
    assert.equal(
      (await db.query('select * from trade_bridge_batches')).rows.length,
      1,
    );
    assert.equal(
      (await db.query('select * from trade_bridge_ticks')).rows.length,
      1,
    );
    assert.equal(
      (await db.query('select * from trade_bridge_candles')).rows.length,
      1,
    );
    assert.equal(
      (await db.query('select * from trade_bridge_commands')).rows.length,
      0,
    );
    const row: any = (await db.query('select * from trade_bridge_state'))
      .rows[0];
    assert.equal(row.kill_switch, true);
    assert.equal(row.state.protocolVersion, 2);
    assert.equal(row.state.executionAllowed, false);
    assert.equal(
      row.state.backendDiagnostics.executionExplicitlyDisabled,
      true,
    );
  } finally {
    globalThis.fetch = original;
    await db.close();
  }
});
