import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest as guard } from '../../functions/api/trade/_middleware.js';
import { onRequest as pageGuard } from '../../functions/trade/_middleware.js';
import { onRequestGet as evaluate } from '../../functions/api/trade/evaluate';
import { onRequestPost as professor } from '../../functions/api/trade/professor';
import { onRequest as journal } from '../../functions/api/trade/journal.js';
import { onRequest as runs } from '../../functions/api/trade/runs';
const origin = 'https://focoemcanto.com';
const env = { ADMIN_TOKEN: 'unit-test-principal' };
const next = async () => new Response('protected');
function request(method = 'GET', cookie = true, sameOrigin = true) {
  return new Request(origin + '/api/trade/evaluate', {
    method,
    headers: {
      ...(cookie ? { Cookie: 'foco_admin_session=unit-test-principal' } : {}),
      ...(method === 'POST'
        ? { Origin: sameOrigin ? origin : 'https://foreign.example' }
        : {}),
    },
  });
}
test('unauthenticated API is 401; page redirects to canonical existing login', async () => {
  assert.equal(
    (await guard({ request: request('GET', false), env, next })).status,
    401
  );
  const r = await pageGuard({
    request: new Request(origin + '/trade/'),
    env,
    next,
  });
  assert.equal(r.status, 302);
  assert.ok(
    r.headers.get('location')?.includes('/admin/login/?next=%2Ftrade%2F')
  );
});
test('authenticated reads get no-store, writes reject cross-origin', async () => {
  const r = await guard({ request: request(), env, next });
  assert.equal(await r.text(), 'protected');
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
  assert.equal(
    (await guard({ request: request('POST', true, false), env, next })).status,
    403
  );
});
test('cursor validation and professor cannot accept forged setup numbers', async () => {
  assert.equal(
    (
      await evaluate({
        request: new Request(origin + '/api/trade/evaluate?cursor=-1'),
      })
    ).status,
    400
  );
  const r = await professor({
    request: new Request(origin + '/api/trade/professor', {
      method: 'POST',
      body: JSON.stringify({
        cursor: 180,
        question: 'Por que esse stop está aqui?',
        setup: { entry: 7, stop: 1 },
      }),
    }),
    env: {},
  });
  const d = (await r.json()) as any;
  assert.equal(d.provider, 'educational-rules');
  assert.ok(d.answer.includes('134975'));
  assert.ok(!d.answer.includes('A perda de 1 invalida'));
});
test('Professor uses fallback without claiming AI, no entry when setup incomplete', async () => {
  const r = await professor({
    request: new Request(origin + '/api/trade/professor', {
      method: 'POST',
      // 15 closed M1 bars: below every rule's warm-up. (At 30, M1-only rules may legitimately confirm.)
      body: JSON.stringify({ cursor: 15, question: 'Qual meu risco?' }),
    }),
    env: {},
  });
  const d = (await r.json()) as any;
  assert.ok(d.answer.includes('não há setup completo'));
  assert.equal(d.provider, 'educational-rules');
});
test('journal and runs fail clearly when storage is absent', async () => {
  assert.equal(
    (
      await journal({
        request: new Request(origin + '/api/trade/journal'),
        env: {},
      })
    ).status,
    503
  );
  assert.equal(
    (await runs({ request: new Request(origin + '/api/trade/runs'), env: {} }))
      .status,
    503
  );
});
test('journal/runs persist isolated records; runs always recalculate authoritative numbers', async () => {
  const map = new Map<string, string>();
  const kv = {
    put: async (k: string, v: string) => {
      map.set(k, v);
    },
    get: async (k: string) => JSON.parse(map.get(k) || 'null'),
    list: async ({ prefix }: { prefix: string }) => ({
      keys: [...map.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((name) => ({ name })),
      list_complete: true,
    }),
  };
  const r = await journal({
    request: new Request(origin + '/api/trade/journal', {
      method: 'POST',
      body: JSON.stringify({ note: 'Minha leitura', cursor: 180 }),
    }),
    env: { FOCO_LINKS: kv },
  });
  assert.equal(r.status, 201);
  assert.equal(
    (
      (await (
        await journal({
          request: new Request(origin + '/api/trade/journal'),
          env: { FOCO_LINKS: kv },
        })
      ).json()) as any
    ).records.length,
    1
  );
  const saved = await runs({
    request: new Request(origin + '/api/trade/runs', {
      method: 'POST',
      body: JSON.stringify({
        cursor: 180,
        metrics: { winRate: 1 },
        signals: [],
      }),
    }),
    env: { FOCO_LINKS: kv },
  });
  const d = (await saved.json()) as any;
  assert.equal(d.record.signals.length, 1);
  assert.equal(d.record.metrics.winRate, 0);
  assert.ok([...map.keys()].every((k) => k.startsWith('trade:v1:')));
});
test('AI output with invented numeric references is discarded; deterministic answer survives', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      output: [
        {
          content: [
            {
              type: 'output_text',
              text: 'Entrada perfeita em 999666 e stop em 1.',
            },
          ],
        },
      ],
    });
  try {
    const r = await professor({
      request: new Request(origin + '/api/trade/professor', {
        method: 'POST',
        body: JSON.stringify({
          cursor: 180,
          question: 'Por que esse stop está aqui?',
        }),
      }),
      env: { OPENAI_API_KEY: 'unit-test-placeholder' },
    });
    const d = (await r.json()) as any;
    assert.equal(d.provider, 'educational-rules');
    assert.ok(!d.answer.includes('999666'));
    assert.ok(d.answer.includes('134975'));
  } finally {
    globalThis.fetch = original;
  }
});
