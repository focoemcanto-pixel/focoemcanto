-- Readiness and LAB risk evidence. Additive (create or replace / new functions only).
--
-- 1) trade_bridge_status: the bridge state and latest tick WITHOUT the 2.000-candle history. Callers that
--    only need feed/EA state (REAL context, health, PAPER price checks, diagnostics) no longer download
--    ~344 KB per call; the slow responses that surfaced as "Não foi possível acessar a persistência
--    Trade" (timeout) and made the REAL panel fall back to OFFLINE/desconectado come from that payload.
--    Same normalized market clock as trade_bridge_read (single source of truth for LIVE/STALE/OFFLINE).
create function public.trade_bridge_status(p_bridge text) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'state',s.state,'receivedAt',s.received_at,'killSwitch',s.kill_switch,
 'marketClock',jsonb_build_object('sourceTimezone',coalesce(z.source_timezone,'UTC'),'representation','UTC epoch milliseconds (ticks), UTC epoch seconds (candles)','originalsPreserved',true),
 'clockDiagnostics',jsonb_build_object('serverEpochMs',round(extract(epoch from statement_timestamp())*1000),'rawTickEpochMs',s.tick->'timeMsc','tickEpochMs',public.trade_bridge_market_epoch((s.tick->>'timeMsc')::bigint,coalesce(z.source_timezone,'UTC'))),
 'tick',case when s.tick is null then null else s.tick||jsonb_build_object('rawTimeMsc',s.tick->'timeMsc','timeMsc',public.trade_bridge_market_epoch((s.tick->>'timeMsc')::bigint,coalesce(z.source_timezone,'UTC'))) end,
 'candles','[]'::jsonb,
 'commands',(select coalesce(jsonb_agg(c),'[]'::jsonb) from (select id,state,created_at,result from public.trade_bridge_commands where bridge_id=p_bridge order by created_at desc limit 30)c))
 from public.trade_bridge_state s left join public.trade_bridge_clock_settings z on z.bridge_id=s.bridge_id where s.bridge_id=p_bridge;
$$;

-- 2) REAL context reads the light status (it never used the candle history). Everything else unchanged.
create or replace function public.trade_real_context(p_bridge text) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('bridge',(select public.trade_bridge_status(p_bridge)||jsonb_build_object('accountHash',account_hash,'bridgeId',bridge_id,'symbol',symbol)from public.trade_bridge_state where bridge_id=p_bridge),
 'policy',(select to_jsonb(p)from public.trade_execution_policy p where bridge_id=p_bridge),
 'authorizations',(select coalesce(jsonb_agg(a),'[]')from public.trade_live_authorizations a),
 'unresolved',(select count(*)from public.trade_bridge_commands where bridge_id=p_bridge and state in ('queued','dispatch_unknown','submitted')),
 'ordersDay',(select count(*)from public.trade_bridge_commands where bridge_id=p_bridge and created_at>=(date_trunc('day',now() at time zone 'America/Sao_Paulo')at time zone 'America/Sao_Paulo')),
 'ordersSession',(select count(*)from public.trade_bridge_commands where bridge_id=p_bridge and created_at>=coalesce((select min((w->>'open')::timestamptz)from public.trade_execution_policy p,jsonb_array_elements(p.session_windows)w where p.bridge_id=p_bridge and (w->>'open')::timestamptz<=now()and(w->>'close')::timestamptz>now()),(select r.armed_at from public.trade_real_sessions r where r.bridge_id=p_bridge and r.disarmed_at is null),'infinity'::timestamptz)),
 'session',(select to_jsonb(r)-'account_hash'-'policy_fingerprint'||jsonb_build_object('active',public.trade_real_session_active(p_bridge)) from public.trade_real_sessions r where r.bridge_id=p_bridge order by r.armed_at desc limit 1));
$$;

-- 3) LAB: each observation exposes the sizing of its proposal (risk version/hash, capital, 1R rule, 1R,
--    risk per contract, suggested/chosen quantity, total risk, % of 1R, daily limit) and any PAPER entry
--    refusals, so technical outcome and sizing can be studied separately. Read-only; nothing copied.
create or replace function public.trade_lab_read(p_owner text,p_since bigint) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object(
 'observations',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'source',o.source,'scope',o.scope,'symbol',o.symbol,'strategyId',o.strategy_id,'version',o.version,'configHash',o.config_hash,'direction',o.direction,
  'detectedAt',o.detected_at,'confirmedAt',o.confirmed_at,'lifecycle',o.lifecycle,'proposalState',o.proposal_state,'actionability',o.actionability,'outcome',o.outcome,'paper',o.paper,
  'snapshot',o.snapshot-'context'-'participants'||jsonb_build_object('strategy',(o.snapshot->'strategy')-'definition'),
  'risk',(select case when pr.id is null then null else jsonb_build_object(
    'proposalState',pr.payload->>'proposalState','riskSettingsVersion',pr.payload->'riskSettings'->'version','riskConfigHash',pr.payload->'riskSettings'->'configHash',
    'capitalBRL',pr.payload->'riskSettings'->'capitalBRL','riskModel',pr.payload->'riskSettings'->'riskModel','riskValue',pr.payload->'riskSettings'->'riskValue',
    'oneRBRL',coalesce(pr.payload->'riskSettings'->'oneRBRL',pr.payload->'sizing'->'maxRiskBRL'),'riskPerContractBRL',pr.payload->'riskPerContractBRL',
    'suggestedQuantity',coalesce(pr.payload->'sizing'->'suggestedQuantity',pr.payload->'quantity'),'chosenQuantity',coalesce(pr.payload->'sizing'->'chosenQuantity',pr.payload->'quantity'),
    'riskBRL',pr.payload->'riskBRL','dailyLossBRL',pr.payload->'riskSettings'->'dailyLossBRL','dailyBlocked',pr.payload->'riskSettings'->'dailyBlocked','blockCode',pr.payload->'riskBlock'->'code') end
   from public.trade_operation_proposals pr where pr.id=o.proposal_id),
  'refusals',(select coalesce(jsonb_agg(e.payload->>'code' order by e.id),'[]'::jsonb) from public.trade_setup_observation_events e where e.observation_id=o.id and e.kind='PAPER_ENTRY_REFUSED'),
  'notes',(select coalesce(jsonb_agg(jsonb_build_object('at',n.created_at,'note',n.note) order by n.id),'[]'::jsonb) from public.trade_setup_notes n where n.observation_id=o.id))
  order by o.confirmed_at desc),'[]'::jsonb) from (select * from public.trade_setup_observations where owner_id=p_owner and confirmed_at>=p_since order by confirmed_at desc limit 5000)o),
 'detected',(select count(*) from public.trade_setup_watches w where w.owner_id=p_owner and w.detected_at>=p_since and w.scope like 'mt5:%'),
 'registry',(select coalesce(jsonb_agg(jsonb_build_object('strategyId',strategy_id,'version',version,'configHash',config_hash,'status',status,'activatedAt',activated_at,'deactivatedAt',deactivated_at,'name',definition->>'name','timeframes',definition->'timeframes','parameters',definition->'parameters') order by strategy_id,version),'[]'::jsonb) from public.trade_strategy_versions),
 'periods',(select coalesce(jsonb_agg(to_jsonb(p) order by p.starts_at),'[]'::jsonb) from public.trade_lab_periods p));
$$;

revoke all on function public.trade_bridge_status(text),public.trade_real_context(text),public.trade_lab_read(text,bigint) from public,anon,authenticated;
grant execute on function public.trade_bridge_status(text),public.trade_real_context(text),public.trade_lab_read(text,bigint) to service_role;
