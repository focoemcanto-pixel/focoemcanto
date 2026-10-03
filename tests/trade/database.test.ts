import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
test('migration creates all tables; RLS isolates owners and rejects owner reassignment', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; grant usage on schema auth to authenticated; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`
    );
    await db.exec(
      readFileSync(
        'supabase/migrations/20261003021627_foco_trade_initial.sql',
        'utf8'
      )
    );
    const tables = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='foco_trade' and c.relkind='r'`
    );
    assert.equal(tables.rows.length, 14);
    assert.ok(tables.rows.every((r) => r.relrowsecurity));
    const a = '11111111-1111-4111-8111-111111111111',
      b = '22222222-2222-4222-8222-222222222222';
    await db.query('insert into auth.users values ($1),($2)', [a, b]);
    await db.query(
      `insert into foco_trade.trade_journal(user_id,note,source) values ($1,'A note','mock'),($2,'B note','mock')`,
      [a, b]
    );
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${a}';`);
    const own = await db.query<{ note: string }>(
      `select note from foco_trade.trade_journal`
    );
    assert.deepEqual(
      own.rows.map((r) => r.note),
      ['A note']
    );
    await assert.rejects(
      db.query(
        `insert into foco_trade.trade_journal(user_id,note,source) values ($1,'forged','mock')`,
        [b]
      ),
      /row-level security/
    );
    await assert.rejects(
      db.query(`update foco_trade.trade_journal set user_id=$1`, [b]),
      /row-level security/
    );
    await assert.rejects(
      db.exec(`update foco_trade.strategy_versions set live_authorized=true`),
      /permission denied/
    );
    await db.exec(`reset role;`);
    await assert.rejects(
      db.exec(`update foco_trade.strategy_versions set live_authorized=true`),
      /check constraint/
    );
    await db.exec(`set role anon;`);
    await assert.rejects(
      db.exec(`select * from foco_trade.trade_journal`),
      /permission denied/
    );
  } finally {
    await db.close();
  }
});
test('schema disallows cross-owner journal reference even for server writes', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`
    );
    await db.exec(
      readFileSync(
        'supabase/migrations/20261003021627_foco_trade_initial.sql',
        'utf8'
      )
    );
    const a = '11111111-1111-4111-8111-111111111111',
      b = '22222222-2222-4222-8222-222222222222';
    await db.query('insert into auth.users values ($1),($2)', [a, b]);
    const version = (
      await db.query<{ id: string }>(
        'select id from foco_trade.strategy_versions'
      )
    ).rows[0].id;
    const run = (
      await db.query<{ id: string }>(
        `insert into foco_trade.strategy_runs(user_id,strategy_version_id,symbol,mode,source,dataset_hash,parameter_snapshot,starts_at,as_of) values($1,$2,'WIN','replay','mock','seed42','{}',now(),now()) returning id`,
        [b, version]
      )
    ).rows[0].id;
    const setup = (
      await db.query<{ id: string }>(
        `insert into foco_trade.setups(user_id,run_id,strategy_version_id,symbol,timestamp,direction,entry_reference,invalidation,targets,risk_points,potential_points,rr,context,explanation) values($1,$2,$3,'WIN',now(),'long',100,90,'[120]',10,20,2,'{}','test') returning id`,
        [b, run, version]
      )
    ).rows[0].id;
    const trade = (
      await db.query<{ id: string }>(
        `insert into foco_trade.paper_trades(user_id,setup_id,entry_at,entry,stop,target,status,conditions,context) values($1,$2,now(),100,90,120,'open','[]','{}') returning id`,
        [b, setup]
      )
    ).rows[0].id;
    await assert.rejects(
      db.query(
        `insert into foco_trade.trade_journal(user_id,paper_trade_id,note,source) values($1,$2,'cross owner','mock')`,
        [a, trade]
      ),
      /foreign key/
    );
  } finally {
    await db.close();
  }
});
