# PAPER e REAL: pipeline implementado, execução desarmada

## Estado desta entrega

PAPER continua operacional com Replay e, quando o feed está recente, dados XP/MT5. REAL tem aprovação em duas etapas, comando assinado, validação no backend/Postgres/EA e reconciliação por eventos do broker. Não houve ordem real nem alteração dos gates de produção: TRADE_EXECUTION_ENABLED=false, EnableExecution=false, kill switch ativo, autorizações live false e política REAL desabilitada.

O compilador MetaEditor/terminal XP não está disponível neste ambiente. O EA v2 precisa ser compilado no Mac e homologado de forma deliberada antes de ativar dinheiro real. Testes locais não são homologação XP.

## Auditoria e arquitetura

A causa do erro antigo de persistência foi a ausência da migration de aprovação humana, embora a migration do feed existisse. A correção anterior está documentada em [integration-audit-2026-10-03.md](integration-audit-2026-10-03.md). A UI agora mostra erros específicos de configuração, schema, permissão e indisponibilidade. PAPER não depende da autorização REAL.

O mesmo scanner determinístico gera a análise e os números em ambos os modos. Não alteramos regras, thresholds, estágio research/paper nem liveAuthorized do catálogo. Uma autorização separada no banco permite aprovar explicitamente uma estratégia e versão para live-monitoring no futuro. Professor interpreta os dados; não calcula ordens.

- `MT5MarketDataProvider`: ticks, candles e estado persistidos; Mock/Replay preservados.
- `PaperExecutionProvider`: aprovação humana, entrada causal no próximo candle, resultados e diário sem comando MT5.
- `MT5BrokerExecutionProvider`: somente proposta REAL, nonce de confirmação e comando assinado aprovado.
- API `operations`: proposta → ENTRAR / primeira confirmação → diálogo final → CONFIRMAR ORDEM REAL → confirmação transacional e fila.
- `execution-status`: checklist sanitizado, sem conta/token, autenticado pelo login FocoOS existente.
- EA v2: HTTPS direto, sem Python e compatível com MT5/Wine. Feed v1 permanece compatível e não pode receber ordens.

A última confirmação valida novamente a hipótese, feed, conta, sessão, autorização, quantidade, SL/TP e orçamento. O nonce dura no máximo 20 segundos; a proposta/comando, 30 segundos. Cancelar o diálogo não cria comando. Confirmações repetidas retornam o mesmo ciclo sem nova ordem.

CMD2 usa HMAC-SHA256 com o token privado do bridge sobre campos canônicos com oito casas decimais. O banco reserva a entrega em `dispatch_unknown` antes de responder; resposta perdida/repetida e reinício não redisparam. O EA grava a intenção em disco antes de OrderSend; resposta salva interrompida é colocada em quarentena ao reiniciar, sem execução. Nunca apague o ledger para tentar novamente. Estado indeterminado exige reconciliação e intervenção, não reenvio automático.

OrderCheck registra retcode/margem e precisa retornar sucesso antes de OrderSend; o retcode 0 nessa verificação é documentado como Done na [referência oficial MQL5](https://www.mql5.com/en/docs/trading/ordercheck), diferente do resultado de OrderSend. OrderSend registra aceitação e retcodes interno/externo, sem inferir fill. Apenas deals observados confirmam PARCIAL/EXECUTADA; posições, ordens, SL/TP, taxas, encerramento e resultado em R são reconciliados. Falta/divergência de proteção gera alerta. Preço/P&L antigos ficam ocultos. Eventos do broker são gravados mesmo com o navegador fechado.

A primeira versão REAL exige conta sem posições ou ordens antes de abrir nova entrada. Isso é mais conservador que permitir netting ou exposição de outros ativos sem mensuração. A perda é uma janela móvel conservadora de 24h: soma perdas/custos, sem compensar com ganhos, mais reserva de risco da proposta. Não é um calendário diário da bolsa. Ordens de gerenciamento remoto CLOSE/SLTP/MODIFY/CANCEL não têm fluxo humano de UI/API nesta entrega; gerencie a posição diretamente no MT5. O endpoint bruto de comandos continua fechado.

## Supabase e variáveis

Reutilizamos `hubfocoemcanto`, somente objetos Trade. Migrations adicionais aplicadas:

- `20261004210552_real_execution_safety.sql`: política de risco, autorizações por versão, provas de confirmação final, RPCs e triggers de confirmação/dispatch.
- `20261005000359_real_execution_fail_closed.sql`: rejeita evidência JSON ausente/null e condições sem confirmação explícita.

Tabelas novas: trade_execution_policy, trade_live_authorizations e trade_real_confirmations, RLS habilitado, sem grants para anon/authenticated; RPCs SECURITY INVOKER/search_path vazio e service_role exclusivo. Reutilizamos propostas, journal, feed, comandos e eventos existentes. Não reexecute migrations já aplicadas.

Variáveis server-side existentes: TRADE_SUPABASE_URL, TRADE_SUPABASE_SERVICE_KEY, TRADE_BRIDGE_TOKEN, TRADE_MT5_SYMBOL, TRADE_EXECUTION_ENABLED. Configurações de evolução: TRADE_BRIDGE_ID, TRADE_ACCOUNT_HASH, TRADE_MAX_CONTRACTS, TRADE_FEED_MAX_AGE_MS. Nenhuma chave no frontend e nenhum valor de secret neste documento.

Limites financeiros não foram inventados: max_risk_brl, max_daily_loss_brl e max_slippage_points começam vazios no banco; MaxRiskBRL, MaxLoss24hBRL e MaxSlippagePoints começam zero no EA. Account fingerprint local começa vazio. Todos bloqueiam REAL. Sessões são janelas UTC datadas, deliberadamente aprovadas, não uma agenda semanal presumida; vencimento/rollover precisa de aprovação e metadados MT5 atuais.

## Instalar o EA v2 no Mac — manter tudo bloqueado

1. Baixe [FocoTradeBridge.mq5](https://github.com/focoemcanto-pixel/focoemcanto/blob/main/mt5/FocoTradeBridge.mq5), botão Download raw file. Faça backup do arquivo EA anterior.
2. No MT5, **Arquivo → Abrir pasta de dados**. Abra **MQL5 → Experts** e copie o arquivo .mq5 para lá.
3. No MT5, pressione **F4** para abrir MetaEditor. Abra FocoTradeBridge.mq5 e pressione **F7**. Confira **0 errors**. Se houver erro, não instale nem ative execução: registre o texto/linha para corrigirmos.
4. Volte ao MT5, **Navegador → Expert Advisors → Atualizar**. Remova apenas a instância anterior do gráfico; preserve os arquivos FocoTrade_ em FILE_COMMON. Instale uma única instância nova no gráfico WINV26.
5. Configure ApiOrigin=https://focoemcanto.com, BridgeId=xp-mt5-primary e TradeSymbol=WINV26. Preencha BridgeToken com o token privado já utilizado. Mantenha **EnableExecution=false** e limites financeiros em zero. Não habilite Algo Trading para enviar ordens.
6. **Ferramentas → Opções → Expert Advisors → Permitir WebRequest**: adicione https://focoemcanto.com. WebRequest é para comunicação, não exige liberar execução financeira.
7. Confira o gráfico/Experts: versão v2 e HTTP 200. Não publicamos o fingerprint da conta nos logs; ele trafega apenas no exchange autenticado.
8. Entre em `/trade`, fonte **XP / MetaTrader 5**. No pregão, confira WINV26, último tick recente e LIVE. Fora do pregão, OFFLINE pode ser correto mesmo com HTTP 200. Selecione REAL para ver o gate de protocolo v2 aprovado e os gates de execução ainda bloqueados.
9. Teste propostas/confirmar/descartar em **PAPER**, avançando Replay ou esperando um novo candle do feed. Verifique diário. Nenhum comando XP deve ser criado.

## Ativação futura — somente deliberada, depois da homologação

Não executamos estes passos nesta entrega. Antes de qualquer teste com dinheiro real:

1. Compilar/homologar EA v2, assinatura, reconexão, reinício, metadados monetários e feed XP em sessão real; validar a conta e contrato vigente.
2. Definir explicitamente no banco fingerprint, símbolo, vencimento, rollover, janelas datadas e limites de contratos, posições, risco, perda e desvio. Aprovar uma estratégia/versão como live-monitoring/live_authorized. Decidir esses valores com o responsável pela conta.
3. Configurar o mesmo fingerprint e limites locais no EA; habilitar EnableExecution/permissões do MT5 apenas sob autorização deliberada.
4. Autorizar explicitamente TRADE_EXECUTION_ENABLED=true e liberação do kill switch somente para o teste controlado. A política precisa estar habilitada; nenhum desses gates se ativa sozinho.
5. Ainda assim, toda entrada exige proposta atual e os dois cliques humanos, incluindo CONFIRMAR ORDEM REAL. Conferir o deal/posição e SL/TP efetivos no terminal; requisição aceita não é execução.

## Validação

103 testes TS/API/Postgres isolados aprovados nesta reconstrução: gates, assinatura/tampering, confirmação dupla, idempotência, resposta perdida, reinício, parcial, fees/R, proteção, causalidade, RLS e PAPER com execução false. Typecheck strict, build Next/export e build Pages Functions aprovados. QA headless desktop/mobile cobre login, gráfico, modos, checklist bloqueado, confirmação PAPER e diário. Nenhum teste local usa conta XP ou endpoint de corretora.

Advisors Trade: apenas INFO de RLS sem policies, intencional para tabelas server-only sem grants públicos. [Referência do aviso](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Avisos de outros produtos foram preservados fora deste escopo.

> Operação diária, sessão REAL armável e configuração uma-vez: [real-session-operations.md](real-session-operations.md).
