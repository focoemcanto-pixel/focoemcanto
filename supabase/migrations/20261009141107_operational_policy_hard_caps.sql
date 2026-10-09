-- Additive enforcement, no tables or data rewritten. All old execution/human confirmation gates retained.
create or replace function public.trade_real_context(p_bridge text) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('bridge',(select public.trade_bridge_status(p_bridge)||jsonb_build_object('accountHash',account_hash,'bridgeId',bridge_id,'symbol',symbol,'session',session)from public.trade_bridge_state where bridge_id=p_bridge),
 'policyFingerprint',(select public.trade_policy_fingerprint(p) from public.trade_execution_policy p where bridge_id=p_bridge),
 'policy',(select to_jsonb(p)from public.trade_execution_policy p where bridge_id=p_bridge),
 'authorizations',(select coalesce(jsonb_agg(a),'[]')from public.trade_live_authorizations a),
 'unresolved',(select count(*)from public.trade_bridge_commands where bridge_id=p_bridge and state in ('queued','dispatch_unknown','submitted')),
 'ordersDay',(select count(*)from public.trade_bridge_commands where bridge_id=p_bridge and created_at>=(date_trunc('day',now() at time zone 'America/Sao_Paulo')at time zone 'America/Sao_Paulo')),
 'ordersSession',(select count(*)from public.trade_bridge_commands where bridge_id=p_bridge and created_at>=coalesce((select min((w->>'open')::timestamptz)from public.trade_execution_policy p,jsonb_array_elements(p.session_windows)w where p.bridge_id=p_bridge and (w->>'open')::timestamptz<=now()and(w->>'close')::timestamptz>now()),(select r.armed_at from public.trade_real_sessions r where r.bridge_id=p_bridge and r.disarmed_at is null),'infinity'::timestamptz)),
 'session',(select to_jsonb(r)-'account_hash'-'policy_fingerprint'||jsonb_build_object('active',public.trade_real_session_active(p_bridge)) from public.trade_real_sessions r where r.bridge_id=p_bridge order by r.armed_at desc limit 1));
$$;
-- Existing local inputs are immutable hard caps, never overwritten by remote policy.
-- Legacy v2.07 keeps its original gates; capability policyProtocol=1 opts into signed policy receipts.
create or replace function public.trade_policy_receipt_valid(p_bridge text) returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce((s.state->'policyProtocol' is distinct from '1'::jsonb) or (
 s.state->'policyReceipt'->>'hash'=public.trade_policy_fingerprint(p)
 and s.state->'policyReceipt'->'version'=to_jsonb(p.risk_settings_version)
 and jsonb_typeof(s.state->'policyReceipt'->'validUntil')='number'
 and (s.state->'policyReceipt'->>'validUntil')::numeric>extract(epoch from now())*1000
 and coalesce((s.state->'transport'->>'consecutiveFailures')::int,0)=0),false)
 from public.trade_bridge_state s join public.trade_execution_policy p using(bridge_id) where bridge_id=p_bridge;
$$;

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
 if not coalesce(public.trade_policy_receipt_valid(p_bridge),false) then fails:=array_append(fails,'POLICY_SYNC_OR_TRANSPORT');end if;
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
create or replace function public.trade_real_valid(p_bridge text,p_payload jsonb,p_max int,p_account text,p_age int,p_ignore uuid default null) returns boolean language plpgsql security invoker set search_path='' as $$
declare s public.trade_bridge_state; p public.trade_execution_policy; zone text; tick_ms numeric; window_open timestamptz; price numeric; risk numeric; potential numeric; point_value numeric; q numeric; min_distance numeric; open_risk numeric; open_loss numeric; n bigint;
begin
 if p_payload->'inspectionOnly' is not null and p_payload->'inspectionOnly' is distinct from 'false'::jsonb then return false;end if;
 if p_payload is null or not (p_payload ?& array['quantity','entry','sl','tp','pointValue','riskBRL','riskPoints','asOf','expiresAt','setup','mode','source','symbol','direction']) or (p_payload->>'sl')::numeric<=0 or (p_payload->>'tp')::numeric<=0 or (p_payload->>'riskBRL')::numeric<=0 or (p_payload->>'riskPoints')::numeric<=0 then return false;end if;
 select * into s from public.trade_bridge_state where bridge_id=p_bridge;
 select * into p from public.trade_execution_policy where bridge_id=p_bridge;
 if not coalesce(public.trade_policy_receipt_valid(p_bridge),false) then return false;end if;
 -- JSON null/missing is not SQL false. Require complete typed evidence before comparisons.
 if p_max<1 or p_age not between 1000 and 60000 or p_account is null then return false;end if;
 if jsonb_typeof(p_payload->'setup'->'conditions') is distinct from 'array' or jsonb_array_length(p_payload->'setup'->'conditions')=0 or jsonb_typeof(p_payload->'setup'->'conflicts') is distinct from 'array' then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'setup'->'conditions')x where x->'met' is distinct from 'true'::jsonb) then return false;end if;
 if exists(select 1 from unnest(array['quantity','entry','sl','tp','pointValue','riskBRL','riskPoints','asOf','expiresAt'])k where jsonb_typeof(p_payload->k) is distinct from 'number') then return false;end if;
 if jsonb_typeof(s.state->'positions') is distinct from 'array' or jsonb_typeof(s.state->'orders') is distinct from 'array' then return false;end if;
 if exists(select 1 from unnest(array['timeMsc','bid','ask'])k where jsonb_typeof(s.tick->k) is distinct from 'number') then return false;end if;
 if exists(select 1 from unnest(array['tickSize','tickValue','volumeMin','volumeStep','volumeMax','point','stopsLevel','expirationTime','historyAsOfMsc','loss24hBRL'])k where jsonb_typeof(s.state->k) is distinct from 'number') then return false;end if;
 if s.state->>'magic' is distinct from '706032601' or (s.state->>'stopsLevel')::numeric<0 then return false;end if;
 if s.bridge_id is null or p.bridge_id is null then return false; end if;
 -- A deliberate, unexpired REAL session bound to this bridge/account/symbol/policy is required.
 if not public.trade_real_session_active(p_bridge) then return false;end if;
 select coalesce(z.source_timezone,'UTC') into zone from (select 1) one left join public.trade_bridge_clock_settings z on z.bridge_id=p_bridge;
 tick_ms:=public.trade_bridge_market_epoch((s.tick->>'timeMsc')::bigint,zone);
 if not p.enabled or s.kill_switch or p.account_hash<>p_account or s.account_hash<>p_account or p_account !~ '^[a-f0-9]{64}$' or s.symbol<>p.symbol or p_payload->>'symbol'<>p.symbol or p_payload->>'mode'<>'REAL' or p_payload->>'source'<>'mt5' then return false; end if;
 if coalesce(s.state->>'connected','false')<>'true' or coalesce(s.state->>'executionAllowed','false')<>'true' or coalesce(s.state->>'protocolVersion','0')<>'2' or s.state->>'magic'<>'706032601' or s.received_at<now()-make_interval(secs=>p_age/1000.0) or s.received_at>now()+interval '2 seconds' then return false; end if;
 if not exists(select 1 from public.trade_live_authorizations a where a.strategy_id=p_payload->'setup'->>'strategy' and a.version=p_payload->'setup'->>'version' and a.live_authorized and a.stage='live-monitoring')then return false; end if;
 if p.contract_expires_at is null or p.contract_expires_at<=now() or not p.rollover_confirmed or coalesce((s.state->>'expirationTime')::numeric,0)<=extract(epoch from now()) then return false; end if;
 -- Dated policy windows are optional extra restrictions; the armed session is always the operating window.
 if (jsonb_array_length(p.session_windows)>0 and not exists(select 1 from jsonb_array_elements(p.session_windows)w where (w->>'open')::timestamptz<=now() and (w->>'close')::timestamptz>now())) or coalesce(s.state->>'sessionOpen','false')<>'true' or coalesce(s.state->>'tradeMode','0')<>'4' then return false; end if;
 -- Tick time is broker-wall labelled; compare its market epoch (bridge_market_clock), never the raw label.
 if tick_ms not between extract(epoch from now())*1000-p_age and extract(epoch from now())*1000+2000 or coalesce(s.tick->>'symbol','')<>p.symbol then return false; end if;
 if coalesce(s.state->>'historyReady','false')<>'true' or coalesce(s.state->>'protectionFault','true')<>'false' or coalesce((s.state->>'historyAsOfMsc')::numeric,0) not between extract(epoch from now())*1000-p_age and extract(epoch from now())*1000+2000 then return false; end if;
 if exists(select 1 from public.trade_bridge_commands where bridge_id=p_bridge and state in ('queued','dispatch_unknown','submitted') and id is distinct from p_ignore)then return false; end if;
 if coalesce(s.state->>'localAccountAuthorized','false')<>'true' or coalesce((s.state->'localLimits'->>'maxRiskBRL')::numeric,0)<=0 or coalesce((s.state->'localLimits'->>'maxLossBRL')::numeric,0)<=0 or coalesce((s.state->'localLimits'->>'maxSlippagePoints')::numeric,0)<=0 or coalesce((s.state->'localLimits'->>'maxContracts')::int,0)<1 or coalesce((s.state->'localLimits'->>'maxPositions')::int,0)<1 then return false; end if;
 if p.max_risk_brl is null or p.max_daily_loss_brl is null or p.max_slippage_points is null or coalesce(s.state->>'currency','')<>'BRL' or coalesce((s.state->>'volumeMin')::numeric,0)<=0 or coalesce((s.state->>'volumeStep')::numeric,0)<=0 or coalesce((s.state->>'volumeMax')::numeric,0)<=0 or coalesce((s.state->>'tickSize')::numeric,0)<=0 or coalesce((s.state->>'tickValue')::numeric,0)<=0 or coalesce((s.state->>'point')::numeric,0)<=0 or (s.state->>'stopsLevel') is null then return false; end if;
 if (s.tick->>'bid')::numeric<=0 or (s.tick->>'ask')::numeric<(s.tick->>'bid')::numeric then return false; end if;
 q:=(p_payload->>'quantity')::numeric;
 if q<>floor(q) or q<(s.state->>'volumeMin')::numeric or q>least(p_max,p.max_contracts,(s.state->'localLimits'->>'maxContracts')::numeric,(s.state->>'volumeMax')::numeric) or abs(q/(s.state->>'volumeStep')::numeric-round(q/(s.state->>'volumeStep')::numeric))>0.0000001 then return false; end if;
 price:=case when p_payload->>'direction'='BUY' then (s.tick->>'ask')::numeric when p_payload->>'direction'='SELL' then (s.tick->>'bid')::numeric else null end;
 if price is null then return false; end if;
 risk:=case when p_payload->>'direction'='BUY' then price-(p_payload->>'sl')::numeric else (p_payload->>'sl')::numeric-price end;
 potential:=case when p_payload->>'direction'='BUY' then (p_payload->>'tp')::numeric-price else price-(p_payload->>'tp')::numeric end;
 point_value:=(s.state->>'tickValue')::numeric/(s.state->>'tickSize')::numeric;
 min_distance:=(s.state->>'stopsLevel')::numeric*(s.state->>'point')::numeric;
 if risk<=0 or potential<=0 or risk<min_distance or potential<min_distance or abs(price-(p_payload->>'entry')::numeric)>least(p.max_slippage_points,(s.state->'localLimits'->>'maxSlippagePoints')::numeric) or abs((p_payload->>'sl')::numeric/(s.state->>'tickSize')::numeric-round((p_payload->>'sl')::numeric/(s.state->>'tickSize')::numeric))>0.0000001 or abs((p_payload->>'tp')::numeric/(s.state->>'tickSize')::numeric-round((p_payload->>'tp')::numeric/(s.state->>'tickSize')::numeric))>0.0000001 or risk*point_value*q>least(p.max_risk_brl,(s.state->'localLimits'->>'maxRiskBRL')::numeric) or (p_payload->>'pointValue')::numeric<>point_value or abs((p_payload->>'riskBRL')::numeric-(p_payload->>'riskPoints')::numeric*point_value*q)>0.000001 or (p_payload->>'riskBRL')::numeric>p.max_risk_brl then return false; end if;
 if (p_payload->>'expiresAt')::numeric<=extract(epoch from now())*1000 or (p_payload->>'asOf')::numeric not between extract(epoch from now())-120 and extract(epoch from now()) then return false; end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'setup'->'conditions')x where x->>'met'<>'true') or jsonb_array_length(p_payload->'setup'->'conflicts')<>0 then return false; end if;
 select count(*) into n from (select value x from jsonb_array_elements(s.state->'positions') union all select value x from jsonb_array_elements(s.state->'orders'))v;
 if n>0 or n>=least(p.max_positions,(s.state->'localLimits'->>'maxPositions')::int) or exists(select 1 from (select value x from jsonb_array_elements(s.state->'positions') union all select value x from jsonb_array_elements(s.state->'orders'))v where x->>'symbol'=p.symbol)then return false; end if;
 if exists(select 1 from jsonb_array_elements(s.state->'positions')x where coalesce((x->>'sl')::numeric,0)<=0 or x->>'symbol'<>p.symbol)then return false; end if;
 select coalesce(sum(abs((x->>'price')::numeric-(x->>'sl')::numeric)*(x->>'volume')::numeric*point_value),0),coalesce(sum(greatest(0,-(x->>'profit')::numeric)),0) into open_risk,open_loss from jsonb_array_elements(s.state->'positions')x;
 if (s.state->>'loss24hBRL') is null or (s.state->>'loss24hBRL')::numeric<0 or (s.state->>'loss24hBRL')::numeric+greatest(open_risk,open_loss)+greatest(risk*point_value*q,(p_payload->>'riskBRL')::numeric)>=least(p.max_daily_loss_brl,(s.state->'localLimits'->>'maxLossBRL')::numeric) then return false; end if;
 if p.account_trade_mode is distinct from 2 or s.state->'accountTradeMode' is distinct from '2'::jsonb then return false;end if;
 if p.max_position_contracts is null or q>p.max_position_contracts or p.max_notional_brl is null or price*point_value*q>p.max_notional_brl or p.max_orders_per_session is null or p.max_orders_per_day is null then return false;end if;
 if (select count(*)from public.trade_bridge_commands c where c.bridge_id=p_bridge and c.id is distinct from p_ignore and c.created_at>=(date_trunc('day',now() at time zone 'America/Sao_Paulo')at time zone 'America/Sao_Paulo'))>=p.max_orders_per_day then return false;end if;
 if (select count(*)from public.trade_bridge_commands c where c.bridge_id=p_bridge and c.id is distinct from p_ignore and c.created_at>=coalesce((select min((w->>'open')::timestamptz)from jsonb_array_elements(p.session_windows)w where (w->>'open')::timestamptz<=now()and(w->>'close')::timestamptz>now()),(select r.armed_at from public.trade_real_sessions r where r.bridge_id=p_bridge and r.disarmed_at is null)))>=p.max_orders_per_session then return false;end if;
 return true;
exception when others then return false;
end $$;
create or replace function public.trade_real_session_check(p_bridge text,p_age int) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.trade_real_sessions; s public.trade_bridge_state; p public.trade_execution_policy; reason text; zone text; tick_ms numeric; now_ms numeric:=extract(epoch from now())*1000; open_loss numeric;
begin
 select * into r from public.trade_real_sessions where bridge_id=p_bridge and disarmed_at is null;
 if not found then return jsonb_build_object('armed',false);end if;
 select * into s from public.trade_bridge_state where bridge_id=p_bridge;
 select * into p from public.trade_execution_policy where bridge_id=p_bridge;
 select coalesce(z.source_timezone,'UTC') into zone from (select 1) one left join public.trade_bridge_clock_settings z on z.bridge_id=p_bridge;
 begin
 tick_ms:=public.trade_bridge_market_epoch((s.tick->>'timeMsc')::bigint,zone);
 select coalesce(sum(greatest(0,-(x->>'profit')::numeric)),0) into open_loss from jsonb_array_elements(coalesce(s.state->'positions','[]'::jsonb))x;
 reason:=case
 when now()>=r.expires_at then 'EXPIRED'
 when s.bridge_id is null or s.kill_switch then 'KILL_SWITCH'
 when s.received_at<now()-make_interval(secs=>p_age/1000.0) or s.state->'connected' is distinct from 'true'::jsonb then 'BRIDGE_OFFLINE'
 when tick_ms is null or tick_ms<now_ms-p_age or tick_ms>now_ms+2000 then 'FEED_STALE'
 when s.session<>r.bridge_session then 'BRIDGE_RESTARTED'
 when s.account_hash<>r.account_hash or p.account_hash is distinct from r.account_hash or s.state->'accountTradeMode' is distinct from '2'::jsonb then 'ACCOUNT_CHANGED'
 when s.symbol<>r.symbol or p.symbol is distinct from r.symbol or coalesce(s.tick->>'symbol','')<>r.symbol then 'SYMBOL_CHANGED'
 when p.bridge_id is null or not p.enabled or public.trade_policy_fingerprint(p)<>r.policy_fingerprint then 'POLICY_CHANGED'
 when not coalesce(public.trade_policy_receipt_valid(p_bridge),false) then 'POLICY_SYNC_OR_TRANSPORT'
 when s.state->'executionAllowed' is distinct from 'true'::jsonb then 'EA_EXECUTION_DISABLED'
 when jsonb_typeof(s.state->'loss24hBRL') is distinct from 'number' or (s.state->>'loss24hBRL')::numeric+open_loss>=least(p.max_daily_loss_brl,(s.state->'localLimits'->>'maxLossBRL')::numeric) then 'DAILY_LOSS_LIMIT'
 when s.state->'protectionFault' is distinct from 'false'::jsonb or s.state->'historyReady' is distinct from 'true'::jsonb or exists(select 1 from public.trade_bridge_commands c where c.bridge_id=p_bridge and c.state='dispatch_unknown') then 'RECONCILIATION_PENDING'
 else null end;
 exception when others then reason:='CHECK_FAILED';
 end;
 if reason is not null then
 perform public.trade_real_disarm(p_bridge,reason);
 return jsonb_build_object('armed',false,'sessionId',r.id,'reason',reason);
 end if;
 return jsonb_build_object('armed',true,'sessionId',r.id,'armedAt',r.armed_at,'expiresAt',r.expires_at);
end $$;
revoke all on function public.trade_policy_receipt_valid(text) from public,anon,authenticated;
grant execute on function public.trade_policy_receipt_valid(text) to service_role;
