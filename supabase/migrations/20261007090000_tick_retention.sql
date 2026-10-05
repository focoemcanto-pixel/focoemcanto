-- Tick retention: keep the 5 most recent TRADING SESSIONS present in the data (not 5 calendar days),
-- so weekends and holidays never shrink the window. Additive. Touches only public.trade_bridge_ticks:
-- candles, setups, observations, snapshots, events, PAPER, journal, analytics, commands and audit
-- tables are never read for deletion.
--
-- Who needs ticks (audited 2026-10-05): bridge ingestion reads only the latest tick; the LAB reads a
-- <=120 s window to settle a candle that touched stop and target, only inside the 240-minute outcome
-- horizon. Scanner, replay, PAPER, REAL execution and audits use candles/state/commands. Nothing needs
-- ticks older than the current session, so 5 sessions is a wide margin.
--
-- A session is a Sao Paulo calendar date (on the normalized market clock) with at least p_min_ticks
-- ticks. Stray test ticks therefore never count as a session. The cutoff is the start (00:00 BRT) of
-- the oldest preserved session; only ticks strictly before it would be removed.
--
-- THIS PHASE IS AUDIT-ONLY: no deletion function exists. trade_tick_retention_run records, once a day
-- after the close, exactly which interval WOULD be removed (DRY_RUN). Enabling deletion is a separate,
-- explicit future migration after the audit trail has been reviewed.

create table public.trade_tick_retention_runs (
 id bigint generated always as identity primary key,
 bridge_id text not null,
 started_at timestamptz not null default clock_timestamp(),
 finished_at timestamptz,
 status text not null check(status in ('DRY_RUN','DONE','PARTIAL','SKIPPED_INSUFFICIENT_SESSIONS','SKIPPED_MARKET_HOURS')),
 dry_run boolean not null,
 sessions jsonb not null default '[]'::jsonb,
 cutoff_raw_ms bigint,
 cutoff_brt timestamp,
 oldest_brt timestamp,
 to_delete bigint,
 deleted bigint not null default 0,
 preserved bigint,
 size_before bigint,
 size_after bigint,
 notes text
);
alter table public.trade_tick_retention_runs enable row level security;
revoke all on public.trade_tick_retention_runs from public,anon,authenticated;
grant all on public.trade_tick_retention_runs to service_role;

-- Normalized (real UTC) ms ↔ raw source ms for a bridge, using the same fixed clock as trade_bridge_read.
create function public.trade_tick_offset(p_bridge text,p_raw_ms bigint) returns bigint language sql stable security invoker set search_path='' as $$
 select public.trade_bridge_market_epoch(p_raw_ms,coalesce((select z.source_timezone from public.trade_bridge_clock_settings z where z.bridge_id=p_bridge),'UTC'))-p_raw_ms;
$$;

-- Read-only plan: which sessions are kept and exactly which interval would be removed.
create function public.trade_tick_retention_plan(p_bridge text,p_sessions int default 5,p_min_ticks int default 1000,p_count boolean default true)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 cur bigint; day date; day_start bigint; day_end bigint; off bigint; n int;
 kept jsonb:='[]'::jsonb; cutoff bigint; oldest bigint; scanned int:=0;
begin
 if p_sessions<1 or p_min_ticks<1 then raise exception 'Invalid retention parameters';end if;
 select max(time_msc) into cur from public.trade_bridge_ticks where bridge_id=p_bridge;
 while cur is not null and jsonb_array_length(kept)<p_sessions and scanned<400 loop
  scanned:=scanned+1;
  off:=public.trade_tick_offset(p_bridge,cur);
  day:=(to_timestamp((cur+off)/1000.0) at time zone 'America/Sao_Paulo')::date;
  day_start:=(extract(epoch from (day::timestamp at time zone 'America/Sao_Paulo'))*1000)::bigint-off;
  day_end:=(extract(epoch from ((day+1)::timestamp at time zone 'America/Sao_Paulo'))*1000)::bigint-off;
  select count(*) into n from (select 1 from public.trade_bridge_ticks where bridge_id=p_bridge and time_msc>=day_start and time_msc<day_end limit p_min_ticks) x;
  if n>=p_min_ticks then
   kept:=kept||jsonb_build_object('date',day,'startRawMs',day_start);
   cutoff:=day_start;
  end if;
  select max(time_msc) into cur from public.trade_bridge_ticks where bridge_id=p_bridge and time_msc<day_start;
 end loop;
 select min(time_msc) into oldest from public.trade_bridge_ticks where bridge_id=p_bridge;
 if jsonb_array_length(kept)<p_sessions then
  return jsonb_build_object('bridge',p_bridge,'status','SKIPPED_INSUFFICIENT_SESSIONS','required',p_sessions,'minTicksPerSession',p_min_ticks,'sessions',kept,'cutoffRawMs',null,
   'oldestBrt',case when oldest is null then null else to_timestamp((oldest+public.trade_tick_offset(p_bridge,oldest))/1000.0) at time zone 'America/Sao_Paulo' end,'toDelete',0);
 end if;
 return jsonb_build_object('bridge',p_bridge,'status','READY','required',p_sessions,'minTicksPerSession',p_min_ticks,'sessions',kept,'cutoffRawMs',cutoff,
  'cutoffBrt',to_timestamp((cutoff+public.trade_tick_offset(p_bridge,cutoff))/1000.0) at time zone 'America/Sao_Paulo',
  'oldestBrt',to_timestamp((oldest+public.trade_tick_offset(p_bridge,oldest))/1000.0) at time zone 'America/Sao_Paulo',
  'toDelete',case when p_count then (select count(*) from public.trade_bridge_ticks where bridge_id=p_bridge and time_msc<cutoff) end,
  'preserved',case when p_count then (select count(*) from public.trade_bridge_ticks where bridge_id=p_bridge and time_msc>=cutoff) end);
end $$;

-- Scheduled entry point (audit-only): re-plans every call, skips market hours unless forced and records
-- the plan. A call without dry-run is refused: deletion is not enabled in this phase.
create function public.trade_tick_retention_run(p_dry_run boolean default true,p_force boolean default false,p_sessions int default 5,p_min_ticks int default 1000)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 b text; plan jsonb; st text; brt timestamp:=now() at time zone 'America/Sao_Paulo'; out jsonb:='[]'::jsonb;
begin
 if p_dry_run is distinct from true then raise exception 'TICK_DELETION_DISABLED: retenção em modo auditoria; nenhuma exclusão nesta fase.';end if;
 for b in select bridge_id from public.trade_bridge_state union select bridge_id from public.trade_bridge_clock_settings loop
  if not p_force and extract(isodow from brt)<=5 and brt::time between time '08:30' and time '18:45' then
   insert into public.trade_tick_retention_runs(bridge_id,status,dry_run,finished_at,notes)values(b,'SKIPPED_MARKET_HOURS',true,clock_timestamp(),'Pregão em andamento (08:30–18:45 BRT).');
   out:=out||jsonb_build_object('bridge',b,'status','SKIPPED_MARKET_HOURS');
   continue;
  end if;
  plan:=public.trade_tick_retention_plan(b,p_sessions,p_min_ticks,true);
  st:=case when plan->>'status'<>'READY' then plan->>'status' else 'DRY_RUN' end;
  insert into public.trade_tick_retention_runs(bridge_id,status,dry_run,finished_at,sessions,cutoff_raw_ms,cutoff_brt,oldest_brt,to_delete,deleted,preserved,size_before,size_after)
  values(b,st,true,clock_timestamp(),plan->'sessions',(plan->>'cutoffRawMs')::bigint,(plan->>'cutoffBrt')::timestamp,(plan->>'oldestBrt')::timestamp,(plan->>'toDelete')::bigint,0,
   (plan->>'preserved')::bigint,pg_total_relation_size('public.trade_bridge_ticks'),pg_total_relation_size('public.trade_bridge_ticks'));
  out:=out||jsonb_build_object('bridge',b,'status',st,'cutoffBrt',plan->'cutoffBrt','toDelete',plan->'toDelete','preserved',plan->'preserved');
 end loop;
 return out;
end $$;

revoke all on function public.trade_tick_offset(text,bigint),public.trade_tick_retention_plan(text,int,int,boolean) from public,anon,authenticated;
grant execute on function public.trade_tick_offset(text,bigint),public.trade_tick_retention_plan(text,int,int,boolean) to service_role;
revoke all on function public.trade_tick_retention_run(boolean,boolean,int,int) from public,anon,authenticated;
grant execute on function public.trade_tick_retention_run(boolean,boolean,int,int) to service_role;

-- AUDIT-ONLY schedule: the job runs the plan in DRY-RUN (nothing is deleted) once a day after the close
-- and records what WOULD be removed in trade_tick_retention_runs. Turning deletion on is a separate,
-- explicit decision in a future migration; it is not possible with this one. Environments without
-- pg_cron (tests) simply keep the procedure for manual calls.
do $$ begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.unschedule(jobid) from cron.job where jobname in ('trade-tick-retention','trade-tick-retention-audit');
  perform cron.schedule('trade-tick-retention-audit','45 22 * * 1-5','select public.trade_tick_retention_run()');
 end if;
end $$;
