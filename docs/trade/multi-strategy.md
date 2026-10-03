# Scanner multi-estratégia — entrega 03/10/2026

## Arquitetura e compatibilidade

A aplicação continua no repositório focoemcanto-pixel/focoemcanto, Next App Router exportado + Cloudflare Pages Functions. Não houve troca de autenticação, bridge, conta, tokens, fornecedor ou banco. Supabase hubfocoemcanto continua sendo a persistência operacional. Mock, Replay, XP/MT5, aprovação humana, diário, proteção de rollover e health existentes permanecem.

`trade/scanner/types.ts` define StrategyDefinition, StrategyEvaluator, StrategyCandidate, SetupWatch, ScannerResult, InstrumentSpecification. O scanner aceita um registro de evaluators; acrescentar uma implementação ao registro não exige editar o scanner. IDs/versões são chaves separadas em avaliações, watches e métricas. Definições publicadas são imutáveis; alterar parâmetros/regras exige nova versão. A autorização real permanece falsa.

## Estratégias efetivamente implementadas

Todas são hipóteses candidatas RESEARCH/PAPER; atividade na biblioteca significa que o avaliador funciona, não que possui vantagem estatística.

| ID | Regras principais |
|---|---|
| trend_pullback_confirmation_v1 | Estratégia original preservada: EMA 4/8 M15, impulso/retração/região M5, reação/confirmação/gatilho M1. |
| structure_breakout_v1 | Fechamento M1 fora dos extremos dos 20 candles anteriores, mais um tick. |
| breakout_retest_v1 | Candle anterior rompe estrutura conhecida; atual testa o nível e fecha retomando a direção. |
| support_rejection_v1 | Teste de suporte, pavio inferior ≥ 1,5 corpo, fechamento positivo acima do anterior. |
| resistance_rejection_v1 | Regra simétrica para resistência. |
| false_breakout_v1 | Extremo excede estrutura mais um tick, fechamento retorna e aponta para dentro. |
| structural_reversal_v1 | Contexto EMA M5 direcional; rompimento M1 em sentido oposto. |
| consolidation_expansion_v1 | Amplitude conhecida ≤ 5 ATR, barra atual > ATR e fechamento fora da estrutura. |
| range_rejection_v1 | Regime RANGE e rejeição confirmada de sua borda. |
| ema_continuation_v1 | Contexto EMA9/21 M5; teste da EMA9 M1 no candle anterior e rompimento do candle. |
| ema_cross_context_v1 | Cruzamento EMA9/21 M1 na direção M5, confirmado por quebra da barra anterior. |
| momentum_activity_v1 | Deslocamento de cinco barras ≥ ATR, atividade relativa de ticks ≥ 1,2 e quebra do candle anterior. |
| rsi_structure_recovery_v1 | RSI14 recupera faixa 30/70 e preço rompe o candle anterior. RSI isolado não confirma. |
| macd_structure_confirmation_v1 | MACD12/26/9 cruza na direção M5 com confirmação de preço. |
| structure_trend_activity_v1 | EMA M5, rompimento estrutural M1 e atividade relativa convergem. |

Os 14 novos avaliadores usam M5 + M1; o original declara M15 + M5 + M1. Não existe timeframe global obrigatório. São 15 implementações avaliáveis + 2 entradas indisponíveis, total 17.

## Famílias indisponíveis

VWAP/rejeição/recuperação: UNAVAILABLE_DATA. O bridge atual não declara de maneira confiável volume real negociado e cobertura integral da sessão. Tick volume serve apenas como proxy de atividade; não se fabrica VWAP financeira.

Abertura/range inicial: UNAVAILABLE_DATA. Calendário B3 e cobertura integral da abertura ainda precisam ser validados. Sessão nominal da especificação WIN não é calendário operacional.

Não há estratégia incompleta ativável pela interface.

## Features e regime

Features compartilhadas calculadas uma vez por scan: EMA9/21, RSI Wilder14, ATR Wilder14, MACD12/26/9, extremos prévios de 20 barras, volume médio das 20 anteriores, atividade relativa, momentum de cinco barras e contexto multi-timeframe. A barra atual não entra nos extremos nem na média usados para compará-la. Só entram candles fechados, sem completar buckets com lacunas.

TREND_UP/DOWN: separação EMA M5 > 0,2 ATR. RANGE: médias próximas e amplitude ≤ 6 ATR. EXPANSION/HIGH_VOLATILITY ou CONTRACTION/LOW_VOLATILITY: ATR atual comparado ao ATR 14 barras antes, razões ≥1,3 ou ≤0,7. UNCERTAIN quando regras não classificam. Essas classes podem coexistir; não predizem retorno. A elegibilidade declarada é aplicada pelo scanner.

## Parâmetros

`featureParameters`, `scannerParameters` e `pullbackParameters` centralizam todos os thresholds. Novas hipóteses: buffer de gatilho 1 tick, stop 2 ticks além da estrutura, stop mínimo 4 ticks/máximo 4 ATR, alvo 2R, validade 10 minutos, reteste 0,25 ATR, pavio/corpo 1,5, atividade relativa 1,2. Esses números são escolhas explícitas para pesquisa, não parâmetros otimizados em B3.

Agrupamento: mesma direção/estado, entradas distantes até 6 ticks e stops até 10 ticks. A primeira estratégia no registro é o representante técnico estável, não "a melhor"; participantes preservados internamente. Hipóteses confirmadas opostas exibem conflito e bloqueiam proposta.

## Scanner e estados

A cada novo fechamento, features → todos os avaliadores → resultados com condições e razões → agrupamento → watches. Estados do avaliador: REJECTED, INSUFFICIENT_DATA, UNAVAILABLE_DATA, FORMING, WAITING_TRIGGER, CONFIRMED, DISABLED. Não existe score arbitrário.

Estados persistidos: DETECTED → FORMING/WAITING_TRIGGER → CONFIRMED → PROPOSED → ACCEPTED → OPEN_PAPER → CLOSED_PAPER. Recusa humana é REJECTED_BY_USER; invalidação técnica/contexto é INVALIDATED; limite temporal é EXPIRED. Transições de domínio são explícitas e testadas. SQL registra também as transições relacionadas à aprovação e PAPER. Descartar uma observação é uma decisão de acompanhamento; NÃO ENTRAR decide uma proposta e preserva seu estudo hipotético.

`detectedAt`, `validUntil`, `confirmedAt`, `invalidatedAt`, `expiredAt`, versão, condições e participantes são preservados. Confirmações requerem fechamento; microticks não criam ordens antecipadas.

## Persistência e recuperação

Migration aditiva `20261003124510_multi_strategy_scanner.sql`: cinco tabelas novas — trade_strategy_versions, trade_scanner_state, trade_setup_watches, trade_strategy_evaluations e trade_human_decisions. Reutiliza trade_operation_proposals e trade_operation_journal, adicionando hypothetical_execution. Não cria tabelas paralelas de propostas/paper nem altera tabelas fora do Trade.

RPCs scanner_read/save usam chave owner/scope e compare-and-swap sob advisory lock. Decisão humana prevalece sobre atualização concorrente do scanner. Reads expiram propostas vencidas. Histórico de avaliações/condições separado da fotografia atual. Todos os objetos são backend-only, RLS habilitada, sem acesso anon/authenticated; funções SECURITY INVOKER e grants apenas service_role. Owner vem do middleware FocoOS, nunca do cliente.

Replay tem identificador de sessão persistido no navegador. Recuar/reiniciar cria outra sessão; servidor rejeita cursor anterior de uma sessão existente. Dados futuros não entram no avaliador. O scanner recupera watches do banco após reload. No primeiro vínculo live, começa na barra mais recente, sem fabricar propostas antigas.

## PAPER e decisão humana

Confirmação completa prepara proposta PAPER automaticamente com **um contrato**, limite conservador explícito. Quantidade nunca aumenta automaticamente. O seletor de propostas permite escolher entre hipóteses diferentes, recusas e posições. ENTRAR NO PAPER exige confirmação do usuário; NÃO ENTRAR registra recusa imutável. Não se confirma request/clique como execução: PAPER aguarda a próxima barra fechada e usa sua abertura para o fill.

Proposta tem referência, stop, alvo, pontos/R$, R:R, versão, condições e validade de 30 segundos do approvalPolicy existente. Confirmação recalcula a estratégia no servidor e exige mesmo setup/asOf. WIN: R$0,20/ponto/contrato quando metadados antigos do EA exigem fallback PAPER explícito. Outros instrumentos ainda não são habilitados. InstrumentSpecification permite evolução e mantém vencimento desconhecido como null, nunca inventado.

PAPER aceita tanto Mock/Replay como XP/MT5, sem chamar BrokerExecutionProvider nem criar comando. Stop prevalece se stop/alvo tocados na mesma barra; gaps adversos têm preço conservador. Gap antes da entrada que cruza stop/alvo cancela simulação. Entrada/P&L/resultado são recuperados da execução persistida mesmo quando a janela histórica desliza. Valores não incluem taxas/slippage adicional.

Recusas de proposta continuam sendo simuladas separadamente em hypothetical_execution, com o mesmo modelo causal; o diário mostra "Você não entrou. Resultado hipotético para estudo". Não contam como operações aceitas nem como performance de dinheiro real.

## Diário e métricas

Por ID/versão: detectados, confirmados, propostas, aceitos, recusados, encerrados, wins/losses/breakeven, R acumulado, pontos, R$ PAPER e R:R médio. Expectativa, taxa de acerto e ganho/perda médios só aparecem com ≥30 encerramentos. Trinta não comprova rentabilidade: rótulo explícito de amostra descritiva. API oferece também divisão por regime/hora de mercado (America/Sao_Paulo); participantes agrupados continuam registrados.

O backtest automático original continua disponível e claramente rotulado como laboratório legado. Não se mistura com operações PAPER decididas pelo usuário nem com estatísticas de outras versões. Não existe ranking pela performance do laboratório ou por amostra insuficiente.

## Interface e Professor

Setups em observação resume AGORA/EM FORMAÇÃO/CONFIRMADOS/PAPER ABERTOS e histórico. Cards revelam gatilho, condição faltante, região, níveis projetados, validade e confluências sob expansão. Biblioteca substitui a promessa "próximas famílias" com regras efetivas, indisponibilidades, parâmetros e amostra. Gráfico mantém apenas a hipótese em foco.

Professor recebe análise determinística da hipótese em foco e resumo do scanner. LLM continua opcional, qualitativo e proibido de inventar números. Referências vêm do servidor.

## Processamento e limites

Exchange do EA continua persistindo antes do ACK. Background waitUntil roda scanner/PAPER no máximo a cada 10 segundos, sem atrasar o HTTP200; candles iguais não recalculam o motor. Interface consulta scanner a cada 3s no MT5 e 5s no Replay; biblioteca reutiliza análise já carregada. Não há uma requisição por estratégia/tick.

Novas confirmações também exigem fechamento mais recente com idade ≤120s (threshold centralizado), além de tick/heartbeat frescos. Tick recente com histórico de candles atrasado não gera proposta. Background depende de heartbeats do EA. Sem EA/Internet não chegam candles novos; feed OFFLINE bloqueia novas confirmações e oculta P&L/preço atual. PAPER pode estudar barreiras nos candles persistidos quando chegam novamente; não reconstrói ticks inexistentes.

Limites conhecidos: candle intrabar usa precedência conservadora, sem fila/orderbook/spread/fills reais; calendário B3/VWAP indisponíveis; thresholds de pesquisa; 1 contrato por proposta automática; seletor de estratégias é informativo (não há editor arbitrário de parâmetros em produção); análises em formação não são previsões. Replay legado e novas decisões são conjuntos separados. Retenção/particionamento das avaliações deve ser dimensionado conforme uso.

## Arquivos principais e validação

Domínio: trade/scanner/{types,features,strategies,engine,service}. APIs: scanner, strategy-metrics, evaluate, operations, professor e callback de exchange. UI: ScannerPanel, OperationsPanel, TradeApp, trade.css. Migration nova e testes em tests/trade/scanner.test.ts; QA integrado em scripts/trade-ui-check.cjs.

Comandos: npm run typecheck:trade; npm run test:trade; npm run build; npm run build:trade-api; npm run test:trade:ui. Testes incluem indicadores, cada avaliador, fixtures de padrões, ausência de dados, estados, conflitos/agrupamento, multitimeframe, causalidade, dinheiro/R, PAPER, decisões, hipotético, banco/reload e execução bloqueada. PGlite executa a migration completa antes de produção.

Nenhum secret novo obrigatório. Execução real continua bloqueada: TRADE_EXECUTION_ENABLED=false, EnableExecution=false, kill switch bloqueado, liveAuthorized=false. Nenhuma ordem é enviada à XP nesta entrega.

## Próximos passos

Acumular Replay/PAPER por versão; revisar hipóteses com amostras e custos; validar sessões/volume real para VWAP/abertura; ampliar fixtures e análise por regime; definir política de retenção. Qualquer REAL exige projeto de validação e autorização separados, não incluídos nesta entrega.

## Resultado da entrega

- 67 testes de domínio/API/banco aprovados; 17 verificações de interface aprovadas.
- Typecheck, Next/export (8 assets) e Functions compilados.
- Migration aplicada ao hubfocoemcanto; read/write scanner testados com service_role em transação ROLLBACK, sem fixtures remanescentes.
- RLS dos novos objetos confirmada e execução de RPC anônima negada.
- Fingerprint de schemas fora do Trade e hash das funções de proteção do bridge idênticos antes/depois.
- Heartbeat real de xp-mt5-primary observado durante a entrega, com diagnostics da persistência disponíveis, execução explicitamente desabilitada, EA false, kill switch true e zero comandos.
- Mercado fechado no sábado: leitura histórica/heartbeat não equivalem a um tick LIVE atual. Próximo pregão validará formação de novos setups com dados de mercado recentes.
