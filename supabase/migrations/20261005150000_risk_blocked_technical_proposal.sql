-- Technical proposal x risk sizing. Additive: no data is deleted or rewritten.
-- A confirmed setup always yields a technical proposal (entry, technical stop, target). When one
-- contract exceeds the configured risk limit the proposal is stored as 'BLOQUEADA POR RISCO'
-- (payload.proposalState = 'RISK_BLOCKED', quantity 0): visible and observable for study, never
-- confirmable, never a PAPER execution, never a bridge command or MT5 order.

-- 1) New terminal proposal state.
alter table public.trade_operation_proposals drop constraint if exists trade_operation_proposals_state_check;
alter table public.trade_operation_proposals add constraint trade_operation_proposals_state_check
 check(state in ('AGUARDANDO CONFIRMAÇÃO','DESCARTADA','EXPIRADA','CONFIRMADA','BLOQUEADA POR RISCO'));
-- A blocked row carries the RISK_BLOCKED payload with zero quantity; a RISK_BLOCKED payload is never confirmed.
alter table public.trade_operation_proposals add constraint trade_risk_blocked_quantity
 check(state<>'BLOQUEADA POR RISCO' or (payload->>'proposalState'='RISK_BLOCKED' and (payload->>'quantity')::numeric=0));
alter table public.trade_operation_proposals add constraint trade_risk_blocked_never_confirmed
 check(not(state='CONFIRMADA' and coalesce(payload->>'proposalState','')='RISK_BLOCKED'));

-- 2) Watch lifecycle mirrors the blocked proposal.
alter table public.trade_setup_watches drop constraint if exists trade_setup_watches_state_check;
alter table public.trade_setup_watches add constraint trade_setup_watches_state_check
 check(state in ('DETECTED','FORMING','WAITING_TRIGGER','CONFIRMED','PROPOSED','ACCEPTED','REJECTED_BY_USER','INVALIDATED','EXPIRED','OPEN_PAPER','CLOSED_PAPER','RISK_BLOCKED'));

-- 3) Blocked rows are terminal: no transition to confirmation, discard or expiry rewrites them.
create function public.trade_risk_blocked_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.state='BLOQUEADA POR RISCO' and (new.state<>old.state or new.payload is distinct from old.payload or new.execution is distinct from old.execution) then
 raise exception 'Risk blocked proposal is terminal';
 end if;
 return new;
end $$;
create trigger trade_risk_blocked_immutable before update on public.trade_operation_proposals for each row execute function public.trade_risk_blocked_immutable();

-- 4) Defense in depth: no command or REAL confirmation proof for a proposal without executable quantity.
create function public.trade_risk_blocked_command_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.trade_operation_proposals p where p.id=new.id and (p.state='BLOQUEADA POR RISCO' or coalesce(p.payload->>'proposalState','')='RISK_BLOCKED' or coalesce((p.payload->>'quantity')::numeric,0)<1)) then
 raise exception 'Risk blocked proposal cannot become an order';
 end if;
 return new;
end $$;
create trigger trade_risk_blocked_command_guard before insert on public.trade_bridge_commands for each row execute function public.trade_risk_blocked_command_guard();
create function public.trade_risk_blocked_proof_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.trade_operation_proposals p where p.id=new.proposal_id and (p.state='BLOQUEADA POR RISCO' or coalesce(p.payload->>'proposalState','')='RISK_BLOCKED' or coalesce((p.payload->>'quantity')::numeric,0)<1)) then
 raise exception 'Risk blocked proposal cannot be prepared';
 end if;
 return new;
end $$;
create trigger trade_risk_blocked_proof_guard before insert or update on public.trade_real_confirmations for each row execute function public.trade_risk_blocked_proof_guard();

-- 5) Proposal endpoint: RISK_BLOCKED payloads land directly in the blocked state; same dedupe as before
--    (one per watch for the scanner, one per setup id/mode/scope for manual proposals).
create or replace function public.trade_propose(p_owner text,p_bridge text,p_proposal jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare old public.trade_operation_proposals; blocked boolean:=coalesce(p_proposal->>'proposalState','')='RISK_BLOCKED';
begin
 perform pg_advisory_xact_lock(hashtext(p_owner));
 if blocked and (p_proposal->>'quantity')::numeric<>0 then raise exception 'Risk blocked proposal must have zero quantity';end if;
 if not blocked and coalesce((p_proposal->>'quantity')::numeric,0)<1 then raise exception 'Proposal without executable quantity';end if;
 if p_proposal->>'setupWatchId' is null then
 select * into old from public.trade_operation_proposals where owner_id=p_owner and state='AGUARDANDO CONFIRMAÇÃO' and expires_at>now() and payload->>'mode'=p_proposal->>'mode' and payload->>'source'=p_proposal->>'source' limit 1;
 else
 if p_proposal->>'mode'<>'PAPER' then raise exception 'Scanner PAPER only';end if;
 select * into old from public.trade_operation_proposals where owner_id=p_owner and payload->>'scope'=p_proposal->>'scope' and payload->>'setupWatchId'=p_proposal->>'setupWatchId' limit 1;
 end if;
 if found then return to_jsonb(old);end if;
 select * into old from public.trade_operation_proposals where owner_id=p_owner and payload->>'mode'=p_proposal->>'mode' and payload->'setup'->>'id'=p_proposal->'setup'->>'id' and coalesce(payload->>'scope','')=coalesce(p_proposal->>'scope','') and state in ('CONFIRMADA','DESCARTADA','BLOQUEADA POR RISCO') limit 1;
 if found then return to_jsonb(old);end if;
 insert into public.trade_operation_proposals(id,owner_id,bridge_id,payload,expires_at,state)values((p_proposal->>'id')::uuid,p_owner,p_bridge,p_proposal,to_timestamp((p_proposal->>'expiresAt')::numeric/1000),case when blocked then 'BLOQUEADA POR RISCO' else 'AGUARDANDO CONFIRMAÇÃO' end)returning * into old;
 insert into public.trade_operation_journal(proposal_id,kind,payload)values(old.id,case when blocked then 'BLOQUEADA_POR_RISCO' else 'PROPOSTA' end,p_proposal);return to_jsonb(old);
end $$;

-- 6) Hypothetical observation (study only) now also covers blocked technical proposals.
create or replace function public.trade_hypothetical_observe(p_owner text,p_id uuid,p_execution jsonb)returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.trade_operation_proposals set hypothetical_execution=p_execution where owner_id=p_owner and id=p_id and ((state='DESCARTADA' and payload->>'mode'='PAPER') or state='BLOQUEADA POR RISCO') and hypothetical_execution->>'exitTime' is null and hypothetical_execution is distinct from p_execution;
 if found then insert into public.trade_operation_journal(proposal_id,kind,payload)values(p_id,'HIPOTETICO_PAPER',p_execution);end if;
end $$;

-- 7) Long-running observations stay readable past the 30-day window, like discarded hypotheses.
create or replace function public.trade_operations_read(p_owner text) returns jsonb language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('command',(select to_jsonb(c)from public.trade_bridge_commands c where c.id=p.id),'events',(select coalesce(jsonb_agg(e.payload),'[]'::jsonb)from public.trade_bridge_events e where e.bridge_id=p.bridge_id and e.payload->>'commandId'=p.id::text),'journal',(select coalesce(jsonb_agg(j order by j.id),'[]'::jsonb)from public.trade_operation_journal j where j.proposal_id=p.id)) order by p.created_at desc),'[]'::jsonb)from(select * from public.trade_operation_proposals where owner_id=p_owner and ((state='CONFIRMADA' and execution->>'exitTime' is null)or(state in ('DESCARTADA','BLOQUEADA POR RISCO') and hypothetical_execution->>'exitTime' is null)or created_at>now()-interval '30 days')order by created_at desc limit 500)p;
$$;

-- 8) Scanner watch follows the blocked proposal (terminal RISK_BLOCKED), never ACCEPTED/OPEN_PAPER.
create or replace function public.trade_scanner_proposal_event() returns trigger language plpgsql security invoker set search_path='' as $$
declare ws text;
begin
 if new.payload->>'mode'<>'PAPER' then return new;end if;
 ws=case when new.state='BLOQUEADA POR RISCO' then 'RISK_BLOCKED' when new.execution->>'exitTime' is not null then 'CLOSED_PAPER' when new.execution->>'entry' is not null then 'OPEN_PAPER' when new.state='CONFIRMADA' then 'ACCEPTED' when new.state='DESCARTADA' then 'REJECTED_BY_USER' when new.state='EXPIRADA' then 'EXPIRED' else 'PROPOSED' end;
 if new.state in ('CONFIRMADA','DESCARTADA') then
 insert into public.trade_human_decisions(proposal_id,decision,payload)values(new.id,new.state,new.payload)on conflict do nothing;
 end if;
 update public.trade_setup_watches set state=ws,payload=payload||jsonb_build_object('state',ws,'proposalId',new.id,'transitions',coalesce(payload->'transitions','[]'::jsonb)||case when state<>ws then jsonb_build_array(jsonb_build_object('from',state,'to',ws,'at',extract(epoch from now())::bigint,'reason',case when ws='RISK_BLOCKED' then 'Proposta técnica bloqueada por risco (quantidade 0)' else 'Human approval / PAPER lifecycle' end)) else '[]'::jsonb end)where owner_id=new.owner_id and scope=new.payload->>'scope' and id=new.payload->>'setupWatchId';
 update public.trade_scanner_state s set payload=jsonb_set(s.payload,'{watches}',coalesce((select jsonb_agg(w.payload)from public.trade_setup_watches w where w.owner_id=new.owner_id and w.scope=new.payload->>'scope'),'[]'::jsonb))where s.owner_id=new.owner_id and s.scope=new.payload->>'scope';
 return new;
end $$;

revoke all on function public.trade_risk_blocked_immutable(),public.trade_risk_blocked_command_guard(),public.trade_risk_blocked_proof_guard(),public.trade_propose(text,text,jsonb),public.trade_hypothetical_observe(text,uuid,jsonb),public.trade_operations_read(text),public.trade_scanner_proposal_event() from public,anon,authenticated;
grant execute on function public.trade_risk_blocked_immutable(),public.trade_risk_blocked_command_guard(),public.trade_risk_blocked_proof_guard(),public.trade_propose(text,text,jsonb),public.trade_hypothetical_observe(text,uuid,jsonb),public.trade_operations_read(text),public.trade_scanner_proposal_event() to service_role;
notify pgrst,'reload schema';
