# Validação da entrega

- `npm run typecheck:trade`: TypeScript estrito para UI, núcleo, APIs e testes do módulo.
- `npm run test:trade`: 25 testes aprovados; inclui execução real da migration em Postgres/PGlite isolado, RLS e propriedade de FKs.
- `npm run build:trade-api`: Cloudflare Pages Functions compiladas com sucesso.
- `npm run build`: export Next.js gerado, incluindo `/trade`; demais rotas preservadas.
- `npm run test:trade:ui`: verificação headless da exportação + handlers reais. Cobre login FocoOS, canvas, setup, próximo candle, timeframe, Professor, aprendizado, salvar execução, diário, ausência de overflow em 390px e reset. API é interceptada para chamar handlers reais em memória; isso não substitui a verificação do runtime Cloudflare em produção.

Para executar UI, instalar o Chromium do Playwright (`npx playwright install chromium`). Alternativamente `CHROMIUM_EXECUTABLE_PATH=/caminho/chromium npm run test:trade:ui`. O script não consulta dados nem contas externas.

Capturas desktop 1440px e mobile 390px foram geradas e inspecionadas. Os testes não confundem dataset mock com desempenho histórico real.

O núcleo incremental mantém igualdade com a agregação em lote para cada um dos 420 prefixos. Uma alteração arbitrária dos candles futuros não muda estado, sinais ou resultados no cursor anterior. Executar até 420 candles produz três hipóteses sintéticas; esse número apenas verifica o caminho funcional.

No ambiente de trabalho, o servidor Wrangler local não pôde iniciar por restrição de interfaces de rede (`uv_interface_addresses`). Foi possível compilar o Worker e validar página/API por headless com handlers reais. Em produção, conferir middleware, cookie e KV no projeto Pages existente após o deploy.

## Ponte XP / MT5 (03/10/2026)

- Typecheck strict do módulo: passou.
- 33 testes TS/API/Postgres/PGlite: passaram, incluindo autenticação bridge, rejeição de símbolos/contas, limites, freshness, idempotência, lote repetido, claim antes da entrega, resposta perdida sem redispatch, lease concorrente, eventos reais versus aceite, RLS server-only e source MT5 sem gerar setups não autorizados.
- Compile Cloudflare Pages Functions: passou.
- Next export e checagem de assets: passaram.
- QA headless: 13 verificações, incluindo MT5 sem configuração mostrando OFFLINE/preço oculto e retorno ao replay; nenhuma ordem enviada.
- EA: inspeção das APIs MQL5 documentadas, ledger antes de OrderSend e gates por padrão desarmados. **Compilação MetaEditor, execução Wine e conexão XP reais ainda pendentes**. Não há compilador MQL5 no ambiente.
- Migration `20261003035402_mt5_bridge.sql` validada em Postgres/PGlite; não aplicada a um projeto Supabase de produção sem identificar o projeto destinado ao Trade.

## Aprovação humana (03/10/2026)

- 39 testes passaram: acrescentados cálculos monetários, bloqueios de proposta, fills efetivos/parciais, idempotência e atomicidade da confirmação REAL, descarte, expiração, RLS, bloqueio de comando direto e PAPER sem futuro.
- QA da interface: 14 verificações, incluindo proposta automática, confirmação PAPER, entrada no candle seguinte e zero comandos MT5.
- Typecheck estrito, build Cloudflare Functions e Next/export passaram.
- Migration validada em Postgres/PGlite; não aplicada a Supabase de produção ainda não escolhido.
- MetaEditor/XP não estão disponíveis neste ambiente; validação do EA compilado e feed real permanecem pendentes. Nenhuma ordem real enviada, nenhum gate real habilitado.
