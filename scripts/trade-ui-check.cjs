// Headless export/API integration check. No dev server or network required.
const { chromium } = require('playwright');
const fs = require('fs/promises');
const path = require('path');
const { onRequest: guard } = require('../functions/api/trade/_middleware.js');
const {
  onRequestGet: evaluate,
} = require('../functions/api/trade/evaluate.ts');
const {
  onRequestPost: professor,
} = require('../functions/api/trade/professor.ts');
const { onRequest: journal } = require('../functions/api/trade/journal.js');
const { onRequest: runs } = require('../functions/api/trade/runs.ts');
const { onRequest: session } = require('../functions/api/admin/session.js');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const operations = require('../functions/api/trade/operations.ts');
const scanner = require('../functions/api/trade/scanner.ts');
const strategyMetrics = require('../functions/api/trade/strategy-metrics.ts');
const health = require('../functions/api/trade/health.ts');
let operationReadFailures = 1;
(async () => {
  const db = new PGlite();
  await db.exec(
    'create role anon;create role authenticated;create role service_role bypassrls;',
  );
  for (const file of [
    '20261003035402_mt5_bridge.sql',
    '20261003042050_human_approval.sql',
    '20261003124510_multi_strategy_scanner.sql',
  ])
    await db.exec(await fs.readFile('supabase/migrations/' + file, 'utf8'));
  globalThis.fetch = async (url, init) => {
    const name = new URL(url).pathname.split('/').pop(),
      args = Object.values(JSON.parse(init.body));
    try {
      const result = await db.query(
        `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as result`,
        args,
      );
      return Response.json(result.rows[0]?.result ?? null);
    } catch (e) {
      return Response.json({ error: e.message }, { status: 409 });
    }
  };
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
      : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  const kv = new Map();
  const env = {
    ADMIN_TOKEN: 'local-test-only',
    TRADE_SUPABASE_URL: 'https://fixture.invalid',
    TRADE_SUPABASE_SERVICE_KEY: 'fixture',
    TRADE_EXECUTION_ENABLED: 'false',
    FOCO_LINKS: {
      put: async (k, v) => {
        kv.set(k, v);
      },
      get: async (k, t) =>
        t === 'json' || t?.type === 'json'
          ? JSON.parse(kv.get(k) || 'null')
          : kv.get(k),
      list: async ({ prefix }) => ({
        keys: [...kv.keys()]
          .filter((k) => k.startsWith(prefix))
          .map((name) => ({ name })),
        list_complete: true,
      }),
    },
  };
  await ctx.route('**/*', async (route) => {
    const r = route.request(),
      url = new URL(r.url());
    if (url.hostname !== 'trade.test') {
      await route.abort();
      return;
    }
    const request = new Request(r.url(), {
      method: r.method(),
      headers: await r.allHeaders(),
      ...(r.postData() ? { body: r.postData() } : {}),
    });
    let response;
    if (url.pathname === '/api/admin/session')
      response = await session({ request, env });
    else if (url.pathname.startsWith('/api/trade/'))
      response = await guard({
        request,
        env,
        next: async () =>
          url.pathname.endsWith('health')
            ? health.onRequestGet({ env })
            : url.pathname.endsWith('scanner')
              ? scanner[
                  request.method === 'POST' ? 'onRequestPost' : 'onRequestGet'
                ]({ request, env })
              : url.pathname.endsWith('strategy-metrics')
                ? strategyMetrics.onRequestGet({ env })
                : url.pathname.endsWith('operations')
                  ? r.method() === 'GET' && operationReadFailures-- > 0
                    ? Response.json(
                        {
                          error: 'Migration do módulo de operações ausente.',
                          code: 'SCHEMA_MISSING',
                        },
                        { status: 503 },
                      )
                    : operations[
                        r.method() === 'POST' ? 'onRequestPost' : 'onRequestGet'
                      ]({ request, env })
                  : url.pathname.endsWith('evaluate')
                    ? evaluate({ request })
                    : url.pathname.endsWith('professor')
                      ? professor({ request, env })
                      : url.pathname.endsWith('journal')
                        ? journal({ request, env })
                        : runs({ request, env }),
      });
    if (response) {
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
      return;
    }
    let relative = url.pathname;
    if (relative === '/' || relative.endsWith('/')) relative += 'index.html';
    if (relative === '/trade') relative = '/trade/index.html';
    const file = path.resolve('out', '.' + relative);
    if (!file.startsWith(path.resolve('out') + path.sep)) {
      await route.abort();
      return;
    }
    try {
      const data = await fs.readFile(file);
      const ext = path.extname(file);
      await route.fulfill({
        status: 200,
        contentType:
          {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.svg': 'image/svg+xml',
            '.webp': 'image/webp',
            '.png': 'image/png',
            '.json': 'application/json',
            '.txt': 'text/plain',
          }[ext] || 'application/octet-stream',
        body: data,
      });
    } catch {
      await route.fulfill({ status: 404, body: 'not found' });
    }
  });
  const page = await ctx.newPage();
  page.on('console', (msg) => {
    if (
      msg.type() === 'error' &&
      /TypeError|ReferenceError|React error/.test(msg.text())
    )
      errors.push(msg.text());
  });
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.error('PAGE ERROR', e.message);
  });
  await page.goto('https://trade.test/trade/');
  await page.waitForURL('**/admin/login/**');
  await page.locator('#token').fill('local-test-only');
  await page.getByRole('button', { name: 'Entrar no Foco OS' }).click();
  await page.waitForURL('**/trade/');
  await page
    .getByRole('heading', { name: 'Copiloto', exact: true })
    .waitFor()
    .catch(async (e) => {
      console.error('UI STATE', await page.locator('body').innerText());
      throw e;
    });
  await page.waitForFunction(
    () =>
      document.querySelector('.trade-chart canvas') &&
      document.querySelector('.trade-quote strong')?.textContent !== '—',
  );
  await fs.mkdir('.trade-qa', { recursive: true });
  await page.screenshot({ path: '.trade-qa/desktop.png', fullPage: true });
  assert.equal(
    await page.getByText('SETUP COMPLETO · PAPER', { exact: true }).count(),
    1,
  );
  assert.equal(
    await page.locator('.trade-scanner-library > details').count(),
    17,
  );
  assert.equal(
    await page
      .locator('select[aria-label="Modo de execução"] option')
      .nth(1)
      .isDisabled(),
    true,
  );
  await page
    .getByRole('heading', { name: 'AGUARDANDO CONFIRMAÇÃO', exact: true })
    .waitFor();
  assert.equal(
    (await db.query('select * from trade_bridge_commands')).rows.length,
    0,
  );
  await page
    .getByRole('button', { name: 'ENTRAR NO PAPER', exact: true })
    .click();
  await page.getByRole('heading', { name: 'ENVIANDO', exact: true }).waitFor();
  await page
    .getByRole('button', { name: 'Próximo candle', exact: true })
    .click();
  await page.getByRole('heading', { name: 'EXECUTADA', exact: true }).waitFor();
  assert.equal(
    (await db.query('select * from trade_bridge_commands')).rows.length,
    0,
  );
  await page.waitForFunction(
    () =>
      document.querySelector('.trade-progress small')?.textContent ===
      '181 / 420 candles',
  );
  await page.getByRole('button', { name: '5m', exact: true }).click();
  await page.getByRole('button', { name: 'Professor', exact: true }).click();
  await page
    .getByRole('button', { name: 'Por que ainda não entrar?', exact: true })
    .click();
  await page.getByText('Explicação por regras', { exact: true }).waitFor();
  await page
    .getByRole('button', {
      name: 'Testar minha leitura do mercado',
      exact: true,
    })
    .click();
  await page
    .getByRole('textbox', { name: 'Sua leitura do mercado', exact: true })
    .fill('Tendência de alta e suporte na mínima anterior');
  await page
    .getByRole('button', { name: 'Comparar com o motor', exact: true })
    .click();
  await page.getByText('Leitura do motor', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await page.getByRole('button', { name: 'Resultados', exact: true }).click();
  await page
    .getByRole('button', { name: 'Salvar execução paper', exact: true })
    .click();
  await page
    .getByText('Execução salva no servidor.', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Diário', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Nota do diário', exact: true })
    .fill('Aprendi a esperar a confirmação.');
  await page
    .getByRole('button', { name: 'Salvar no diário', exact: true })
    .click();
  await page.getByText('Nota salva.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Copiloto', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Estratégias', exact: true }).click();
  await page.screenshot({ path: '.trade-qa/mobile.png', fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    'No horizontal overflow on mobile',
  );
  await page
    .getByRole('button', { name: 'Voltar ao início', exact: true })
    .click();
  await page
    .getByText('Avance o replay para revelar candles fechados.', {
      exact: true,
    })
    .waitFor();
  await page
    .getByRole('combobox', { name: 'Fonte de mercado' })
    .selectOption('mt5');
  await page.getByText('OFFLINE', { exact: true }).waitFor();
  await page
    .getByRole('alert')
    .filter({ hasText: 'MT5 não configurado' })
    .waitFor();
  assert.equal(await page.locator('.trade-quote strong').textContent(), '—');
  assert.equal(
    await page
      .getByRole('button', { name: 'Próximo candle', exact: true })
      .isVisible(),
    false,
  );
  await page
    .getByRole('combobox', { name: 'Fonte de mercado' })
    .selectOption('replay');
  await page.getByText('DADOS SIMULADOS', { exact: true }).waitFor();
  await page.waitForFunction(
    () =>
      !document.body.textContent.includes(
        'Migration do módulo de operações ausente.',
      ),
  );
  const diagnostic = await page.evaluate(async () =>
    (await fetch('/api/trade/health')).json(),
  );
  assert.equal(diagnostic.persistence, 'AVAILABLE');
  assert.equal(diagnostic.realExecutionEnabled, false);
  assert.equal(diagnostic.runtime.executionExplicitlyDisabled, true);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      checks: [
        'FocoOS login reuse',
        'candlestick canvas',
        'setup',
        'multi-strategy scanner and 17-entry library',
        'paper-only action and REAL option disabled',
        'human paper approval, next-candle fill, zero MT5 commands',
        'step',
        'timeframe',
        'Professor',
        'learning',
        'save run',
        'journal',
        'mobile overflow',
        'reset',
        'MT5 offline never fabricates live price',
        'source switch preserves replay',
        'persistence recovery and authenticated runtime health with REAL disabled',
      ],
      screenshots: ['.trade-qa/desktop.png', '.trade-qa/mobile.png'],
    }),
  );
  await browser.close();
  await db.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
