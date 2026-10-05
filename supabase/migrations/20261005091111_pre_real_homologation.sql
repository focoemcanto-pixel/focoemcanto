-- Trade-only additive limits and non-executable human inspection. Never arms any gate.
alter table public.trade_execution_policy
 add column max_position_contracts integer check(max_position_contracts>0),
 add column max_orders_per_session integer check(max_orders_per_session>0),
 add column max_orders_per_day integer check(max_orders_per_day>0),
 add column max_notional_brl numeric check(max_notional_brl>0);
create table public.trade_real_inspections (
 proposal_id uuid primary key references public.trade_operation_proposals(id),
 owner_id text not null, nonce_hash text not null, expires_at timestamptz not null,
 used_at timestamptz, snapshot jsonb not null, created_at timestamptz not null default now()
);
alter table public.trade_real_inspections enable row level security;
revoke all on public.trade_real_inspections from public,anon,authenticated;
grant all on public.trade_real_inspections to service_role;
create function public.trade_inspection_prepare(p_owner text,p_id uuid,p_hash text,p_snapshot jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.trade_operation_proposals; expiry timestamptz;
begin
 select * into p from public.trade_operation_proposals where id=p_id and owner_id=p_owner for update;
 if not found or p.payload->>'mode'<>'REAL' or p.payload->'inspectionOnly' is distinct from 'true'::jsonb or p.state<>'AGUARDANDO CONFIRMAÇÃO' or p.expires_at<=now() or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Inspection proposal invalid'; end if;
 if exists(select 1 from public.trade_real_inspections where proposal_id=p_id and used_at is not null)then raise exception 'Inspection nonce already consumed';end if;
 expiry:=least(p.expires_at,now()+interval '20 seconds');
 insert into public.trade_real_inspections(proposal_id,owner_id,nonce_hash,expires_at,snapshot) values(p_id,p_owner,p_hash,expiry,p_snapshot) on conflict(proposal_id)do update set nonce_hash=excluded.nonce_hash,expires_at=excluded.expires_at,snapshot=excluded.snapshot where trade_real_inspections.used_at is null;
 insert into public.trade_operation_journal(proposal_id,kind,payload)values(p_id,'INSPEÇÃO_REAL_PREPARADA',p_snapshot);
 return jsonb_build_object('expiresAt',expiry);
end $$;
create function public.trade_inspection_confirm(p_owner text,p_id uuid,p_hash text,p_snapshot jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare proof public.trade_real_inspections; p public.trade_operation_proposals;
begin
 select * into p from public.trade_operation_proposals where id=p_id and owner_id=p_owner for update;
 select * into proof from public.trade_real_inspections where proposal_id=p_id and owner_id=p_owner for update;
 if not found or p.payload->'inspectionOnly' is distinct from 'true'::jsonb or p.payload->>'mode'<>'REAL' or p.state<>'AGUARDANDO CONFIRMAÇÃO' or proof.nonce_hash is distinct from p_hash or proof.used_at is not null or proof.expires_at<=now() or p.expires_at<=now()then raise exception 'Inspection confirmation invalid or expired';end if;
 update public.trade_real_inspections set used_at=now()where proposal_id=p_id;
 insert into public.trade_operation_journal(proposal_id,kind,payload)values(p_id,'EXECUÇÃO_REAL_BLOQUEADA',p_snapshot);
 insert into public.trade_bridge_audit(bridge_id,action,payload)values(p.bridge_id,'real_attempt',jsonb_build_object('proposalId',p_id,'status','BLOCKED','inspectionOnly',true,'snapshot',p_snapshot));
 -- Commit consumption and audit without raising; this function cannot enqueue any command.
 return jsonb_build_object('blocked',true,'error','EXECUÇÃO REAL BLOQUEADA','inspectionOnly',true);
end $$;
revoke all on function public.trade_inspection_prepare(text,uuid,text,jsonb),public.trade_inspection_confirm(text,uuid,text,jsonb)from public,anon,authenticated;
grant execute on function public.trade_inspection_prepare(text,uuid,text,jsonb),public.trade_inspection_confirm(text,uuid,text,jsonb)to service_role;
-- Harden nullable JSON evidence; preserves all disarmed policy and broker state.
create or replace function public.trade_real_valid(p_bridge text,p_payload jsonb,p_max int,p_account text,p_age int,p_ignore uuid default null) returns boolean language plpgsql security invoker set search_path='' as $$
declare s public.trade_bridge_state; p public.trade_execution_policy; price numeric; risk numeric; potential numeric; point_value numeric; q numeric; min_distance numeric; open_risk numeric; open_loss numeric; n bigint;
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
 if p.max_position_contracts is null or q>p.max_position_contracts or p.max_notional_brl is null or price*point_value*q>p.max_notional_brl or p.max_orders_per_session is null or p.max_orders_per_day is null then return false;end if;
 if (select count(*)from public.trade_bridge_commands c where c.bridge_id=p_bridge and c.id is distinct from p_ignore and c.created_at>=(date_trunc('day',now() at time zone 'America/Sao_Paulo')at time zone 'America/Sao_Paulo'))>=p.max_orders_per_day then return false;end if;
 if (select count(*)from public.trade_bridge_commands c where c.bridge_id=p_bridge and c.id is distinct from p_ignore and c.created_at>=(select min((w->>'open')::timestamptz)from jsonb_array_elements(p.session_windows)w where (w->>'open')::timestamptz<=now()and(w->>'close')::timestamptz>now()))>=p.max_orders_per_session then return false;end if;
 return true;
exception when others then return false;
end $$;

create or replace function public.trade_real_context(p_bridge text) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('bridge',(select public.trade_bridge_read(p_bridge)||jsonb_build_object('accountHash',account_hash,'bridgeId',bridge_id,'symbol',symbol)from public.trade_bridge_state where bridge_id=p_bridge),
 'policy',(select to_jsonb(p)from public.trade_execution_policy p where bridge_id=p_bridge),
 'authorizations',(select coalesce(jsonb_agg(a),'[]')from public.trade_live_authorizations a),
 'unresolved',(select count(*)from public.trade_bridge_commands where bridge_id=p_bridge and state in ('queued','dispatch_unknown','submitted')),
 'ordersDay',(select count(*)from public.trade_bridge_commands where bridge_id=p_bridge and created_at>=(date_trunc('day',now() at time zone 'America/Sao_Paulo')at time zone 'America/Sao_Paulo')),
 'ordersSession',(select count(*)from public.trade_bridge_commands where bridge_id=p_bridge and created_at>=(select min((w->>'open')::timestamptz)from public.trade_execution_policy p,jsonb_array_elements(p.session_windows)w where p.bridge_id=p_bridge and (w->>'open')::timestamptz<=now()and(w->>'close')::timestamptz>now())));
$$;
