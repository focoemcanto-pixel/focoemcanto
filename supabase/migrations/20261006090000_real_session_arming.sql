-- REAL session arming. Additive and fail-closed: nothing here arms REAL or sends an order.
-- Static configuration (policy, live authorization, EA inputs, backend env) is set once.
-- Operating REAL then needs a deliberate, temporary ARMED SESSION created from the UI, plus
-- a READY proposal, a click and the second human confirmation for every order.
-- The session auto-disarms (sticky, never re-armed silently) on expiry, kill switch, bridge offline,
-- stale feed, EA restart, account/symbol/policy change, EA execution disabled, daily loss or
-- pending reconciliation.

alter table public.trade_execution_policy add column max_session_minutes integer not null default 120 check(max_session_minutes between 5 and 480);

create table public.trade_real_sessions (
 id uuid primary key default gen_random_uuid(),
 bridge_id text not null, owner_id text not null,
 armed_at timestamptz not null default now(), expires_at timestamptz not null,
 disarmed_at timestamptz, disarm_reason text,
 account_hash text not null, symbol text not null, bridge_session text not null,
 policy_fingerprint text not null, checklist jsonb not null default '{}'::jsonb,
 check(expires_at>armed_at)
);
create unique index trade_real_one_armed_session on public.trade_real_sessions(bridge_id) where disarmed_at is null;
alter table public.trade_real_sessions enable row level security;
revoke all on public.trade_real_sessions from public,anon,authenticated;
grant all on public.trade_real_sessions to service_role;

create function public.trade_policy_fingerprint(p public.trade_execution_policy) returns text language sql immutable security invoker set search_path='' as $$
 select md5((to_jsonb(p)-'updated_at')::text);
$$;

-- Read-only: is there an armed, unexpired session still bound to the same bridge session/account/symbol/policy?
create function public.trade_real_session_active(p_bridge text) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.trade_real_sessions r join public.trade_bridge_state s on s.bridge_id=r.bridge_id join public.trade_execution_policy p on p.bridge_id=r.bridge_id
 where r.bridge_id=p_bridge and r.disarmed_at is null and r.expires_at>now() and not s.kill_switch and p.enabled
 and s.session=r.bridge_session and s.account_hash=r.account_hash and p.account_hash=r.account_hash and s.symbol=r.symbol and p.symbol=r.symbol
 and public.trade_policy_fingerprint(p)=r.policy_fingerprint);
$$;

-- Ends the armed session (sticky): kill switch on, queued commands cancelled, reason audited.
create function public.trade_real_disarm(p_bridge text,p_reason text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.trade_real_sessions;
begin
 perform pg_advisory_xact_lock(hashtext(p_bridge));
 update public.trade_real_sessions set disarmed_at=now(),disarm_reason=left(coalesce(p_reason,'MANUAL'),60) where bridge_id=p_bridge and disarmed_at is null returning * into r;
 update public.trade_bridge_state set kill_switch=true where bridge_id=p_bridge;
 update public.trade_bridge_commands set state='cancelled',result=jsonb_build_object('reason','REAL session disarmed: '||coalesce(p_reason,'MANUAL')) where bridge_id=p_bridge and state='queued';
 insert into public.trade_bridge_audit(bridge_id,action,payload)values(p_bridge,'real_session_disarmed',jsonb_build_object('sessionId',r.id,'reason',coalesce(p_reason,'MANUAL')));
 return jsonb_build_object('armed',false,'sessionId',r.id,'reason',coalesce(p_reason,'MANUAL'));
end $$;

-- Evaluates the armed session against the current evidence and disarms it on any critical change.
create function public.trade_real_session_check(p_bridge text,p_age int) returns jsonb language plpgsql security invoker set search_path='' as $$
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

-- Deliberate arming from the UI. Every mandatory gate is rechecked here; any failure = not armed.
create function public.trade_real_arm(p_owner text,p_bridge text,p_minutes int,p_account text,p_age int,p_backend boolean,p_confirmation text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.trade_bridge_state; p public.trade_execution_policy; fails text[]:='{}'; zone text; tick_ms numeric; now_ms numeric:=extract(epoch from now())*1000; r public.trade_real_sessions; loss numeric;
begin
 perform pg_advisory_xact_lock(hashtext(p_bridge));
 select * into s from public.trade_bridge_state where bridge_id=p_bridge;
 select * into p from public.trade_execution_policy where bridge_id=p_bridge;
 select coalesce(z.source_timezone,'UTC') into zone from (select 1) one left join public.trade_bridge_clock_settings z on z.bridge_id=p_bridge;
 if p_confirmation is distinct from 'ARMAR SESSÃO REAL' then fails:=fails||'CONFIRMATION';end if;
 if not coalesce(p_backend,false) then fails:=fails||'BACKEND_EXECUTION_DISABLED';end if;
 if s.bridge_id is null or p.bridge_id is null then raise exception 'ARM_BLOCKED: BRIDGE_OR_POLICY_MISSING';end if;
 if not p.enabled then fails:=fails||'POLICY_DISABLED';end if;
 if p.max_risk_brl is null or p.max_daily_loss_brl is null or p.max_slippage_points is null or p.max_position_contracts is null or p.max_notional_brl is null or p.max_orders_per_session is null or p.max_orders_per_day is null then fails:=fails||'POLICY_LIMITS_MISSING';end if;
 if p_minutes is null or p_minutes<1 or p_minutes>p.max_session_minutes then fails:=fails||'SESSION_DURATION';end if;
 if p_account is null or p_account !~ '^[a-f0-9]{64}$' or p.account_hash<>p_account or s.account_hash<>p_account or p.account_trade_mode is distinct from 2 or s.state->'accountTradeMode' is distinct from '2'::jsonb then fails:=fails||'ACCOUNT';end if;
 if s.symbol<>p.symbol or coalesce(s.tick->>'symbol','')<>p.symbol then fails:=fails||'SYMBOL';end if;
 if p.contract_expires_at is null or p.contract_expires_at<=now() or not p.rollover_confirmed or jsonb_typeof(s.state->'expirationTime') is distinct from 'number' or (s.state->>'expirationTime')::numeric<=extract(epoch from now()) then fails:=fails||'CONTRACT';end if;
 if s.received_at<now()-make_interval(secs=>p_age/1000.0) or s.state->'connected' is distinct from 'true'::jsonb or s.state->'protocolVersion' is distinct from '2'::jsonb or s.state->>'magic' is distinct from '706032601' then fails:=fails||'BRIDGE';end if;
 begin tick_ms:=public.trade_bridge_market_epoch((s.tick->>'timeMsc')::bigint,zone); exception when others then tick_ms:=null; end;
 if tick_ms is null or tick_ms<now_ms-p_age or tick_ms>now_ms+2000 then fails:=fails||'FEED';end if;
 if s.state->'executionAllowed' is distinct from 'true'::jsonb or s.state->'localAccountAuthorized' is distinct from 'true'::jsonb or coalesce((s.state->'localLimits'->>'maxRiskBRL')::numeric,0)<=0 or coalesce((s.state->'localLimits'->>'maxLossBRL')::numeric,0)<=0 or coalesce((s.state->'localLimits'->>'maxSlippagePoints')::numeric,0)<=0 or coalesce((s.state->'localLimits'->>'maxContracts')::int,0)<1 or coalesce((s.state->'localLimits'->>'maxPositions')::int,0)<1 then fails:=fails||'EA';end if;
 if s.state->'sessionOpen' is distinct from 'true'::jsonb or s.state->'tradeMode' is distinct from '4'::jsonb or (jsonb_array_length(p.session_windows)>0 and not exists(select 1 from jsonb_array_elements(p.session_windows)w where (w->>'open')::timestamptz<=now() and (w->>'close')::timestamptz>now())) then fails:=fails||'MARKET_SESSION';end if;
 if s.state->'historyReady' is distinct from 'true'::jsonb or s.state->'protectionFault' is distinct from 'false'::jsonb or exists(select 1 from public.trade_bridge_commands c where c.bridge_id=p_bridge and c.state in ('queued','dispatch_unknown','submitted')) then fails:=fails||'RECONCILIATION';end if;
 if jsonb_typeof(s.state->'positions') is distinct from 'array' or jsonb_typeof(s.state->'orders') is distinct from 'array' or jsonb_array_length(s.state->'positions')>0 or jsonb_array_length(s.state->'orders')>0 then fails:=fails||'EXPOSURE';end if;
 begin loss:=(s.state->>'loss24hBRL')::numeric; exception when others then loss:=null; end;
 if loss is null or loss<0 or p.max_daily_loss_brl is null or loss>=least(p.max_daily_loss_brl,coalesce((s.state->'localLimits'->>'maxLossBRL')::numeric,0)) then fails:=fails||'DAILY_LOSS';end if;
 if not exists(select 1 from public.trade_live_authorizations a where a.live_authorized and a.stage='live-monitoring') then fails:=fails||'STRATEGY_AUTHORIZATION';end if;
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

-- Kill switch: blocks immediately and disarms. Releasing it is only possible through trade_real_arm.
create or replace function public.trade_bridge_kill(p_bridge text,p_enabled boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not p_enabled then raise exception 'Kill switch is released only by arming a REAL session';end if;
 perform public.trade_real_disarm(p_bridge,'KILL_SWITCH');
 insert into public.trade_bridge_audit(bridge_id,action,payload)values(p_bridge,'kill_switch',jsonb_build_object('enabled',true));
 return jsonb_build_object('killSwitch',true,'armed',false);
end $$;

-- One-time static configuration from the authenticated UI (policy changes always disarm).
create function public.trade_real_policy_save(p_bridge text,p_account text,p_symbol text,p_policy jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.trade_execution_policy;
begin
 perform pg_advisory_xact_lock(hashtext(p_bridge));
 if p_account is null or p_account !~ '^[a-f0-9]{64}$' then raise exception 'POLICY_ACCOUNT_REQUIRED';end if;
 if p_symbol is null or p_symbol !~ '^WIN[FGHJKMNQUVXZ][0-9]{2}$' then raise exception 'POLICY_SYMBOL_INVALID';end if;
 insert into public.trade_execution_policy(bridge_id)values(p_bridge)on conflict do nothing;
 update public.trade_execution_policy set
 enabled=coalesce((p_policy->>'enabled')::boolean,false),account_hash=p_account,symbol=p_symbol,account_trade_mode=2,
 contract_expires_at=(p_policy->>'contractExpiresAt')::timestamptz,rollover_confirmed=coalesce((p_policy->>'rolloverConfirmed')::boolean,false),
 max_contracts=(p_policy->>'maxContracts')::int,max_positions=1,max_position_contracts=(p_policy->>'maxContracts')::int,
 max_risk_brl=(p_policy->>'maxRiskBRL')::numeric,max_daily_loss_brl=(p_policy->>'maxDailyLossBRL')::numeric,max_slippage_points=(p_policy->>'maxSlippagePoints')::numeric,
 max_notional_brl=(p_policy->>'maxNotionalBRL')::numeric,max_orders_per_session=(p_policy->>'maxOrdersPerSession')::int,max_orders_per_day=(p_policy->>'maxOrdersPerDay')::int,
 max_session_minutes=coalesce((p_policy->>'maxSessionMinutes')::int,120),updated_at=now()
 where bridge_id=p_bridge returning * into p;
 if p.max_risk_brl is null or p.max_daily_loss_brl is null or p.max_slippage_points is null or p.max_notional_brl is null or p.max_orders_per_session is null or p.max_orders_per_day is null or p.max_contracts is null then raise exception 'POLICY_LIMITS_REQUIRED';end if;
 perform public.trade_real_disarm(p_bridge,'POLICY_CHANGED');
 return to_jsonb(p)-'account_hash';
end $$;
create function public.trade_live_authorization_set(p_strategy text,p_version text,p_authorized boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.trade_live_authorizations;
begin
 if p_strategy !~ '^[a-z0-9_]{3,80}$' or p_version !~ '^[0-9]+\.[0-9]+\.[0-9]+$' then raise exception 'AUTHORIZATION_INVALID';end if;
 insert into public.trade_live_authorizations(strategy_id,version,live_authorized,stage,approved_at)
 values(p_strategy,p_version,p_authorized,case when p_authorized then 'live-monitoring' else 'paper' end,case when p_authorized then now() end)
 on conflict(strategy_id,version)do update set live_authorized=excluded.live_authorized,stage=excluded.stage,approved_at=excluded.approved_at returning * into a;
 return to_jsonb(a);
end $$;

-- Execution validity: + armed session, + market-epoch tick freshness, optional dated windows.
create or replace function public.trade_real_valid(p_bridge text,p_payload jsonb,p_max int,p_account text,p_age int,p_ignore uuid default null) returns boolean language plpgsql security invoker set search_path='' as $$
declare s public.trade_bridge_state; p public.trade_execution_policy; zone text; tick_ms numeric; window_open timestamptz; price numeric; risk numeric; potential numeric; point_value numeric; q numeric; min_distance numeric; open_risk numeric; open_loss numeric; n bigint;
begin
 if p_payload->'inspectionOnly' is not null and p_payload->'inspectionOnly' is distinct from 'false'::jsonb then return false;end if;
 if p_payload is null or not (p_payload ?& array['quantity','entry','sl','tp','pointValue','riskBRL','riskPoints','asOf','expiresAt','setup','mode','source','symbol','direction']) or (p_payload->>'sl')::numeric<=0 or (p_payload->>'tp')::numeric<=0 or (p_payload->>'riskBRL')::numeric<=0 or (p_payload->>'riskPoints')::numeric<=0 then return false;end if;
 select * into s from public.trade_bridge_state where bridge_id=p_bridge;
 select * into p from public.trade_execution_policy where bridge_id=p_bridge;
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
-- Context now carries the current/last REAL session (never the account hash).
create or replace function public.trade_real_context(p_bridge text) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('bridge',(select public.trade_bridge_read(p_bridge)||jsonb_build_object('accountHash',account_hash,'bridgeId',bridge_id,'symbol',symbol)from public.trade_bridge_state where bridge_id=p_bridge),
 'policy',(select to_jsonb(p)from public.trade_execution_policy p where bridge_id=p_bridge),
 'authorizations',(select coalesce(jsonb_agg(a),'[]')from public.trade_live_authorizations a),
 'unresolved',(select count(*)from public.trade_bridge_commands where bridge_id=p_bridge and state in ('queued','dispatch_unknown','submitted')),
 'ordersDay',(select count(*)from public.trade_bridge_commands where bridge_id=p_bridge and created_at>=(date_trunc('day',now() at time zone 'America/Sao_Paulo')at time zone 'America/Sao_Paulo')),
 'ordersSession',(select count(*)from public.trade_bridge_commands where bridge_id=p_bridge and created_at>=coalesce((select min((w->>'open')::timestamptz)from public.trade_execution_policy p,jsonb_array_elements(p.session_windows)w where p.bridge_id=p_bridge and (w->>'open')::timestamptz<=now()and(w->>'close')::timestamptz>now()),(select r.armed_at from public.trade_real_sessions r where r.bridge_id=p_bridge and r.disarmed_at is null),'infinity'::timestamptz)),
 'session',(select to_jsonb(r)-'account_hash'-'policy_fingerprint'||jsonb_build_object('active',public.trade_real_session_active(p_bridge)) from public.trade_real_sessions r where r.bridge_id=p_bridge order by r.armed_at desc limit 1));
$$;

-- Every bridge heartbeat re-evaluates the armed session before any dispatch.
create or replace function public.trade_bridge_exchange_v2(p_batch jsonb,p_execution boolean,p_max int,p_account text,p_max_age int)returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; cmd public.trade_bridge_commands; proposal jsonb;
begin
 result:=public.trade_bridge_exchange(p_batch,false,p_max,p_account,p_max_age);
 perform public.trade_real_session_check(p_batch->>'bridgeId',p_max_age);
 if coalesce((result->>'duplicate')::boolean,false)or not p_execution then return result;end if;
 select * into cmd from public.trade_bridge_commands where bridge_id=p_batch->>'bridgeId' and state='queued' and expires_at>now() order by created_at limit 1 for update;
 if not found then return result;end if;
 select payload into proposal from public.trade_operation_proposals where id=cmd.id;
 if public.trade_real_valid(cmd.bridge_id,proposal,p_max,p_account,p_max_age,cmd.id)then
 update public.trade_bridge_commands set state='dispatch_unknown',dispatched_session=p_batch->>'session'where id=cmd.id;
 insert into public.trade_bridge_audit(bridge_id,action,payload)values(cmd.bridge_id,'dispatch_signed',cmd.payload);
 return jsonb_build_object('command',cmd.payload);
 end if;
 return result;
end $$;

-- Final enqueue (after the second human confirmation) measured the raw broker-wall tick label; fixed.
create or replace function public.trade_bridge_enqueue(p_bridge text,p_command jsonb,p_max integer,p_account text,p_max_age integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.trade_bridge_state; old public.trade_bridge_commands; exposure numeric;
begin
 perform pg_advisory_xact_lock(hashtext(p_bridge));
 select * into old from public.trade_bridge_commands where id=(p_command->>'id')::uuid;
 if found then if old.bridge_id<>p_bridge or old.payload<>p_command then raise exception 'Idempotency conflict'; end if; return jsonb_build_object('id',old.id,'state',old.state); end if;
 select * into s from public.trade_bridge_state where bridge_id=p_bridge for update;
 if not found or s.kill_switch or s.account_hash<>p_account or p_account='' or s.symbol<>p_command->>'symbol' or s.received_at<now()-make_interval(secs=>p_max_age/1000.0) or not (s.state->>'connected')::boolean or not (s.state->>'executionAllowed')::boolean then raise exception 'Execution gates closed'; end if;
 -- Broker-wall tick label converted to its market epoch (bridge_market_clock); never the raw label.
 if public.trade_bridge_market_epoch((s.tick->>'timeMsc')::bigint,coalesce((select z.source_timezone from public.trade_bridge_clock_settings z where z.bridge_id=p_bridge),'UTC')) < (extract(epoch from now())*1000)::bigint-p_max_age then raise exception 'Stale feed'; end if;
 if to_timestamp((p_command->>'expiresAt')::numeric/1000)<=now() or to_timestamp((p_command->>'expiresAt')::numeric/1000)>now()+interval '30 seconds' then raise exception 'Expired command'; end if;
 if exists(select 1 from public.trade_bridge_commands where bridge_id=p_bridge and state in ('queued','dispatch_unknown','submitted')) then raise exception 'Unresolved command requires reconciliation'; end if;
 select coalesce(sum((x->>'volume')::numeric),0) into exposure from (select value x from jsonb_array_elements(s.state->'positions') union all select value x from jsonb_array_elements(s.state->'orders')) exposures where x->>'symbol'=s.symbol;
 if p_command->>'action' in ('BUY','SELL') and exposure+(p_command->>'volume')::numeric>p_max then raise exception 'Exposure exceeds limit'; end if;
 insert into public.trade_bridge_commands(id,bridge_id,payload,expires_at) values((p_command->>'id')::uuid,p_bridge,p_command,to_timestamp((p_command->>'expiresAt')::numeric/1000));
 insert into public.trade_bridge_audit(bridge_id,action,payload) values(p_bridge,'enqueue',p_command);
 return jsonb_build_object('id',p_command->>'id','state','queued');
end $$;

do $$ declare f regprocedure; begin for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in ('trade_policy_fingerprint','trade_real_session_active','trade_real_disarm','trade_real_session_check','trade_real_arm','trade_bridge_kill','trade_real_policy_save','trade_live_authorization_set','trade_real_valid','trade_real_context','trade_bridge_exchange_v2','trade_bridge_enqueue')loop
 execute format('revoke all on function %s from public,anon,authenticated',f); execute format('grant execute on function %s to service_role',f);
end loop;end $$;
notify pgrst,'reload schema';
