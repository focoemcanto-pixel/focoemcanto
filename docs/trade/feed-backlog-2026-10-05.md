# Feed STALE após reabrir o MT5 — diagnóstico e correção (05/10/2026)

## Sintoma
Com o Mac/MT5 reabertos e o EA enviando HTTP 200, o `/trade` mostrava STALE com idade de ~16.400 s, embora os candles e o gráfico estivessem atualizados.

## Evidência de produção (somente leitura, 18:32–18:39 UTC / 15:32–15:39 BRT)

| Item | Valor | Leitura |
|---|---|---|
| `received_at` (relógio do backend, UTC) | 18:36:57 | heartbeat atual |
| último candle M1 normalizado | 18:35 UTC (bruto 15:35, horário de parede da XP) | atual |
| tick em `state.tick`, bruto | `1791199077732` (rótulo 11:17:57) | — |
| tick em `state.tick`, normalizado uma vez | `1791209877732` = 14:17:57 UTC | — |
| relógio do backend | `1791225419260` = 18:36:59 UTC | — |
| idade | 15.541 s | **correta**: é o tick mais novo já gravado |
| lotes | 1000 ticks a cada 2 s (`MaxTickBatch`), cada um cobrindo 4–10 s de mercado | o tick avançou 12,5 min de mercado em 4 min reais |

## Causa raiz
A normalização de relógio estava correta e não aplicava offset em dobro. O defeito está no EA: em `TicksJson()`, a janela `TickRecoverySeconds` só valia quando `lastMsc==0`. Ao reabrir, o EA carregava de `cursor.txt` o cursor das ~10:52 BRT e reenviava **todo** o intervalo, tick a tick. Isso deixava o feed horas atrasado; sem correção, ele só alcançaria o tempo real perto do fechamento do pregão.

## Correção
- **EA v2.06:** se o cursor persistido for mais antigo que `TickRecoverySeconds` (300 s), o intervalo não é reenviado tick a tick. A lacuna vai em `state.tickGap` (`fromMsc`/`toMsc` no rótulo da corretora) e no log `TICK_BACKLOG_SKIPPED`, e o streaming retoma nos últimos 300 s. Os candles M1 continuam cobrindo o histórico. Nenhum tick é inventado.
- **Backend/UI (compatível com o v2.02):** `feedStatus` diagnostica um STALE com `staleReason`:
  - `TICK_BACKLOG`: heartbeat e candles M1 atuais, ticks antigos;
  - `NO_RECENT_TICKS`;
  - `TICK_IN_FUTURE`;
  - `CLOCK_MISMATCH`.

  O diagnóstico nunca promove a LIVE. LIVE continua exigindo um tick normalizado com no máximo `TRADE_FEED_MAX_AGE_MS` de idade.

## Semântica temporal (única)
- **Tick e candles:** o valor bruto é preservado (`rawTimeMsc`/`rawTimestamp` e `trade_bridge_ticks.time_msc`). O instante normalizado vem de `trade_bridge_market_epoch`, central em `trade_bridge_read`, e é consumido por `feedStatus`, pelo scanner, pela UI e pela readiness. No SQL, `trade_real_valid`, `trade_bridge_enqueue`, `trade_real_session_check` e `trade_real_arm` usam a mesma função.
- **`received_at` e `historyAsOfMsc`:** relógio UTC real (backend e `TimeGMT()` do EA).

## Ação necessária (MT5, uma vez, execução continua desligada)
1. MetaEditor → abrir `mt5/FocoTradeBridge.mq5` (v2.06) → Compilar → **0 errors**.
2. No gráfico WINV26: remover o EA e arrastar o v2.06 de novo, mantendo os mesmos inputs (**`EnableExecution=false`**).
3. Na aba Experts deve aparecer `Foco Trade v2.06` e, uma vez, `TICK_BACKLOG_SKIPPED`. Em seguida o `/trade` passa a LIVE, com idade de poucos segundos.

Não apague arquivos de `Common/Files`: cursor, sessão e pendências seguem preservados.
