# Foco Trade — XP / MetaTrader 5

## Status e decisão arquitetural

A implementação oficial usa APIs documentadas do terminal MT5 e MQL5, sem scraping, DLL de terceiros ou pacote Python MetaTrader5. Isso não constitui certificação/homologação da XP. Os números do teste histórico informado pelo usuário (563 M1 / 3.060 ticks) não foram reproduzidos neste ambiente.

`XP/B3 → terminal MT5/Wine → FocoTradeBridge.mq5 → HTTPS POST /api/trade/bridge/exchange → Cloudflare Functions → Postgres/Supabase → MT5MarketDataProvider / MT5BrokerExecutionProvider → /trade`

Não houve envio de ordens, mudança de credenciais XP ou ativação da negociação. O EA e o backend iniciam bloqueados. A estratégia candidata continua research/paper e `liveAuthorized=false`. Não há geração automática de comandos a partir de setups, nem botões BUY/SELL na interface desta entrega.

A auditoria encontrou Next.js 14 App Router com export estático, Cloudflare Pages Functions, login FocoOS por cookie administrativo e KV para diário/replay. Não foi encontrada configuração Supabase de produção neste repositório. Reutilizamos Postgres/Supabase como tecnologia e fornecemos migration isolada; não selecionamos nem alteramos projetos de outros produtos. A persistência de comandos usa transações Postgres, não KV.

## Preparação do backend

1. Escolha o projeto Supabase destinado ao Trade (pode ser o existente autorizado). Execute **somente** `supabase/migrations/20261003035402_mt5_bridge.sql` no SQL Editor desse projeto. A migration inicial `foco_trade` continua independente e não é pré-requisito da ponte.
2. Cloudflare → Workers & Pages → focoemcanto → Settings → Variables and Secrets → Production. Configure:

| Variável | Valor/origem |
|---|---|
| `TRADE_SUPABASE_URL` | URL HTTPS do projeto escolhido |
| `TRADE_SUPABASE_SERVICE_KEY` | Secret/service-role key do projeto; apenas backend |
| `TRADE_BRIDGE_TOKEN` | Segredo aleatório exclusivo, 256 bits; gere localmente `openssl rand -hex 32` e nunca publique |
| `TRADE_BRIDGE_ID` | Identificador estável; default `xp-mt5-primary` |
| `TRADE_MT5_SYMBOL` | `WINV26` inicialmente; centralizado para rollover |
| `TRADE_EXECUTION_ENABLED` | `false`; mantenha assim no teste de feed |
| `TRADE_ACCOUNT_HASH` | Deixe vazio no primeiro teste de feed; antes de execução precisa ser o fingerprint exibido pelo EA em Experts |
| `TRADE_MAX_CONTRACTS` | Inteiro; default conservador `1` |
| `TRADE_FEED_MAX_AGE_MS` | Default `15000`; máximo `60000` |

Marque token e chave Supabase como **secrets**. Nenhuma variável `NEXT_PUBLIC_*`. Repita o deploy depois de configurar. REST `/rpc` deve estar habilitado no Supabase; tabelas e funções só concedem acesso a `service_role`, RLS habilitado, sem grants para anon/authenticated. O FocoOS continua autenticando usuários no backend.

## Instalação no Mac — passos simples

1. Baixe o arquivo [FocoTradeBridge.mq5](https://github.com/focoemcanto-pixel/focoemcanto/blob/main/mt5/FocoTradeBridge.mq5): abra o link, clique **Download raw file**. Confira que terminou em `.mq5`, não `.txt`.
2. Abra o MetaTrader 5 da XP pelo mesmo aplicativo Wine que já funciona. Entre na conta existente normalmente; não forneça a senha XP ao Foco Trade.
3. No menu do **MT5**, clique **Arquivo → Abrir Pasta de Dados**. Dentro dela, entre em **MQL5 → Experts**. Copie `FocoTradeBridge.mq5` para essa pasta. Use a pasta aberta pelo terminal, não outra instalação Wine.
4. Volte ao MT5. Clique **Ferramentas → MetaQuotes Language Editor** (ou F4/Fn+F4). No MetaEditor, abra **Experts → FocoTradeBridge.mq5**. Clique **Compile / Compilar** (F7/Fn+F7).
5. O resultado necessário é **0 errors**. Se houver erro, não instale o EA: envie a lista com linha/erro. Não há compilador MetaEditor disponível no ambiente de desenvolvimento; a compilação MQL5 é uma validação pendente real, não foi declarada como concluída.
6. No MT5, abra **Ferramentas → Opções → Expert Advisors**. Marque **Allow WebRequest for listed URL** e adicione **`https://focoemcanto.com`**. Não adicione `/api/...` à origem autorizada. Não precisa permitir DLL.
7. Abra um gráfico **WINV26**, preferencialmente M1. No **Navegador → Expert Advisors**, atualize a lista (clique direito → Refresh) e arraste **FocoTradeBridge** para o gráfico.
8. Em **Inputs**, configure:
   - `BridgeToken`: o mesmo segredo exclusivo configurado no Cloudflare.
   - `TradeSymbol`: `WINV26`.
   - `EnableExecution`: **false**.
   - `ApiOrigin`: `https://focoemcanto.com` (sem barra final).
   - `BridgeId`: o mesmo backend; demais limites podem manter defaults documentados.
9. Confirme **OK**. Para o teste de dados, não habilite negociação automática: timer e WebRequest são independentes de permissão de ordens. Mesmo se o terminal estiver autorizado para outras operações, `EnableExecution=false` bloqueia este EA.
10. Abra **Toolbox/Caixa de Ferramentas → Experts**. Procure o fingerprint e **HTTP 200** no gráfico. HTTP -1/erro 4014/4060: confira URL autorizada e rede. HTTP 401: tokens não coincidem. HTTP 400: veja configuração do backend/persistência/símbolo/conta. Segredos nunca aparecem no log.
11. Abra `focoemcanto.com/trade`, faça login FocoOS e selecione **XP / MetaTrader 5** em **Fonte de mercado**. O gráfico deve mostrar histórico e o painel mostrar último tick, idade, Bid/Ask/Last. **LIVE** exige tick recente e heartbeat conectado; fora do pregão pode estar corretamente OFFLINE mesmo com HTTP 200.
12. Deixe terminal e Mac ligados, conectados e sem repouso. Fechar o MT5, suspender o Mac ou perder rede para o feed. Ao reabrir o MT5, confirme que o gráfico manteve o EA e observe a reconexão.

## Segurança, execução e falhas

- HTTPS com bearer token dedicado de alta entropia; comparação de digest em tempo constante. Retry de lote usa `(bridge, sessão, batch)` transacional. Nunca use token FocoOS ou senha XP como token do bridge. Quem possui o token é um emissor de dados autorizado: guarde-o como senha e rotacione em ambos os lados se vazar.
- Limites: lote 1 MB, 1.000 ticks, 2.000 M1, 200 eventos, 100 posições/ordens. Timestamp de tick preserva milissegundos e sequência dentro do lote preserva negócios iguais no mesmo ms. Tick cursor inclusivo conta eventos já drenados no ms final.
- Feed é transporte HTTPS em lotes a cada 2s, não WebSocket/tick-a-tick de baixa latência. WebRequest é síncrono; `CopyTicksRange` recupera ticks enquanto a rede bloqueia o EA. Não é infraestrutura HFT. Recuperação inicial de ticks: 300s; M1: 1.500 barras; limites ajustáveis. Tick antigo nunca aparece como preço LIVE; a UI mostra `—` e OFFLINE. Data age é diferente de latência unidirecional; não anunciamos latência exata de rede sem relógios sincronizados.
- Apenas um EA por bridge: trava local exclusiva em FILE_COMMON e lease transacional 15s no backend. Não clone nem rode a mesma instalação/account/bridge em paralelo.
- Ledger, fila de eventos, lote pendente e cursor em **Common/Files** com nomes `FocoTrade_<hash>_*`. Escrita temporária + flush + move. Não apague esses arquivos para tentar liberar um comando! São parte da prevenção de duplicatas. Backups e integridade de disco importam.
- UUID de comando fornecido pelo cliente deliberado; payload idêntico retorna estado existente, UUID reaproveitado com outro payload falha. Magic default `706032601`, comentário FT + 24 hex do UUID. Tickets são strings para evitar perda de precisão JS.
- Fluxo: queued → dispatch_unknown (claim ANTES da entrega) → submitted (aceito pelo MT5) → observed (negócio/alteração efetivamente observado). `observed` não significa que todos os contratos foram preenchidos: consulte eventos/deals e ordens, especialmente fills parciais. Retcodes e volumes efetivos ficam registrados. Timeout não vira rejeição nem sucesso.
- Comando despachado com resposta perdida **não é reenviado**. Se EA caiu antes de receber, pode nunca executar. Se caiu depois de gravar intent e antes do OrderSend, pode nunca executar. Preferimos perder entrega a duplicar uma ordem. Um comando indeterminado bloqueia novos comandos até reconciliação; não crie novo UUID para “repetir” uma operação sem verificar o terminal.
- Eventos `OnTradeTransaction` entram na fila durável; a cada heartbeat, histórico real de negócios/ordens é reconciliado por Magic, comentário e order ticket. Broker pode alterar comentários: ordens/tickets confirmados ajudam a correlação. Comandos que continuam desconhecidos exigem inspeção deliberada de histórico da corretora; não existe promessa de exactly-once universal diante de falha/destruição do disco.
- Gates para qualquer execução futura: backend `TRADE_EXECUTION_ENABLED=true`, fingerprint correspondente, kill switch liberado explicitamente, feed recente, EA `EnableExecution=true`, permissões MT5/conta, símbolo correto, volume máximo, SL/TP, validade ≤30s e `OrderCheck`. Nunca libere estes gates no primeiro teste de feed.
- Kill switch começa **true**. Botão “Bloquear execução” cancela queued e impede novos comandos. Não desfaz comando já entregue, não fecha posições nem cancela ordens na corretora automaticamente. Para emergência, desabilite Algo Trading/remova EA no MT5 e gerencie ordens/posições no terminal.
- BUY/SELL a mercado, CLOSE por ticket, SLTP por posição, MODIFY/CANCEL por order ticket. O EA só altera posições/ordens do seu Magic e símbolo. Em conta netting, não misture operações manuais de WIN com Foco Trade: Magic não oferece segregação contábil perfeita de uma posição líquida compartilhada. Uso em produção de execução exige validação controlada posterior.
- Não há botões de execução nem ativação automática nesta entrega. A API `POST /api/trade/commands` só aceita sessão FocoOS + Origin local; envio não foi testado contra corretora e permanece bloqueado. O motor de estratégias não chama essa API. `liveAuthorized` não foi removido.

## Contrato de APIs e retenção

- EA: `POST /api/trade/bridge/exchange`, bearer próprio, JSON de ticks/M1/estado/eventos; resposta textual `OK` e no máximo uma linha `CMD|uuid|action|symbol|volume|sl|tp|price|ticket|expiresAtMs`.
- Usuário FocoOS: GET feed / evaluate?source=mt5; POST commands / kill. APIs do bridge não exigem cookie de usuário; apenas o caminho POST exato exchange usa esse mecanismo.
- Banco: `trade_bridge_state`, batches, ticks, candles, commands, events, audit. Comandos têm chave única, claim serializado com advisory lock e sem redispatch. RLS server-only; nenhuma conta XP/token gravado nessas tabelas. Balance/margin são dados privados disponíveis apenas à API autenticada.
- Histórico de ticks/M1 pode crescer muito. Antes de operar diariamente, configure orçamento e retenção no projeto escolhido (ex.: arquivar ticks em storage depois de 30 dias). Preserve ledger de comandos, eventos e auditoria; não purgue dedup keys enquanto houver clientes capazes de repetir lotes antigos. A entrega não agenda limpeza destrutiva automaticamente.
- Rollover: com execução desarmada, atualize `TRADE_MT5_SYMBOL` no Cloudflare e `TradeSymbol` no EA, use novo gráfico e redeploy. Candles têm chave de símbolo, histórico do contrato anterior é preservado. Nunca concatene vencimentos silenciosamente para backtest.

## Validação

Testes TS/API + Postgres/PGlite validam autenticador, payload, idempotência, claim, lost response, sessão concorrente, RLS, gates e freshness. QA headless preserva replay/professor/diário; compile Functions + Next export. **Não substituem compilar MQL5 no MetaEditor, validar Wine/WebRequest nem homologar execução XP**. Checklist de conexão e ticks reais acima é o próximo gate, antes de qualquer ordem.
