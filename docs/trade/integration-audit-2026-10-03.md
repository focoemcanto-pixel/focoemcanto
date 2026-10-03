# Auditoria Foco Trade / Supabase / MT5 — 03/10/2026

## Causa raiz

`functions/api/trade/operations.ts`, GET, chamava `trade_operations_read` e capturava qualquer exceção retornando “Fluxo de operações requer persistência Supabase configurada.” A migration do bridge estava instalada; a migration de aprovação humana não. Faltavam `trade_operation_proposals`, `trade_operation_journal`, `trade_operations_read`, `trade_propose`, `trade_confirm` e `trade_operation_observe`. Portanto, presença de candles e heartbeat não comprova que o módulo de propostas esteja instalado. `TRADE_EXECUTION_ENABLED=false` não participou da falha e não bloqueia PAPER.

Instalamos `20261003042050_human_approval.sql` no projeto autorizado hubfocoemcanto, sem reexecutar a migration do bridge e sem alterar tabelas de outros produtos. Schema fingerprint das colunas fora do Trade foi preservado: b102d77817f28baeaf7f754b8e80a0be.

## Código

- config.ts: REST RPC com apikey/Bearer exclusivamente de TRADE_SUPABASE_SERVICE_KEY e URL TRADE_SUPABASE_URL; normalização da URL; erros separados de configuração, schema, permissão e indisponibilidade, sem retornar o texto bruto do Supabase ou secrets.
- operations.ts: preserva PAPER com gate real false; corrige fallback indevido para mock se uma fonte MT5 não tiver estado; marcador PAPER/MT5 passa a ser timestamp fechado em vez do tamanho da janela, que pode ficar fixo em 1.500 candles.
- instruments.ts + approval.ts: metadados monetários do EA moderno; compatibilidade explicitamente marcada com especificação WIN somente no PAPER, para o EA instalado que ainda não enviava tickValue/currency. REAL continua exigindo metadados válidos e autorização.
- OperationsPanel.tsx: separa erro de leitura de erro de ação e limpa erro de leitura após resposta válida, sem exigir reload da página; mostra a origem do multiplicador PAPER.
- bridge/exchange.ts: inclui somente flags seguras da configuração server-side no heartbeat persistido. Não registra chave/token/conta. Dados de ticks/candles continuam em RPC transacional Supabase, sem fallback para memória/cache.
- health.ts: diagnóstico protegido por autenticação FocoOS que lê as RPCs de bridge e operações usando as credenciais do runtime. Retorna flags, acesso operacional, feed e gates; não há emissão de comandos.
- persistence.test.ts e trade-ui-check.cjs: regressões de migration ausente, acesso via service role, classificação de erros, recuperação do painel, PAPER com false, janela de tamanho fixo e HTTP 200 sem CMD.

Não há uso de SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL nesses módulos. Nenhum SDK Supabase precisa ser inicializado: o backend usa REST/RPC autenticado diretamente. As notas pessoais e execuções de replay antigas permanecem no namespace KV FOCO_LINKS; propostas/ciclos de operação têm persistência transacional Supabase. Não confundimos essas duas finalidades.

## Verificação do banco e runtime

Confirmadas as sete tabelas trade_bridge_state/batches/ticks/candles/commands/events/audit e as quatro RPCs trade_bridge_exchange/read/enqueue/kill. Todas as tabelas Trade têm RLS; anon/authenticated não possuem grants. Funções são SECURITY INVOKER, exclusivas de service_role. Avisos INFO “RLS sem policies” são intencionais em armazenamento server-only.

Dados reais: WINV26, xp-mt5-primary, 1.500 candles e dois ticks históricos; o contador de batches passou de 445 para 513 durante a auditoria inicial. Heartbeat continuou avançando depois da migration. Isso confirma escrita Supabase, sem memória como substituto. A consulta real `trade_operations_read` passou a retornar array válido.

Executamos também ciclo de gravação/leitura PAPER e diário no Supabase real com SET LOCAL ROLE service_role, dentro de transação revertida. Verificamos confirmação, observação simulada, diário e ausência de comandos. Nenhum dado de teste ficou gravado após ROLLBACK.

O exchange também consulta a RPC operacional a cada 30s, com cache exclusivo de diagnóstico (nenhum candle/tick substituído por memória), e inclui operationsRpcAvailable no heartbeat. As flags backendDiagnostics do próximo heartbeat após deployment permitirão confirmar os bindings utilizados no runtime e executionExplicitlyDisabled. O último heartbeat observado antes do deployment foi 05:40:11 UTC; é necessário manter o MT5/EA ativo para concluir essa validação pós-deploy. Para diagnóstico visual, autenticado no FocoOS, acesse `/api/trade/health`.

## Segurança e limitações

EA instalado observado com executionAllowed=false, kill_switch=true e zero comandos. Não alteramos env para true, não liberamos kill switch, não criamos ordens XP. `liveAuthorized=false` continua. A migration adiciona proteção de aprovação humana também no banco.

Heartbeat conectado/HTTP 200 não é tick atual. Nesta madrugada de sábado, os ticks disponíveis são históricos; OFFLINE é correto se a idade do último tick excede o limite. Candles históricos podem ser lidos normalmente. PAPER de treinamento é utilizável com Mock/Replay; novos setups usando feed real exigem dados atuais. Não fabricamos candles ou ticks atuais para mostrar LIVE.

Compilação no MetaEditor foi confirmada pelo usuário para o EA instalado; não recompilamos MQL5 neste ambiente. A atualização do EA é recomendada para trazer metadados monetários/posição completos antes de qualquer futura validação de execução. O token permanece o mesmo e o transporte do EA anterior é compatível.

## Validação

42 testes TS/API/Postgres/PGlite, typecheck strict, build Functions e Next/export; QA headless com 15 verificações, incluindo recuperação de falha de schema e health autenticado com execução false. API de exchange retorna OK/HTTP 200 sem CMD no teste com papel de banco service_role e proteção de execução ativa. Deployment e heartbeat de produção são verificados após o push.
