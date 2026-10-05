# Foco Trade — Risk/Position handoff — 2026-10-05

## Safety baseline
- Market data may be LIVE while execution remains PAPER.
- REAL stays fail-closed and requires the existing explicit gates/human confirmation.
- Never infer execution from HTTP success; reconcile broker state.

## Production defect fixed before this handoff
The 2026-10-05 live session exposed a cross-session structure bug: a ~208k WIN hypothesis inherited a ~193k region/stop. Commit `436db50412bca5d44cd5b02c49261aa59dad26f3` introduced session-contiguous decision structure, central price/risk invariants, rejection of invalid projections, strategy version 1.1.0 and fail-closed proposal validation. Historical chart data remains available; execution structure does not cross sessions/gaps.

## Risk/position primitives added after Work credits ended
- `trade/core/risk-engine.ts`: capital/risk budget, daily loss limit, simultaneous open-risk cap, instrument specification and technical-stop-based sizing.
- `trade/core/position-management.ts`: monotonic trailing, breakeven state, partial exits, realized R/BRL, open risk and protected profit.
- `trade/core/analytics.ts`: sample size, win rate, avg win/loss R, expectancy, net R, max/current drawdown, loss streaks, MFE/MAE summaries and environment separation.
- `tests/trade/risk-management.test.ts`: regression examples for WIN sizing, zero-contract rejection, daily/open-risk gates, breakeven, non-loosening trailing, partial realization and analytics.

These are deterministic domain primitives. Strategy-specific use must be opt-in and tested; their existence does not make breakeven, partial exits or trailing universally superior.

## Learning/engine roadmap
Architecture should remain ready for: volatility/ATR regimes; session context/opening range; volume/tick activity; VWAP; EMA/SMA context; RSI/MACD/momentum; multi-timeframe support/resistance with age/session/test metadata; spread/slippage/costs; MFE/MAE and post-exit excursion; accepted vs rejected setup tracking; independent confluence groups; strategy correlation; calibrated scores only with evidence; sample-size gates; BACKTEST/REPLAY/PAPER/REAL separation; out-of-sample/walk-forward validation; overfitting controls; event/anomaly flags; gaps; and internal circuit breakers.

## Required product principle
`DATA -> CONTEXT -> HYPOTHESIS -> VALIDATION -> RISK -> PROPOSAL -> HUMAN DECISION`

Never `INDICATOR -> ORDER`.

## Next integration work
1. Wire `risk-engine.ts` into proposal creation without changing strategy stops: invalid/oversized risk yields NO_TRADE, never a distorted stop.
2. Wire `position-management.ts` first into PAPER lifecycle; record every management event in journal/audit.
3. Add persistence fields/migration only after auditing current trade proposal/journal schema; migrations must be additive.
4. Add position panel fields: initial R, current stop, remaining open risk, protected profit, partial quantity, MFE/MAE.
5. Keep management automation for REAL disabled until separately homologated and explicitly authorized.
6. Validate builds/tests and live feed after each integration slice; preserve freshness correction and execution gates.
