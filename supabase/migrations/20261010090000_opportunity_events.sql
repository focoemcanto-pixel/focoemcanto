-- OPORTUNIDADE ATIVA: lifecycle events of the opportunity card, appended to the EXISTING per-proposal journal
-- (trade_operation_journal). Additive: one function, no table. It only inserts journal rows; it never changes a
-- proposal's state, creates a command, arms a session or touches the kill switch.
--
-- The server stamps every event with its own clock, the proposal's mode, strategy/version, setup id, state and
-- the remaining validity computed from the stored expires_at (the client never supplies time). One-shot kinds
-- (presented, expired, invalidated, discarded) are recorded once per proposal so polling can't duplicate them.
create function public.trade_opportunity_event(p_owner text,p_id uuid,p_kind text,p_payload jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare p public.trade_operation_proposals;
begin
 if p_kind is null or p_kind not in ('OPPORTUNITY_PRESENTED','OPPORTUNITY_MINIMIZED','OPPORTUNITY_RESTORED','OPPORTUNITY_EXPIRED','OPPORTUNITY_INVALIDATED',
  'DISCARDED_BY_OPERATOR','ENTER_CLICKED','FINAL_CONFIRMATION_PRESENTED','FINAL_CONFIRMATION_EXPIRED','FINAL_CONFIRMATION_CANCELLED') then
  raise exception 'OPPORTUNITY_EVENT_INVALID';
 end if;
 select * into p from public.trade_operation_proposals where id=p_id and owner_id=p_owner;
 if not found then return; end if;
 if p_kind in ('OPPORTUNITY_PRESENTED','OPPORTUNITY_EXPIRED','OPPORTUNITY_INVALIDATED','DISCARDED_BY_OPERATOR')
  and exists(select 1 from public.trade_operation_journal j where j.proposal_id=p_id and j.kind=p_kind) then return; end if;
 insert into public.trade_operation_journal(proposal_id,kind,payload) values(p_id,p_kind,jsonb_build_object(
  'at',now(),
  'mode',p.payload->>'mode',
  'state',p.state,
  'setupId',p.payload->'setup'->>'id',
  'strategy',p.payload->'setup'->>'strategy',
  'version',p.payload->'setup'->>'version',
  'remainingMs',greatest(0,floor(extract(epoch from (p.expires_at-now()))*1000))::bigint,
  'reason',left(coalesce(p_payload->>'reason',''),40)));
end $$;
revoke all on function public.trade_opportunity_event(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.trade_opportunity_event(text,uuid,text,jsonb) to service_role;
