# Homologação pré-real — 5 de outubro de 2026

Objetivo: PAPER operacional; pipeline REAL implementado e bloqueado. Nenhuma ativação financeira faz parte desta entrega.

## Resultado e limites da validação

O EA instalado v2.02 confirmou HTTP 200 / OK / gate LOCKED. A produção registra também a confirmação enviada pelo cliente (`lastExchangeHttpStatus=200`), heartbeat e batches progressivos. Nenhum token ou fingerprint completo é apresentado neste relatório.

O fluxo de inspeção REAL possui proposta e ID próprios, aprovação inicial, resumo, nonce de 20 segundos no máximo, consumo atômico e tentativa final explicitamente bloqueada. `inspectionOnly=true` é permanente: esta proposta nunca pode ser convertida em ordem, mesmo após uma futura ativação. O fluxo usa dados MT5 atuais e regras determinísticas; replay não pode produzir uma proposta REAL. Na ausência de um setup completo atual, o botão permanece indisponível. Não se fabricam setups para testar produção.

| Verificação | Evidência / estado |
|---|---|
| 1. Transporte | HTTP 200, resposta OK e ACK do cliente; zero CMD2 enquanto desarmado. |
| 2. Feed | Provider persistente, M1 agregado causalmente, timestamps UTC, gaps/duplicação/ordem detectáveis. LIVE/STALE/OFFLINE; REPLAY explícito. Mercado atual ainda exige comparação visual MT5/app na sessão. |
| 3. Identidade | Fingerprint inclui login e servidor; backend, política e EA precisam concordar. Sem pinning completo, bloqueio. Hash completo não é retornado pela API de readiness. |
| 4. Conta/modo | Modo netting/hedging validado pelos metadados; futura execução requer accountTradeMode=2 e política account_trade_mode=2. EA v2.03 acrescenta essa telemetria. Ausência bloqueia REAL. |
| 5. Contrato | Símbolo centralizado, expiração do MT5 e política, rollover confirmado e sessões datadas; sem rollover silencioso. |
| 6. Limites | Contratos, posições, risco, perdas em 24h, slippage; novos limites de contratos por posição, ordens por sessão/dia e nocional. Todos server-side, rechecados sob o lock financeiro. Limites não definidos bloqueiam. EA revalida conta, SL/TP, risco, perdas, contratos e slippage usando o menor limite local/remoto. |
| 7. SL/TP | Obrigatórios, alinhados ao tick, direção e distância mínima. Proteções compõem a mesma requisição de entrada. |
| 8. Dupla confirmação | Fluxo financeiro e fluxo separado de inspeção com resumo. Selecionar REAL não arma gates. |
| 9. Nonce | Hash persistido, prazo curto, single-use atômico; inspeção registra a tentativa bloqueada sem comando. Retry financeiro já confirmado devolve o mesmo ciclo, sem nova ordem. |
| 10. CMD2 | Canonicalização de 14 campos + HMAC-SHA256; EA verifica assinatura antes do ledger/OrderSend; alteração/expiração rejeitadas. |
| 11. Idempotência | Fixtures API/Postgres: confirmação, retry, resposta perdida, claim e restart preservam no máximo um comando. Ledger local precede OrderSend. Não há promessa de “exactly once” no broker: entrega desconhecida não é repetida. |
| 12. Timeout | dispatch_unknown / resultado indeterminado; sem redispatch automático. |
| 13. Reconciliação | OnTradeTransaction e histórico por order/deal/position, refs/seen e journal; EXECUTADA exige deal. Requisição aceita não equivale a fill. |
| 14. Estado indeterminado | RESULTADO INDETERMINADO exibido e bloqueia nova entrada até reconciliação. |
| 15. Kill switch | Server-side, rechecado antes de dispatch; permaneceu ativo. |
| 16. Gates | Backend, política, estratégia/versão, EA, identidade, contrato, feed, calendário, quantidade, SL/TP, risco, perdas, exposição, frequência, confirmação e assinatura independentes. |
| 17. PAPER | Replay e MT5 atuais; aprovação humana, fill no candle seguinte, resultado/diário causal, nenhum comando financeiro. |
| 18. REAL bloqueado | Revisão de proposta própria e tentativa final auditada; checklist compacto. A hipótese PAPER não é reutilizada como proposta REAL. |
| 19. Ordens XP | Zero comandos reais produzidos/enviados por esta homologação. |
| 20. Posições | Nenhuma posição aberta pela tarefa; snapshots MT5 permanecem sem posições/ordens. |
| 21. Migrations | 20261005091111_pre_real_homologation.sql; 20261005092318_pre_real_account_mode.sql. Aditivas, somente Trade. Nenhum valor de política financeira foi preenchido/ativado. |
| 22. Testes | 131 testes Trade aprovados; API/bridge/protocolo/engine/providers/Postgres, typecheck, Worker, Next export e 20 verificações QA Playwright desktop/mobile. Diálogo de inspeção verificado nos dois tamanhos. |
| 23. Commit | Consultar histórico deste documento e commit final da entrega. |
| 24. Deploy | Cloudflare Pages via main, confirmado antes da entrega final. |
| 25. Primeira ordem | Etapa separada, exige autorização explícita e validações abaixo. |

## Arquivos

- `app/trade/OperationsPanel.tsx`, `TradeApp.tsx`: modos, proposta independente, inspeção, diálogo, checklist e STALE.
- `functions/api/trade/operations.ts`: intenção server-side, isolamento de modo, inspeção sem assinatura/comando e auditoria.
- `trade/bridge/approval.ts`, `real.ts`, `mt5.ts`, `config.ts`: contrato de inspeção, gates adicionais, qualidade/freshness e erros sanitizados.
- `mt5/FocoTradeBridge.mq5`: v2.03 adiciona apenas accountTradeMode à telemetria; mantém execução false, protocolo 2 e recuperação v2.02.
- Duas migrations, testes `real`, `bridge`, `transport` e QA `scripts/trade-ui-check.cjs`.

## Antes de qualquer homologação financeira

1. Na sessão B3, comparar WINV26, Bid/Ask/Last, timestamps, M1, tickSize=5 e preço entre app e MT5. Verificar fresh/stale, reconexão e um restart real controlado. Não chamar histórico antigo de LIVE.
2. Compilar/carregar v2.03 antes da ativação financeira para informar accountTradeMode; manter EnableExecution=false e AlgoTrading desabilitado durante a verificação. A compilação MQL5 ocorre no MetaEditor do usuário e não foi simulada como teste Node.
3. Configurar pinning privado: TRADE_ACCOUNT_HASH, policy.account_hash e ExpectedAccountFingerprint com a mesma identidade verificada. O fingerprint já inclui o servidor; mudança de conta/servidor bloqueia automaticamente.
4. Aprovar valores de limites backend/EA, nocional/frequência, modo da conta, símbolo, expiração e calendário datado. Não foram inventados limites financeiros.
5. Backtest/paper suficiente e aprovação explícita de uma estratégia/versão para live-monitoring. As versões atuais permanecem não autorizadas.
6. Somente em outra etapa, com autorização explícita: liberar os gates deliberadamente, testar uma única ordem protegida e acompanhar deal, posição, proteção e reconciliação. Esta entrega não comprovou execução física/SL/TP na XP, porque nenhuma ordem foi enviada.

## Segurança do banco

RPCs security invoker, search_path vazio e execução exclusiva service_role. RLS nas tabelas operacionais; anon/authenticated sem acesso direto. Aviso informativo “RLS sem policy” é esperado nessas tabelas privadas: não adicionar acesso público para silenciá-lo. Os testes de produção das RPCs de inspeção usaram transação revertida, sem inserir comandos, alterar feed ou modificar gates financeiros.
