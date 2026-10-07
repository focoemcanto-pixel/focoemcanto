/**
 * OPORTUNIDADE ATIVA: the global card's selection rules (pure) and its audit trail (local Postgres/PGlite).
 * The gate matrix that decides whether a REAL order can ever be created lives in real.test.ts and
 * real-session.test.ts; this file covers what the card adds on top. No network, no MT5, no broker.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  blockedNotices,
  clockLabel,
  departures,
  minimize,
  notActionable,
  opportunityQueue,
  restore,
  sizeFor,
  type OpportunityRow,
} from '../../app/trade/opportunity';

const NOW = Date.UTC(2026, 9, 7, 13, 0, 0);
let seq = 0;
function row(over: Partial<OpportunityRow> & { payload?: any } = {}): OpportunityRow {
  const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  return {
    id,
    state: 'AGUARDANDO CONFIRMAÇÃO',
    created_at: new Date(NOW - 1000).toISOString(),
    actionability: { status: 'ACTIONABLE' },
    ...over,
    payload: {
      id,
      mode: 'PAPER',
      source: 'mt5',
      symbol: 'WINV26',
      direction: 'BUY',
      quantity: 1,
      proposalState: 'READY',
      entry: 206000,
      sl: 205800,
      tp: 206400,
      riskPoints: 200,
      pointValue: 0.2,
      riskPerContractBRL: 40,
      riskBRL: 40,
      expiresAt: NOW + 23000,
      setup: { id: 'setup-' + id, strategy: 'structure_breakout_v1', version: '1.2.0' },
      riskSettings: { oneRBRL: 50 },
      ...(over.payload || {}),
    },
  };
}
const paper = (rows: OpportunityRow[], nowMs = NOW, skewMs = 0) => opportunityQueue(rows, { mode: 'PAPER', source: 'mt5', nowMs, skewMs });
const real = (rows: OpportunityRow[], maxRiskBRL: number | null = 100, nowMs = NOW) =>
  opportunityQueue(rows, { mode: 'REAL', source: 'mt5', nowMs, real: { maxRiskBRL, maxContracts: 1 } });

test('1: an actionable READY proposal opens the opportunity card', () => {
  const q = paper([row()]);
  assert.equal(q.length, 1);
  assert.equal(q[0].quantity, 1);
  assert.equal(q[0].seconds, 23);
  assert.equal(clockLabel(q[0].seconds), '00:23');
});

test('2: RISK_BLOCKED never opens the entry card; it becomes a small notice with risk vs 1R', () => {
  const blocked = row({
    state: 'BLOQUEADA POR RISCO',
    payload: { proposalState: 'RISK_BLOCKED', quantity: 0, riskPerContractBRL: 88, riskBlock: { minimumRiskBRL: 88, maxRiskBRL: 10 } },
  });
  assert.equal(paper([blocked]).length, 0);
  const n = blockedNotices([blocked], { mode: 'PAPER', source: 'mt5', nowMs: NOW });
  assert.equal(n.length, 1);
  assert.equal(n[0].minimumRiskBRL, 88);
  assert.equal(n[0].maxRiskBRL, 10);
  assert.equal(notActionable(blocked, NOW), 'RISK_BLOCKED');
});

test('3/23: the countdown is the backend expiresAt (absolute, server-skew aligned); re-evaluating never extends it', () => {
  const r = row();
  assert.equal(paper([r], NOW)[0].seconds, 23);
  assert.equal(paper([r], NOW + 1000)[0].seconds, 22);
  assert.equal(paper([r], NOW + 22500)[0].seconds, 1);
  // Local clock 5 s behind the server: the server's deadline still wins.
  assert.equal(paper([r], NOW, 5000)[0].seconds, 18);
  // Re-render/refresh = same inputs → same deadline; a later poll can only show less time.
  assert.deepEqual(paper([r], NOW + 4000), paper([structuredClone(r)], NOW + 4000));
});

test('4/5: minimize and restore change presentation only, never the deadline', () => {
  const r = row();
  let view = minimize({}, r.id);
  assert.equal(view[r.id], 'minimized');
  assert.equal(paper([r], NOW + 5000)[0].seconds, 18, 'minimized: still counting from expiresAt');
  view = restore(view, r.id);
  assert.equal(view[r.id], 'open');
  assert.equal(paper([r], NOW + 6000)[0].seconds, 17, 'restored with the SAME original deadline');
});

test('6: at expiresAt the entry disappears and the departure is recorded as EXPIRED', () => {
  const r = row();
  const before = paper([r]);
  assert.equal(paper([r], NOW + 23000).length, 0);
  assert.deepEqual(departures(before, [r], { nowMs: NOW + 23000, mode: 'PAPER' }), [{ id: r.id, kind: 'OPPORTUNITY_EXPIRED', reason: 'EXPIRED' }]);
});

test('7: a proposal the server invalidates before its deadline stops being actionable immediately', () => {
  const r = row();
  const before = paper([r]);
  for (const status of ['MISSED', 'INVALIDATED', 'NO_QUOTE']) {
    const changed = { ...r, actionability: { status } };
    assert.equal(paper([changed]).length, 0, status);
    assert.deepEqual(departures(before, [changed], { nowMs: NOW, mode: 'PAPER' })[0], { id: r.id, kind: 'OPPORTUNITY_INVALIDATED', reason: status });
  }
  // Closed on the server (confirmed/discarded/expired elsewhere) or gone from the list.
  assert.equal(departures(before, [{ ...r, state: 'DESCARTADA' }], { nowMs: NOW, mode: 'PAPER' })[0].kind, 'OPPORTUNITY_INVALIDATED');
  assert.equal(departures(before, [], { nowMs: NOW, mode: 'PAPER' })[0].kind, 'OPPORTUNITY_INVALIDATED');
});

test('22: simultaneous opportunities form one deterministic queue; one card, nothing lost, own expiry each', () => {
  const late = row({ payload: { expiresAt: NOW + 25000 } }),
    early = row({ payload: { expiresAt: NOW + 12000 } }),
    sameTime = row({ payload: { expiresAt: NOW + 25000 }, created_at: new Date(NOW - 5000).toISOString() });
  const q = paper([late, early, sameTime]);
  assert.deepEqual(q.map((o) => o.id), [early.id, sameTime.id, late.id]);
  assert.deepEqual(q.map((o) => o.seconds), [12, 25, 25]);
  // The head leaves when it expires; the others stay with their own deadlines.
  assert.deepEqual(paper([late, early, sameTime], NOW + 12000).map((o) => o.id), [sameTime.id, late.id]);
});

test('REAL view: sized with the REAL limit; a setup blocked only by the PAPER 1R can still be a REAL opportunity', () => {
  const blockedByPaper = row({
    state: 'BLOQUEADA POR RISCO',
    payload: { proposalState: 'RISK_BLOCKED', quantity: 0, riskPerContractBRL: 88, riskBlock: { minimumRiskBRL: 88, maxRiskBRL: 10 } },
  });
  const q = real([blockedByPaper], 100);
  assert.equal(q.length, 1);
  assert.equal(q[0].quantity, 1);
  assert.equal(q[0].riskBRL, 88);
  assert.equal(q[0].oneRBRL, 100);
  // REAL limit below one contract → notice, never a card; the stop is never moved to make it fit.
  assert.equal(real([blockedByPaper], 50).length, 0);
  assert.equal(blockedNotices([blockedByPaper], { mode: 'REAL', source: 'mt5', nowMs: NOW, real: { maxRiskBRL: 50, maxContracts: 1 } })[0].maxRiskBRL, 50);
  assert.equal(blockedByPaper.payload.sl, 205800);
  // No REAL risk management materialized → no REAL opportunity.
  assert.equal(real([blockedByPaper], null).length, 0);
  // floor(1R / risk per contract), capped by maxContracts.
  assert.equal(sizeFor(row({ payload: { riskPerContractBRL: 30 } }), 'REAL', { maxRiskBRL: 100, maxContracts: 2 }).quantity, 2);
  assert.equal(sizeFor(row({ payload: { riskPerContractBRL: 30 } }), 'REAL', { maxRiskBRL: 100, maxContracts: 5 }).quantity, 3);
});

test('REAL view: one card per setup — a REAL proposal replaces the Copilot proposal of the same setup', () => {
  const copilot = row();
  const realRow = row({ payload: { mode: 'REAL', setup: copilot.payload.setup, riskBRL: 40 } });
  const q = real([copilot, realRow]);
  assert.deepEqual(q.map((o) => o.id), [realRow.id]);
  // An inspection-only REAL proposal is never an entry.
  assert.equal(real([row({ payload: { mode: 'REAL', inspectionOnly: true } })]).length, 0);
});

test('9: the PAPER card can never target REAL: REAL proposals never appear in the PAPER queue', () => {
  assert.equal(paper([row({ payload: { mode: 'REAL' } })]).length, 0);
  const card = readFileSync('app/trade/OpportunityCard.tsx', 'utf8');
  assert.ok(card.includes("mode === 'PAPER' ? 'ENTRAR PAPER' : 'ENTRAR REAL'"));
  assert.ok(card.includes("data-entry={mode === 'PAPER' ? 'paper' : 'real'}"));
});

test('10: ENTRAR REAL only prepares the existing nonce-bound final confirmation; it never confirms', () => {
  const panel = readFileSync('app/trade/OperationsPanel.tsx', 'utf8');
  const enter = panel.slice(panel.indexOf('async function enterReal'), panel.indexOf('async function confirmPaperCard'));
  assert.ok(enter.includes("action: 'prepare-real'"));
  assert.ok(!enter.includes("action: 'confirm'"), 'the first click never confirms');
  assert.ok(!/confirmation\s*:/.test(enter), 'no confirmation text or nonce is ever sent by ENTRAR');
  // The final confirmation closes itself at the server TTL; nothing is sent after it.
  assert.ok(panel.includes("'FINAL_CONFIRMATION_EXPIRED'"));
  assert.ok(panel.includes('confirmSeconds <= 0'));
});

// ── Audit trail on the existing per-proposal journal ─────────────────────────────────────────────
async function db() {
  const d = new PGlite();
  await d.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for (const m of readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql') && f !== '20261003021627_foco_trade_initial.sql').sort())
    await d.exec(readFileSync('supabase/migrations/' + m, 'utf8'));
  return d;
}
async function insertProposal(d: PGlite, r: OpportunityRow, expiresInMs = 20000) {
  await d.query(`insert into trade_operation_proposals(id,owner_id,bridge_id,payload,expires_at,state) values($1,'focoos-admin','xp-mt5-primary',$2,now()+make_interval(secs=>$3::numeric/1000),'AGUARDANDO CONFIRMAÇÃO')`, [
    r.id,
    r.payload,
    expiresInMs,
  ]);
}

test('8: DESCARTAR is an explicit operator decision — journaled with snapshot and remaining time, never a LOSS or a command', async () => {
  const d = await db();
  try {
    const r = row();
    await insertProposal(d, r);
    const closed = (await d.query<any>(`select trade_confirm('focoos-admin',$1,'discard',null,1,$2,15000) result`, [r.id, 'a'.repeat(64)])).rows[0].result;
    assert.equal(closed.state, 'DESCARTADA');
    await d.query(`select trade_opportunity_event('focoos-admin',$1,'DISCARDED_BY_OPERATOR','{}')`, [r.id]);
    await d.query(`select trade_opportunity_event('focoos-admin',$1,'DISCARDED_BY_OPERATOR','{}')`, [r.id]);
    const j = (await d.query<any>('select kind,payload from trade_operation_journal where proposal_id=$1 order by id', [r.id])).rows;
    assert.deepEqual(j.map((x) => x.kind), ['DESCARTADA', 'DISCARDED_BY_OPERATOR'], 'one-shot event recorded once');
    const ev = j[1].payload;
    assert.equal(ev.setupId, r.payload.setup.id);
    assert.equal(ev.strategy, 'structure_breakout_v1');
    assert.equal(ev.version, '1.2.0');
    assert.equal(ev.mode, 'PAPER');
    assert.ok(ev.remainingMs > 0 && ev.remainingMs <= 20000);
    assert.equal(j[0].payload.payload.id, r.id, 'DESCARTADA keeps the full proposal snapshot');
    const p = (await d.query<any>('select execution,hypothetical_execution from trade_operation_proposals where id=$1', [r.id])).rows[0];
    assert.equal(p.execution, null, 'no execution, so no LOSS');
    assert.equal(Number((await d.query<any>('select count(*) n from trade_bridge_commands')).rows[0].n), 0);
  } finally {
    await d.close();
  }
});

test('opportunity events: allow-list, owner check, server time/remaining, one-shot dedupe, no state change', async () => {
  const d = await db();
  try {
    const r = row();
    await insertProposal(d, r, 15000);
    for (const kind of ['OPPORTUNITY_PRESENTED', 'OPPORTUNITY_PRESENTED', 'OPPORTUNITY_MINIMIZED', 'OPPORTUNITY_RESTORED', 'OPPORTUNITY_MINIMIZED', 'ENTER_CLICKED', 'FINAL_CONFIRMATION_PRESENTED', 'FINAL_CONFIRMATION_EXPIRED', 'OPPORTUNITY_EXPIRED'])
      await d.query(`select trade_opportunity_event('focoos-admin',$1,$2,$3)`, [r.id, kind, { reason: 'x'.repeat(100), at: '1999-01-01' }]);
    const j = (await d.query<any>('select kind,payload from trade_operation_journal where proposal_id=$1 order by id', [r.id])).rows;
    assert.deepEqual(j.map((x) => x.kind), [
      'OPPORTUNITY_PRESENTED',
      'OPPORTUNITY_MINIMIZED',
      'OPPORTUNITY_RESTORED',
      'OPPORTUNITY_MINIMIZED',
      'ENTER_CLICKED',
      'FINAL_CONFIRMATION_PRESENTED',
      'FINAL_CONFIRMATION_EXPIRED',
      'OPPORTUNITY_EXPIRED',
    ]);
    assert.ok(!j[0].payload.at.startsWith('1999'), 'the server stamps time; the client cannot');
    assert.equal(j[0].payload.reason.length, 40);
    await assert.rejects(d.query(`select trade_opportunity_event('focoos-admin',$1,'CONFIRM_ORDER','{}')`, [r.id]), /OPPORTUNITY_EVENT_INVALID/);
    await d.query(`select trade_opportunity_event('someone-else',$1,'OPPORTUNITY_RESTORED','{}')`, [r.id]);
    assert.equal(Number((await d.query<any>('select count(*) n from trade_operation_journal where proposal_id=$1', [r.id])).rows[0].n), 8, 'other owners write nothing');
    assert.equal((await d.query<any>('select state from trade_operation_proposals where id=$1', [r.id])).rows[0].state, 'AGUARDANDO CONFIRMAÇÃO');
    assert.equal(Number((await d.query<any>('select count(*) n from trade_bridge_commands')).rows[0].n), 0);
  } finally {
    await d.close();
  }
});

test('API: the event action only journals allow-listed kinds and never creates a command', async () => {
  const d = await db(),
    original = globalThis.fetch;
  globalThis.fetch = (async (u: any, init: any) => {
    const url = new URL(String(u));
    assert.equal(url.hostname, 'fixture.invalid');
    const name = url.pathname.split('/').pop()!,
      args = Object.values(JSON.parse(String(init?.body)));
    try {
      const r = await d.query<any>(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args);
      return (r.rows[0]?.result ?? null) === null ? new Response(null, { status: 204 }) : Response.json(r.rows[0].result);
    } catch (e: any) {
      return Response.json({ code: 'P0001', message: String(e.message) }, { status: 400 });
    }
  }) as any;
  try {
    const r = row();
    await insertProposal(d, r);
    const { onRequestPost } = await import('../../functions/api/trade/operations');
    const env = { TRADE_SUPABASE_URL: 'https://fixture.invalid', TRADE_SUPABASE_SERVICE_KEY: 'fixture', TRADE_EXECUTION_ENABLED: 'true', TRADE_ACCOUNT_HASH: 'a'.repeat(64) };
    const post = async (body: unknown) => {
      const res: Response = await onRequestPost({ env, request: new Request('https://fixture.invalid/api/trade/operations', { method: 'POST', body: JSON.stringify(body) }) } as any);
      return { status: res.status, data: await res.json() };
    };
    assert.equal((await post({ action: 'event', id: r.id, kind: 'OPPORTUNITY_PRESENTED', mode: 'REAL' })).status, 200);
    assert.equal((await post({ action: 'event', id: r.id, kind: 'CONFIRM_ORDER', mode: 'REAL' })).status, 409);
    assert.equal((await post({ action: 'event', id: 'not-a-uuid', kind: 'OPPORTUNITY_PRESENTED' })).status, 409);
    const kinds = (await d.query<any>('select kind from trade_operation_journal where proposal_id=$1', [r.id])).rows.map((x) => x.kind);
    assert.deepEqual(kinds, ['OPPORTUNITY_PRESENTED']);
    assert.equal(Number((await d.query<any>('select count(*) n from trade_bridge_commands')).rows[0].n), 0);
    assert.equal(Number((await d.query<any>('select count(*) n from trade_real_confirmations')).rows[0].n), 0);
  } finally {
    globalThis.fetch = original;
    await d.close();
  }
});
