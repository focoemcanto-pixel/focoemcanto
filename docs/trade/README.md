# Foco Trade — primeira versão funcional

Módulo educacional em `/trade/`, dentro de `focoemcanto-pixel/focoemcanto`.
Usa dados sintéticos identificados como simulação e não executa ordens.

## Auditoria e decisão

- Domínio: `focoemcanto.com` responde pelo projeto Next.js com `output: export` e Cloudflare Pages Functions de `focoemcanto`.
- Base auditada: `9e53b05b086c547547c77946a421b79302038650`, branch `main`.
- FocoOS está em `public/admin`, com login em `/admin/login/`, endpoint `/api/admin/session` e verificação em `functions/_lib/admin-auth.js`.
- A identidade da V1 é o administrador único do FocoOS, autenticado pelo token já configurado. O cookie existente é HttpOnly, Secure, SameSite=Strict, Path=/, com duração de oito horas. O Trade não armazena, lê no navegador nem replica o token.
- `foco-assistente` foi auditado pelo conector GitHub: usa Supabase Auth no projeto Hub e possui login próprio em `components/AuthGate.tsx`. Ele não é o login do FocoOS. Nenhuma chave dele foi copiada.
- Foram inventariados os repositórios disponíveis. Cópias locais antigas com alterações pendentes foram preservadas. Trabalho realizado em checkout novo.
- Decisão: módulo no mesmo repositório e origem, sem novo proxy, domínio ou Worker. Next.js App Router + TypeScript + Tailwind prefixado, sem preflight global. Backend em Pages Functions, adequado à arquitetura real existente.
- Uma aplicação Next com SSR/OpenNext separada exigiria novo deploy, roteamento de assets e nova ponte de sessão. Não é necessária para esta entrega. O núcleo `trade/core` é separável se essa necessidade surgir.
- Nenhuma alteração nas regras das aulas, contratos, comunicação, landing pages ou login existente.

## Funcionando

- Candlesticks WIN mock, volume, timeframes 1m/5m/15m/1h, suporte/resistência dos candles 5m fechados, limites da região, EMA, referência, invalidação e alvo.
- Biblioteca **TradingView Lightweight Charts 5.0.8**, canvas, atualização incremental e suporte nativo a candles/volume. Escolhida pelo desempenho, ecossistema financeiro e adequação a streaming. Atribuição preservada no gráfico e no rodapé. https://tradingview.github.io/lightweight-charts/docs/
- Copiloto com contexto, estrutura, pullback, região, reação, confirmação, gatilho e validação de risco; descreve condições pendentes e conflitos.
- `trend_pullback_confirmation_v1` v1.0.0 candidata, `paper`, sem autorização ao vivo. Apenas essa estratégia está implementada; demais famílias estão no catálogo de pesquisa, sem sinais simulados falsos de implementação.
- Replay progressivo com play/pause, velocidade, próximo candle e reset. A sessão abre no candle 180, onde existe um exemplo de setup; reset permite acompanhar toda a formação desde zero.
- Backtest/paper causal: entrada no próximo candle, stop/alvo, resultado em R, duração, condições e versão. Mostra métricas e permite salvar execuções.
- Professor contextual por regras; interpretação generativa opcional no servidor. O estado recebido é recalculado, não aceito do cliente. A IA só pode explicar qualitativamente; se produzir dígitos, sua resposta é descartada. Referências numéricas são anexadas pelo motor.
- Modo de aprendizado oculta análise/overlays, recolhe leitura livre e escolha da tendência, revela e compara a tendência com critérios objetivos. Respostas livres sobre suporte/impulso/confirmacão são colocadas ao lado dos critérios; não há nota semântica automatizada nesta V1.
- Diário e execuções paper persistidos em `FOCO_LINKS`, sob `trade:v1:focoos-admin:*`, um registro por chave para evitar sobrescrever coleções simultaneamente. Listagens têm limites visíveis de 100 notas e 50 execuções; KV pode ter atraso de propagação entre regiões.

## Organização

| Caminho                          | Responsabilidade                                                               |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `trade/core/types.ts`            | Candle, provider snapshot, contrato de estratégia, análise, setup, paper trade |
| `trade/core/providers.ts`        | Mock, Replay, agregação em lote/incremental e corte temporal                   |
| `trade/core/strategy.ts`         | Estratégia candidata e parâmetros centralizados                                |
| `trade/core/engine.ts`           | Avaliação de plugins, conflitos, autorização live, paper/backtest e métricas   |
| `functions/api/trade`            | APIs protegidas, Professor e persistência                                      |
| `functions/trade/_middleware.js` | Proteção da página com a sessão existente                                      |
| `app/trade`                      | Interface e renderização; nenhuma regra de setup em React                      |
| `supabase/migrations`            | Schema isolado e RLS para evolução por usuário                                 |
| `tests/trade`                    | Testes do motor, APIs e Postgres/RLS                                           |

## Desenvolvimento / deploy

```bash
npm ci
npm run typecheck:trade
npm run test:trade
npm run build:trade-api
npm run build
```

A saída estática permanece `out`. Pages compila `functions` como já faz para o FocoOS.
Não troque o projeto de produção para um servidor Next ou OpenNext: esta entrega mantém export estático.
`next dev` sozinho não executa Pages Functions.

Preview completo:

```bash
npx wrangler pages dev out --local-protocol https --kv FOCO_LINKS --binding ADMIN_TOKEN=um-token-local-de-teste
```

Use um token exclusivo para teste, nunca uma credencial real na linha de comando.
Em produção, reutilize `ADMIN_TOKEN`/`FOCO_ADMIN_TOKEN`/`ADMIN_SECRET` ou `config:admin_token` do KV, exatamente como no FocoOS. Nenhuma nova credencial é necessária para o laboratório.

| Configuração no servidor         | Uso                                                       |
| -------------------------------- | --------------------------------------------------------- |
| `FOCO_LINKS`                     | Namespace KV já utilizado pelo FocoOS; diário e execuções |
| Autenticação existente do FocoOS | Proteção da página e de todas as APIs                     |
| `OPENAI_API_KEY` opcional        | Professor generativo; não aparece no frontend             |
| `TRADE_AI_MODEL` opcional        | Modelo do Professor, default `gpt-4.1-mini`               |

O Professor funciona por regras sem chave ou em caso de falha/timeout da IA. Respostas informam o provedor realmente usado. Não existem APIs de compra, venda ou conexão a uma conta de corretora.

Após push para `main`, o projeto Pages já conectado ao GitHub deve construir e publicar normalmente. Verificar `/trade/` sem sessão → login; APIs sem sessão → 401; login → dashboard; diário e salvar execução → persistência. Se o deploy automático estiver desabilitado, publicar o commit no projeto Pages existente, usando `npm ci && npm run build` e saída `out`.

Rollback aditivo: reverter o commit do módulo, removendo `/trade` e APIs Trade; manter registros KV para auditoria. Não remover namespaces/tabelas de outros produtos.

## Banco

Migration gerada pelo CLI Supabase: `20261003021627_foco_trade_initial.sql`.
Contém as 14 tabelas pedidas, no schema isolado `foco_trade`, sem colisões com `public`:
`instruments`, `candles`, `strategies`, `strategy_versions`, `strategy_runs`, `setups`, `setup_conditions`, `signals`, `paper_trades`, `trade_journal`, `backtests`, `backtest_results`, `market_sessions`, `user_learning_progress`.

A migration foi executada em Postgres/PGlite isolado e verificada, incluindo RLS, rejeição de troca de proprietário, ausência de acesso anônimo e FKs entre registros do mesmo proprietário. **Não foi aplicada a um Supabase de produção e não é necessária para usar a V1.**

Não selecione silenciosamente um banco de outro produto. A autenticação real do FocoOS usa um principal administrativo compartilhado, sem UUID Supabase; não foi criado um falso `auth.users` ou duplicada a identidade. Antes da evolução multiusuário, vincular contas pessoais Supabase de forma explícita e escolher o projeto de destino. Aplicar a migration nesse destino; manter chaves de serviço somente no servidor. Se usar Data API, expor deliberadamente o schema e revisar permissões; não expor `service_role` ao navegador.

Todas as tabelas têm RLS. Catálogo é somente leitura para usuários autenticados. Valores de setups, sinais e resultados não podem ser escritos por clientes autenticados. Diário/progresso aceitam somente dados do próprio `auth.uid()`, com USING e WITH CHECK; FKs compostas impedem vincular notas a operações de outro proprietário. Sem funções SECURITY DEFINER.

## Limitações honestas

- Mock WIN é um símbolo lógico; não resolve contrato vigente e não representa preços do pregão atual.
- Dataset determinístico de 420 minutos, seed 42, rotulado como sintético. Métricas não demonstram vantagem estatística.
- Backtest inicial tem posição única, cooldown configurável, custos e slippage de rotina ainda zerados. Gaps através do stop usam pior preço de abertura; se stop e alvo tocam no mesmo candle, stop primeiro e resultado marcado como ambíguo. Sem reconstrução intrabar.
- Resultados agregados atuais são da única sessão sintética. Banco prepara segmentação por horário, regime e estratégia; análises comparativas extensas não estão implementadas.
- Professor não recebe saldo/posição real nem envia ordens. Risco financeiro em reais não é calculado sem especificação de contrato, quantidade, custos e slippage.
- Live continua bloqueado: dados ao vivo não bastam para autorizar uma hipótese não validada.
- Versão do Next.js mantida para evitar migração fora do escopo; o build principal herda `ignoreBuildErrors`. O módulo possui typecheck estrito separado, que deve passar antes do deploy.

Veja [parâmetros](./parameters.md), [conectar WIN/B3](./live-b3.md) e [validação](./validation.md).
