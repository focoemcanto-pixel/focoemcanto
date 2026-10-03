-- Additive Trade-only scanner. Existing approval and bridge tables are reused.
create table public.trade_strategy_versions (
 strategy_id text not null, version text not null, definition jsonb not null,
 created_at timestamptz not null default now(), primary key(strategy_id,version)
);
create table public.trade_scanner_state (
 owner_id text not null, scope text not null, as_of bigint not null,
 payload jsonb not null, updated_at timestamptz not null default now(), primary key(owner_id,scope)
);
create table public.trade_setup_watches (
 owner_id text not null, scope text not null, id text not null, strategy_id text not null, version text not null,
 state text not null check(state in ('DETECTED','FORMING','WAITING_TRIGGER','CONFIRMED','PROPOSED','ACCEPTED','REJECTED_BY_USER','INVALIDATED','EXPIRED','OPEN_PAPER','CLOSED_PAPER')),
 detected_at bigint not null, valid_until bigint not null, payload jsonb not null,
 primary key(owner_id,scope,id)
);
create index trade_watches_strategy on public.trade_setup_watches(owner_id,strategy_id,version,state);
create table public.trade_strategy_evaluations (
 owner_id text not null,scope text not null,as_of bigint not null,strategy_id text not null,version text not null,
 state text not null,payload jsonb not null,primary key(owner_id,scope,as_of,strategy_id,version)
);
create table public.trade_human_decisions (
 id bigint generated always as identity primary key, proposal_id uuid not null references public.trade_operation_proposals(id),
 decision text not null check(decision in ('CONFIRMADA','DESCARTADA')), payload jsonb not null,
 decided_at timestamptz not null default now(), unique(proposal_id)
);
alter table public.trade_operation_proposals add column hypothetical_execution jsonb;
create index trade_proposal_setup_key on public.trade_operation_proposals(owner_id,((payload->>'scope')),((payload->'setup'->>'id')));
create function public.trade_scanner_read(p_owner text,p_scope text) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 update public.trade_operation_proposals set state='EXPIRADA' where owner_id=p_owner and payload->>'scope'=p_scope and state='AGUARDANDO CONFIRMAÇÃO' and expires_at<=now();
 return coalesce((select payload from public.trade_scanner_state where owner_id=p_owner and scope=p_scope),'{}'::jsonb);
end $$;
create function public.trade_scanner_save(p_owner text,p_scope text,p_expected bigint,p_payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare old public.trade_scanner_state; w jsonb;c jsonb;e jsonb;
begin
 perform pg_advisory_xact_lock(hashtext(p_owner||':'||p_scope));
 select * into old from public.trade_scanner_state where owner_id=p_owner and scope=p_scope;
 if found and old.as_of<>p_expected then return old.payload;end if;
 if (p_payload->>'asOf')::bigint<p_expected then raise exception 'Future state cannot enter earlier replay';end if;
 for c in select value from jsonb_array_elements(p_payload->'scan'->'candidates') loop
 insert into public.trade_strategy_versions(strategy_id,version,definition)values(c->'definition'->>'id',c->'definition'->>'version',c->'definition')on conflict do nothing;
 insert into public.trade_strategy_evaluations values(p_owner,p_scope,(p_payload->>'asOf')::bigint,c->'definition'->>'id',c->'definition'->>'version',c->>'state',c)on conflict do nothing;
 end loop;
 for e in select value from jsonb_array_elements(coalesce(p_payload->'evaluations','[]'::jsonb)) loop
 for c in select value from jsonb_array_elements(e->'candidates') loop
 insert into public.trade_strategy_evaluations values(p_owner,p_scope,(e->>'asOf')::bigint,c->>'id',c->>'version',c->>'state',c)on conflict do nothing;
 end loop;end loop;
 p_payload=p_payload-'evaluations';
 for w in select value from jsonb_array_elements(p_payload->'watches') loop
 insert into public.trade_setup_watches values(p_owner,p_scope,w->>'id',w->'candidate'->'definition'->>'id',w->'candidate'->'definition'->>'version',w->>'state',(w->>'detectedAt')::bigint,(w->>'validUntil')::bigint,w)
 on conflict(owner_id,scope,id) do update set state=excluded.state,payload=excluded.payload
 where public.trade_setup_watches.state not in ('PROPOSED','ACCEPTED','REJECTED_BY_USER','OPEN_PAPER','CLOSED_PAPER');
 end loop;
 -- Decisions committed between read and save take precedence over the scanner copy.
 select coalesce(jsonb_agg(t.payload order by t.detected_at),'[]'::jsonb) into w from (select payload,detected_at from public.trade_setup_watches where owner_id=p_owner and scope=p_scope order by detected_at desc limit 100)t;
 p_payload=jsonb_set(p_payload,'{watches}',w);
 insert into public.trade_scanner_state values(p_owner,p_scope,(p_payload->>'asOf')::bigint,p_payload,now())on conflict(owner_id,scope)do update set as_of=excluded.as_of,payload=excluded.payload,updated_at=now();
 return p_payload;
end $$;
create function public.trade_watch_action(p_owner text,p_scope text,p_id text,p_action text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_action not in ('discard','follow')then raise exception 'Invalid watch action';end if;
 update public.trade_setup_watches set state=case when p_action='discard' then 'REJECTED_BY_USER' else state end,
 payload=payload||jsonb_build_object('state',case when p_action='discard' then 'REJECTED_BY_USER' else state end,'following',p_action='follow')
 where owner_id=p_owner and scope=p_scope and id=p_id and state in ('FORMING','WAITING_TRIGGER');
 update public.trade_scanner_state set payload=jsonb_set(payload,'{watches}',coalesce((select jsonb_agg(w.payload)from public.trade_setup_watches w where w.owner_id=p_owner and w.scope=p_scope),'[]'::jsonb)) where owner_id=p_owner and scope=p_scope;
end $$;
create function public.trade_scanner_proposal_event() returns trigger language plpgsql security invoker set search_path='' as $$
declare ws text;
begin
 if new.payload->>'mode'<>'PAPER' then return new;end if;
 ws=case when new.execution->>'exitTime' is not null then 'CLOSED_PAPER' when new.execution->>'entry' is not null then 'OPEN_PAPER' when new.state='CONFIRMADA' then 'ACCEPTED' when new.state='DESCARTADA' then 'REJECTED_BY_USER' when new.state='EXPIRADA' then 'EXPIRED' else 'PROPOSED' end;
 if new.state in ('CONFIRMADA','DESCARTADA') then
 insert into public.trade_human_decisions(proposal_id,decision,payload)values(new.id,new.state,new.payload)on conflict do nothing;
 end if;
 update public.trade_setup_watches set state=ws,payload=payload||jsonb_build_object('state',ws,'proposalId',new.id,'transitions',coalesce(payload->'transitions','[]'::jsonb)||case when state<>ws then jsonb_build_array(jsonb_build_object('from',state,'to',ws,'at',extract(epoch from now())::bigint,'reason','Human approval / PAPER lifecycle')) else '[]'::jsonb end)where owner_id=new.owner_id and scope=new.payload->>'scope' and id=new.payload->>'setupWatchId';
 update public.trade_scanner_state s set payload=jsonb_set(s.payload,'{watches}',coalesce((select jsonb_agg(w.payload)from public.trade_setup_watches w where w.owner_id=new.owner_id and w.scope=new.payload->>'scope'),'[]'::jsonb))where s.owner_id=new.owner_id and s.scope=new.payload->>'scope';
 return new;
end $$;
create trigger trade_scanner_proposal_lifecycle after insert or update on public.trade_operation_proposals for each row execute function public.trade_scanner_proposal_event();
create function public.trade_hypothetical_observe(p_owner text,p_id uuid,p_execution jsonb)returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.trade_operation_proposals set hypothetical_execution=p_execution where owner_id=p_owner and id=p_id and state='DESCARTADA' and payload->>'mode'='PAPER' and hypothetical_execution->>'exitTime' is null and hypothetical_execution is distinct from p_execution;
 if found then insert into public.trade_operation_journal(proposal_id,kind,payload)values(p_id,'HIPOTETICO_PAPER',p_execution);end if;
end $$;
-- Existing proposal endpoint supports legacy callers and one proposal per watch, not one globally.
create or replace function public.trade_propose(p_owner text,p_bridge text,p_proposal jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare old public.trade_operation_proposals;
begin
 perform pg_advisory_xact_lock(hashtext(p_owner));
 if p_proposal->>'setupWatchId' is null then
 select * into old from public.trade_operation_proposals where owner_id=p_owner and state='AGUARDANDO CONFIRMAÇÃO' and expires_at>now() and payload->>'mode'=p_proposal->>'mode' and payload->>'source'=p_proposal->>'source' limit 1;
 else
 if p_proposal->>'mode'<>'PAPER' then raise exception 'Scanner PAPER only';end if;
 select * into old from public.trade_operation_proposals where owner_id=p_owner and payload->>'scope'=p_proposal->>'scope' and payload->>'setupWatchId'=p_proposal->>'setupWatchId' limit 1;
 end if;
 if found then return to_jsonb(old);end if;
 select * into old from public.trade_operation_proposals where owner_id=p_owner and payload->>'mode'=p_proposal->>'mode' and payload->'setup'->>'id'=p_proposal->'setup'->>'id' and coalesce(payload->>'scope','')=coalesce(p_proposal->>'scope','') and state in ('CONFIRMADA','DESCARTADA') limit 1;
 if found then return to_jsonb(old);end if;
 insert into public.trade_operation_proposals(id,owner_id,bridge_id,payload,expires_at)values((p_proposal->>'id')::uuid,p_owner,p_bridge,p_proposal,to_timestamp((p_proposal->>'expiresAt')::numeric/1000))returning * into old;
 insert into public.trade_operation_journal(proposal_id,kind,payload)values(old.id,'PROPOSTA',p_proposal);return to_jsonb(old);
end $$;
-- Long-running PAPER reads: active positions are always included, with latest closed history.
create or replace function public.trade_operations_read(p_owner text) returns jsonb language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('command',(select to_jsonb(c)from public.trade_bridge_commands c where c.id=p.id),'events',(select coalesce(jsonb_agg(e.payload),'[]'::jsonb)from public.trade_bridge_events e where e.bridge_id=p.bridge_id and e.payload->>'commandId'=p.id::text),'journal',(select coalesce(jsonb_agg(j order by j.id),'[]'::jsonb)from public.trade_operation_journal j where j.proposal_id=p.id)) order by p.created_at desc),'[]'::jsonb)from(select * from public.trade_operation_proposals where owner_id=p_owner and ((state='CONFIRMADA' and execution->>'exitTime' is null)or(state='DESCARTADA' and hypothetical_execution->>'exitTime' is null)or created_at>now()-interval '30 days')order by created_at desc limit 500)p;
$$;
create function public.trade_strategy_metrics(p_owner text)returns jsonb language sql security invoker set search_path='' as $$
 with p as(select payload->'setup'->>'strategy' id,payload->'setup'->>'version' version,state,payload,execution from public.trade_operation_proposals where owner_id=p_owner and payload->>'mode'='PAPER'), k as(select strategy_id id,version,count(*) detected,count(*)filter(where payload->>'confirmedAt' is not null)confirmed from public.trade_setup_watches where owner_id=p_owner group by 1,2), a as(select id,version,count(*) proposals,count(*)filter(where state='CONFIRMADA')accepted,count(*)filter(where state='DESCARTADA')rejected,count(*)filter(where execution->>'resultR' is not null)closed,count(*)filter(where(execution->>'resultR')::numeric>0)wins,count(*)filter(where(execution->>'resultR')::numeric<0)losses,count(*)filter(where(execution->>'resultR')::numeric=0)breakeven,avg((execution->>'resultR')::numeric)expectancy,sum((execution->>'resultR')::numeric)net_r,sum((execution->>'resultBRL')::numeric)net_money,sum((execution->>'resultPoints')::numeric)net_points,avg((payload->>'rr')::numeric)average_rr,avg((execution->>'resultR')::numeric)filter(where(execution->>'resultR')::numeric>0)average_win,avg((execution->>'resultR')::numeric)filter(where(execution->>'resultR')::numeric<0)average_loss from p group by 1,2)
 select coalesce(jsonb_agg(jsonb_build_object('strategy',v.strategy_id,'version',v.version,'detected',coalesce(k.detected,0),'confirmed',coalesce(k.confirmed,0),'proposals',coalesce(a.proposals,0),'accepted',coalesce(a.accepted,0),'rejected',coalesce(a.rejected,0),'closed',coalesce(a.closed,0),'wins',coalesce(a.wins,0),'losses',coalesce(a.losses,0),'breakeven',coalesce(a.breakeven,0),'sampleStatus',case when coalesce(a.closed,0)<30 then 'DADOS INSUFICIENTES' else 'AMOSTRA DESCRITIVA — NÃO COMPROVA VANTAGEM' end,'expectancy',case when a.closed>=30 then a.expectancy else null end,'winRate',case when a.closed>=30 then a.wins::numeric/a.closed else null end,'averageWinR',case when a.closed>=30 then a.average_win else null end,'averageLossR',case when a.closed>=30 then a.average_loss else null end,'netR',a.net_r,'netMoney',a.net_money,'netPoints',a.net_points,'averageRR',a.average_rr,'breakdown',(select coalesce(jsonb_agg(to_jsonb(b)),'[]'::jsonb)from(select p.payload->'regimes' regimes,to_char(to_timestamp((p.payload->>'asOf')::bigint) at time zone 'America/Sao_Paulo','HH24') market_hour,count(*) samples,sum((p.execution->>'resultR')::numeric) net_r from p where p.id=v.strategy_id and p.version=v.version and p.execution->>'resultR' is not null group by 1,2)b))),'[]'::jsonb)from public.trade_strategy_versions v left join k on k.id=v.strategy_id and k.version=v.version left join a on a.id=v.strategy_id and a.version=v.version;
$$;
alter table public.trade_strategy_versions enable row level security;
alter table public.trade_scanner_state enable row level security;
alter table public.trade_setup_watches enable row level security;
alter table public.trade_strategy_evaluations enable row level security;
alter table public.trade_human_decisions enable row level security;
revoke all on public.trade_strategy_versions,public.trade_scanner_state,public.trade_setup_watches,public.trade_strategy_evaluations,public.trade_human_decisions from public,anon,authenticated;
grant all on public.trade_strategy_versions,public.trade_scanner_state,public.trade_setup_watches,public.trade_strategy_evaluations,public.trade_human_decisions to service_role;
grant usage,select on sequence public.trade_human_decisions_id_seq to service_role;
revoke all on function public.trade_scanner_read(text,text),public.trade_scanner_save(text,text,bigint,jsonb),public.trade_watch_action(text,text,text,text),public.trade_scanner_proposal_event(),public.trade_hypothetical_observe(text,uuid,jsonb),public.trade_strategy_metrics(text)from public,anon,authenticated;
grant execute on function public.trade_scanner_read(text,text),public.trade_scanner_save(text,text,bigint,jsonb),public.trade_watch_action(text,text,text,text),public.trade_scanner_proposal_event(),public.trade_hypothetical_observe(text,uuid,jsonb),public.trade_strategy_metrics(text)to service_role;
notify pgrst,'reload schema';
