-- Server-only proposals and immutable lifecycle journal. Existing FocoOS single-admin scope.
create table public.trade_operation_proposals (
 id uuid primary key, owner_id text not null, bridge_id text not null, payload jsonb not null,
 state text not null default 'AGUARDANDO CONFIRMAÇÃO' check(state in ('AGUARDANDO CONFIRMAÇÃO','DESCARTADA','EXPIRADA','CONFIRMADA')),
 created_at timestamptz not null default now(), expires_at timestamptz not null, confirmed_at timestamptz,
 execution jsonb, paper_cursor bigint
);
create index trade_proposal_owner on public.trade_operation_proposals(owner_id,created_at desc);
create table public.trade_operation_journal (
 id bigint generated always as identity primary key, proposal_id uuid not null references public.trade_operation_proposals(id),
 created_at timestamptz not null default now(), kind text not null, payload jsonb not null
);
alter table public.trade_operation_proposals enable row level security;
alter table public.trade_operation_journal enable row level security;
revoke all on public.trade_operation_proposals,public.trade_operation_journal from anon,authenticated;
grant all on public.trade_operation_proposals,public.trade_operation_journal to service_role;
grant usage,select on sequence public.trade_operation_journal_id_seq to service_role;
create function public.trade_approved_command() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.trade_operation_proposals p where p.id=new.id and p.bridge_id=new.bridge_id and p.state='CONFIRMADA' and p.payload->>'mode'='REAL'
 and p.payload->>'symbol'=new.payload->>'symbol' and p.payload->>'direction'=new.payload->>'action'
 and (new.payload->>'price')::numeric=0 and new.payload->>'ticket'='0' and (new.payload->>'expiresAt')::numeric=(p.payload->>'expiresAt')::numeric
 and (p.payload->>'quantity')::numeric=(new.payload->>'volume')::numeric and (p.payload->>'sl')::numeric=(new.payload->>'sl')::numeric and (p.payload->>'tp')::numeric=(new.payload->>'tp')::numeric) then raise exception 'Human approval required'; end if;
 return new;
end $$;
create trigger trade_require_human_approval before insert on public.trade_bridge_commands for each row execute function public.trade_approved_command();
create function public.trade_propose(p_owner text,p_bridge text,p_proposal jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare old public.trade_operation_proposals;
begin
 perform pg_advisory_xact_lock(hashtext(p_owner));
 select * into old from public.trade_operation_proposals where owner_id=p_owner and state='AGUARDANDO CONFIRMAÇÃO' and expires_at>now() and payload->>'mode'=p_proposal->>'mode' and payload->>'source'=p_proposal->>'source' limit 1;
 if found then return to_jsonb(old); end if;
 select * into old from public.trade_operation_proposals where owner_id=p_owner and payload->>'mode'=p_proposal->>'mode' and payload->'setup'->>'id'=p_proposal->'setup'->>'id' and state in ('CONFIRMADA','DESCARTADA') limit 1;
 if found then return to_jsonb(old); end if;
 insert into public.trade_operation_proposals(id,owner_id,bridge_id,payload,expires_at) values((p_proposal->>'id')::uuid,p_owner,p_bridge,p_proposal,to_timestamp((p_proposal->>'expiresAt')::numeric/1000)) returning * into old;
 insert into public.trade_operation_journal(proposal_id,kind,payload)values(old.id,'PROPOSTA',p_proposal);
 return to_jsonb(old);
end $$;
create function public.trade_confirm(p_owner text,p_id uuid,p_action text,p_command jsonb,p_max int,p_account text,p_max_age int) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.trade_operation_proposals;
begin
 select * into p from public.trade_operation_proposals where id=p_id and owner_id=p_owner for update;
 if not found then raise exception 'Proposal not found'; end if;
 if p_action not in ('confirm','discard') then raise exception 'Invalid action'; end if;
 if p.state<>'AGUARDANDO CONFIRMAÇÃO' then return to_jsonb(p); end if;
 if p.expires_at<=now() then update public.trade_operation_proposals set state='EXPIRADA' where id=p.id returning * into p;
 elsif p_action='discard' then update public.trade_operation_proposals set state='DESCARTADA' where id=p.id returning * into p;
 else
 update public.trade_operation_proposals set state='CONFIRMADA',confirmed_at=now(),paper_cursor=(payload->>'cursor')::bigint where id=p.id returning * into p;
 if p.payload->>'mode'='REAL' then
 if p_command->>'id'<>p.id::text then raise exception 'Command mismatch'; end if;
 perform public.trade_bridge_enqueue(p.bridge_id,p_command,p_max,p_account,p_max_age);
 end if;
 end if;
 insert into public.trade_operation_journal(proposal_id,kind,payload)values(p.id,p.state,to_jsonb(p));
 return to_jsonb(p);
end $$;
create function public.trade_operations_read(p_owner text) returns jsonb language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('command',(select to_jsonb(c) from public.trade_bridge_commands c where c.id=p.id),'events',(select coalesce(jsonb_agg(e.payload),'[]'::jsonb) from public.trade_bridge_events e where e.bridge_id=p.bridge_id and e.payload->>'commandId'=p.id::text),'journal',(select coalesce(jsonb_agg(j order by j.id),'[]'::jsonb) from public.trade_operation_journal j where j.proposal_id=p.id)) order by p.created_at desc),'[]'::jsonb) from (select * from public.trade_operation_proposals where owner_id=p_owner order by created_at desc limit 40)p;
$$;
create function public.trade_operation_observe(p_owner text,p_id uuid,p_execution jsonb,p_cursor bigint) returns void language plpgsql security invoker set search_path='' as $$
declare p public.trade_operation_proposals;
begin
 select * into p from public.trade_operation_proposals where id=p_id and owner_id=p_owner for update;
 if not found or p.state<>'CONFIRMADA' then return; end if;
 if p.payload->>'mode'='PAPER' and p_cursor<=p.paper_cursor then return; end if;
 if p.execution is distinct from p_execution then
 update public.trade_operation_proposals set execution=p_execution,paper_cursor=case when payload->>'mode'='PAPER' then p_cursor else paper_cursor end where id=p_id;
 insert into public.trade_operation_journal(proposal_id,kind,payload) values(p.id,'ACOMPANHAMENTO',p_execution);
 end if;
end $$;
revoke all on function public.trade_approved_command(),public.trade_propose(text,text,jsonb),public.trade_confirm(text,uuid,text,jsonb,int,text,int),public.trade_operations_read(text),public.trade_operation_observe(text,uuid,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.trade_approved_command(),public.trade_propose(text,text,jsonb),public.trade_confirm(text,uuid,text,jsonb,int,text,int),public.trade_operations_read(text),public.trade_operation_observe(text,uuid,jsonb,bigint) to service_role;
-- Transaction events survive browser closure and are recorded exactly once by event PK.
create function public.trade_journal_broker_event() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.payload->>'commandId' ~ '^[0-9a-f-]{36}$' and exists(select 1 from public.trade_operation_proposals where id=(new.payload->>'commandId')::uuid) then
 insert into public.trade_operation_journal(proposal_id,kind,payload)values((new.payload->>'commandId')::uuid,'MT5_'||upper(new.payload->>'kind'),new.payload);
 end if;
 return new;
end $$;
create trigger trade_record_broker_event after insert on public.trade_bridge_events for each row execute function public.trade_journal_broker_event();
revoke all on function public.trade_journal_broker_event() from public,anon,authenticated;
grant execute on function public.trade_journal_broker_event() to service_role;
-- Legacy undispatched commands have no approval proof; never deliver them after upgrade.
with cancelled as (
 update public.trade_bridge_commands c set state='cancelled',result=jsonb_build_object('reason','Human approval required after upgrade')
 where c.state='queued' and not exists(select 1 from public.trade_operation_proposals p where p.id=c.id and p.state='CONFIRMADA')
 returning c.bridge_id,c.id
) insert into public.trade_bridge_audit(bridge_id,action,payload)select bridge_id,'legacy_command_cancelled',jsonb_build_object('id',id)from cancelled;
