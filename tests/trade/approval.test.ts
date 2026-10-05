import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { makeProposal, executionView } from '../../trade/bridge/approval';
import { runReplay } from '../../trade/core/engine';
import { generateMockCandles } from '../../trade/core/providers';
const analysis = runReplay(generateMockCandles(), 180).analyses[0];
const options = {
  mode: 'PAPER' as const,
  source: 'replay' as const,
  symbol: 'WIN',
  quantity: 1,
  max: 1,
  pointValue: 0.2,
  currency: 'BRL',
  cursor: 180,
  asOf: analysis.setup!.timestamp,
  liveAuthorized: false,
};
test('proposal quantifies configured monetary risk and rejects incomplete, conflicting and unauthorized real setups', () => {
  const p = makeProposal(analysis, options);
  assert.equal(p.riskBRL, p.riskPoints * 0.2);
  assert.equal(p.direction, 'BUY');
  assert.throws(() =>
    makeProposal({ ...analysis, status: 'waiting' }, options),
  );
  assert.throws(() =>
    makeProposal({ ...analysis, conflicts: ['opposite'] }, options),
  );
  assert.throws(() =>
    makeProposal(analysis, { ...options, mode: 'REAL', source: 'mt5' }),
  );
  assert.throws(() => makeProposal(analysis, { ...options, currency: 'USD' }));
  assert.throws(() => makeProposal(analysis, { ...options, quantity: 2 }));
});
test('acceptance and HTTP response are not fills; broker deals deduplicate and determine partial/full states', () => {
  const p = { ...makeProposal(analysis, options), quantity: 2 };
  assert.equal(
    executionView(p, { state: 'submitted' }, [], [], true).status,
    'PENDENTE',
  );
  assert.equal(executionView(p, { state: 'observed' }, [], [], true).filled, 0);
  const d = {
    commandId: p.id,
    kind: 'observed',
    deal: '1',
    entry: 0,
    volume: 1,
    price: p.entry,
    position: 'p',
  };
  assert.equal(
    executionView(p, { state: 'observed' }, [d, d], [], true).status,
    'PARCIAL',
  );
  assert.equal(
    executionView(p, {}, [d, { ...d, deal: '2' }], [], true).status,
    'EXECUTADA',
  );
  assert.equal(
    executionView(p, { state: 'rejected' }, [], [], true).status,
    'REJEITADA',
  );
  assert.equal(
    executionView(p, { state: 'expired' }, [], [], true).status,
    'CANCELADA',
  );
  assert.equal(
    executionView(
      p,
      { state: 'submitted' },
      [{ commandId: p.id, orderState: 5 }],
      [],
      true,
    ).status,
    'REJEITADA',
  );
  assert.equal(
    executionView(
      p,
      { state: 'submitted' },
      [{ commandId: p.id, orderState: 6 }],
      [],
      true,
    ).status,
    'CANCELADA',
  );
});
test('atomic confirmation, discard, expiry and RLS; raw entry cannot bypass approval', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      'create role anon;create role authenticated;create role service_role bypassrls;',
    );
    for (const name of [
      '20261003035402_mt5_bridge.sql',
      '20261003042050_human_approval.sql',
    ])
      await db.exec(readFileSync('supabase/migrations/' + name, 'utf8'));
    const p = makeProposal(analysis, options),
      bridge = 'xp-mt5-primary';
    await db.query('select trade_propose($1,$2,$3)', [
      'focoos-admin',
      bridge,
      p,
    ]);
    assert.equal(
      (await db.query('select * from trade_bridge_commands')).rows.length,
      0,
    );
    const confirm = () =>
      db.query("select trade_confirm($1,$2,$3,null,1,'',15000)", [
        'focoos-admin',
        p.id,
        'confirm',
      ]);
    await confirm();
    await confirm();
    assert.equal(
      (await db.query('select * from trade_operation_journal')).rows.length,
      2,
    );
    await assert.rejects(
      db.query(
        "insert into trade_bridge_commands(id,bridge_id,payload,expires_at)values($1,$2,$3,now()+interval '20 seconds')",
        [crypto.randomUUID(), bridge, { action: 'BUY' }],
      ),
      /Human approval required/,
    );
    const p2 = {
      ...p,
      id: crypto.randomUUID(),
      setup: { ...p.setup, id: 'other' },
    };
    await db.query('select trade_propose($1,$2,$3)', [
      'focoos-admin',
      bridge,
      p2,
    ]);
    await db.query("select trade_confirm($1,$2,'discard',null,1,'',15000)", [
      'focoos-admin',
      p2.id,
    ]);
    await db.query("select trade_confirm($1,$2,'confirm',null,1,'',15000)", [
      'focoos-admin',
      p2.id,
    ]);
    assert.equal(
      (
        await db.query<any>(
          'select state from trade_operation_proposals where id=$1',
          [p2.id],
        )
      ).rows[0].state,
      'DESCARTADA',
    );
    await db.exec('set role authenticated');
    await assert.rejects(
      db.exec('select * from trade_operation_proposals'),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test('paper execution waits for a visible next candle and cannot inspect future candles', async () => {
  const { paperExecution } = await import('../../trade/bridge/paper');
  const candles = generateMockCandles(),
    p = makeProposal(analysis, {
      ...options,
      asOf: candles[179].timestamp + 60,
    });
  assert.equal(paperExecution(p, candles.slice(0, 180)), null);
  const visible = candles.slice(0, 181),
    x = paperExecution(p, visible);
  assert.equal(x?.entry, candles[180].open);
  const mutated = candles.map((c, i) =>
    i > 180 ? { ...c, open: 1, high: 2, low: 1, close: 1 } : c,
  );
  assert.deepEqual(paperExecution(p, mutated.slice(0, 181)), x);
});

test('direct command endpoint refuses an authenticated raw BUY request', async () => {
  const { onRequestPost } = await import('../../functions/api/trade/commands');
  assert.equal((await onRequestPost()).status, 409);
});

test('real confirmation creates exactly one command; repeated confirmation and expired proposals create no extra order', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      'create role anon;create role authenticated;create role service_role bypassrls;',
    );
    for (const name of [
      '20261003035402_mt5_bridge.sql',
      '20261003042050_human_approval.sql',
    ])
      await db.exec(readFileSync('supabase/migrations/' + name, 'utf8'));
    const base = makeProposal(analysis, options),
      p = { ...base, mode: 'REAL', source: 'mt5', symbol: 'WINV26' },
      bridge = 'xp-mt5-primary',
      account = 'a'.repeat(64);
    await db.query(
      `insert into trade_bridge_state(bridge_id,symbol,session,account_hash,state,tick,kill_switch)values($1,$2,'test',$3,$4,$5,false)`,
      [
        bridge,
        p.symbol,
        account,
        { connected: true, executionAllowed: true, positions: [], orders: [] },
        { symbol: p.symbol, timeMsc: Date.now() },
      ],
    );
    await db.query('select trade_propose($1,$2,$3)', [
      'focoos-admin',
      bridge,
      p,
    ]);
    const cmd = {
      id: p.id,
      action: p.direction,
      symbol: p.symbol,
      volume: p.quantity,
      sl: p.sl,
      tp: p.tp,
      price: 0,
      ticket: '0',
      expiresAt: p.expiresAt,
    };
    const confirm = () =>
      db.query("select trade_confirm($1,$2,'confirm',$3,1,$4,15000)", [
        'focoos-admin',
        p.id,
        cmd,
        account,
      ]);
    await confirm();
    await confirm();
    assert.equal(
      (await db.query('select * from trade_bridge_commands')).rows.length,
      1,
    );
    const expired = {
      ...p,
      id: crypto.randomUUID(),
      expiresAt: Date.now() - 1,
      setup: { ...p.setup, id: 'expired' },
    };
    await db.query('select trade_propose($1,$2,$3)', [
      'focoos-admin',
      bridge,
      expired,
    ]);
    await db.query("select trade_confirm($1,$2,'confirm',null,1,$3,15000)", [
      'focoos-admin',
      expired.id,
      account,
    ]);
    assert.equal(
      (
        await db.query<any>(
          'select state from trade_operation_proposals where id=$1',
          [expired.id],
        )
      ).rows[0].state,
      'EXPIRADA',
    );
    assert.equal(
      (await db.query('select * from trade_bridge_commands')).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});
