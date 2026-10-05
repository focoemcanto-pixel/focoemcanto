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
-- the oldest preserved session; only ticks strictly before it are deleted, in bounded batches per
-- call. Fewer sessions than required → nothing is deleted.

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

-- One bounded batch. Only rows strictly before the cutoff of this bridge; returns rows deleted.
create function public.trade_tick_retention_batch(p_bridge text,p_cutoff_raw_ms bigint,p_batch int) returns int language plpgsql security invoker set search_path='' as $$
declare n int;
begin
 if p_cutoff_raw_ms is null or p_batch<1 or p_batch>100000 then raise exception 'Invalid retention batch';end if;
 delete from public.trade_bridge_ticks t where t.ctid=any(array(
  select x.ctid from public.trade_bridge_ticks x where x.bridge_id=p_bridge and x.time_msc<p_cutoff_raw_ms limit p_batch));
 get diagnostics n=row_count;
 return n;
end $$;

-- Scheduled entry point: one bounded, short transaction per call (at most p_max_batches × p_batch rows),
-- re-planned every call (idempotent), market hours skipped unless forced, every call audited. Large
-- backlogs are drained by successive scheduled calls after the close.
create function public.trade_tick_retention_run(p_dry_run boolean default false,p_force boolean default false,p_sessions int default 5,p_min_ticks int default 1000,p_batch int default 20000,p_max_batches int default 10)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 b text; plan jsonb; got int; total bigint; batches int; st text; before bigint; brt timestamp:=now() at time zone 'America/Sao_Paulo'; out jsonb:='[]'::jsonb;
begin
 if p_max_batches<1 or p_max_batches>50 then raise exception 'Invalid retention batches';end if;
 -- Bridges come from the small configuration tables (never a scan of the tick table).
 for b in select bridge_id from public.trade_bridge_state union select bridge_id from public.trade_bridge_clock_settings loop
  if not p_force and extract(isodow from brt)<=5 and brt::time between time '08:30' and time '18:45' then
   insert into public.trade_tick_retention_runs(bridge_id,status,dry_run,finished_at,notes)values(b,'SKIPPED_MARKET_HOURS',p_dry_run,clock_timestamp(),'Pregão em andamento (08:30–18:45 BRT).');
   out:=out||jsonb_build_object('bridge',b,'status','SKIPPED_MARKET_HOURS');
   continue;
  end if;
  plan:=public.trade_tick_retention_plan(b,p_sessions,p_min_ticks,true);
  total:=0; batches:=0; got:=0; before:=pg_total_relation_size('public.trade_bridge_ticks');
  st:=case when plan->>'status'<>'READY' then plan->>'status' when p_dry_run then 'DRY_RUN' else 'DONE' end;
  if st='DONE' then
   loop
    got:=public.trade_tick_retention_batch(b,(plan->>'cutoffRawMs')::bigint,p_batch);
    total:=total+got; batches:=batches+1;
    exit when got<p_batch or batches>=p_max_batches;
   end loop;
   if got>=p_batch then st:='PARTIAL';end if;
  end if;
  insert into public.trade_tick_retention_runs(bridge_id,status,dry_run,finished_at,sessions,cutoff_raw_ms,cutoff_brt,oldest_brt,to_delete,deleted,preserved,size_before,size_after,notes)
  values(b,st,p_dry_run,clock_timestamp(),plan->'sessions',(plan->>'cutoffRawMs')::bigint,(plan->>'cutoffBrt')::timestamp,(plan->>'oldestBrt')::timestamp,(plan->>'toDelete')::bigint,total,
   (plan->>'preserved')::bigint,before,pg_total_relation_size('public.trade_bridge_ticks'),
   case when total>0 then 'Espaço liberado é reutilizado pelo autovacuum; o arquivo não encolhe sem VACUUM FULL.' end);
  out:=out||jsonb_build_object('bridge',b,'status',st,'cutoffBrt',plan->'cutoffBrt','toDelete',plan->'toDelete','deleted',total,'preserved',plan->'preserved');
 end loop;
 return out;
end $$;

revoke all on function public.trade_tick_offset(text,bigint),public.trade_tick_retention_plan(text,int,int,boolean),public.trade_tick_retention_batch(text,bigint,int) from public,anon,authenticated;
grant execute on function public.trade_tick_offset(text,bigint),public.trade_tick_retention_plan(text,int,int,boolean),public.trade_tick_retention_batch(text,bigint,int) to service_role;
revoke all on function public.trade_tick_retention_run(boolean,boolean,int,int,int,int) from public,anon,authenticated;
grant execute on function public.trade_tick_retention_run(boolean,boolean,int,int,int,int) to service_role;

-- Every 10 minutes from 19:00 to 23:50 BRT (22:00–02:50 UTC) when pg_cron exists; each call is short. Environments without
-- pg_cron (tests) simply keep the procedure for manual calls.
do $$ begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.unschedule(jobid) from cron.job where jobname='trade-tick-retention';
  perform cron.schedule('trade-tick-retention','*/10 22,23,0,1,2 * * *','select public.trade_tick_retention_run()');
 end if;
end $$;
