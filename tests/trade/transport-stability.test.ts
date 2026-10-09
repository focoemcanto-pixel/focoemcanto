/**
 * Transport stability: the EA exchange must never wait on the panel's operations read, and that read must stay
 * bounded as the hypothetical-observation journal grows. Local Postgres (PGlite); no network, no broker.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

async function db() {
  const d = new PGlite();
  await d.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for (const m of readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql') && f !== '20261003021627_foco_trade_initial.sql').sort())
    await d.exec(readFileSync('supabase/migrations/' + m, 'utf8'));
  return d;
}

test('the exchange availability probe uses an owner without proposals, never the real operations list', async () => {
  const src = readFileSync('functions/api/trade/bridge/exchange.ts', 'utf8');
  const probe = src.slice(src.indexOf('async function probeOperations'), src.indexOf('export async function onRequestPost'));
  assert.ok(probe.includes('p_owner: operationsProbeOwner'));
  assert.ok(!probe.includes("'focoos-admin'"), 'the EA path must not read the operator operations');
  const { operationsProbeOwner } = await import('../../functions/api/trade/bridge/exchange');
  assert.notEqual(operationsProbeOwner, 'focoos-admin');
  const d = await db();
  try {
    await d.query(`insert into trade_operation_proposals(id,owner_id,bridge_id,payload,expires_at,state) values(gen_random_uuid(),'focoos-admin','xp-mt5-primary','{"mode":"PAPER"}',now()+interval '1 minute','AGUARDANDO CONFIRMAÇÃO')`);
    const r = (await d.query<any>('select trade_operations_read($1) r', [operationsProbeOwner])).rows[0].r;
    assert.deepEqual(r, [], 'probe answers from the owner index with no data');
  } finally {
    await d.close();
  }
});

test('operations read returns at most 50 recent journal entries per proposal, without snapshots, oldest first; the table keeps everything', async () => {
  const d = await db();
  try {
    const id = (await d.query<any>(`insert into trade_operation_proposals(id,owner_id,bridge_id,payload,expires_at,state) values(gen_random_uuid(),'focoos-admin','xp-mt5-primary','{"mode":"PAPER","setup":{"id":"s"}}',now()+interval '1 minute','BLOQUEADA POR RISCO') returning id`)).rows[0].id;
    await d.query(`insert into trade_operation_journal(proposal_id,kind,payload) select $1,'HIPOTETICO_PAPER',jsonb_build_object('n',g,'big',repeat('x',2000)) from generate_series(1,60) g`, [id]);
    const rows = (await d.query<any>(`select trade_operations_read('focoos-admin') r`)).rows[0].r;
    assert.equal(rows.length, 1);
    const j = rows[0].journal;
    assert.equal(j.length, 50);
    assert.deepEqual(Object.keys(j[0]).sort(), ['created_at', 'id', 'kind']);
    assert.ok(j.every((x: any, i: number) => i === 0 || x.id > j[i - 1].id), 'oldest first');
    assert.equal(j[49].id, Math.max(...j.map((x: any) => x.id)), 'the most recent entries are kept');
    assert.equal(Number((await d.query<any>('select count(*) n from trade_operation_journal where proposal_id=$1', [id])).rows[0].n), 60, 'audit keeps every entry');
    // Same proposal, state and command fields as before.
    assert.equal(rows[0].id, id);
    assert.equal(rows[0].state, 'BLOQUEADA POR RISCO');
    assert.equal(rows[0].command, null);
    assert.deepEqual(rows[0].events, []);
    const idx = (await d.query<any>(`select indexdef from pg_indexes where indexname='trade_operation_journal_proposal'`)).rows;
    assert.equal(idx.length, 1);
  } finally {
    await d.close();
  }
});
