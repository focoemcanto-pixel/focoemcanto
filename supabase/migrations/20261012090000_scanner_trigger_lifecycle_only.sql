-- Root cause of the 2026-10-09 database saturation (statement timeouts, PostgREST restarts, Postgres crash-recoveries,
-- PERSISTENCE_UNAVAILABLE on the EA exchange): trade_scanner_proposal_event ran AFTER EVERY UPDATE of
-- trade_operation_proposals, including the hypothetical-observation updates written once per candle for every followed
-- proposal. Each run rewrote the setup watch and REBUILT trade_scanner_state.payload from all watches of the scope
-- (~3k rows, a ~1.4 MB jsonb), producing ~1.2 MB of WAL per call and serialising every writer on the shared scanner row.
--
-- Same function, one change: an UPDATE that does not change the lifecycle (same derived watch state and same proposal
-- state) is a no-op. Inserts and real lifecycle transitions (proposed → accepted/rejected/open/closed/expired/blocked)
-- behave exactly as before, so watches, transitions, human decisions and the scanner snapshot keep the same content.
create or replace function public.trade_scanner_proposal_event() returns trigger language plpgsql security invoker set search_path='' as $$
declare ws text; old_ws text;
begin
 if new.payload->>'mode'<>'PAPER' then return new;end if;
 ws=case when new.state='BLOQUEADA POR RISCO' then 'RISK_BLOCKED' when new.execution->>'exitTime' is not null then 'CLOSED_PAPER' when new.execution->>'entry' is not null then 'OPEN_PAPER' when new.state='CONFIRMADA' then 'ACCEPTED' when new.state='DESCARTADA' then 'REJECTED_BY_USER' when new.state='EXPIRADA' then 'EXPIRED' else 'PROPOSED' end;
 if tg_op='UPDATE' then
  old_ws=case when old.state='BLOQUEADA POR RISCO' then 'RISK_BLOCKED' when old.execution->>'exitTime' is not null then 'CLOSED_PAPER' when old.execution->>'entry' is not null then 'OPEN_PAPER' when old.state='CONFIRMADA' then 'ACCEPTED' when old.state='DESCARTADA' then 'REJECTED_BY_USER' when old.state='EXPIRADA' then 'EXPIRED' else 'PROPOSED' end;
  if old_ws=ws and old.state is not distinct from new.state and old.payload->>'setupWatchId' is not distinct from new.payload->>'setupWatchId' and old.payload->>'scope' is not distinct from new.payload->>'scope' then return new;end if;
 end if;
 if new.state in ('CONFIRMADA','DESCARTADA') then
 insert into public.trade_human_decisions(proposal_id,decision,payload)values(new.id,new.state,new.payload)on conflict do nothing;
 end if;
 update public.trade_setup_watches set state=ws,payload=payload||jsonb_build_object('state',ws,'proposalId',new.id,'transitions',coalesce(payload->'transitions','[]'::jsonb)||case when state<>ws then jsonb_build_array(jsonb_build_object('from',state,'to',ws,'at',extract(epoch from now())::bigint,'reason',case when ws='RISK_BLOCKED' then 'Proposta técnica bloqueada por risco (quantidade 0)' else 'Human approval / PAPER lifecycle' end)) else '[]'::jsonb end)where owner_id=new.owner_id and scope=new.payload->>'scope' and id=new.payload->>'setupWatchId';
 update public.trade_scanner_state s set payload=jsonb_set(s.payload,'{watches}',coalesce((select jsonb_agg(w.payload)from public.trade_setup_watches w where w.owner_id=new.owner_id and w.scope=new.payload->>'scope'),'[]'::jsonb))where s.owner_id=new.owner_id and s.scope=new.payload->>'scope';
 return new;
end $$;
