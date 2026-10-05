# Foco Trade — Modo REAL: sessão armável e prontidão operacional (06/10/2026)

Princípio: o Foco Trade **não é um robô**. Scanner, setup READY, selecionar REAL e armar a sessão **nunca** enviam ordem. Uma ordem REAL só existe com:

```
sessão REAL armada (temporária)
+ proposta READY (Risk Engine, quantidade ≥ 1)
+ clique em ENTRAR · ORDEM REAL
+ segunda confirmação explícita (nonce de 20 s + "CONFIRMAR ORDEM REAL")
+ todos os gates revalidados no backend (TS) e no Postgres (prepare, confirm e dispatch)
```

## 1. Auditoria — IMPLEMENTADO × CONFIGURADO × HOMOLOGADO

Estado de produção lido em 06/10/2026 (somente leitura, sem secrets):

| Item | Implementado | Configurado em produção | Homologado |
|---|---|---|---|
| Bridge MT5 (feed, lease, lotes) | sim | sim — feed recebido até 13:52 UTC | feed sim; execução não |
| EA instalado | v2.05 neste PR | **EA antigo**: sem `marketClock`/`accountTradeMode`, `EnableExecution=false`, limites locais 0, fingerprint vazio | não |
| Kill switch | sim | ativo (`true`) | testes PGlite |
| Policy REAL | sim | **vazia**: `enabled=false`, sem conta, símbolo, limites, vencimento | não |
| Autorização live por estratégia/versão | sim | **nenhuma** | não |
| `TRADE_EXECUTION_ENABLED` / `TRADE_ACCOUNT_HASH` | sim | não auditável daqui (variáveis do Cloudflare Pages); o backend reportou `executionEnabled=false` no último heartbeat | — |
| Risk Engine / RISK_BLOCKED | sim | migration `20261005150000` **aplicada nesta etapa** (faltava em produção) | testes |
| Sessão REAL armável | sim (este PR) | migration `20261006090000` **pendente** (aplicar no merge) | testes PGlite A–Q |
| Comandos / ordens | — | 0 comandos, 0 propostas REAL | nenhuma ordem enviada |

### Defeitos encontrados e corrigidos

1. **Relógio da XP (bloqueador de produção):** os ticks da XP chegam rotulados no horário de Brasília como se fosse UTC (migration `bridge_market_clock`). Três pontos comparavam o rótulo bruto com o relógio real e reprovariam **toda** ordem em produção:
   - `trade_real_valid` (prepare, confirm e dispatch);
   - `trade_bridge_enqueue` (confirmação final), que daria "Stale feed";
   - o EA (`FocoTradeBridge.mq5`), que comparava `tick.time_msc` com `TimeGMT()` e rejeitaria todo comando.

   Correção: o backend usa `trade_bridge_market_epoch`, e o EA v2.05 compara o tick com `TimeTradeServer()`. A expiração do comando continua em UTC real (`TimeGMT`).
2. **Janela datada diária:** a policy exigia uma `session_windows` datada contendo o momento atual, o que obrigaria editar o Supabase todo dia. Agora a sessão armada é a janela de operação. Janelas datadas continuam suportadas como restrição **adicional** opcional.
3. **Kill switch sem caminho seguro de liberação** e botão "Bloquear execução" exibido com tudo já bloqueado: corrigidos (seção 4).

## 2. Organização dos gates

| Categoria | Gates | Como se altera |
|---|---|---|
| **A. Estática (uma vez)** | execução backend (`TRADE_EXECUTION_ENABLED`), conta (`TRADE_ACCOUNT_HASH` + fingerprint do EA + modo REAL), protocolo/token/magic, símbolo, vencimento/rollover, policy e limites, limites locais do EA, metadados do contrato, autorização live por estratégia/versão | Cloudflare/EA uma vez; policy e autorizações pela **UI → Configuração REAL** |
| **B. Sessão (UI)** | sessão armada, kill switch, EA apto, bridge conectado, feed LIVE, pregão, reconciliação, comando indeterminado, perda diária, posições/ordens | **ARMAR SESSÃO REAL / BLOQUEAR EXECUÇÃO**; desarme automático |
| **C. Por operação** | proposta READY e fresca (≤ 120 s), quantidade/lote, preços/SL/TP/desvio, risco ≤ `max_risk_brl`, exposição, frequência, nonce, segunda confirmação | a cada ordem, sempre com confirmação humana |

Nenhum gate foi removido. Cada gate exibido traz o `scope` correspondente (`static`, `session` ou `operation`).

## 3. Sessão REAL armada

- **Armar:** UI → REAL → **ARMAR SESSÃO REAL** → checklist → duração (até `max_session_minutes`, padrão 120) → marcar ciência → **CONFIRMAR ARMAMENTO**.
  - O Postgres (`trade_real_arm`) revalida tudo. Se qualquer gate obrigatório falhar, a sessão **não arma** e a resposta lista os códigos que falharam.
  - Armar só libera o kill switch durante a sessão. Não cria proposta, comando nem ordem.
- **Expiração:** ao fim da duração escolhida, a sessão volta sozinha para REAL BLOQUEADO.
- **Desarme automático (definitivo até novo armamento):** a cada heartbeat do EA e a cada leitura de status são verificados:

  | Código | Condição |
  |---|---|
  | `EXPIRED` | duração da sessão esgotada |
  | `KILL_SWITCH` | execução bloqueada |
  | `BRIDGE_OFFLINE` | sem heartbeat por mais que `TRADE_FEED_MAX_AGE_MS` |
  | `FEED_STALE` | último tick antigo |
  | `BRIDGE_RESTARTED` | EA/MT5 reaberto (nova sessão de transporte) |
  | `ACCOUNT_CHANGED` | conta, fingerprint ou modo diferentes |
  | `SYMBOL_CHANGED` | símbolo diferente |
  | `POLICY_CHANGED` | policy alterada ou desabilitada |
  | `EA_EXECUTION_DISABLED` | EA sem permissão de execução |
  | `DAILY_LOSS_LIMIT` | perda diária máxima atingida |
  | `RECONCILIATION_PENDING` | falha de proteção, histórico indisponível ou comando indeterminado |

  Ao desarmar, o kill switch é ligado e os comandos ainda na fila são cancelados.
- **Mac/MT5 fechado:** o REAL fica impossível (`BRIDGE_OFFLINE`). Ao reabrir, o feed volta a LIVE, mas a sessão **não** é rearmada.

## 4. BLOQUEAR EXECUÇÃO (kill switch)

O botão aparece apenas com o REAL ARMADO, no cabeçalho e no painel REAL. Ele:

- impede novos comandos;
- desarma a sessão;
- cancela comandos ainda na fila.

Ele **não** fecha posições abertas e **não** cancela ordens que já chegaram à corretora. Gerencie isso no MT5; a interface avisa.

O kill switch só é liberado por um novo armamento: a API e o SQL recusam a liberação direta.

## 5. Risco REAL

- O limite vem de `trade_execution_policy.max_risk_brl`, apertado por `MaxRiskBRL` do EA quando menor. Sem limite configurado: **fail closed**.
- Exemplo 1 — limite R$ 100, stop de 300 pts, WIN a R$ 0,20/pt: risco de R$ 60 por contrato → **1 contrato**.
- Exemplo 2 — com risco de R$ 140 por contrato e o mesmo limite: **RISK_BLOCKED**, quantidade 0.
- O stop técnico nunca é alterado para caber no limite.

## 6. Configuração estática — uma única vez

1. **Supabase:** aplicar `20261006090000_real_session_arming.sql` (aditiva) junto com o merge deste PR. `20261005150000` já foi aplicada.
2. **Cloudflare Pages → Production → Variables and Secrets:**
   - `TRADE_EXECUTION_ENABLED=true`: só torna o pipeline capaz de executar. Continua sem ordem até armar e confirmar.
   - `TRADE_ACCOUNT_HASH`: o fingerprint exibido pelo EA na aba Experts.
   - `TRADE_MAX_CONTRACTS`: teto absoluto.
   - Conferir que `TRADE_BRIDGE_TOKEN` e `TRADE_MT5_SYMBOL` já estão configurados.
   - Fazer o redeploy.
3. **MT5 (no Mac):** abrir no MetaEditor o `mt5/FocoTradeBridge.mq5` **v2.05** deste repositório, compilar com **0 errors** e reinstalar no gráfico WINV26 com:
   - `EnableExecution=true`;
   - `ExpectedAccountFingerprint` = mesmo valor de `TRADE_ACCOUNT_HASH`;
   - `MaxContracts`, `MaxRiskBRL`, `MaxLoss24hBRL` e `MaxSlippagePoints` > 0 (limites locais que espelham a policy);
   - `MaxPositions=1`;
   - Algo Trading ligado no terminal.

   Com `EnableExecution=true` o EA fica apto a receber comandos, mas só recebe um comando assinado (HMAC) que o backend libera depois de sessão armada, proposta READY e confirmação final. Ele repete as próprias verificações (conta, símbolo, sessão, tick, limites, `OrderCheck`).
4. **UI → REAL → Configuração REAL · uma vez:**
   - preencher limite por operação, perda diária, desvio, contratos, exposição, ordens por sessão/dia e duração máxima da sessão;
   - confirmar o contrato vigente;
   - marcar "Permitir sessões REAL";
   - **SALVAR CONFIGURAÇÃO REAL**;
   - **Autorizar** as estratégias/versões que deseja operar.

   No rollover (troca de contrato): atualizar `TRADE_MT5_SYMBOL` e o `TradeSymbol` do EA, e então salvar a configuração de novo.

## 7. No dia de operar

1. Abrir o Foco Trade e selecionar XP / MetaTrader 5 → REAL.
2. Conferir no painel: feed LIVE, conta confere, EA apto, limites.
3. **ARMAR SESSÃO REAL**: checklist → duração → confirmar.
4. Escolher a proposta READY. A tela mostra direção, entrada, stop, alvo, R/R, risco por contrato, limite, quantidade, risco total, potencial e validade.
5. Clicar **ENTRAR · ORDEM REAL** e conferir "VOCÊ ESTÁ PRESTES A ENVIAR UMA ORDEM REAL À XP".
6. **CONFIRMAR ORDEM REAL** ou **CANCELAR**.
7. Ao terminar: **BLOQUEAR EXECUÇÃO**, ou deixar a sessão expirar.

Validade: a proposta vale 30 s e a confirmação final vale 20 s. Se algo mudar no meio do caminho, o backend aborta e é preciso gerar uma nova proposta.

## 8. Testes desta etapa

Arquivo `tests/trade/real-session.test.ts`: PGlite com todas as migrations e relógio XP de produção (BRT), EA simulado por heartbeats SQL e fetch restrito ao host local (qualquer outro host falha o teste). Casos cobertos:

| Caso | Situação | Resultado esperado |
|---|---|---|
| A | selecionar REAL | nenhuma ordem |
| B | armar | nenhuma ordem |
| C | armado + READY | nenhuma ordem |
| D | ENTRAR | só nonce, nenhum comando |
| E | confirmação válida | comando assinado entregue **só ao EA simulado** |
| F | offline | não arma / desarma |
| G | feed stale | desarma |
| H | kill switch | desarma, cancela a fila, não libera |
| I | sem `max_risk_brl` | não arma |
| J | RISK_BLOCKED | nunca executa |
| K | fingerprint trocado | desarma / não arma |
| L | símbolo trocado | desarma |
| M | snapshot vencido | aborta |
| N | nonce inválido/expirado | aborta |
| O | confirmação ausente/incorreta | aborta |
| P | sessão expirada | desarma |
| Q | MT5 reaberto | feed volta, sessão não rearma |

Nenhuma ordem REAL foi enviada nesta homologação.
