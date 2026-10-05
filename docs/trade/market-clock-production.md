# XP/MT5 — source clock and production freshness

Production evidence collected 2026-10-05, with market open:

- database/server UTC: 12:15:07.157Z (1791202507157 ms);
- fresh terminal heartbeat: 12:15:06.992Z;
- received/persisted raw MqlTick.time_msc: 1791191700531, labelled 09:15:00.531;
- unconverted age: 10,806,626 ms;
- XP server wall time is America/Sao_Paulo for this bridge; absolute UTC tick: 1791202500531 (12:15:00.531Z);
- true age: 6,626 ms. Raw M1 bars had the identical source-clock mismatch.

The EA emitted broker wall-clock epochs without time-basis metadata. Exchange/RPC preserved those numbers exactly. The provider treated them as UTC, and the browser displayed the resulting false UTC instant in BRT, producing a second visual displacement. Heartbeat already used true UTC. No unit conversion was responsible: ticks are milliseconds, candles seconds.

Migration `20261005122031_bridge_market_clock.sql` adds a service-only RLS-protected clock configuration keyed by bridge. Only xp-mt5-primary is explicitly configured as America/Sao_Paulo, based on the production observation and operator's actual market clock. This is NOT an offset inferred from stale age and does NOT replace a tick's time with its receive time. Unknown bridges remain UTC.

`trade_bridge_read` is the single normalization boundary. PostgreSQL interprets the original server clock in the configured IANA timezone, including historical timezone rules. All consumers receive UTC epoch milliseconds for ticks and UTC epoch seconds for candles. Raw values are returned as rawTimeMsc/rawTimestamp and remain untouched in storage. Retry keys, FILE_COMMON pending/cursor/ledger/events, session leases and financial records are preserved. A genuinely stale tick remains stale after normalization. Maximum freshness remains 15 seconds and also requires a fresh heartbeat.

EA 2.04 additionally reports broker-wall basis, TimeTradeServer, TimeGMT and their offset. A disagreement with configured source clock blocks LIVE. Changing broker/server or adopting a true UTC producer requires an explicit source-clock configuration change; never automatically shift data based on apparent lag. The existing EA does not need reinstalling for this backend market-data fix. Installing 2.04 is needed for the additional producer clock/error telemetry; compile and retain EnableExecution=false and AlgoTrading disabled.

Original financial SQL guards remain fail-closed against raw timestamps; this change does not authorize execution or implement a financial gate migration. Any future real execution homologation must address that guard explicitly while all other gates remain mandatory.

## Transport diagnostics

The previous `BRIDGE_RESPONSE_UNCLASSIFIED` discarded the distinction between empty, HTML, nonstandard JSON and text responses. EA 2.04 classifies these shapes and prints only status, response byte count and whether Content-Type is JSON, never a raw body/token/account. No original response body is stored by the installed EA, so its historical root cause cannot be retroactively asserted. The final hour inspected before this fix had 114 persisted receipts reporting client HTTP 200, no current rejection. Historical lease conflict was at 08:57 UTC; only one session was actively exchanging after that. Single-owner protection is unchanged.

Validation: 133 Trade tests; UTC/BRT, timezone independence, midnight, millisecond preservation, 1s/10s/16s freshness, original persistence retained, clock-settings access denied to authenticated role; Next build, Worker build and typecheck. Production evidence after migration at 12:24:03Z: true feed age 1,512 ms; heartbeat 12:24:01Z; scanner advanced to UTC as_of 1791202980. Further deployment receipts are audited separately.
