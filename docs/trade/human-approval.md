# Aprovação humana obrigatória

A estratégia calcula; a API recalcula a proposta; o usuário confirma; o provedor acompanha o resultado efetivo. Nenhuma proposta, clique, HTTP 200, `OrderSend` aceito ou estado `observed` isolado é prova de preenchimento.

## Fluxo

1. Selecione Mock/Replay e PAPER. Um setup completo gera automaticamente a proposta com a quantidade configurada. **Preparar proposta** permite tentar novamente após falha de conexão.
2. Confira BUY/SELL, símbolo, entrada **a mercado** com referência, SL, TP, risco e potencial em pontos/R$, R/R e explicação.
3. A proposta fica **AGUARDANDO CONFIRMAÇÃO**, por 30 segundos. **DESCARTAR** é terminal. Propostas vencidas não podem ser enviadas. A análise deve continuar idêntica no instante da confirmação; mudança de candle exige nova proposta.
4. Só **CONFIRMAR OPERAÇÃO** chama a confirmação autenticada do servidor. A transação Postgres trava a proposta, registra a aprovação e cria no máximo um comando. Repetir a confirmação retorna o mesmo ciclo. O comando usa o UUID da proposta.
5. REAL passa pelo `MT5BrokerExecutionProvider.confirm`, gates existentes de conta/feed/kill switch/exposição e EA. PAPER nunca cria comando MT5: espera o candle seguinte visível e simula o mercado na abertura. Stop vence se stop e alvo estiverem no mesmo candle. Gap de stop recebe o preço pior da abertura. Sem taxas no PAPER.
6. ENVIANDO significa despacho/retorno ainda não resolvido; PENDENTE significa aceitação; EXECUTADA e PARCIAL exigem negócios efetivos (`DEAL_ENTRY_IN`), deduplicados pelo ticket. REJEITADA/CANCELADA vêm do retorno/estado efetivo ou de comando vencido ainda não enviado. Entrega incerta nunca é reenviada automaticamente.
7. Depois do fill, o painel mostra preço médio, volume executado, preço atual, P&L, SL/TP e risco até stop. Preço atual/P&L ficam ocultos com feed OFFLINE. Não encontrar posição não prova encerramento: é necessário histórico de negócios de saída reconciliado pelo identificador da posição. O resultado inclui comissão que o MT5 informar; outros custos/ajustes não recebidos não são inferidos.
8. Diário de operações fica disponível no próprio painel. Proposta, confirmação/descarte, transações MT5 e snapshots do acompanhamento ficam persistidos. Transações são registradas mesmo sem navegador aberto; PAPER com fonte ao vivo reconstrói o ciclo dos candles persistidos quando consultado. Replay só avança por ação humana.

## Implantação

Aplicar depois das migrations iniciais e do bridge:
`supabase/migrations/20261003042050_human_approval.sql`.

Usar os mesmos `TRADE_SUPABASE_URL` e `TRADE_SUPABASE_SERVICE_KEY` do bridge, somente no backend Cloudflare. Nenhum secret novo. Ambos os modos precisam dessa persistência transacional; não existe fallback de execução usando KV ou armazenamento do navegador. Não aplicamos a migration a um projeto Supabase ainda não escolhido.

RLS ligada, sem grants a anon/authenticated; apenas service_role. A autenticação existente de administrador e verificação Origin protegem as rotas. `owner_id=focoos-admin` corresponde ao acesso de administrador único atual; uma futura expansão multiusuário deve resolver identidade real no middleware, nunca receber owner do cliente.

`POST /api/trade/commands` está fechado. Além disso, trigger no banco rejeita qualquer novo comando sem proposta REAL confirmada com mesmo ID, direção, símbolo, quantidade, SL, TP, expiração e entrada a mercado. A migration cancela comandos legados ainda na fila que não têm prova de aprovação. Comandos de entrega incerta não são reenviados. Mudanças/fechamentos/cancelamentos arbitrários por esse endpoint também estão bloqueados; continuam os stops/alvos no MT5 e o fechamento manual no terminal. Um fluxo futuro de gerenciamento remoto exige sua própria aprovação humana.

A estratégia candidata continua PAPER, `liveAuthorized=false`. Não foi promovida nem autorizada para execução real. O fluxo REAL ficará bloqueado até uma estratégia ser validada e autorizada, além de configuração explícita dos dois gates. Não habilitar `TRADE_EXECUTION_ENABLED` nem `EnableExecution` durante o teste inicial de feed. O kill switch continua ligado por padrão.

## Valores centralizados

`trade/bridge/approval.ts`: validade 30s, multiplicador PAPER do WIN de R$0,20/ponto, moeda BRL. Referência oficial: https://www.b3.com.br/pt_br/produtos-e-servicos/negociacao/renda-variavel/futuro-mini-de-ibovespa.htm .

Fonte MT5 usa `SYMBOL_TRADE_TICK_VALUE / SYMBOL_TRADE_TICK_SIZE` e moeda da conta enviada pelo EA; moeda diferente de BRL ou valor inválido bloqueiam propostas. Não reutilizar o multiplicador mock para outro instrumento. Quantidade máxima vem de `TRADE_MAX_CONTRACTS` (padrão 1). Risco e potencial são estimativas na referência, sem taxas/slippage, não garantia de perda máxima.

## Validação

Testes Postgres locais verificam atomicidade, idempotência, bloqueio do caminho direto, descarte, expiração e RLS. Testes determinísticos verificam fills parciais, preço médio, ausência de fill após aceitação e causalidade PAPER. Interface headless usa a migration real em PGlite e valida confirmação PAPER, candle seguinte e ausência de comandos MT5, além de login/gráfico/Professor/mobile.

A compilação do EA e validação com XP/MT5 continuam necessárias no MetaEditor do Mac; não há terminal MQL5 nesta máquina. Não foi enviada nenhuma ordem real.
