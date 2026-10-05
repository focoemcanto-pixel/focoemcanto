-- Explicit source-clock configuration, never inferred from a tick's age.
-- XP/MT5 production 2026-10-05: server-labelled tick 09:15, UTC heartbeat 12:15.
-- Original transport, ticks, candles, cursors and broker evidence remain untouched.
create table public.trade_bridge_clock_settings (
 bridge_id text primary key,
 source_timezone text not null check(source_timezone in ('UTC','America/Sao_Paulo')),
 evidence text not null,
 configured_at timestamptz not null default now()
);
alter table public.trade_bridge_clock_settings enable row level security;
revoke all on public.trade_bridge_clock_settings from public,anon,authenticated;
grant select,insert,update on public.trade_bridge_clock_settings to service_role;
insert into public.trade_bridge_clock_settings(bridge_id,source_timezone,evidence)
values('xp-mt5-primary','America/Sao_Paulo','Production 2026-10-05: raw tick 1791191700531 (09:15:00.531 server), UTC heartbeat 12:15:06.992962; operator confirms current WIN market at 09:15 BRT. Fixed source clock, not inferred freshness.');
create function public.trade_bridge_market_epoch(p_ms bigint,p_zone text) returns bigint
language sql stable strict security invoker set search_path='' as $$
 select round(extract(epoch from ((to_timestamp(p_ms::numeric/1000) at time zone 'UTC') at time zone p_zone))*1000)::bigint;
$$;
revoke all on function public.trade_bridge_market_epoch(bigint,text) from public,anon,authenticated;
grant execute on function public.trade_bridge_market_epoch(bigint,text) to service_role;
create or replace function public.trade_bridge_read(p_bridge text) returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object(
 'state',s.state,'receivedAt',s.received_at,'killSwitch',s.kill_switch,
 'marketClock',jsonb_build_object('sourceTimezone',coalesce(z.source_timezone,'UTC'),'representation','UTC epoch milliseconds (ticks), UTC epoch seconds (candles)','originalsPreserved',true),
 'clockDiagnostics',jsonb_build_object('serverEpochMs',round(extract(epoch from statement_timestamp())*1000),'rawTickEpochMs',s.tick->'timeMsc','tickEpochMs',public.trade_bridge_market_epoch((s.tick->>'timeMsc')::bigint,coalesce(z.source_timezone,'UTC'))),
 'tick',case when s.tick is null then null else s.tick||jsonb_build_object('rawTimeMsc',s.tick->'timeMsc','timeMsc',public.trade_bridge_market_epoch((s.tick->>'timeMsc')::bigint,coalesce(z.source_timezone,'UTC'))) end,
 'candles',(select coalesce(jsonb_agg(c.payload||jsonb_build_object('rawTimestamp',c.timestamp,'timestamp',public.trade_bridge_market_epoch(c.timestamp*1000,coalesce(z.source_timezone,'UTC'))/1000) order by c.timestamp),'[]'::jsonb) from (select * from public.trade_bridge_candles where bridge_id=p_bridge and symbol=s.symbol order by timestamp desc limit 2000)c),
 'commands',(select coalesce(jsonb_agg(c),'[]'::jsonb) from (select id,state,created_at,result from public.trade_bridge_commands where bridge_id=p_bridge order by created_at desc limit 30)c))
 from public.trade_bridge_state s left join public.trade_bridge_clock_settings z on z.bridge_id=s.bridge_id where s.bridge_id=p_bridge;
$$;
-- Execution SQL gates intentionally continue to fail closed against original timestamps.
-- No change to kill switch, policies, authorizations, exchange/command RPCs or broker state.
