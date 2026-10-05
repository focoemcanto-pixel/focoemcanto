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
const lab = require('../functions/api/trade/lab.ts');
const risk = require('../functions/api/trade/risk.ts');
const health = require('../functions/api/trade/health.ts');
const executionStatus = require('../functions/api/trade/execution-status.ts');
let operationReadFailures = 1;
let simulateMissingBridge=false;
(async () => {
  const db = new PGlite();
  await db.exec(
    'create role anon;create role authenticated;create role service_role bypassrls;',
  );
  for (const file of [
    '20261003035402_mt5_bridge.sql',
    '20261003042050_human_approval.sql',
    '20261003124510_multi_strategy_scanner.sql',
    '20261004210552_real_execution_safety.sql',
    '20261005000359_real_execution_fail_closed.sql',
    '20261005091111_pre_real_homologation.sql',
    '20261005092318_pre_real_account_mode.sql',
    '20261005122031_bridge_market_clock.sql',
    '20261005150000_risk_blocked_technical_proposal.sql',
    '20261006090000_real_session_arming.sql',
    '20261006120000_setup_observation_lab.sql',
    '20261006130000_lab_notes_index.sql',
    '20261007090000_tick_retention.sql',
    '20261007091000_lab_participant_attribution.sql',
    '20261007100000_paper_risk_settings.sql',
  ])
    await db.exec(await fs.readFile('supabase/migrations/' + file, 'utf8'));
  // Fixture ticks are stamped in real UTC; the production broker-wall clock is covered in real-session.test.ts.
  await db.exec('delete from trade_bridge_clock_settings');
  globalThis.fetch = async (url, init) => {
    const name = new URL(url).pathname.split('/').pop(),
      args = Object.values(JSON.parse(init.body));
    try {
      const result = await db.query(
        `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as result`,
        args,
      );
      if(simulateMissingBridge&&name==='trade_bridge_read'&&!result.rows[0]?.result)return Response.json({code:'PGRST202'},{status:404});
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
          url.pathname.endsWith('execution-status')
            ? executionStatus.onRequestGet({ env })
            : url.pathname.endsWith('health')
              ? health.onRequestGet({ env })
              : url.pathname.endsWith('scanner')
                ? scanner[
                    request.method === 'POST' ? 'onRequestPost' : 'onRequestGet'
                  ]({ request, env })
                : url.pathname.endsWith('/api/trade/risk')
                  ? risk[request.method === 'POST' ? 'onRequestPost' : 'onRequestGet']({ request, env })
                : url.pathname.endsWith('/api/trade/lab')
                  ? lab[request.method === 'POST' ? 'onRequestPost' : 'onRequestGet']({ request, env })
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
                          r.method() === 'POST'
                            ? 'onRequestPost'
                            : 'onRequestGet'
                        ]({ request, env })
                    : url.pathname.endsWith('evaluate')
                      ? evaluate({ request,env })
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
    await page.locator('.trade-scanner-library > details').count(),
    0,
  );
  await page
    .getByRole('button', { name: 'Ver estratégias', exact: true })
    .click();
  const drawer = page.getByRole('dialog');
  await drawer.waitFor();
  assert.equal(
    await drawer.locator('.trade-scanner-library > details').count(),
    17,
  );
  await drawer
    .getByRole('textbox', { name: 'Buscar estratégias' })
    .fill('VWAP');
  assert.equal(
    await drawer.locator('.trade-scanner-library > details').count(),
    1,
  );
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(
    await page
      .getByRole('button', { name: 'Ver estratégias', exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  // GESTÃO DE RISCO: nothing preconfigured. The proposal stays RISK_BLOCKED (no hardcoded fallback)
  // until the user fills capital, 1R rule and limits; the 1R preview updates while typing.
  await page.locator('.trade-risk summary').getByText('GESTÃO DE RISCO NÃO CONFIGURADA').waitFor();
  assert.equal((await db.query('select count(*)::int n from trade_risk_settings_versions')).rows[0].n, 0);
  assert.equal(await page.getByRole('button', { name: 'SALVAR CONFIGURAÇÃO', exact: true }).isDisabled(), true);
  for (const label of ['Capital operacional (R$) — planejamento, não é o saldo da XP', 'Risco por operação (% do capital)', 'Limite de perda diária (R)', 'Máximo de operações por dia', 'Máximo de contratos por operação'])
    assert.equal(await page.getByLabel(label).inputValue(), '', `${label} must start empty`);
  await page.getByLabel('Capital operacional (R$) — planejamento, não é o saldo da XP').fill('10.000,00');
  await page.getByLabel('Percentual do capital').check();
  await page.getByLabel('Risco por operação (% do capital)').fill('0,5');
  await page.locator('[data-risk-preview="one-r"]').getByText('R$ 50,00').waitFor();
  await page.getByLabel('Risco por operação (% do capital)').fill('1');
  await page.locator('[data-risk-preview="one-r"]').getByText('R$ 100,00').waitFor();
  await page.getByLabel('Limite de perda diária (R)').fill('5');
  await page.locator('.trade-risk-summary').getByText('5R · R$ 500,00').waitFor();
  await page.getByLabel('Máximo de operações por dia').fill('20');
  await page.getByLabel('Máximo de contratos por operação').fill('1');
  assert.equal((await db.query('select count(*)::int n from trade_risk_settings_versions')).rows[0].n, 0); // typing never saves
  await page.screenshot({ path: '.trade-qa/risk-form.png', fullPage: false });
  await page.getByRole('button', { name: 'SALVAR CONFIGURAÇÃO', exact: true }).click();
  await page.getByText(/^Versão 1 salva\./).waitFor();
  await page
    .getByRole('heading', { name: 'AGUARDANDO CONFIRMAÇÃO', exact: true })
    .waitFor();
  await page
    .getByRole('button', { name: 'REAL INDISPONÍVEL', exact: true })
    .click();
  await page.locator('.trade-real-checklist summary').waitFor();
  // ONE proposal, two destinations: REAL shows the Copilot's proposal with ENTRAR REAL blocked.
  assert.equal(await page.locator('[data-destination="real"] button').isDisabled(), true);
  await page.locator('.trade-real-inspection summary').click();
  assert.equal(
    await page
      .getByRole('button', { name: 'Preparar proposta REAL', exact: true })
      .isDisabled(),
    true,
  );
  await page.screenshot({
    path: '/tmp/trade-real-disarmed-desktop.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'PAPER OPERACIONAL', exact: true })
    .click();
  await page
    .getByRole('heading', { name: 'AGUARDANDO CONFIRMAÇÃO', exact: true })
    .waitFor();
  assert.equal(
    (await db.query('select * from trade_bridge_commands')).rows.length,
    0,
  );
  // A READY proposal shows a live countdown from the backend expiresAt before the entry button.
  const countdown = page.locator('[data-entry="available"]');
  await countdown.waitFor();
  assert.match(await countdown.textContent(), /^ENTRADA DISPONÍVEL · \d+s$/);
  // The proposal shows the risk it was sized with (immutable snapshot).
  assert.match(await page.locator('[data-risk="one-r"]').textContent(), /R\$\s?100,00 · gestão v1/);
  assert.match(await page.locator('[data-risk="usage"]').textContent(), /%/);
  await page.locator('.trade-risk summary').getByText('1R = R$ 100,00').waitFor();
  await page
    .getByRole('button', { name: 'ENTRAR EM PAPER', exact: true })
    .click();
  // Confirmation: quantity may only go down; nothing executes before CONFIRMAR.
  await page.getByLabel('Quantidade da entrada PAPER').fill('2');
  await page.getByRole('alert').getByText(/2 contratos arriscariam/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'CONFIRMAR ENTRADA PAPER', exact: true }).isDisabled(), true);
  await page.getByLabel('Quantidade da entrada PAPER').fill('1');
  assert.equal((await db.query("select count(*)::int n from trade_operation_proposals where state='CONFIRMADA'")).rows[0].n, 0);
  await page.getByRole('button', { name: 'CONFIRMAR ENTRADA PAPER', exact: true }).click();
  await page.getByRole('heading', { name: 'ENVIANDO', exact: true }).waitFor();
  await page
    .getByRole('button', { name: 'Próximo candle', exact: true })
    .click();
  await page.getByRole('heading', { name: 'EXECUTADA', exact: true }).waitFor();
  assert.equal(
    (await db.query('select * from trade_bridge_commands')).rows.length,
    0,
  );
  // GESTÃO DE RISCO: a new version via the form (R$5.000 × 1% = R$50); history is not rewritten.
  await page.locator('.trade-risk > summary').click();
  await page.getByLabel('Capital operacional (R$) — planejamento, não é o saldo da XP').fill('5000');
  await page.getByLabel('Percentual do capital').check();
  await page.getByLabel('Risco por operação (% do capital)').fill('1');
  await page.getByRole('button', { name: 'SALVAR CONFIGURAÇÃO', exact: true }).click();
  await page.getByText(/^Versão 2 salva\./).waitFor();
  await page.locator('.trade-risk summary').getByText('1R = R$ 50,00').waitFor();
  assert.equal(
    (await db.query("select count(*)::int n from trade_operation_proposals where payload->'riskSettings'->>'version'='2'")).rows[0].n,
    0,
  );
  await page.screenshot({ path: '.trade-qa/risk.png', fullPage: false });
  assert.equal((await db.query('select * from trade_bridge_commands')).rows.length, 0);
  await page.waitForFunction(
    () =>
      document.querySelector('.trade-progress small')?.textContent ===
      '181 / 420 candles',
  );
  await page.getByRole('button', { name: '5m', exact: true }).click();
  await page.getByRole('button', { name: 'Professor', exact: true }).click();
  await page
    .getByRole('button', { name: 'Ver raciocínio completo', exact: true })
    .click();
  await page.getByRole('dialog').waitFor();
  assert.equal(
    await page
      .getByRole('dialog')
      .locator('.trade-scanner-library > details')
      .count(),
    17,
  );
  await page
    .getByRole('button', { name: 'Fechar detalhes do motor', exact: true })
    .click();
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
  // LAB: evidence base renders from the deterministic analytics endpoint.
  await page.getByRole('button', { name: 'LAB', exact: true }).click();
  await page.getByRole('heading', { name: 'Setups, resultados e estatística por estratégia', exact: true }).waitFor();
  await page.getByText('HOJE · XP/MT5 LIVE', { exact: true }).waitFor();
  await page.screenshot({ path: '.trade-qa/lab.png', fullPage: true });
  // Small N is never presented as a conclusion.
  const badges = await page.locator('.trade-lab-card summary em').allTextContents();
  assert.ok(badges.length > 0, 'LAB shows at least one strategy card');
  assert.ok(badges.every((b) => b === 'AMOSTRA INSUFICIENTE'), `small N only: ${badges.join(', ')}`);
  // Origin filter keeps datasets apart.
  await page.getByLabel('Origem dos dados').selectOption('PAPER_FORWARD');
  assert.ok((await page.locator('.trade-lab-card').count()) < badges.length || badges.length === 0);
  await page.getByLabel('Origem dos dados').selectOption('ALL');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'LAB mobile overflow');
  await page.screenshot({ path: '.trade-qa/lab-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('button', { name: 'Copiloto', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Estratégias', exact: true }).click();
  assert.equal(
    await page.locator('.trade-scanner-library > details').count(),
    0,
  );
  await page
    .getByRole('button', { name: 'Ver estratégias', exact: true })
    .click();
  await page.getByRole('dialog').waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.screenshot({
    path: '.trade-qa/mobile-drawer.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Fechar detalhes do motor', exact: true })
    .click();
  await page.screenshot({ path: '.trade-qa/mobile.png', fullPage: true });
  await page
    .getByRole('button', { name: 'REAL INDISPONÍVEL', exact: true })
    .click();
  await page.screenshot({ path: '.trade-qa/mobile-real.png', fullPage: true });
  assert.ok(
    await page.evaluate(() => {
      const parent = document
        .querySelector('.trade-execution-selector')
        .getBoundingClientRect();
      return (
        [
          ...document.querySelectorAll('.trade-execution-selector button'),
        ].every((el) => {
          const r = el.getBoundingClientRect();
          return r.left >= parent.left && r.right <= parent.right + 1;
        }) && document.documentElement.scrollWidth <= innerWidth
      );
    }),
  );
  await page
    .getByRole('button', { name: 'PAPER OPERACIONAL', exact: true })
    .click();
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
  simulateMissingBridge=true;
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
  await page.getByText('REPLAY', { exact: true }).waitFor();
  await page.waitForFunction(
    () =>
      !document.body.textContent.includes(
        'Migration do módulo de operações ausente.',
      ),
  );
  simulateMissingBridge=false;
  const diagnostic = await page.evaluate(async () =>
    (await fetch('/api/trade/health')).json(),
  );
  assert.equal(diagnostic.persistence, 'AVAILABLE');
  assert.equal(diagnostic.realExecutionEnabled, false);
  assert.equal(diagnostic.runtime.executionExplicitlyDisabled, true);
  // Isolated real-feed fixture: never a broker request. REAL gates remain false.
  const {generateMockCandles,snapshotOf}=require('../trade/core/providers.ts');
  const {scanMarket}=require('../trade/scanner/engine.ts');
  let liveFixture;const mockBars=generateMockCandles(),closed=Math.floor(Date.now()/60000)*60;
  for(let cursor=120;cursor<=420;cursor++){
    const delta=closed-(mockBars[cursor-1].timestamp+60);
    const candles=mockBars.slice(0,cursor).map(c=>({...c,symbol:'WINV26',timestamp:c.timestamp+delta}));
    const candidate=scanMarket(snapshotOf(candles,'live')).candidates.find(c=>c.analysis.status==='complete'&&!c.analysis.conflicts.length);
    if(candidate){liveFixture={candles,candidate};break;}
  }
  assert.ok(liveFixture);const price=liveFixture.candidate.analysis.setup.entry;
  await db.query('select trade_bridge_exchange_v2($1,false,1,$2,15000)',[{
    bridgeId:'xp-mt5-primary',symbol:'WINV26',session:'ui-inspection',batch:0,accountHash:'a'.repeat(64),
    ticks:[{symbol:'WINV26',timeMsc:Date.now(),bid:price-5,ask:price,last:price,volume:1,flags:0}],candles:liveFixture.candles,events:[],
    state:{protocolVersion:2,connected:true,executionAllowed:false,tickSize:5,tickValue:1,currency:'BRL',positions:[],orders:[]}},'a'.repeat(64)]);
  // REAL sizing needs an explicit policy risk limit (absent = RISK_BLOCKED). Policy stays disabled: REAL remains disarmed.
  await db.query("insert into trade_execution_policy(bridge_id,enabled,max_risk_brl) values('xp-mt5-primary',false,10000)");
  await page.setViewportSize({width:1440,height:1100});
  await page.getByRole('combobox',{name:'Fonte de mercado'}).selectOption('mt5');
  await page.getByRole('button',{name:'REAL INDISPONÍVEL',exact:true}).click();
  await page.locator('.trade-real-inspection summary').click();
  const prepareButton=page.getByRole('button',{name:'Preparar proposta REAL',exact:true});
  await prepareButton.waitFor();await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Preparar proposta REAL');return b&&!b.disabled;});
  await prepareButton.click();await page.getByRole('button',{name:'REVISAR PROPOSTA REAL',exact:true}).click();
  await page.getByRole('heading',{name:'Confirmar operação REAL?',exact:true}).waitFor();
  await page.screenshot({path:'.trade-qa/inspection-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.trade-qa/inspection-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'CONFIRMAR ORDEM REAL',exact:true}).click();
  await page.getByRole('status').filter({hasText:'EXECUÇÃO REAL BLOQUEADA'}).waitFor();
  assert.equal((await db.query('select *from trade_bridge_commands')).rows.length,0);
  assert.ok((await db.query('select used_at from trade_real_inspections')).rows[0].used_at);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      checks: [
        'FocoOS login reuse',
        'candlestick canvas',
        'setup',
        'compact motor; full 17-entry library only in accessible drawer, search, Escape and focus recovery',
        'proposal before formation; detailed method on demand',
        'PAPER operational; REAL selectable, checklist visible, order blocked',
        'human paper approval, next-candle fill, zero MT5 commands',
        'REAL inspection: separate proposal, desktop/mobile final dialog, consumed nonce, explicit blocked response, zero commands',
        'step',
        'timeframe',
        'Professor ON: full reasoning drawer; OFF: compact operational view',
        'learning',
        'save run',
        'journal',
        'mobile overflow',
        'reset',
        'MT5 offline never fabricates live price',
        'source switch preserves replay',
        'persistence recovery and authenticated runtime health with REAL selectable but blocked',
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
