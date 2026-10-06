-- LAB performance. Additive: new table + new functions only; no existing row, table or function changes.
--
-- 1) Batch outcome writes. The scanner settled outcomes one RPC at a time and the first void response
--    (HTTP 204, empty body) was treated as a failure, so only one observation was updated per run.
--    The client is fixed; this batch also turns N round trips into one. Bad items are skipped, not fatal.
create function public.trade_setup_outcomes_batch(p_owner text,p_items jsonb) returns int language plpgsql security invoker set search_path='' as $$
declare i jsonb; n int:=0;
begin
 for i in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
  begin
   perform public.trade_setup_outcome(p_owner,i->>'id',i->'outcome');
   n:=n+1;
  exception when others then
   null; -- invalid or already-final item: left for the next run, never aborts the batch
  end;
 end loop;
 return n;
end $$;

-- 2) Proposal records without a LAB observation (proposals created before the LAB existed, or whose
--    observation write failed). Their own persisted levels (entry/stop/target/asOf) are followed with
--    the same causal outcome model. No snapshot is invented: they carry no features and are labelled
--    PROPOSAL_RECORD in every analytic output.
create table public.trade_proposal_record_outcomes (
 proposal_id uuid primary key references public.trade_operation_proposals(id),
 owner_id text not null,
 outcome jsonb not null,
 outcome_status text not null check(outcome_status in ('OPEN','TARGET_FIRST','STOP_FIRST','AMBIGUOUS','EXPIRED')),
 outcome_final_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.trade_proposal_record_outcomes enable row level security;
revoke all on public.trade_proposal_record_outcomes from public,anon,authenticated;
grant all on public.trade_proposal_record_outcomes to service_role;
create function public.trade_proposal_record_outcome_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.proposal_id<>old.proposal_id or new.owner_id<>old.owner_id then raise exception 'Proposal record identity is immutable';end if;
 if old.outcome_status<>'OPEN' and (new.outcome is distinct from old.outcome or new.outcome_status<>old.outcome_status) then raise exception 'Final setup outcome is immutable';end if;
 new.updated_at=now();
 return new;
end $$;
create trigger trade_proposal_record_outcome_guard before update on public.trade_proposal_record_outcomes for each row execute function public.trade_proposal_record_outcome_guard();
create trigger trade_proposal_record_outcomes_no_delete before delete on public.trade_proposal_record_outcomes for each row execute function public.trade_append_only();

-- A proposal is a "record" only when no observation exists for it (by id or by its scanner watch).
create function public.trade_proposal_is_record(p public.trade_operation_proposals) returns boolean language sql stable security invoker set search_path='' as $$
 select p.payload->>'mode'='PAPER' and p.payload->>'scope' is not null and p.payload->>'asOf' is not null
  and not exists(select 1 from public.trade_setup_observations o where o.owner_id=p.owner_id and (o.id=p.payload->>'setupObservationId' or (o.scope=p.payload->>'scope' and o.watch_id=p.payload->>'setupWatchId')));
$$;
create function public.trade_proposal_records_open(p_owner text,p_scope text,p_limit int) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'direction',p.payload->>'direction','entry',p.payload->'entry','stop',p.payload->'sl','target',p.payload->'tp',
  'marketAsOf',(p.payload->>'asOf')::bigint,'outcome',r.outcome) order by p.created_at),'[]'::jsonb)
 from (select * from public.trade_operation_proposals x where x.owner_id=p_owner and x.payload->>'scope'=p_scope and x.created_at>now()-interval '10 days'
   and public.trade_proposal_is_record(x) order by x.created_at desc limit greatest(1,least(p_limit,200))) p
 left join public.trade_proposal_record_outcomes r on r.proposal_id=p.id
 where coalesce(r.outcome_status,'OPEN')='OPEN';
$$;
create function public.trade_proposal_record_outcomes_batch(p_owner text,p_items jsonb) returns int language plpgsql security invoker set search_path='' as $$
declare i jsonb; n int:=0; st text;
begin
 for i in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
  st:=i->'outcome'->>'status';
  if st not in ('OPEN','TARGET_FIRST','STOP_FIRST','AMBIGUOUS','EXPIRED') then continue;end if;
  if not exists(select 1 from public.trade_operation_proposals p where p.id=(i->>'id')::uuid and p.owner_id=p_owner and public.trade_proposal_is_record(p)) then continue;end if;
  insert into public.trade_proposal_record_outcomes as r(proposal_id,owner_id,outcome,outcome_status,outcome_final_at)
  values((i->>'id')::uuid,p_owner,i->'outcome',st,case when st<>'OPEN' then now() end)
  on conflict(proposal_id) do update set outcome=excluded.outcome,outcome_status=excluded.outcome_status,outcome_final_at=excluded.outcome_final_at
  where r.outcome_status='OPEN' and r.outcome is distinct from excluded.outcome;
  if found then n:=n+1;end if;
 end loop;
 return n;
end $$;

-- 3) Read for the DESEMPENHO section: observations + proposal records + scanner watch counts of the
--    period, with the proposal sizing snapshot of each one. Cluster counts (signals/confirmed/actionable
--    in the previous 5 minutes) use only rows at or before each confirmation (causal). Read-only; no
--    account hash, token or fingerprint is selected.
create function public.trade_lab_performance(p_owner text,p_from bigint,p_to bigint) returns jsonb language sql stable security invoker set search_path='' as $$
 with obs as (select * from public.trade_setup_observations where owner_id=p_owner and confirmed_at>=p_from and confirmed_at<p_to order by confirmed_at limit 10000),
 rec as (select * from public.trade_operation_proposals p where p.owner_id=p_owner and (p.payload->>'asOf')::bigint>=p_from and (p.payload->>'asOf')::bigint<p_to and public.trade_proposal_is_record(p) order by p.created_at limit 5000)
 select jsonb_build_object(
 'observations',(select coalesce(jsonb_agg(jsonb_build_object(
   'id',o.id,'origin','OBSERVATION','source',o.source,'scope',o.scope,'symbol',o.symbol,'strategyId',o.strategy_id,'version',o.version,'direction',o.direction,
   'detectedAt',o.detected_at,'confirmedAt',o.confirmed_at,'marketAsOf',o.market_as_of,'lifecycle',o.lifecycle,'proposalState',o.proposal_state,
   'actionability',o.actionability->>'status','outcome',o.outcome,'paper',o.paper,
   'entry',o.snapshot->'entry','stop',o.snapshot->'stop','target',o.snapshot->'target','rr',o.snapshot->'rr','riskPoints',o.snapshot->'riskPoints','pointValue',o.snapshot->'pointValue',
   'features',jsonb_build_object('hourBRT',o.snapshot->'session'->'hourBRT','weekday',o.snapshot->'session'->'weekday','regimes',o.snapshot->'regimes','trend5m',o.snapshot->'derived'->'trend5m',
     'volumeRatio1m',o.snapshot->'derived'->'volumeRatio1m','riskInAtr1m',o.snapshot->'derived'->'riskInAtr1m'),
   'participants',(select coalesce(jsonb_agg(jsonb_build_object('strategyId',x->>'strategyId','version',x->>'version')),'[]'::jsonb) from jsonb_array_elements(coalesce(o.snapshot->'participantEvidence','[]'::jsonb)) x where x->>'state'='CONFIRMED'),
   'cluster',jsonb_build_object(
     'signalsLast5m',(select count(*) from public.trade_setup_watches w where w.owner_id=p_owner and w.scope=o.scope and w.detected_at>o.confirmed_at-300 and w.detected_at<=o.confirmed_at),
     'confirmedLast5m',(select count(*) from public.trade_setup_observations y where y.owner_id=p_owner and y.scope=o.scope and y.id<>o.id and y.confirmed_at>o.confirmed_at-300 and y.confirmed_at<=o.confirmed_at),
     'actionableLast5m',(select count(*) from public.trade_setup_observations y where y.owner_id=p_owner and y.scope=o.scope and y.id<>o.id and y.confirmed_at>o.confirmed_at-300 and y.confirmed_at<=o.confirmed_at and y.actionability->>'status'='ACTIONABLE')),
   'proposal',(select jsonb_build_object('state',pr.state,'createdAt',extract(epoch from pr.created_at),'expiresAt',extract(epoch from pr.expires_at),
     'riskSettingsVersion',pr.payload->'riskSettings'->'version','oneRBRL',coalesce(pr.payload->'riskSettings'->'oneRBRL',pr.payload->'sizing'->'maxRiskBRL'),
     'dailyLossBRL',pr.payload->'riskSettings'->'dailyLossBRL','maxTradesPerDay',pr.payload->'riskSettings'->'maxTradesPerDay',
     'riskPerContractBRL',pr.payload->'riskPerContractBRL','quantity',coalesce(pr.payload->'sizing'->'suggestedQuantity',pr.payload->'quantity'),'riskBRL',pr.payload->'riskBRL',
     'blockCode',pr.payload->'riskBlock'->>'code') from public.trade_operation_proposals pr where pr.id=o.proposal_id)) order by o.confirmed_at),'[]'::jsonb) from obs o),
 'records',(select coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id::text,'origin','PROPOSAL_RECORD','source',case when p.payload->>'source'='mt5' then 'LIVE' else 'REPLAY' end,'scope',p.payload->>'scope','symbol',p.payload->>'symbol',
   'strategyId',p.payload->'setup'->>'strategy','version',p.payload->'setup'->>'version','direction',p.payload->>'direction',
   'detectedAt',(p.payload->>'asOf')::bigint,'confirmedAt',(p.payload->>'asOf')::bigint,'marketAsOf',(p.payload->>'asOf')::bigint,
   'lifecycle',case p.state when 'BLOQUEADA POR RISCO' then 'BLOCKED_RISK' when 'EXPIRADA' then 'EXPIRED' when 'DESCARTADA' then 'IGNORED' when 'CONFIRMADA' then 'PAPER_ACCEPTED' else 'PROPOSED' end,
   'proposalState',coalesce(p.payload->>'proposalState','LEGACY'),'actionability',null,'outcome',r.outcome,'paper',case when p.state='CONFIRMADA' then p.execution end,
   'entry',p.payload->'entry','stop',p.payload->'sl','target',p.payload->'tp','rr',p.payload->'rr','riskPoints',p.payload->'riskPoints','pointValue',p.payload->'pointValue',
   'features',jsonb_build_object('hourBRT',null,'weekday',null,'regimes',coalesce(p.payload->'regimes','[]'::jsonb),'trend5m',null),
   'participants','[]'::jsonb,'cluster',null,
   'proposal',jsonb_build_object('state',p.state,'createdAt',extract(epoch from p.created_at),'expiresAt',extract(epoch from p.expires_at),
     'riskSettingsVersion',p.payload->'riskSettings'->'version','oneRBRL',coalesce(p.payload->'riskSettings'->'oneRBRL',p.payload->'sizing'->'maxRiskBRL'),
     'dailyLossBRL',p.payload->'riskSettings'->'dailyLossBRL','maxTradesPerDay',p.payload->'riskSettings'->'maxTradesPerDay',
     'riskPerContractBRL',p.payload->'riskPerContractBRL','quantity',coalesce(p.payload->'sizing'->'suggestedQuantity',p.payload->'quantity'),'riskBRL',p.payload->'riskBRL',
     'blockCode',p.payload->'riskBlock'->>'code')) order by p.created_at),'[]'::jsonb)
   from rec p left join public.trade_proposal_record_outcomes r on r.proposal_id=p.id),
 'watches',(select coalesce(jsonb_agg(jsonb_build_object('source',split_part(w.scope,':',1),'date',w.d,'strategyId',w.strategy_id,'version',w.version,'state',w.state,'n',w.n)),'[]'::jsonb)
   from (select scope,strategy_id,version,state,to_char(to_timestamp(detected_at) at time zone 'America/Sao_Paulo','YYYY-MM-DD') d,count(*) n from public.trade_setup_watches
         where owner_id=p_owner and detected_at>=p_from and detected_at<p_to group by 1,2,3,4,5) w),
 'riskVersions',(select coalesce(jsonb_agg(jsonb_build_object('version',v.id,'createdAt',extract(epoch from v.created_at),'oneRBRL',v.one_r_brl,'dailyLossBRL',v.daily_loss_brl,'maxTradesPerDay',v.max_trades_per_day,'maxContracts',v.max_contracts) order by v.id),'[]'::jsonb)
   from public.trade_risk_settings_versions v where v.owner_id=p_owner));
$$;

do $$ declare f regprocedure; begin for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in ('trade_setup_outcomes_batch','trade_proposal_record_outcome_guard','trade_proposal_is_record','trade_proposal_records_open','trade_proposal_record_outcomes_batch','trade_lab_performance')loop
 execute format('revoke all on function %s from public,anon,authenticated',f); execute format('grant execute on function %s to service_role',f);
end loop;end $$;
notify pgrst,'reload schema';
