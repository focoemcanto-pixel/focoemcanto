# Hipótese candidata — parâmetros explícitos

Fonte única de execução: `trade/core/strategy.ts`, `pullbackParameters`.
Os valores abaixo são **propostas para pesquisa**, não parâmetros otimizados ou validados em WIN real.
A versão de banco contém o snapshot inicial. Ao mudar parâmetros, criar nova versão e manter o snapshot/hash da execução; não reescrever resultados históricos.

| Parâmetro                  | Valor inicial | Significado                                                           |
| -------------------------- | ------------: | --------------------------------------------------------------------- |
| contextFastPeriod          |             4 | EMA rápida em candles 15m fechados                                    |
| contextSlowPeriod          |             8 | EMA lenta em candles 15m fechados                                     |
| contextSlopeBars           |             2 | Distância em candles para inclinação da EMA rápida                    |
| minContextSeparationPoints |            20 | Separação absoluta mínima entre EMAs; inclinação deve concordar       |
| structureLookbackBars      |            10 | Janela de candles 5m; último é separado da busca do impulso           |
| minImpulsePoints           |           150 | Amplitude mínima do impulso conhecido antes do pico                   |
| pullbackMinRatio           |          0.12 | Retração mínima relativa ao impulso                                   |
| pullbackMaxRatio           |          0.75 | Retração máxima relativa ao impulso                                   |
| supportTolerancePoints     |            65 | Distância máxima do fundo/topo do pullback à região conhecida         |
| reactionBodyMinPoints      |            15 | Corpo mínimo da reação na direção do contexto em 1m                   |
| confirmationCloses         |             2 | Fechamentos sequenciais na direção da reação, incluindo reação        |
| triggerBufferTicks         |             1 | Fechamento além do extremo do candle anterior, mais um tick           |
| stopBufferTicks            |             2 | Invalidação além do extremo do pullback/reação, menos/mais dois ticks |
| minStopPoints              |            20 | Distância técnica mínima da referência à invalidação                  |
| maxStopPoints              |           650 | Distância técnica máxima                                              |
| targetR                    |             2 | Alvo geométrico de duas vezes a distância técnica                     |
| cooldownMinutes            |            15 | Intervalo mínimo entre novos registros de setup                       |

Tick usado na simulação: 5 pontos. Não há multiplicador financeiro silencioso. A implantação de um instrumento real deve carregar a especificação vigente no catálogo.

Alta e baixa usam transformação simétrica de preços. Contexto só se forma após pelo menos 10 candles 15m fechados. O impulso é a diferença entre extremo conhecido e a origem precedente; pullback exige candles 5m posteriores ao pico. Região é a mais próxima entre EMA rápida de contexto, origem do impulso e metade do impulso. Não há Fibonacci ou detecção de pivôs com candles futuros.

A região e a reação usam apenas candles fechados. Gatilho é um fechamento 1m, não uma ordem automática no rompimento intrabar. Suporte/resistência desenhados são os extremos dos 10 candles 5m fechados, distintos da região candidata. EMA mostrada no gráfico usa o timeframe escolhido e não substitui a EMA de contexto 15m.

O alvo é geométrico; não há garantia de que o mercado o alcance. A condição de risco confere distância técnica, não risco sobre saldo de conta. Stop e alvo de referência não são ordens existentes na corretora.
