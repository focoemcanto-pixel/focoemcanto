-- Transport stability: trade_operations_read was the heaviest query of the project (mean ~1.5 s, peaks of 5-9 s,
-- ~23 MB of temp spill per call) because, for each of up to 500 proposals, it sequentially scanned the whole
-- trade_operation_journal (no index on proposal_id) and returned every journal row with its full snapshot
-- (12k+ rows, mostly HIPOTETICO_PAPER observations, ~8 MB) on every 2 s poll of /trade.
--
-- Additive and behaviour-preserving for state: same proposals, same order, same command/events. The journal
-- returned per proposal is now its 50 most recent entries as {id, kind, created_at}, oldest first, which is
-- everything the UI diary shows. The full journal (with payloads) stays in trade_operation_journal for audit.
create index if not exists trade_operation_journal_proposal on public.trade_operation_journal(proposal_id, id desc);

create or replace function public.trade_operations_read(p_owner text) returns jsonb language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object(
   'command',(select to_jsonb(c) from public.trade_bridge_commands c where c.id=p.id),
   'events',(select coalesce(jsonb_agg(e.payload),'[]'::jsonb) from public.trade_bridge_events e where e.bridge_id=p.bridge_id and e.payload->>'commandId'=p.id::text),
   'journal',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'kind',j.kind,'created_at',j.created_at) order by j.id),'[]'::jsonb)
     from (select id,kind,created_at from public.trade_operation_journal where proposal_id=p.id order by id desc limit 50) j)
  ) order by p.created_at desc),'[]'::jsonb)
 from (select * from public.trade_operation_proposals where owner_id=p_owner and ((state='CONFIRMADA' and execution->>'exitTime' is null) or (state in ('DESCARTADA','BLOQUEADA POR RISCO') and hypothetical_execution->>'exitTime' is null) or created_at>now()-interval '30 days') order by created_at desc limit 500) p;
$$;
