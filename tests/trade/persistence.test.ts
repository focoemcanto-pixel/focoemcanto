import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  rpc,
  PersistenceError,
  runtimeConfiguration,
} from '../../trade/bridge/config';
import {
  onRequestGet as operations,
  onRequestPost as operate,
} from '../../functions/api/trade/operations';
import { onRequestGet as health } from '../../functions/api/trade/health';
import { instrumentValue } from '../../trade/bridge/instruments';
const env = {
  TRADE_SUPABASE_URL: 'https://fixture.invalid/',
  TRADE_SUPABASE_SERVICE_KEY: 'test-private-service-key',
  TRADE_EXECUTION_ENABLED: 'false',
  TRADE_BRIDGE_TOKEN: 'test-placeholder-32-characters-long',
};
test('schema, access, missing configuration and network errors remain distinct and never reveal secrets', async () => {
  const original = globalThis.fetch;
  try {
    await assert.rejects(
      rpc({}, 'trade_operations_read', {}),
      (e: any) => e.code === 'CONFIGURATION_MISSING',
    );
    for (const [status, code, expected] of [
      [404, 'PGRST202', 'SCHEMA_MISSING'],
      [401, 'PGRST301', 'ACCESS_DENIED'],
      [403, '42501', 'ACCESS_DENIED'],
      [500, 'XX000', 'PERSISTENCE_UNAVAILABLE'],
    ] as const) {
      globalThis.fetch = async () =>
        Response.json(
          { code, message: env.TRADE_SUPABASE_SERVICE_KEY },
          { status },
        );
      const response = await operations({
        request: new Request('https://test/api/trade/operations'),
        env,
      });
      const data: any = await response.json();
      assert.equal(data.code, expected);
      assert.equal(
        JSON.stringify(data).includes(env.TRADE_SUPABASE_SERVICE_KEY),
        false,
      );
    }
    globalThis.fetch = async () => {
      throw new Error(env.TRADE_SUPABASE_SERVICE_KEY);
    };
    await assert.rejects(
      rpc(env, 'trade_operations_read', {}),
      PersistenceError,
    );
    assert.equal(runtimeConfiguration(env).executionExplicitlyDisabled, true);
  } finally {
    globalThis.fetch = original;
  }
});
test('PAPER uses explicit WIN specification for old EA metadata; REAL cannot use fallback', () => {
  assert.equal(
    instrumentValue('WINV26', 'PAPER', { tickSize: 5 }).pointValue,
    0.2,
  );
  assert.equal(
    instrumentValue('WINV26', 'PAPER', { tickSize: 5 }).source,
    'win-specification-paper',
  );
  assert.throws(() => instrumentValue('WINV26', 'REAL', { tickSize: 5 }));
  assert.throws(() => instrumentValue('WDOF27', 'PAPER', { tickSize: 5 }));
  assert.throws(() =>
    instrumentValue('WINV26', 'PAPER', {
      currency: 'USD',
      tickValue: 1,
      tickSize: 5,
    }),
  );
  assert.equal(
    instrumentValue('WINV26', 'PAPER', {
      currency: 'BRL',
      tickValue: 1,
      tickSize: 5,
    }).source,
    'mt5',
  );
});
test('service-role RPC PAPER approval/journal works with execution false; schema failure disappears after migration', async () => {
  const db = new PGlite(),
    original = globalThis.fetch;
  try {
    await db.exec(
      'create role anon;create role authenticated;create role service_role bypassrls;',
    );
    await db.exec(
      readFileSync('supabase/migrations/20261003035402_mt5_bridge.sql', 'utf8'),
    );
    globalThis.fetch = async (url, init: any) => {
      assert.equal(init.headers.apikey, env.TRADE_SUPABASE_SERVICE_KEY);
      assert.equal(
        init.headers.Authorization,
        'Bearer ' + env.TRADE_SUPABASE_SERVICE_KEY,
      );
      const name = new URL(String(url)).pathname.split('/').pop(),
        args = Object.values(JSON.parse(init.body));
      try {
        const r = await db.query<any>(
          `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`,
          args,
        );
        return Response.json(r.rows[0]?.result ?? null);
      } catch {
        return Response.json({ code: 'PGRST202' }, { status: 404 });
      }
    };
    const request = new Request(
      'https://test/api/trade/operations?source=replay&cursor=180',
    );
    assert.equal(
      ((await (await operations({ request, env })).json()) as any).code,
      'SCHEMA_MISSING',
    );
    await db.exec(
      readFileSync(
        'supabase/migrations/20261003042050_human_approval.sql',
        'utf8',
      ),
    );
    await db.exec('set role service_role');
    assert.equal((await operations({ request, env })).status, 200);
    const post = async (body: any) =>
      operate({
        env,
        request: new Request('https://test/api/trade/operations', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      });
    const r = await post({
      action: 'propose',
      mode: 'PAPER',
      source: 'replay',
      cursor: 180,
      quantity: 1,
    });
    assert.equal(r.status, 200);
    const row: any = await r.json();
    assert.equal(
      (await post({ action: 'confirm', id: row.id, cursor: 180 })).status,
      200,
    );
    const rows: any = await (
      await operations({
        env,
        request: new Request(
          'https://test/api/trade/operations?source=replay&cursor=181',
        ),
      })
    ).json();
    assert.equal(rows[0].execution.status, 'EXECUTADA');
    assert.equal(
      (await db.query('select * from trade_bridge_commands')).rows.length,
      0,
    );
    assert.ok(
      (await db.query('select * from trade_operation_journal')).rows.length >=
        3,
    );
    const { onRequestPost: exchange } = await import(
      '../../functions/api/trade/bridge/exchange'
    );
    const batch = {
      bridgeId: 'xp-mt5-primary',
      symbol: 'WINV26',
      session: 'test-session',
      batch: 1,
      accountHash: 'a'.repeat(64),
      ticks: [
        {
          symbol: 'WINV26',
          timeMsc: Date.now(),
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
        executionAllowed: false,
        tickSize: 5,
        positions: [],
        orders: [],
      },
    };
    const response = await exchange({
      env,
      request: new Request('https://test/api/trade/bridge/exchange', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + env.TRADE_BRIDGE_TOKEN,
        },
        body: JSON.stringify(batch),
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'OK\n');
    const persisted: any = (
      await db.query<any>('select state,kill_switch from trade_bridge_state')
    ).rows[0];
    assert.equal(persisted.kill_switch, true);
    assert.equal(persisted.state.executionAllowed, false);
    assert.equal(
      persisted.state.backendDiagnostics.executionExplicitlyDisabled,
      true,
    );
    assert.equal(persisted.state.backendDiagnostics.serviceKeyPresent, true);
    assert.equal(
      persisted.state.backendDiagnostics.operationsRpcAvailable,
      true,
    );
    const { generateMockCandles } = await import('../../trade/core/providers');
    const bars = generateMockCandles().map((c) => ({ ...c, symbol: 'WINV26' }));
    const livePaper = {
      ...row.payload,
      id: crypto.randomUUID(),
      source: 'mt5',
      symbol: 'WINV26',
      cursor: row.payload.asOf,
      setup: { ...row.payload.setup, id: 'window-paper' },
    };
    await db.query('select trade_propose($1,$2,$3)', [
      'focoos-admin',
      batch.bridgeId,
      livePaper,
    ]);
    await db.query("select trade_confirm($1,$2,'confirm',null,1,'',15000)", [
      'focoos-admin',
      livePaper.id,
    ]);
    const saveBars = async (cs: any[]) => {
      for (const c of cs)
        await db.query('insert into trade_bridge_candles values($1,$2,$3,$4)', [
          batch.bridgeId,
          c.symbol,
          c.timestamp,
          c,
        ]);
    };
    await saveBars(bars.slice(0, 181));
    const getPaper = () =>
      operations({
        env,
        request: new Request(
          'https://test/api/trade/operations?source=mt5&cursor=181',
        ),
      });
    assert.equal((await getPaper()).status, 200);
    const first: any = (
      await db.query<any>(
        'select paper_cursor,execution from trade_operation_proposals where id=$1',
        [livePaper.id],
      )
    ).rows[0];
    await db.query('delete from trade_bridge_candles where timestamp=$1', [
      bars[0].timestamp,
    ]);
    await saveBars([bars[181]]);
    assert.equal((await getPaper()).status, 200);
    const second: any = (
      await db.query<any>(
        'select paper_cursor,execution from trade_operation_proposals where id=$1',
        [livePaper.id],
      )
    ).rows[0];
    assert.ok(second.paper_cursor > first.paper_cursor);
    assert.notDeepEqual(second.execution, first.execution);
    assert.equal(
      (await db.query('select * from trade_bridge_commands')).rows.length,
      0,
    );
    const h: any = await (await health({ env })).json();
    assert.equal(h.persistence, 'AVAILABLE');
    assert.equal(h.paperAvailable, true);
    assert.equal(h.realExecutionEnabled, false);
    assert.equal(h.runtime.executionExplicitlyDisabled, true);
  } finally {
    globalThis.fetch = original;
    await db.close();
  }
});
