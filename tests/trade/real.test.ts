import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { makeProposal, executionView } from '../../trade/bridge/approval';
import { realReadiness, signCommand, nonceHash } from '../../trade/bridge/real';
import { commandCanonical, commandWire } from '../../trade/bridge/protocol';
import { runReplay } from '../../trade/core/engine';
import { generateMockCandles, snapshotOf } from '../../trade/core/providers';
import { scanMarket } from '../../trade/scanner/engine';
const bridge = 'xp-mt5-primary',
  account = 'a'.repeat(64);
// All enabled flags below are isolated fixtures, never production configuration.
function fixture() {
  const now = Date.now(),
    analysis = runReplay(generateMockCandles(), 180).analyses[0];
  const base = makeProposal(
    analysis,
    {
      mode: 'PAPER',
      source: 'replay',
      symbol: 'WIN',
      quantity: 1,
      max: 2,
      pointValue: 0.2,
      currency: 'BRL',
      cursor: 180,
      asOf: now / 1000 - 5,
      liveAuthorized: false,
    },
    now,
  );
  const p = {
    ...base,
    mode: 'REAL' as const,
    source: 'mt5' as const,
    symbol: 'WINV26',
    entry: 135425,
    sl: 134975,
    tp: 136325,
    riskPoints: 450,
    riskBRL: 90,
    potentialPoints: 900,
    potentialBRL: 180,
    rr: 2,
  };
  const env = {
    TRADE_EXECUTION_ENABLED: 'true',
    TRADE_ACCOUNT_HASH: account,
    TRADE_BRIDGE_TOKEN: 'isolated-test-fixture-token-32-characters',
    TRADE_MAX_CONTRACTS: '2',
  };
  const state = {
    connected: true,
    executionAllowed: true,
    protocolVersion: 2,
    magic: '706032601',
    currency: 'BRL',
    tickSize: 5,
    tickValue: 1,
    volumeMin: 1,
    volumeStep: 1,
    volumeMax: 10,
    point: 1,
    stopsLevel: 5,
    expirationTime: (now + 86400000) / 1000,
    tradeMode: 4,
    sessionOpen: true,
    historyReady: true,
    historyAsOfMsc: now,
    loss24hBRL: 0,
    protectionFault: false,
    positions: [] as any[],
    orders: [] as any[],
    localAccountAuthorized: true,
    localLimits: {
      maxContracts: 2,
      maxPositions: 1,
      maxRiskBRL: 200,
      maxLossBRL: 600,
      maxSlippagePoints: 20,
    },
  };
  const ctx = {
    bridge: {
      bridgeId: bridge,
      symbol: p.symbol,
      accountHash: account,
      receivedAt: new Date(now).toISOString(),
      killSwitch: false,
      tick: {
        symbol: p.symbol,
        timeMsc: now,
        bid: 135420,
        ask: 135425,
        last: 135425,
        volume: 1,
        flags: 0,
      },
      state,
    },
    policy: {
      enabled: true,
      account_hash: account,
      symbol: p.symbol,
      contract_expires_at: new Date(now + 86400000).toISOString(),
      rollover_confirmed: true,
      session_windows: [
        {
          open: new Date(now - 3600000).toISOString(),
          close: new Date(now + 3600000).toISOString(),
        },
      ],
      max_contracts: 2,
      max_positions: 1,
      max_risk_brl: 200,
      max_daily_loss_brl: 600,
      max_slippage_points: 20,
    },
    authorizations: [
      {
        strategy_id: p.setup.strategy,
        version: p.setup.version,
        live_authorized: true,
        stage: 'live-monitoring',
      },
    ],
    unresolved: 0,
  };
  return { now, p, env, ctx };
}
test('REAL is ready only with every explicit gate; disarmed backend never disables PAPER', () => {
  const f = fixture();
  assert.equal(realReadiness(f.ctx, f.env, f.p, f.now).canExecute, true);
  assert.equal(
    realReadiness(
      f.ctx,
      { ...f.env, TRADE_EXECUTION_ENABLED: 'false' },
      f.p,
      f.now,
    ).canExecute,
    false,
  );
  assert.equal(realReadiness({}, f.env, undefined, f.now).canExecute, false);
  assert.ok(
    makeProposal(runReplay(generateMockCandles(), 180).analyses[0], {
      mode: 'PAPER',
      source: 'replay',
      symbol: 'WIN',
      quantity: 1,
      max: 1,
      pointValue: 0.2,
      currency: 'BRL',
      cursor: 180,
      asOf: 1,
      liveAuthorized: false,
    }),
  );
});
const blocks: Record<string, (f: ReturnType<typeof fixture>) => void> = {
  'kill switch': (f) => (f.ctx.bridge.killSwitch = true),
  'EA disabled': (f) => (f.ctx.bridge.state.executionAllowed = false),
  'offline bridge': (f) => (f.ctx.bridge.state.connected = false),
  'old heartbeat': (f) =>
    (f.ctx.bridge.receivedAt = new Date(f.now - 60000).toISOString()),
  'old tick': (f) => (f.ctx.bridge.tick.timeMsc = f.now - 60000),
  'future tick': (f) => (f.ctx.bridge.tick.timeMsc = f.now + 10000),
  'wrong account': (f) => (f.ctx.bridge.accountHash = 'b'.repeat(64)),
  'wrong symbol': (f) => (f.p.symbol = 'WINZ26'),
  'expired policy': (f) =>
    (f.ctx.policy.contract_expires_at = new Date(f.now - 1).toISOString()),
  'expired MT5 contract': (f) =>
    (f.ctx.bridge.state.expirationTime = (f.now - 1) / 1000),
  'rollover missing': (f) => (f.ctx.policy.rollover_confirmed = false),
  'session closed': (f) => (f.ctx.bridge.state.sessionOpen = false),
  'calendar absent': (f) => (f.ctx.policy.session_windows = []),
  'quantity invalid': (f) => (f.p.quantity = 3),
  'volume step': (f) => (f.ctx.bridge.state.volumeStep = 2),
  'wrong SL': (f) => (f.p.sl = f.p.entry),
  'tick alignment': (f) => (f.p.tp += 1),
  'excessive risk': (f) => (f.ctx.policy.max_risk_brl = 10),
  'loss limit': (f) => (f.ctx.bridge.state.loss24hBRL = 590),
  'open position': (f) => (f.ctx.bridge.state.positions = [{ volume: 1 }]),
  'pending order': (f) => (f.ctx.bridge.state.orders = [{ volume: 1 }]),
  'live authorization': (f) =>
    (f.ctx.authorizations[0].live_authorized = false),
  'unknown command': (f) => (f.ctx.unresolved = 1),
  'legacy protocol': (f) => (f.ctx.bridge.state.protocolVersion = 1),
  'missing history': (f) => (f.ctx.bridge.state.historyReady = false),
  'protection fault': (f) => (f.ctx.bridge.state.protectionFault = true),
  'expired proposal': (f) => (f.p.expiresAt = f.now - 1),
  'local account': (f) => (f.ctx.bridge.state.localAccountAuthorized = false),
  'local financial limits': (f) =>
    (f.ctx.bridge.state.localLimits.maxRiskBRL = 0),
};
for (const [name, change] of Object.entries(blocks))
  test('REAL fail-closed: ' + name, () => {
    const f = fixture();
    change(f);
    assert.equal(realReadiness(f.ctx, f.env, f.p, f.now).canExecute, false);
  });
async function signed(f: ReturnType<typeof fixture>) {
  return signCommand(
    {
      id: f.p.id,
      action: f.p.direction,
      symbol: f.p.symbol,
      volume: f.p.quantity,
      sl: f.p.sl,
      tp: f.p.tp,
      price: 0,
      ticket: '0',
      expiresAt: f.p.expiresAt,
      referencePrice: f.p.entry,
      maxRiskBRL: 200,
      maxLossBRL: 600,
      maxSlippagePoints: 20,
    },
    f.env,
  );
}
test('CMD2 HMAC uses stable eight-decimal canonical fields and rejects tampering', async () => {
  const f = fixture(),
    c = await signed(f);
  assert.equal(
    c.signature,
    createHmac('sha256', f.env.TRADE_BRIDGE_TOKEN)
      .update(commandCanonical(c))
      .digest('hex'),
  );
  assert.equal(commandWire(c).trim().split('\n')[1].split('|').length, 15);
  assert.notEqual(
    (await signCommand({ ...c, volume: 2 }, f.env)).signature,
    c.signature,
  );
  await assert.rejects(signCommand(c, {}));
});
test('broker deals alone establish fills, fees/R use actual entry, pending partial orders cannot close', () => {
  const { p } = fixture();
  const d = {
    commandId: p.id,
    kind: 'observed',
    deal: '1',
    entry: 0,
    volume: 0.5,
    price: p.entry + 5,
    position: '10',
    order: '20',
    commission: -1,
  };
  const exit = {
    ...d,
    deal: '2',
    entry: 1,
    profit: 50,
    commission: -1,
    swap: -1,
    timeMsc: Date.now(),
  };
  assert.equal(
    executionView(p, { state: 'dispatch_unknown' }, [], [], true).status,
    'RESULTADO INDETERMINADO',
  );
  assert.equal(
    executionView(p, { state: 'submitted' }, [], [], true).filled,
    0,
  );
  assert.equal(executionView(p, {}, [d, d], [], true).filled, 0.5);
  const pending = executionView(p, {}, [d, exit], [], true, [
    { ticket: '20', symbol: p.symbol, magic: '706032601', volume: 0.5 },
  ]);
  assert.equal(pending.closed, false);
  const x = executionView(
    p,
    {},
    [d, exit, { commandId: p.id, kind: 'order-state', orderState: 4 }],
    [],
    true,
  );
  assert.equal(x.resultBRL, 47);
  assert.equal(x.resultR, 47 / (455 * 0.2 * 0.5));
  const position = {
    identifier: '10',
    magic: '706032601',
    symbol: p.symbol,
    sl: 0,
    tp: 0,
    current: 1,
    profit: 2,
  };
  const offline = executionView(p, {}, [d], [position], false);
  assert.equal(offline.protectionFault, true);
  assert.equal(offline.position.current, null);
});
async function database() {
  const db = new PGlite();
  await db.exec(
    'create role anon;create role authenticated;create role service_role bypassrls;',
  );
  for (const name of [
    '20261003035402_mt5_bridge.sql',
    '20261003042050_human_approval.sql',
    '20261003124510_multi_strategy_scanner.sql',
    '20261004210552_real_execution_safety.sql',
    '20261005000359_real_execution_fail_closed.sql',
  ])
    await db.exec(readFileSync('supabase/migrations/' + name, 'utf8'));
  return db;
}
async function seed(
  db: PGlite,
  f: ReturnType<typeof fixture>,
  candles: any[] = [],
) {
  await db.query('select trade_bridge_exchange_v2($1,false,2,$2,15000)', [
    {
      bridgeId: bridge,
      symbol: f.p.symbol,
      session: 'fixture',
      batch: 0,
      accountHash: account,
      state: f.ctx.bridge.state,
      ticks: [f.ctx.bridge.tick],
      candles,
      events: [],
    },
    account,
  ]);
  await db.query(
    'update trade_bridge_state set kill_switch=false where bridge_id=$1',
    [bridge],
  );
  await db.query(
    `insert into trade_execution_policy(bridge_id,enabled,account_hash,symbol,contract_expires_at,rollover_confirmed,session_windows,max_contracts,max_positions,max_risk_brl,max_daily_loss_brl,max_slippage_points) values($1,true,$2,$3,$4,true,$5,2,1,200,600,20) on conflict(bridge_id) do update set enabled=true,account_hash=excluded.account_hash,symbol=excluded.symbol,contract_expires_at=excluded.contract_expires_at,rollover_confirmed=true,session_windows=excluded.session_windows,max_contracts=2,max_positions=1,max_risk_brl=200,max_daily_loss_brl=600,max_slippage_points=20`,
    [
      bridge,
      account,
      f.p.symbol,
      f.ctx.policy.contract_expires_at,
      f.ctx.policy.session_windows,
    ],
  );
  await db.query(
    `insert into trade_live_authorizations(strategy_id,version,live_authorized,stage)values($1,$2,true,'live-monitoring')on conflict(strategy_id,version)do update set live_authorized=true,stage='live-monitoring'`,
    [f.p.setup.strategy, f.p.setup.version],
  );
}
test('database second confirmation, atomic idempotence, kill at dispatch, lost response, restart and RLS', async () => {
  const db = await database(),
    f = fixture();
  try {
    await seed(db, f);
    for (const missing of ['tick', 'conditions', 'positions']) {
      const pp = structuredClone(f.p),
        state = structuredClone(f.ctx.bridge.state),
        tick: any = structuredClone(f.ctx.bridge.tick);
      if (missing === 'tick') delete tick.timeMsc;
      if (missing === 'conditions') (pp.setup.conditions[0] as any).met = null;
      if (missing === 'positions') delete (state as any).positions;
      await db.query(
        'update trade_bridge_state set state=$1,tick=$2 where bridge_id=$3',
        [state, tick, bridge],
      );
      assert.equal(
        (
          await db.query<any>(
            'select trade_real_valid($1,$2,2,$3,15000) as ok',
            [bridge, pp, account],
          )
        ).rows[0].ok,
        false,
      );
    }
    await db.query(
      'update trade_bridge_state set state=$1,tick=$2 where bridge_id=$3',
      [f.ctx.bridge.state, f.ctx.bridge.tick, bridge],
    );
    await db.query('select trade_propose($1,$2,$3)', [
      'focoos-admin',
      bridge,
      f.p,
    ]);
    const c = await signed(f),
      nonce = 'local-human-final-confirmation',
      hash = await nonceHash(nonce);
    assert.equal(
      (
        await db.query<any>('select trade_real_valid($1,$2,2,$3,15000) as ok', [
          bridge,
          f.p,
          account,
        ])
      ).rows[0].ok,
      true,
    );
    await assert.rejects(
      db.query(
        "select trade_confirm('focoos-admin',$1,'confirm',$2,2,$3,15000)",
        [f.p.id, c, account],
      ),
      /Second human/,
    );
    await db.query(
      "select trade_real_prepare('focoos-admin',$1,$2,$3,$4,2,$5,15000,true)",
      [f.p.id, hash, c, { setup: f.p.setup }, account],
    );
    assert.equal(
      (await db.query('select * from trade_bridge_commands')).rows.length,
      0,
    );
    const confirm = (n = nonce, enabled = true) =>
      db.query(
        "select trade_real_confirm('focoos-admin',$1,$2,$3,2,$4,15000,$5)",
        [f.p.id, n, c, account, enabled],
      );
    await assert.rejects(confirm('wrong'), /Second human/);
    await assert.rejects(confirm(nonce, false), /gates blocked/);
    await confirm();
    await confirm();
    assert.equal(
      (await db.query('select * from trade_bridge_commands')).rows.length,
      1,
    );
    const exchange = (batch: number, session = 'fixture', events: any[] = []) =>
      db.query<any>(
        'select trade_bridge_exchange_v2($1,true,2,$2,15000) as result',
        [
          {
            bridgeId: bridge,
            symbol: f.p.symbol,
            session,
            batch,
            accountHash: account,
            state: f.ctx.bridge.state,
            ticks: [f.ctx.bridge.tick],
            candles: [],
            events,
          },
          account,
        ],
      );
    await db.query(
      'update trade_bridge_state set kill_switch=true where bridge_id=$1',
      [bridge],
    );
    assert.equal((await exchange(1)).rows[0].result.command ?? null, null);
    await db.query(
      'update trade_bridge_state set kill_switch=false where bridge_id=$1',
      [bridge],
    );
    assert.equal((await exchange(2)).rows[0].result.command.id, f.p.id);
    assert.equal((await exchange(2)).rows[0].result.command ?? null, null);
    await db.query(
      "update trade_bridge_state set received_at=now()-interval '20 seconds' where bridge_id=$1",
      [bridge],
    );
    assert.equal(
      (await exchange(3, 'restart')).rows[0].result.command ?? null,
      null,
    );
    await confirm();
    assert.equal(
      (await db.query('select * from trade_bridge_commands')).rows.length,
      1,
    );
    const event = {
      id: 'deal_123',
      kind: 'observed',
      commandId: f.p.id,
      deal: '123',
      entry: 0,
      volume: 1,
      price: f.p.entry,
      position: '123',
      timeMsc: Date.now(),
    };
    await exchange(4, 'restart', [event]);
    await exchange(5, 'restart', [event]);
    assert.equal(
      (
        await db.query('select * from trade_bridge_events where event_id=$1', [
          'deal_123',
        ])
      ).rows.length,
      1,
    );
    await db.exec('set role authenticated');
    await assert.rejects(
      db.exec('select * from trade_real_confirmations'),
      /permission denied/,
    );
    await assert.rejects(
      db.exec("select trade_real_context('xp-mt5-primary')"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
test('actual API shares scanner and requires both human steps before signed queue; no network or broker order', async () => {
  const db = await database(),
    f = fixture(),
    original = globalThis.fetch;
  try {
    let found: any;
    const mock = generateMockCandles(),
      end = Math.floor(Date.now() / 60000) * 60;
    for (let cursor = 120; cursor <= 420; cursor++) {
      const delta = end - (mock[cursor - 1].timestamp + 60),
        candles = mock.slice(0, cursor).map((c) => ({
          ...c,
          symbol: 'WINV26',
          timestamp: c.timestamp + delta,
        }));
      const candidate = scanMarket(snapshotOf(candles, 'live')).candidates.find(
        (c) =>
          c.analysis.status === 'complete' && c.analysis.conflicts.length === 0,
      );
      if (candidate) {
        found = { candles, candidate };
        break;
      }
    }
    assert.ok(found);
    const setup = found.candidate.analysis.setup;
    f.p.setup = setup;
    f.ctx.authorizations[0] = {
      strategy_id: setup.strategy,
      version: setup.version,
      live_authorized: true,
      stage: 'live-monitoring',
    };
    const price = setup.entry;
    f.ctx.bridge.tick = {
      ...f.ctx.bridge.tick,
      bid: price - 5,
      ask: price,
      last: price,
    };
    f.ctx.policy.max_risk_brl = 10000;
    f.ctx.policy.max_daily_loss_brl = 100000;
    f.ctx.policy.max_slippage_points = 1000;
    f.ctx.bridge.state.localLimits = {
      maxContracts: 2,
      maxPositions: 1,
      maxRiskBRL: 10000,
      maxLossBRL: 100000,
      maxSlippagePoints: 1000,
    };
    await seed(db, f, found.candles);
    await db.exec(
      'update trade_execution_policy set max_risk_brl=10000,max_daily_loss_brl=100000,max_slippage_points=1000',
    );
    globalThis.fetch = async (input, init) => {
      const u = new URL(String(input));
      assert.equal(u.hostname, 'local-fixture.invalid');
      const name = u.pathname.split('/').pop()!;
      assert.match(name, /^trade_[a-z_]+$/);
      const args = Object.values(JSON.parse(String(init?.body)));
      try {
        const r = await db.query<any>(
          `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as result`,
          args,
        );
        return Response.json(r.rows[0].result);
      } catch (e) {
        return Response.json({ error: String(e) }, { status: 409 });
      }
    };
    const env = {
      ...f.env,
      TRADE_SUPABASE_URL: 'https://local-fixture.invalid',
      TRADE_SUPABASE_SERVICE_KEY: 'isolated-fixture-only',
    };
    const { onRequestPost } = await import(
      '../../functions/api/trade/operations'
    );
    const post = (body: any) =>
      onRequestPost({
        request: new Request(
          'https://local-fixture.invalid/api/trade/operations',
          {
            method: 'POST',
            body: JSON.stringify({
              source: 'mt5',
              cursor: 180,
              mode: 'REAL',
              quantity: 1,
              ...body,
            }),
          },
        ),
        env,
      });
    const propose = await post({ action: 'propose', strategy: setup.strategy });
    const proposed: any = await propose.json();
    assert.equal(propose.status, 200, JSON.stringify(proposed));
    const id = proposed.id;
    const first = await post({ action: 'prepare-real', id });
    const prepared: any = await first.json();
    assert.equal(first.status, 200, JSON.stringify(prepared));
    assert.equal(
      (await db.query('select * from trade_bridge_commands')).rows.length,
      0,
    );
    assert.equal(
      (await post({ action: 'confirm', id, nonce: prepared.nonce })).status,
      409,
    );
    assert.equal(
      (
        await post({
          action: 'confirm',
          id,
          nonce: prepared.nonce,
          confirmation: 'CONFIRMAR ORDEM REAL',
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await post({
          action: 'confirm',
          id,
          nonce: prepared.nonce,
          confirmation: 'CONFIRMAR ORDEM REAL',
        })
      ).status,
      200,
    );
    const commands: any = (
      await db.query('select * from trade_bridge_commands')
    ).rows;
    assert.equal(commands.length, 1);
    assert.equal(commands[0].state, 'queued');
    assert.equal(commands[0].payload.signatureVersion, 2);
    assert.equal(
      executionView(proposed.payload, commands[0], [], [], true).filled,
      0,
    );
  } finally {
    globalThis.fetch = original;
    await db.close();
  }
});
