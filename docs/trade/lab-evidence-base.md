# Foco Trade — LAB: base de evidência (06/10/2026)

O objetivo do LAB é acumular evidência própria. O sistema **não** altera estratégias sozinho:

dados → hipótese → backtest/replay → PAPER → comparação → proposta de alteração → aprovação humana → nova `strategy_version`.

## Domínio

| Termo | Significado | Onde fica |
|---|---|---|
| SETUP | O mercado satisfez as condições técnicas de uma estratégia/versão. | `trade_setup_watches` (detecção e ciclo do scanner) e `trade_setup_observations` (um registro por setup confirmado) |
| PROPOSTA | Possível operação calculada a partir do setup (Risk Engine, READY/RISK_BLOCKED). | `trade_operation_proposals` |
| ORDEM | Instrução enviada ao broker. | `trade_bridge_commands`, só REAL, e bloqueado nesta fase |

Um setup pode existir sem proposta executável. Uma proposta pode ser bloqueada por risco e continuar sendo acompanhada.

## Observação de setup (`trade_setup_observations`)

- **Identidade.** Um registro por *watch* do scanner (`obs:<scope>:<watchId>`, único por owner/scope/watch). O mesmo setup que persiste entre polls ou candles mantém o watch; uma nova oportunidade abre outro watch. O polling de 2 s não duplica nada.
- **Snapshot imutável** (`setup-snapshot-v1`). Inclui:
  - origem e scope;
  - símbolo;
  - estratégia, versão e definição completa (com hash md5);
  - direção e timeframes;
  - `detectedAt`, `confirmedAt` e `marketAsOf`;
  - referência, entrada, stop, alvo, riscos/potenciais em pontos e em R$ por contrato, e R/R;
  - cada condição com o seu resultado;
  - regimes determinísticos (M5);
  - features já calculadas pelo scanner em M1/M5/M15: EMA9/21, ATR, RSI, MACD, suporte, resistência, volume relativo, momentum e faixa de 20 barras;
  - distâncias derivadas;
  - hora e dia da semana em BRT;
  - bid, ask, last e spread do momento.

  Nada é inventado: o que não existe fica `null`. Um trigger impede alterar snapshot, identidade e versão; eventos são append-only; nenhuma observação é apagada.
- **Ciclo de decisão (`lifecycle`).** Estados possíveis: CONFIRMED → PROPOSED | BLOCKED_RISK | MISSED | INVALIDATED | CANCELLED (conflito); PROPOSED → IGNORED | EXPIRED | PAPER_ACCEPTED → PAPER_ACTIVE → PAPER_CLOSED. As transições vêm de um trigger sobre as propostas e do scanner, e cada mudança gera um evento em `trade_setup_observation_events`.
- **Desfecho (`outcome`, `outcome-v1`).** Todo setup confirmado é acompanhado, operado ou não:
  - **Barras usadas:** só as barras M1 a partir da confirmação (causal), com entrada hipotética na referência.
  - **Resultados possíveis:** TARGET_FIRST, STOP_FIRST ou EXPIRED (horizonte de 240 min, com resultado marcado no fechamento).
  - **Stop e alvo no mesmo candle:** vira AMBIGUOUS, a menos que os ticks (`trade_bridge_ticks_window`, sem copiar ticks) provem a ordem. Gap pela abertura é resolvido pela própria barra; um gap pelo stop rende menos que −1R.
  - **Métricas registradas:** MFE/MAE em pontos e em R, tempo até alvo/stop, barras acompanhadas e resultado em R.
  - **Imutabilidade:** o desfecho final não muda mais.

## Confluência e atribuição por estratégia

Uma oportunidade de mercado gera **uma** observação, **um** desfecho, **uma** proposta e, no máximo, **uma** operação PAPER. Isso preserva a deduplicação do scanner.

**Prova de participação.** Outra estratégia do mesmo grupo de deduplicação recebe crédito analítico só se tiver tudo isto:

- estado CONFIRMED **no mesmo candle** da confirmação;
- todas as condições dela própria atendidas;
- a mesma direção.

Essa prova vai para `snapshot.participantEvidence`, que é imutável e guarda estratégia, versão, `configHash`, `confirmedAt`, condições e níveis. Uma estratégia apenas em formação, ou que confirma depois, não recebe o resultado (não há look-ahead).

**Na estatística:**

- cada estratégia confirmada recebe o desfecho **hipotético** na própria estatística (papel PARTICIPANT, mostrado como "N como participante");
- `opportunities` conta cada oportunidade uma vez (N global);
- PAPER_FORWARD é creditado só à estratégia cujos níveis foram operados;
- uma estratégia que também tem observação própria da mesma oportunidade conta uma vez só.

## Entrada disponível ≠ hipótese válida

AGUARDANDO GATILHO → SETUP CONFIRMADO → PROPOSTA READY → **ENTRADA DISPONÍVEL · Ns** → ENTRADA EXPIRADA.

- O cronômetro usa o `expiresAt` do **backend**, ajustado pela diferença entre o relógio local e o do servidor (header `Date`).
- Uma proposta expirada nunca exibe botão de entrada.
- O backend também recusa: o SQL `trade_confirm` marca EXPIRADA, e no feed LIVE a actionability recusa MISSED, INVALIDATED e EXPIRED.

## Validade da proposta (`actionability-v1`)

Medida contra a **cotação atual** (compra no ask, venda no bid):

| Status | Condição |
|---|---|
| EXPIRED | validade da proposta encerrada |
| INVALIDATED | preço além do stop |
| MISSED | alvo já tocado, ou preço se afastou mais de 0,25R da referência, ou R/R no preço atual < 1,5 |
| NO_QUOTE | sem cotação |

O sistema **não persegue preço**:

- um setup MISSED ou INVALIDATED na confirmação não gera proposta, mas continua acompanhado;
- o aceite PAPER sobre dados LIVE é recusado se a proposta não estiver ACTIONABLE.

Feed STALE não confirma setups, então não há proposta acionável.

## PAPER como laboratório

A execução PAPER registra:

- entrada planejada e entrada efetiva, pelo modelo explícito `next-bar-open-v1` (mercado na abertura do próximo candle fechado);
- slippage simulado, quantidade, risco e R/R planejados;
- abertura e fechamento, motivo de saída;
- resultado em pontos, R$ e R;
- MFE, MAE e duração.

A execução PAPER é copiada para a observação (`paper`) pelo trigger. O PAPER nunca cria comando de broker.

## Registry de estratégias

`trade_strategy_versions` ganhou `config_hash` (md5 da definição), `status`, `activated_at` e `deactivated_at`. Cada observação grava o hash da definição usada.

Se a mesma versão aparecer com definição diferente da registrada, é gravado um evento `REGISTRY_MISMATCH`: mudança de lógica exige nova versão. As observações da v1.2.0 continuam ligadas à v1.2.0 mesmo depois de existir uma v1.3.0.

## Estatística (`lab-v1`, `trade/lab/analytics.ts`)

**Datasets nunca misturados:**

| Dataset | Conteúdo |
|---|---|
| `LIVE_DETECTED` | todos os setups LIVE confirmados, com desfecho hipotético; inclui bloqueados, ignorados, perdidos e expirados (evita viés de seleção) |
| `PAPER_FORWARD` | resultado efetivo das operações PAPER |
| `REPLAY` | setups detectados no replay |
| `BACKTEST` | reservado |
| `REAL` | reservado e bloqueado |

Os agrupamentos são sempre estratégia × versão × dataset.

**Métricas:** N resolvido, ambíguos/expirados/abertos, acerto e perda, expectativa (R médio), profit factor, R médio de ganho e de perda, MFE/MAE médios, tempo médio, drawdown máximo em R, maior sequência de perdas, distribuição de R e curva acumulada.

**Status, por critérios documentados (nunca só pelo acerto):**

| Status | Critério |
|---|---|
| AMOSTRA INSUFICIENTE | N < 30 |
| DEGRADANDO | expectativa das últimas 20 < 0 com expectativa total > 0 |
| PROMISSORA | N ≥ 50, expectativa ≥ 0,1R e profit factor ≥ 1,3 |
| EM OBSERVAÇÃO | nos demais casos |

**Segmentos:** hora (BRT), dia da semana, direção, regime M5, alinhamento com a tendência M5 e faixa de R/R. Cada segmento só é descrito com a própria amostra (N ≥ 30).

**Separação de camadas:** DADO (observações) → ESTATÍSTICA (determinística, neste módulo) → INTERPRETAÇÃO (UI/IA só explicam esses números; não inventam correlações).

**Períodos de pesquisa:** `trade_lab_periods` declara EXPLORATION, VALIDATION e FORWARD_PAPER por estratégia/versão, para não otimizar e validar com os mesmos dados.

## UI

- **Aba LAB:**
  - funil do dia: detectados, confirmados, PAPER, ignorados, bloqueados por risco, perdidos/expirados e desfechos;
  - cartões por estratégia/versão/origem, com N, status e motivo;
  - métricas, curva de R acumulado (com tooltip e tabela), distribuição de R e contextos;
  - setups recentes, com dados AUTOMÁTICOS separados das NOTAS do usuário.
- **Copiloto:** o setup confirmado mostra EXECUTÁVEL EM PAPER, BLOQUEADA POR RISCO, PROPOSTA EXPIRADA, PERDIDA ou INVALIDADA.

## Segurança

Nenhuma leitura do LAB seleciona `account_hash`, token ou fingerprint. Nenhuma estatística altera gates: REAL continua bloqueado (`TRADE_EXECUTION_ENABLED=false`, kill switch ativo, policy desabilitada).

## Retenção de ticks (`20261007090000_tick_retention.sql`)

**Regra:**

- mantém os **5 pregões mais recentes presentes na base**, não 5 dias corridos;
- um pregão é uma data BRT, no relógio de mercado normalizado, com pelo menos 1.000 ticks;
- fins de semana, feriados e ticks de teste não reduzem a janela;
- o cutoff é 00:00 BRT do pregão preservado mais antigo, e só os ticks anteriores a ele são removidos.

**Execução:**

- `trade_tick_retention_plan` é a prévia somente leitura;
- `trade_tick_retention_run` processa no máximo 10 lotes de 20 mil linhas por chamada, em transação curta;
- não roda entre 08:30 e 18:45 BRT em dia útil;
- o pg_cron chama a função a cada 10 min, das 19:00 às 23:50 BRT.

**Auditoria:** cada execução fica em `trade_tick_retention_runs`, com cutoff, sessões preservadas, quantidade a remover e removida, linhas preservadas e tamanho antes/depois.

**Segurança:**

- com menos de 5 pregões, nada é apagado;
- somente `trade_bridge_ticks` é tocada.

**Dependências auditadas:** a ingestão lê só o último tick; o LAB lê uma janela de ≤120 s dentro do horizonte de 240 min. Scanner, replay, PAPER, REAL e auditorias usam candles, estado e comandos.

## Retenção

- Observações: uma por setup confirmado (dezenas por dia).
- Eventos: alguns por setup.
- Ticks não são copiados.
- `trade_strategy_evaluations` grava uma linha por estratégia por candle (~8,5 mil/dia).
- `trade_bridge_ticks` já passa de 790 MB e não tem retenção. Recomenda-se uma política de arquivamento (fora do escopo desta fase).

## Gestão de risco PAPER (`20261007100000_paper_risk_settings.sql`)

**Origem.** Substitui o limite fixo de compatibilidade de R$100 (`paperCompatMaxRiskBRL`, origem `compat-default`). Não há mais fallback por código nem por variável de ambiente: sem configuração salva, a proposta PAPER fica RISK_BLOCKED.

**Persistência.** A configuração fica em `trade_risk_settings_versions`, uma tabela só de inserções (append-only): cada gravação é uma versão nova, com `config_hash`. O banco valida tudo e calcula o 1R:

- `FIXED_BRL`: 1R = valor fixo em R$;
- `PCT_CAPITAL`: 1R = capital × % / 100, com no máximo 10% e 1R ≤ capital.

O capital operacional é um número de planejamento; não é o saldo da corretora.

**Quantidade.** O Risk Engine usa o 1R persistido como orçamento de risco por operação:

- quantidade = min(⌊1R / risco por contrato⌋, máximo de contratos);
- se 0, a proposta é RISK_BLOCKED;
- o stop técnico nunca muda.

**Limites diários (dia em BRT, política `GROSS_LOSSES_PLUS_OPEN_RISK_V1`).** Só operações PAPER aceitas no mercado LIVE (fonte `mt5`) consomem os limites. Replay é treino; LIVE_DETECTED e desfechos hipotéticos nunca consomem.

- Orçamento consumido = soma das **perdas** realizadas do dia, em valor absoluto. Um ganho posterior **não** devolve o orçamento; o P&L líquido é mostrado à parte.
- Risco aberto = risco inicial integral de cada posição PAPER aberta. O PAPER não move stop nem faz parcial, então nada reduz esse risco.
- Uma entrada é recusada quando: perdas do dia ≥ limite; operações do dia ≥ máximo; ou perdas + risco aberto + risco da nova entrada > limite.
- Scanner, hipóteses e LAB continuam funcionando.

**Quantidade.**

- **Sugerida** = mín(⌊1R / risco por contrato⌋, máximo de contratos).
- **Redução:** o usuário pode diminuí-la na confirmação (`trade_paper_quantity` guarda a sugerida e a escolhida), nunca aumentá-la. Ao tentar, a recusa explica: "3 contratos arriscariam R$ 114,00, acima do seu limite de R$ 100,00."

**Mudança de configuração.**

- A proposta pendente ou bloqueada criada com uma versão anterior é substituída automaticamente por uma nova, já redimensionada, enquanto o setup continua válido.
- A pendente é expirada. A bloqueada é terminal por desenho e permanece como registro de estudo.
- No diário fica `SUBSTITUIDA_GESTAO_RISCO`.

**Autoridade.** No aceite PAPER, `trade_paper_entry_check` exige:

- a mesma versão da configuração usada para dimensionar a proposta;
- risco ≤ 1R;
- limites diários disponíveis.

**Histórico.** Cada proposta guarda `payload.riskSettings` (versão, hash, capital, 1R e limites). Mudanças futuras nunca reescrevem esse registro.

## Readiness (fonte única)

`trade/bridge/readiness.ts` separa as dimensões:

| Dimensão | Valores |
|---|---|
| Dados de mercado | LIVE / STALE / OFFLINE |
| Bridge | conectado / desconectado |
| EA | conectado / desconectado |
| Execução no EA | habilitada / desabilitada |
| Execução no backend | habilitada / desabilitada |
| Sessão REAL | armada / não armada |
| Policy | válida / inválida / ausente |
| Kill switch | ativo / liberado |
| Estratégia | autorizada / não autorizada |
| Conta | verificada / não verificada |

- O dado de mercado usa o mesmo `feedStatus` do header.
- Um EA conectado com EnableExecution=false aparece como **CONECTADO + EXECUÇÃO DESABILITADA**.
- Contexto indisponível aparece como **DESCONHECIDO**, nunca como OFFLINE.

**Causa do erro "Não foi possível acessar a persistência Trade".** `trade_bridge_read` (e `trade_real_context`, que o usava) devolvia cerca de 344 KB por chamada, com 2.000 candles. Isso dava média de 443 ms e picos de 7 s na borda. Somado a uma janela de deploy antes da migration (404 de `trade_real_session_check`), fazia o painel REAL cair em "Feed OFFLINE / desconectado".

**Correção.**

- `trade_bridge_status` (estado + tick, sem candles) passa a ser usado pelo contexto REAL, pelo health, pela checagem de preço do PAPER e pelo diagnóstico.
- O `execution-status` sempre devolve as dimensões, e o erro aparece com código, operação e HTTP.

## Retenção de ticks nesta fase

O agendamento roda **só em dry-run**: registra diariamente o que seria removido, sem apagar nada. Ativar a deleção é uma decisão explícita futura.
