-- Fix: trade_real_arm accumulated refusal reasons with `fails:=fails||'X'`. In PostgreSQL the untyped literal
-- is resolved as text[] and raises "malformed array literal", so any refused arm surfaced as a cryptic
-- error instead of "ARM_BLOCKED: <reasons>". Arming stayed fail-closed (it never armed), only the reason
-- was lost. Same body, reasons now appended with array_append. Also requires the policy to come from
-- GESTÃO DE RISCO · REAL (risk_settings_version), mirroring the readiness gate (defense in depth).
create or replace function public.trade_real_arm(p_owner text,p_bridge text,p_minutes int,p_account text,p_age int,p_backend boolean,p_confirmation text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.trade_bridge_state; p public.trade_execution_policy; fails text[]:='{}'; zone text; tick_ms numeric; now_ms numeric:=extract(epoch from now())*1000; r public.trade_real_sessions; loss numeric;
begin
 perform pg_advisory_xact_lock(hashtext(p_bridge));
 select * into s from public.trade_bridge_state where bridge_id=p_bridge;
 select * into p from public.trade_execution_policy where bridge_id=p_bridge;
 select coalesce(z.source_timezone,'UTC') into zone from (select 1) one left join public.trade_bridge_clock_settings z on z.bridge_id=p_bridge;
 if p_confirmation is distinct from 'ARMAR SESSÃO REAL' then fails:=array_append(fails,'CONFIRMATION');end if;
 if not coalesce(p_backend,false) then fails:=array_append(fails,'BACKEND_EXECUTION_DISABLED');end if;
 if s.bridge_id is null or p.bridge_id is null then raise exception 'ARM_BLOCKED: BRIDGE_OR_POLICY_MISSING';end if;
 if not p.enabled then fails:=array_append(fails,'POLICY_DISABLED');end if;
 if p.risk_settings_version is null then fails:=array_append(fails,'POLICY_NOT_FROM_REAL_RISK_SETTINGS');end if;
 if p.max_risk_brl is null or p.max_daily_loss_brl is null or p.max_slippage_points is null or p.max_position_contracts is null or p.max_notional_brl is null or p.max_orders_per_session is null or p.max_orders_per_day is null then fails:=array_append(fails,'POLICY_LIMITS_MISSING');end if;
 if p_minutes is null or p_minutes<1 or p_minutes>p.max_session_minutes then fails:=array_append(fails,'SESSION_DURATION');end if;
 if p_account is null or p_account !~ '^[a-f0-9]{64}$' or p.account_hash<>p_account or s.account_hash<>p_account or p.account_trade_mode is distinct from 2 or s.state->'accountTradeMode' is distinct from '2'::jsonb then fails:=array_append(fails,'ACCOUNT');end if;
 if s.symbol<>p.symbol or coalesce(s.tick->>'symbol','')<>p.symbol then fails:=array_append(fails,'SYMBOL');end if;
 if p.contract_expires_at is null or p.contract_expires_at<=now() or not p.rollover_confirmed or jsonb_typeof(s.state->'expirationTime') is distinct from 'number' or (s.state->>'expirationTime')::numeric<=extract(epoch from now()) then fails:=array_append(fails,'CONTRACT');end if;
 if s.received_at<now()-make_interval(secs=>p_age/1000.0) or s.state->'connected' is distinct from 'true'::jsonb or s.state->'protocolVersion' is distinct from '2'::jsonb or s.state->>'magic' is distinct from '706032601' then fails:=array_append(fails,'BRIDGE');end if;
 begin tick_ms:=public.trade_bridge_market_epoch((s.tick->>'timeMsc')::bigint,zone); exception when others then tick_ms:=null; end;
 if tick_ms is null or tick_ms<now_ms-p_age or tick_ms>now_ms+2000 then fails:=array_append(fails,'FEED');end if;
 if s.state->'executionAllowed' is distinct from 'true'::jsonb or s.state->'localAccountAuthorized' is distinct from 'true'::jsonb or coalesce((s.state->'localLimits'->>'maxRiskBRL')::numeric,0)<=0 or coalesce((s.state->'localLimits'->>'maxLossBRL')::numeric,0)<=0 or coalesce((s.state->'localLimits'->>'maxSlippagePoints')::numeric,0)<=0 or coalesce((s.state->'localLimits'->>'maxContracts')::int,0)<1 or coalesce((s.state->'localLimits'->>'maxPositions')::int,0)<1 then fails:=array_append(fails,'EA');end if;
 if s.state->'sessionOpen' is distinct from 'true'::jsonb or s.state->'tradeMode' is distinct from '4'::jsonb or (jsonb_array_length(p.session_windows)>0 and not exists(select 1 from jsonb_array_elements(p.session_windows)w where (w->>'open')::timestamptz<=now() and (w->>'close')::timestamptz>now())) then fails:=array_append(fails,'MARKET_SESSION');end if;
 if s.state->'historyReady' is distinct from 'true'::jsonb or s.state->'protectionFault' is distinct from 'false'::jsonb or exists(select 1 from public.trade_bridge_commands c where c.bridge_id=p_bridge and c.state in ('queued','dispatch_unknown','submitted')) then fails:=array_append(fails,'RECONCILIATION');end if;
 if jsonb_typeof(s.state->'positions') is distinct from 'array' or jsonb_typeof(s.state->'orders') is distinct from 'array' or jsonb_array_length(s.state->'positions')>0 or jsonb_array_length(s.state->'orders')>0 then fails:=array_append(fails,'EXPOSURE');end if;
 begin loss:=(s.state->>'loss24hBRL')::numeric; exception when others then loss:=null; end;
 if loss is null or loss<0 or p.max_daily_loss_brl is null or loss>=least(p.max_daily_loss_brl,coalesce((s.state->'localLimits'->>'maxLossBRL')::numeric,0)) then fails:=array_append(fails,'DAILY_LOSS');end if;
 if not exists(select 1 from public.trade_live_authorizations a where a.live_authorized and a.stage='live-monitoring') then fails:=array_append(fails,'STRATEGY_AUTHORIZATION');end if;
 if array_length(fails,1)>0 then
 insert into public.trade_bridge_audit(bridge_id,action,payload)values(p_bridge,'real_session_arm_blocked',jsonb_build_object('failed',to_jsonb(fails)));
 raise exception 'ARM_BLOCKED: %',array_to_string(fails,',');
 end if;
 update public.trade_real_sessions set disarmed_at=now(),disarm_reason='REARMED' where bridge_id=p_bridge and disarmed_at is null;
 insert into public.trade_real_sessions(bridge_id,owner_id,expires_at,account_hash,symbol,bridge_session,policy_fingerprint,checklist)
 values(p_bridge,p_owner,now()+make_interval(mins=>p_minutes),p_account,p.symbol,s.session,public.trade_policy_fingerprint(p),jsonb_build_object('minutes',p_minutes,'maxRiskBRL',p.max_risk_brl,'maxDailyLossBRL',p.max_daily_loss_brl,'maxContracts',p.max_contracts,'symbol',p.symbol)) returning * into r;
 -- Arming is the only path that releases the kill switch. It never queues or sends a command.
 update public.trade_bridge_state set kill_switch=false where bridge_id=p_bridge;
 insert into public.trade_bridge_audit(bridge_id,action,payload)values(p_bridge,'real_session_armed',jsonb_build_object('sessionId',r.id,'expiresAt',r.expires_at,'minutes',p_minutes));
 return jsonb_build_object('armed',true,'sessionId',r.id,'armedAt',r.armed_at,'expiresAt',r.expires_at);
end $$;
