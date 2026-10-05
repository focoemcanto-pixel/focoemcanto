# Da hipótese à proposta — 05/10/2026

Escopo: feed real → scanner → hipótese → gatilho → confirmação → proposta técnica → dimensionamento pelo risco. Nada aqui envia ordem: PAPER e REAL continuam exigindo a decisão humana já existente, e o REAL permanece fail-closed.

## Causa raiz 1 — warm-up global do scanner

Depois da correção de estrutura da sessão atual (`decisionSnapshot`/`currentStructure`), cada `RuleStrategy` exigia `ctx.emaFast/emaSlow` do M5 — 22 barras M5 da sessão atual (~110 minutos) — mesmo quando a regra só lê M1. Resultado: as 14 RuleStrategy ficavam em `INSUFFICIENT_DATA` durante quase duas horas de pregão e o painel não mostrava nenhuma hipótese.

Reprodução determinística (replay, mesmos candles, `scanMarket`):

| Barras M1 da sessão | `main` antes: RuleStrategy em INSUFFICIENT_DATA | Depois (v1.2.0) |
|---|---|---|
| 30 | 14/14 | 6/14 (2 confirmadas, 2 em formação) |
| 60 | 14/14 | 6/14 (2 aguardando gatilho) |
| 109 | 14/14 | 6/14 |
| 110 (22 M5) | 0/14 | 0/14 |

Correção: requisitos de dados **por regra** (`StrategyDefinition.dataRequirements`), `RuleStrategy` **v1.2.0**.

| Regra | Requisitos |
|---|---|
| structure_breakout, breakout_retest, support_rejection, resistance_rejection, false_breakout, consolidation_expansion, momentum_activity, rsi_structure_recovery | M1: 22 barras da sessão atual |
| structural_reversal, ema_continuation, ema_cross_context, structure_trend_activity, range_rejection | M1: 22 + M5: 22 (contexto EMA9/21 ou regime RANGE no M5) |
| macd_structure_confirmation | M1: 35 (MACD12/26/9) + M5: 22 |
| trend_pullback_confirmation_v1 (inalterada) | M15: 10, M5: 10, M1: 3 |

Preservado: estrutura somente da sessão atual (níveis herdados de sessões antigas nunca viram stop), invalidação de watches de versão incompatível (a troca para 1.2.0 invalida watches 1.1.0 em vez de reutilizá-los), IDs de setup com versão, validação central de níveis/projeções e replay sem acesso ao futuro.

## Hipóteses visíveis

`scanMarket` agora devolve `hypotheses` (uma por estratégia cadastrada) e `desk` (veredito da mesa). Cada hipótese tem estágio, condições atendidas/total, o que falta, bloqueios com código, pontuação explicada por fatores, posição, projeção preliminar e, quando aquecendo, barras por timeframe e horário previsto.

Estágios: `CONFIRMED`, `WAITING_TRIGGER`, `FORMING`, `FAR` (em formação com pontuação < 50), `REJECTED`, `WARMING_UP`, `UNAVAILABLE_DATA`, `DISABLED`.

A pontuação é diagnóstica: pesos dados 10, contexto 20, padrão 25, gatilho 30, risco técnico 15; o gatilho recebe crédito parcial linear pela distância até o nível (zero a 1 risco técnico de distância). **Nunca confirma, promove ou propõe nada**: `CONFIRMED` vem exclusivamente das regras.

## Causa raiz 2 — risco confundido com validade do setup

Um setup confirmado cujo stop técnico era largo demais para o orçamento simplesmente não aparecia como proposta (falha de `makeProposal`/quantidade), dando a impressão de que o setup não existia. A correção separa três coisas:

```
buildTechnicalProposal(...)   ← setup confirmado: direção, entrada, stop técnico, alvo, distâncias, R/R, snapshot, validade
        ↓
sizeProposal(...)             ← Risk Engine central (trade/core/risk-engine.ts · sizePosition)
        ↓
READY (quantidade ≥ 1)  ou  RISK_BLOCKED (quantidade 0)
```

O Risk Engine pode alterar **quantidade, risco financeiro total e elegibilidade**. Não pode alterar entrada, stop ou alvo para caber no orçamento.

### Exemplo de referência

SELL · entrada 208.495 · stop 210.885 · alvo 203.715 → stop de 2.390 pontos. WIN: R$ 0,20 por ponto por contrato → risco mínimo de 1 contrato = 2.390 × 0,20 = **R$ 478,00**.

Com limite R$ 100,00: setup técnico **válido**, proposta técnica **existe**, quantidade **0**, status **RISK_BLOCKED / BLOQUEADA POR RISCO**, risco mínimo R$ 478,00, diferença **R$ 378,00**. A interface mostra “NÃO EXECUTÁVEL COM O LIMITE ATUAL”. Nenhum stop é aproximado, nenhuma ordem é enviada. Com limite R$ 1.000,00 a mesma proposta técnica fica READY com 2 contratos (R$ 956,00). Coberto em `tests/trade/hypothesis-proposal.test.ts`.

## PAPER

Limite por operação: `TRADE_PAPER_MAX_RISK_BRL`; fallback `TRADE_MAX_RISK_BRL`. Sem nenhum dos dois, vale o valor legado de **R$ 100 identificado como `compat-default`** (exibido na interface como valor de compatibilidade, nunca como decisão silenciosa). Valor explícito inválido (≤ 0, texto) **não** cai no default: bloqueia (`RISK_LIMIT_NOT_CONFIGURED`).

RISK_BLOCKED no PAPER: persistido como `BLOQUEADA POR RISCO` (quantidade 0), nunca passa pelo `PaperExecutionProvider`, não pode ser confirmado (endpoint, provider, constraint e trigger no banco). Fica em **observação hipotética para estudo**: resultado (stop/alvo), R, MFE/MAE em pontos e em R, duração — sem valor financeiro, sem preenchimento. Na confirmação de uma proposta READY o limite PAPER atual é conferido de novo.

## REAL

Nada foi simplificado. O REAL continua exigindo todos os gates de `realReadiness` (execução backend, policy, autorização live por estratégia/versão, kill switch, EA, bridge, feed LIVE, conta/modo, protocolo/magic/token, símbolo, vencimento/rollover, sessão, limites, reconciliação, comandos indeterminados, perdas/exposição, proposta fresca) e a dupla confirmação humana (nonce + “CONFIRMAR ORDEM REAL”). Nenhuma ordem automática; nenhuma ordem por detecção do scanner (o scanner só cria propostas PAPER).

Limite REAL: somente `trade_execution_policy.max_risk_brl` (apertado pelo `localLimits.maxRiskBRL` do EA quando menor). **Sem `max_risk_brl` na policy: RISK_BLOCKED (`RISK_LIMIT_NOT_CONFIGURED`)** — nunca R$ 100.

Novo gate `sizing`: só uma proposta `READY` com quantidade ≥ 1 pode ficar pronta. RISK_BLOCKED nunca gera readiness executável, assinatura, nonce, chamada ao provider REAL, proof de confirmação ou comando MT5 (bloqueado no endpoint, no `MT5BrokerExecutionProvider`, no gate e por triggers no Postgres).

## Migration

`supabase/migrations/20261005150000_risk_blocked_technical_proposal.sql` (aditiva): estado `BLOQUEADA POR RISCO`, watch `RISK_BLOCKED`, constraints de consistência (quantidade 0; RISK_BLOCKED nunca CONFIRMADA), linha bloqueada terminal, guards em `trade_bridge_commands` e `trade_real_confirmations`, `trade_propose` com mesma deduplicação, observação hipotética e leitura de operações estendidas. Não apaga nem reescreve dados.
