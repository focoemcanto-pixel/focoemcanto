-- Setup observation LAB. Additive only: no table is dropped, renamed or rewritten.
-- SETUP (market met conditions) ≠ PROPOSAL (a calculated possible trade) ≠ ORDER (sent to a broker).
-- Every CONFIRMED setup is recorded once with an immutable snapshot and followed to an objective
-- outcome whether or not it was traded (no selection bias). PAPER trades link to their setup.
-- Nothing here can create a command, arm REAL or touch the broker.

-- 1) Strategy registry: reproducible configuration per version.
alter table public.trade_strategy_versions
 add column config_hash text generated always as (md5(definition::text)) stored,
 add column status text not null default 'ACTIVE' check(status in ('ACTIVE','RETIRED','RESEARCH')),
 add column activated_at timestamptz,
 add column deactivated_at timestamptz;
update public.trade_strategy_versions set activated_at=created_at where activated_at is null;

-- 2) One observation per confirmed setup (dedup unit: the scanner watch, which persists across polls).
create table public.trade_setup_observations (
 id text primary key,
 owner_id text not null, scope text not null,
 source text not null check(source in ('LIVE','REPLAY','BACKTEST')),
 symbol text not null, strategy_id text not null, version text not null, config_hash text not null,
 direction text not null check(direction in ('BUY','SELL')),
 watch_id text not null, detected_at bigint not null, confirmed_at bigint not null, market_as_of bigint not null,
 snapshot jsonb not null,
 lifecycle text not null default 'CONFIRMED' check(lifecycle in ('CONFIRMED','PROPOSED','BLOCKED_RISK','MISSED','INVALIDATED','EXPIRED','IGNORED','PAPER_ACCEPTED','PAPER_ACTIVE','PAPER_CLOSED','CANCELLED')),
 proposal_id uuid, proposal_state text, actionability jsonb,
 outcome jsonb, outcome_status text not null default 'OPEN' check(outcome_status in ('OPEN','TARGET_FIRST','STOP_FIRST','AMBIGUOUS','EXPIRED')),
 outcome_final_at timestamptz, paper jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner_id,scope,watch_id)
);
create index trade_setup_obs_strategy on public.trade_setup_observations(owner_id,strategy_id,version,source);
create index trade_setup_obs_time on public.trade_setup_observations(owner_id,confirmed_at desc);
create index trade_setup_obs_open on public.trade_setup_observations(owner_id,scope) where outcome_status='OPEN';
create table public.trade_setup_observation_events (
 id bigint generated always as identity primary key,
 observation_id text not null references public.trade_setup_observations(id),
 at timestamptz not null default now(), kind text not null, payload jsonb not null default '{}'::jsonb
);
create index trade_setup_obs_events on public.trade_setup_observation_events(observation_id,id);
-- User annotations, kept apart from automatic objective data.
create table public.trade_setup_notes (
 id bigint generated always as identity primary key,
 observation_id text not null references public.trade_setup_observations(id),
 owner_id text not null, note text not null check(length(note) between 1 and 4000),
 created_at timestamptz not null default now()
);
-- Research periods: exploration vs validation vs forward PAPER are declared, never inferred.
create table public.trade_lab_periods (
 id bigint generated always as identity primary key,
 label text not null, kind text not null check(kind in ('EXPLORATION','VALIDATION','FORWARD_PAPER')),
 strategy_id text, version text, starts_at timestamptz not null, ends_at timestamptz,
 notes text, created_at timestamptz not null default now(), check(ends_at is null or ends_at>starts_at)
);
do $$ declare t text; begin foreach t in array array['trade_setup_observations','trade_setup_observation_events','trade_setup_notes','trade_lab_periods'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop; end $$;

-- 3) Immutability: the snapshot and identity never change; a final outcome never changes; events are append-only.
create function public.trade_setup_observation_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.id<>old.id or new.snapshot is distinct from old.snapshot or new.source<>old.source or new.strategy_id<>old.strategy_id or new.version<>old.version
  or new.config_hash<>old.config_hash or new.confirmed_at<>old.confirmed_at or new.market_as_of<>old.market_as_of or new.detected_at<>old.detected_at or new.direction<>old.direction or new.created_at<>old.created_at then
  raise exception 'Setup observation snapshot is immutable';
 end if;
 if old.outcome_status<>'OPEN' and (new.outcome is distinct from old.outcome or new.outcome_status<>old.outcome_status) then
  raise exception 'Final setup outcome is immutable';
 end if;
 new.updated_at=now();
 return new;
end $$;
create trigger trade_setup_observation_guard before update on public.trade_setup_observations for each row execute function public.trade_setup_observation_guard();
create function public.trade_append_only() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'Append-only history'; end $$;
create trigger trade_setup_events_append_only before update or delete on public.trade_setup_observation_events for each row execute function public.trade_append_only();
create trigger trade_setup_observations_no_delete before delete on public.trade_setup_observations for each row execute function public.trade_append_only();

-- 4) Record a confirmed setup once. Registry hash mismatch (definition changed without a version bump) is evented.
create function public.trade_setup_observe(p_owner text,p_observation jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.trade_setup_observations; def jsonb:=p_observation->'snapshot'->'strategy'->'definition'; reg text;
begin
 insert into public.trade_strategy_versions(strategy_id,version,definition,activated_at)values(def->>'id',def->>'version',def,now())on conflict do nothing;
 select config_hash into reg from public.trade_strategy_versions where strategy_id=def->>'id' and version=def->>'version';
 insert into public.trade_setup_observations(id,owner_id,scope,source,symbol,strategy_id,version,config_hash,direction,watch_id,detected_at,confirmed_at,market_as_of,snapshot,actionability)
 values(p_observation->>'id',p_owner,p_observation->>'scope',p_observation->>'source',p_observation->'snapshot'->>'symbol',def->>'id',def->>'version',md5(def::text),
  p_observation->'snapshot'->>'direction',p_observation->'snapshot'->>'watchId',(p_observation->'snapshot'->>'detectedAt')::bigint,(p_observation->'snapshot'->>'confirmedAt')::bigint,
  (p_observation->'snapshot'->>'marketAsOf')::bigint,p_observation->'snapshot',p_observation->'actionability')
 on conflict do nothing returning * into o;
 if found then
  insert into public.trade_setup_observation_events(observation_id,kind,payload)values(o.id,'CONFIRMED',jsonb_build_object('marketAsOf',o.market_as_of,'configHash',o.config_hash,'actionability',o.actionability));
  if reg is distinct from o.config_hash then
   insert into public.trade_setup_observation_events(observation_id,kind,payload)values(o.id,'REGISTRY_MISMATCH',jsonb_build_object('registryHash',reg,'observedHash',o.config_hash));
  end if;
 else
  select * into o from public.trade_setup_observations where id=p_observation->>'id' or (owner_id=p_owner and scope=p_observation->>'scope' and watch_id=p_observation->'snapshot'->>'watchId') limit 1;
 end if;
 return to_jsonb(o)-'snapshot';
end $$;

-- 5) Decision lifecycle set by the scanner when no proposal is made (price moved away / invalidated).
create function public.trade_setup_lifecycle(p_owner text,p_id text,p_state text,p_payload jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_state not in ('MISSED','INVALIDATED','CANCELLED') then raise exception 'Invalid lifecycle';end if;
 update public.trade_setup_observations set lifecycle=p_state,actionability=coalesce(p_payload,actionability)
 where owner_id=p_owner and id=p_id and lifecycle in ('CONFIRMED');
 if found then insert into public.trade_setup_observation_events(observation_id,kind,payload)values(p_id,p_state,coalesce(p_payload,'{}'::jsonb));end if;
end $$;

-- 6) Proposal/PAPER lifecycle mirrors into the observation (automatic diary of objective data).
create function public.trade_setup_proposal_event() returns trigger language plpgsql security invoker set search_path='' as $$
declare lc text; oid text:=new.payload->>'setupObservationId';
begin
 if oid is null then return new;end if;
 lc:=case
  when new.state='BLOQUEADA POR RISCO' then 'BLOCKED_RISK'
  when new.state='CONFIRMADA' and new.execution->>'exitTime' is not null then 'PAPER_CLOSED'
  when new.state='CONFIRMADA' and new.execution->>'entry' is not null then 'PAPER_ACTIVE'
  when new.state='CONFIRMADA' then 'PAPER_ACCEPTED'
  when new.state='DESCARTADA' then 'IGNORED'
  when new.state='EXPIRADA' then 'EXPIRED'
  else 'PROPOSED' end;
 if new.payload->>'mode'<>'PAPER' then return new;end if;
 update public.trade_setup_observations set lifecycle=lc,proposal_id=new.id,proposal_state=new.payload->>'proposalState',
  paper=case when new.state='CONFIRMADA' then new.execution else paper end
 where id=oid and owner_id=new.owner_id and (lifecycle is distinct from lc or paper is distinct from new.execution or proposal_id is distinct from new.id);
 if found then insert into public.trade_setup_observation_events(observation_id,kind,payload)values(oid,lc,jsonb_build_object('proposalId',new.id,'state',new.state,'execution',new.execution));end if;
 return new;
end $$;
create trigger trade_setup_proposal_event after insert or update on public.trade_operation_proposals for each row execute function public.trade_setup_proposal_event();

-- 7) Outcome tracking: updates only while OPEN; the final result is written once.
create function public.trade_setup_outcome(p_owner text,p_id text,p_outcome jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare st text:=p_outcome->>'status';
begin
 if st not in ('OPEN','TARGET_FIRST','STOP_FIRST','AMBIGUOUS','EXPIRED') then raise exception 'Invalid outcome';end if;
 update public.trade_setup_observations set outcome=p_outcome,outcome_status=st,outcome_final_at=case when st<>'OPEN' then now() end
 where owner_id=p_owner and id=p_id and outcome_status='OPEN' and outcome is distinct from p_outcome;
 if found and st<>'OPEN' then insert into public.trade_setup_observation_events(observation_id,kind,payload)values(p_id,'OUTCOME_'||st,p_outcome);end if;
end $$;
create function public.trade_setup_open(p_owner text,p_scope text,p_limit int) returns jsonb language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'direction',snapshot->>'direction','entry',snapshot->'entry','stop',snapshot->'stop','target',snapshot->'target','marketAsOf',market_as_of,'outcome',outcome) order by confirmed_at),'[]'::jsonb)
 from (select * from public.trade_setup_observations where owner_id=p_owner and scope=p_scope and outcome_status='OPEN' order by confirmed_at desc limit greatest(1,least(p_limit,200)))o;
$$;
-- Ticks for ambiguity resolution only, returned on the normalized (UTC) clock. No copy of ticks is stored.
create function public.trade_bridge_ticks_window(p_bridge text,p_symbol text,p_from_ms bigint,p_to_ms bigint) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare zone text; off bigint;
begin
 if p_to_ms-p_from_ms>120000 or p_to_ms<p_from_ms then raise exception 'Tick window too large';end if;
 select coalesce((select z.source_timezone from public.trade_bridge_clock_settings z where z.bridge_id=p_bridge),'UTC') into zone;
 off:=public.trade_bridge_market_epoch(p_from_ms,zone)-p_from_ms;
 return (select coalesce(jsonb_agg(jsonb_build_object('timeMsc',t.time_msc+off,'bid',t.payload->'bid','ask',t.payload->'ask','last',t.payload->'last') order by t.time_msc,t.ordinal),'[]'::jsonb)
  from (select * from public.trade_bridge_ticks where bridge_id=p_bridge and symbol=p_symbol and time_msc between p_from_ms-off and p_to_ms-off order by time_msc limit 20000)t);
end $$;

-- 8) LAB reads (no account hash, token or fingerprint is ever selected).
create function public.trade_lab_read(p_owner text,p_since bigint) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object(
 'observations',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'source',o.source,'scope',o.scope,'symbol',o.symbol,'strategyId',o.strategy_id,'version',o.version,'configHash',o.config_hash,'direction',o.direction,
  'detectedAt',o.detected_at,'confirmedAt',o.confirmed_at,'lifecycle',o.lifecycle,'proposalState',o.proposal_state,'actionability',o.actionability,'outcome',o.outcome,'paper',o.paper,
  'snapshot',o.snapshot-'context'-'participants'||jsonb_build_object('strategy',(o.snapshot->'strategy')-'definition'),
  'notes',(select coalesce(jsonb_agg(jsonb_build_object('at',n.created_at,'note',n.note) order by n.id),'[]'::jsonb) from public.trade_setup_notes n where n.observation_id=o.id))
  order by o.confirmed_at desc),'[]'::jsonb) from (select * from public.trade_setup_observations where owner_id=p_owner and confirmed_at>=p_since order by confirmed_at desc limit 5000)o),
 'detected',(select count(*) from public.trade_setup_watches w where w.owner_id=p_owner and w.detected_at>=p_since and w.scope like 'mt5:%'),
 'registry',(select coalesce(jsonb_agg(jsonb_build_object('strategyId',strategy_id,'version',version,'configHash',config_hash,'status',status,'activatedAt',activated_at,'deactivatedAt',deactivated_at,'name',definition->>'name','timeframes',definition->'timeframes','parameters',definition->'parameters') order by strategy_id,version),'[]'::jsonb) from public.trade_strategy_versions),
 'periods',(select coalesce(jsonb_agg(to_jsonb(p) order by p.starts_at),'[]'::jsonb) from public.trade_lab_periods p));
$$;
create function public.trade_setup_note_add(p_owner text,p_id text,p_note text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.trade_setup_observations where id=p_id and owner_id=p_owner) then raise exception 'Observation not found';end if;
 insert into public.trade_setup_notes(observation_id,owner_id,note)values(p_id,p_owner,left(p_note,4000));
end $$;

do $$ declare f regprocedure; begin for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in ('trade_setup_observation_guard','trade_append_only','trade_setup_observe','trade_setup_lifecycle','trade_setup_proposal_event','trade_setup_outcome','trade_setup_open','trade_bridge_ticks_window','trade_lab_read','trade_setup_note_add')loop
 execute format('revoke all on function %s from public,anon,authenticated',f); execute format('grant execute on function %s to service_role',f);
end loop;end $$;
notify pgrst,'reload schema';
