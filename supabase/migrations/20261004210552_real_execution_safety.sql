-- Additive Trade-only safeguards. Does not arm any existing gate or touch broker orders.
create table public.trade_execution_policy (
 bridge_id text primary key, enabled boolean not null default false,
 account_hash text not null default '', symbol text not null default '',
 contract_expires_at timestamptz, rollover_confirmed boolean not null default false,
 session_windows jsonb not null default '[]', max_contracts integer not null default 1 check(max_contracts>=1),
 max_positions integer not null default 1 check(max_positions>=1),
 max_risk_brl numeric check(max_risk_brl>0), max_daily_loss_brl numeric check(max_daily_loss_brl>0),
 max_slippage_points numeric check(max_slippage_points>0), updated_at timestamptz not null default now()
);
create table public.trade_live_authorizations (
 strategy_id text not null, version text not null, live_authorized boolean not null default false,
 stage text not null default 'paper' check(stage in ('research','backtest','paper','live-monitoring')),
 approved_at timestamptz, primary key(strategy_id,version)
);
create table public.trade_real_confirmations (
 proposal_id uuid primary key references public.trade_operation_proposals(id), owner_id text not null,
 nonce_hash text not null, expires_at timestamptz not null, used_at timestamptz,
 command jsonb not null, snapshot jsonb not null, created_at timestamptz not null default now()
);
do $$ declare t text; begin foreach t in array array['trade_execution_policy','trade_live_authorizations','trade_real_confirmations'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop; end $$;
insert into public.trade_execution_policy(bridge_id)select bridge_id from public.trade_bridge_state on conflict do nothing;
insert into public.trade_live_authorizations(strategy_id,version)select strategy_id,version from public.trade_strategy_versions on conflict do nothing;
create function public.trade_execution_policy_audit() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.trade_bridge_audit(bridge_id,action,payload) values(coalesce(to_jsonb(new)->>'bridge_id','authorization'),'real_policy_change',jsonb_build_object('table',TG_TABLE_NAME,'before',to_jsonb(old)-'account_hash','after',to_jsonb(new)-'account_hash'));
 return new;
end $$;
create trigger trade_real_policy_audit after update on public.trade_execution_policy for each row execute function public.trade_execution_policy_audit();
create trigger trade_live_authorization_audit after update on public.trade_live_authorizations for each row execute function public.trade_execution_policy_audit();
create function public.trade_real_context(p_bridge text) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('bridge',(select public.trade_bridge_read(p_bridge)||jsonb_build_object('accountHash',account_hash) from public.trade_bridge_state where bridge_id=p_bridge),
 'policy',(select to_jsonb(p) from public.trade_execution_policy p where bridge_id=p_bridge),
 'authorizations',(select coalesce(jsonb_agg(a),'[]')from public.trade_live_authorizations a),
 'unresolved',(select count(*) from public.trade_bridge_commands where bridge_id=p_bridge and state in ('queued','dispatch_unknown','submitted')));
$$;
-- Recheck inside the same advisory-lock transaction at confirmation AND dispatch.
create function public.trade_real_valid(p_bridge text,p_payload jsonb,p_max int,p_account text,p_age int,p_ignore uuid default null) returns boolean language plpgsql security invoker set search_path='' as $$
declare s public.trade_bridge_state; p public.trade_execution_policy; price numeric; risk numeric; potential numeric; point_value numeric; q numeric; min_distance numeric; open_risk numeric; open_loss numeric; n bigint;
begin
 if p_payload is null or not (p_payload ?& array['quantity','entry','sl','tp','pointValue','riskBRL','riskPoints','asOf','expiresAt','setup','mode','source','symbol','direction']) or (p_payload->>'sl')::numeric<=0 or (p_payload->>'tp')::numeric<=0 or (p_payload->>'riskBRL')::numeric<=0 or (p_payload->>'riskPoints')::numeric<=0 then return false;end if;
 select * into s from public.trade_bridge_state where bridge_id=p_bridge;
 select * into p from public.trade_execution_policy where bridge_id=p_bridge;
 if s.bridge_id is null or p.bridge_id is null then return false; end if;
 if not p.enabled or s.kill_switch or p.account_hash<>p_account or s.account_hash<>p_account or p_account !~ '^[a-f0-9]{64}$' or s.symbol<>p.symbol or p_payload->>'symbol'<>p.symbol or p_payload->>'mode'<>'REAL' or p_payload->>'source'<>'mt5' then return false; end if;
 if coalesce(s.state->>'connected','false')<>'true' or coalesce(s.state->>'executionAllowed','false')<>'true' or coalesce(s.state->>'protocolVersion','0')<>'2' or s.state->>'magic'<>'706032601' or s.received_at<now()-make_interval(secs=>p_age/1000.0) or s.received_at>now()+interval '2 seconds' then return false; end if;
 if not exists(select 1 from public.trade_live_authorizations a where a.strategy_id=p_payload->'setup'->>'strategy' and a.version=p_payload->'setup'->>'version' and a.live_authorized and a.stage='live-monitoring')then return false; end if;
 if p.contract_expires_at is null or p.contract_expires_at<=now() or not p.rollover_confirmed or coalesce((s.state->>'expirationTime')::numeric,0)<=extract(epoch from now()) then return false; end if;
 if not exists(select 1 from jsonb_array_elements(p.session_windows)w where (w->>'open')::timestamptz<=now() and (w->>'close')::timestamptz>now()) or coalesce(s.state->>'sessionOpen','false')<>'true' or coalesce(s.state->>'tradeMode','0')<>'4' then return false; end if;
 if (s.tick->>'timeMsc')::numeric not between extract(epoch from now())*1000-p_age and extract(epoch from now())*1000+2000 or coalesce(s.tick->>'symbol','')<>p.symbol then return false; end if;
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
 return true;
exception when others then return false;
end $$;
create function public.trade_real_prepare(p_owner text,p_id uuid,p_hash text,p_command jsonb,p_snapshot jsonb,p_max int,p_account text,p_age int,p_backend boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.trade_operation_proposals;
begin
 select * into p from public.trade_operation_proposals where id=p_id and owner_id=p_owner for update;
 if not found then raise exception 'Proposal not found';end if;
 perform pg_advisory_xact_lock(hashtext(p.bridge_id));
 if not p_backend or p.state<>'AGUARDANDO CONFIRMAÇÃO' or not public.trade_real_valid(p.bridge_id,p.payload,p_max,p_account,p_age) then raise exception 'REAL gates blocked';end if;
 if p_hash !~ '^[a-f0-9]{64}$' or p_command->>'id'<>p_id::text or coalesce(p_command->>'signatureVersion','0')<>'2' or p_command->>'signature' !~ '^[a-f0-9]{64}$' then raise exception 'Signed command/nonce required';end if;
 insert into public.trade_real_confirmations(proposal_id,owner_id,nonce_hash,expires_at,command,snapshot) values(p_id,p_owner,p_hash,least(p.expires_at,now()+interval '20 seconds'),p_command,p_snapshot)
 on conflict(proposal_id)do update set nonce_hash=excluded.nonce_hash,expires_at=excluded.expires_at,command=excluded.command,snapshot=excluded.snapshot where trade_real_confirmations.used_at is null;
 insert into public.trade_operation_journal(proposal_id,kind,payload)values(p_id,'CONFIRMAÇÃO_FINAL_PREPARADA',jsonb_build_object('snapshot',p_snapshot,'requestedOrder',p_command));
 return jsonb_build_object('expiresAt',least(p.expires_at,now()+interval '20 seconds'));
end $$;
create function public.trade_real_confirm(p_owner text,p_id uuid,p_nonce text,p_command jsonb,p_max int,p_account text,p_age int,p_backend boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.trade_operation_proposals; proof public.trade_real_confirmations;
begin
 select * into p from public.trade_operation_proposals where id=p_id and owner_id=p_owner for update;
 if not found then raise exception 'Proposal not found';end if;
 perform pg_advisory_xact_lock(hashtext(p.bridge_id));
 select * into proof from public.trade_real_confirmations where proposal_id=p_id and owner_id=p_owner for update;
 if not found or proof.nonce_hash<>encode(sha256(convert_to(p_nonce,'UTF8')),'hex') or proof.command<>p_command then raise exception 'Second human confirmation required';end if;
 if p.state='CONFIRMADA' and proof.used_at is not null then return to_jsonb(p);end if;
 if not p_backend or proof.used_at is not null or proof.expires_at<=now() or not public.trade_real_valid(p.bridge_id,p.payload,p_max,p_account,p_age) then raise exception 'REAL gates blocked or final confirmation expired';end if;
 update public.trade_real_confirmations set used_at=now()where proposal_id=p_id;
 insert into public.trade_operation_journal(proposal_id,kind,payload)values(p_id,'CONFIRMADA_PELO_USUÁRIO_REAL',jsonb_build_object('confirmedAt',now(),'commandId',p_id,'snapshot',proof.snapshot,'requestedOrder',p_command));
 return public.trade_confirm(p_owner,p_id,'confirm',p_command,p_max,p_account,p_age);
end $$;
create function public.trade_require_real_proof() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.trade_real_confirmations where proposal_id=new.id and used_at is not null and command=new.payload) then raise exception 'Second human confirmation required';end if;
 return new;
end $$;
create trigger trade_real_proof before insert on public.trade_bridge_commands for each row execute function public.trade_require_real_proof();
-- Old/raw dispatcher cannot bypass v2 gates. New exchange below ingests first and claims only valid commands.
create function public.trade_real_dispatch_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare proposal jsonb;
begin
 if old.state='queued' and new.state='dispatch_unknown' then
 select payload into proposal from public.trade_operation_proposals where id=new.id;
 if not exists(select 1 from public.trade_real_confirmations where proposal_id=new.id and used_at is not null and command=new.payload) or not public.trade_real_valid(new.bridge_id,proposal,2147483647,(select account_hash from public.trade_execution_policy where bridge_id=new.bridge_id),15000,new.id)then raise exception 'REAL dispatch blocked';end if;
 end if;
 return new;
end $$;
create trigger trade_real_dispatch_guard before update on public.trade_bridge_commands for each row execute function public.trade_real_dispatch_guard();
create function public.trade_bridge_exchange_v2(p_batch jsonb,p_execution boolean,p_max int,p_account text,p_max_age int)returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; cmd public.trade_bridge_commands; proposal jsonb;
begin
 result:=public.trade_bridge_exchange(p_batch,false,p_max,p_account,p_max_age);
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
create function public.trade_real_audit(p_bridge text,p_payload jsonb)returns void language sql security invoker set search_path='' as $$
 insert into public.trade_bridge_audit(bridge_id,action,payload)values(p_bridge,'real_attempt',p_payload);
$$;
do $$ declare f regprocedure; begin for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in ('trade_execution_policy_audit','trade_real_context','trade_real_valid','trade_real_prepare','trade_real_confirm','trade_require_real_proof','trade_real_dispatch_guard','trade_bridge_exchange_v2','trade_real_audit')loop
 execute format('revoke all on function %s from public,anon,authenticated',f); execute format('grant execute on function %s to service_role',f);
end loop;end $$;

