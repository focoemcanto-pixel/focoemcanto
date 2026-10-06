-- REAL risk management (GESTÃO DE RISCO · REAL). Additive. Same principle as PAPER (capital operacional,
-- 1R by % of capital or fixed BRL, daily limit in R or BRL) but independent of PAPER and materialized into
-- the existing trade_execution_policy, which stays the only server-side enforcement table.
--
-- * Capital operacional is a planning number typed by the user, never the XP balance/margin.
-- * Every save is a new immutable version with the previous policy, the new one, the admin cap in force and
--   the 1R it produced; the same payload goes to trade_bridge_audit.
-- * Saving goes through trade_real_policy_save, so an armed REAL session is disarmed (POLICY_CHANGED) and the
--   kill switch is set. Nothing here arms, authorizes, releases the kill switch or creates a command.
-- * trade_execution_policy.risk_settings_version links the enforced policy to the version that produced it;
--   the readiness gate requires it, so a policy typed outside this flow is never enough for REAL.
create table public.trade_real_risk_settings_versions (
 id bigint generated always as identity primary key,
 bridge_id text not null,
 owner_id text not null,
 capital_brl numeric not null check(capital_brl>0 and capital_brl<=100000000),
 risk_model text not null check(risk_model in ('FIXED_BRL','PCT_CAPITAL')),
 risk_value numeric not null check(risk_value>0),
 one_r_brl numeric not null check(one_r_brl>=1 and one_r_brl<=100000),
 daily_loss_unit text not null check(daily_loss_unit in ('R','BRL')),
 daily_loss_value numeric not null check(daily_loss_value>0),
 daily_loss_brl numeric not null check(daily_loss_brl>0),
 max_contracts int not null check(max_contracts>=1),
 max_positions int not null check(max_positions=1),
 max_orders_per_session int not null check(max_orders_per_session between 1 and 100),
 max_orders_per_day int not null check(max_orders_per_day between 1 and 500),
 max_session_minutes int not null check(max_session_minutes between 5 and 480),
 max_slippage_points numeric not null check(max_slippage_points between 5 and 2000),
 max_notional_brl numeric not null check(max_notional_brl>=1 and max_notional_brl<=100000000),
 enabled boolean not null,
 rollover_confirmed boolean not null,
 symbol text not null,
 contract_expires_at timestamptz not null,
 risk_cap_brl numeric check(risk_cap_brl is null or risk_cap_brl>0),
 previous_policy jsonb,
 config_hash text not null,
 created_at timestamptz not null default now(),
 check(risk_model<>'PCT_CAPITAL' or risk_value<=10),
 check(one_r_brl<=capital_brl),
 check(daily_loss_brl>=one_r_brl and daily_loss_brl<=capital_brl),
 check(max_orders_per_day>=max_orders_per_session),
 check(risk_cap_brl is null or one_r_brl<=risk_cap_brl)
);
create index trade_real_risk_settings_bridge on public.trade_real_risk_settings_versions(bridge_id,id desc);
alter table public.trade_real_risk_settings_versions enable row level security;
revoke all on public.trade_real_risk_settings_versions from public,anon,authenticated;
grant select,insert on public.trade_real_risk_settings_versions to service_role;
create function public.trade_real_risk_settings_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'REAL risk settings versions are append-only'; end $$;
create trigger trade_real_risk_settings_append_only before update or delete on public.trade_real_risk_settings_versions for each row execute function public.trade_real_risk_settings_immutable();

alter table public.trade_execution_policy add column risk_settings_version bigint;

create function public.trade_real_risk_settings_json(r public.trade_real_risk_settings_versions) returns jsonb language sql immutable security invoker set search_path='' as $$
 select case when r.id is null then null else jsonb_build_object('version',r.id,'configHash',r.config_hash,'mode','REAL','capitalBRL',r.capital_brl,'riskModel',r.risk_model,
  'riskValue',r.risk_value,'oneRBRL',r.one_r_brl,'dailyLossUnit',r.daily_loss_unit,'dailyLossValue',r.daily_loss_value,'dailyLossBRL',r.daily_loss_brl,
  'maxContracts',r.max_contracts,'maxPositions',r.max_positions,'maxOrdersPerSession',r.max_orders_per_session,'maxOrdersPerDay',r.max_orders_per_day,
  'maxSessionMinutes',r.max_session_minutes,'maxSlippagePoints',r.max_slippage_points,'maxNotionalBRL',r.max_notional_brl,'enabled',r.enabled,
  'rolloverConfirmed',r.rollover_confirmed,'symbol',r.symbol,'contractExpiresAt',r.contract_expires_at,'riskCapBRL',r.risk_cap_brl,
  'owner',r.owner_id,'createdAt',r.created_at) end;
$$;

-- Validates the user's REAL risk management, computes 1R and the daily limit, materializes the enforced
-- policy and records the version + audit atomically. Account, symbol and contract expiry come from the
-- server (endpoint), never from the client. p_cap is the optional administrative 1R ceiling (null = none).
create function public.trade_real_risk_settings_save(p_owner text,p_bridge text,p_account text,p_symbol text,p_expires timestamptz,p_cap numeric,p_settings jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare cap numeric; model text:=p_settings->>'riskModel'; val numeric; one numeric; unit text:=p_settings->>'dailyLossUnit'; dl numeric; dlb numeric;
 mc int; ops int; opd int; mins int; slip numeric; notional numeric; en boolean; roll boolean; prev jsonb; canon jsonb;
 r public.trade_real_risk_settings_versions; p public.trade_execution_policy;
begin
 perform pg_advisory_xact_lock(hashtext(p_bridge));
 begin
  cap:=(p_settings->>'capitalBRL')::numeric; val:=(p_settings->>'riskValue')::numeric; dl:=(p_settings->>'dailyLossValue')::numeric;
  mc:=(p_settings->>'maxContracts')::int; ops:=(p_settings->>'maxOrdersPerSession')::int; opd:=(p_settings->>'maxOrdersPerDay')::int;
  mins:=coalesce((p_settings->>'maxSessionMinutes')::int,120); slip:=(p_settings->>'maxSlippagePoints')::numeric; notional:=(p_settings->>'maxNotionalBRL')::numeric;
  en:=coalesce((p_settings->>'enabled')::boolean,false); roll:=coalesce((p_settings->>'rolloverConfirmed')::boolean,false);
 exception when others then raise exception 'REAL_RISK_SETTINGS_INVALID: valores numéricos inválidos';
 end;
 if p_expires is null or p_expires<=now() then raise exception 'REAL_RISK_SETTINGS_INVALID: vencimento do contrato indisponível ou vencido no MT5';end if;
 if cap is null or cap<=0 or cap>100000000 then raise exception 'REAL_RISK_SETTINGS_INVALID: capital operacional deve ser positivo';end if;
 if model is null or model not in ('FIXED_BRL','PCT_CAPITAL') then raise exception 'REAL_RISK_SETTINGS_INVALID: modelo de 1R inválido';end if;
 if val is null or val<=0 then raise exception 'REAL_RISK_SETTINGS_INVALID: valor de risco deve ser positivo';end if;
 if model='PCT_CAPITAL' and val>10 then raise exception 'REAL_RISK_SETTINGS_INVALID: risco acima de 10%% do capital por operação';end if;
 one:=round(case when model='FIXED_BRL' then val else cap*val/100 end,2);
 if one<1 or one>100000 or one>cap then raise exception 'REAL_RISK_SETTINGS_INVALID: 1R deve ficar entre R$1 e o capital operacional (máx. R$100.000)';end if;
 if p_cap is not null and (p_cap<=0 or one>p_cap) then raise exception 'REAL_RISK_SETTINGS_INVALID: 1R acima do teto administrativo de risco';end if;
 if unit is null or unit not in ('R','BRL') then raise exception 'REAL_RISK_SETTINGS_INVALID: unidade da perda diária inválida';end if;
 if dl is null or dl<=0 then raise exception 'REAL_RISK_SETTINGS_INVALID: perda máxima diária deve ser positiva';end if;
 dlb:=round(case when unit='R' then dl*one else dl end,2);
 if dlb<one or dlb>cap then raise exception 'REAL_RISK_SETTINGS_INVALID: perda máxima diária deve ficar entre 1R e o capital operacional';end if;
 if mc is null or mc<1 then raise exception 'REAL_RISK_SETTINGS_INVALID: máximo de contratos inválido';end if;
 if ops is null or ops<1 or ops>100 then raise exception 'REAL_RISK_SETTINGS_INVALID: operações por sessão entre 1 e 100';end if;
 if opd is null or opd<ops or opd>500 then raise exception 'REAL_RISK_SETTINGS_INVALID: operações por dia entre as da sessão e 500';end if;
 if mins<5 or mins>480 then raise exception 'REAL_RISK_SETTINGS_INVALID: duração da sessão entre 5 e 480 minutos';end if;
 if slip is null or slip<5 or slip>2000 then raise exception 'REAL_RISK_SETTINGS_INVALID: desvio máximo entre 5 e 2000 pontos';end if;
 if notional is null or notional<1 or notional>100000000 then raise exception 'REAL_RISK_SETTINGS_INVALID: exposição nocional máxima inválida';end if;
 select to_jsonb(x)-'account_hash' into prev from public.trade_execution_policy x where x.bridge_id=p_bridge;
 -- Existing enforcement path: validates account/symbol, writes the policy and disarms any armed session.
 perform public.trade_real_policy_save(p_bridge,p_account,p_symbol,jsonb_build_object('enabled',en,'rolloverConfirmed',roll,
  'contractExpiresAt',p_expires,'maxRiskBRL',one,'maxDailyLossBRL',dlb,'maxSlippagePoints',slip,'maxContracts',mc,'maxNotionalBRL',notional,
  'maxOrdersPerSession',ops,'maxOrdersPerDay',opd,'maxSessionMinutes',mins));
 canon:=jsonb_build_object('mode','REAL','capitalBRL',cap,'riskModel',model,'riskValue',val,'oneRBRL',one,'dailyLossUnit',unit,'dailyLossValue',dl,
  'dailyLossBRL',dlb,'maxContracts',mc,'maxPositions',1,'maxOrdersPerSession',ops,'maxOrdersPerDay',opd,'maxSessionMinutes',mins,'maxSlippagePoints',slip,
  'maxNotionalBRL',notional,'enabled',en,'rolloverConfirmed',roll,'symbol',p_symbol,'contractExpiresAt',p_expires,'riskCapBRL',p_cap);
 insert into public.trade_real_risk_settings_versions(bridge_id,owner_id,capital_brl,risk_model,risk_value,one_r_brl,daily_loss_unit,daily_loss_value,daily_loss_brl,
  max_contracts,max_positions,max_orders_per_session,max_orders_per_day,max_session_minutes,max_slippage_points,max_notional_brl,enabled,rollover_confirmed,
  symbol,contract_expires_at,risk_cap_brl,previous_policy,config_hash)
 values(p_bridge,p_owner,cap,model,val,one,unit,dl,dlb,mc,1,ops,opd,mins,slip,notional,en,roll,p_symbol,p_expires,p_cap,prev,md5(canon::text)) returning * into r;
 update public.trade_execution_policy set risk_settings_version=r.id where bridge_id=p_bridge returning * into p;
 insert into public.trade_bridge_audit(bridge_id,action,payload) values(p_bridge,'real_risk_settings_saved',
  jsonb_build_object('version',r.id,'owner',p_owner,'previous',prev,'new',to_jsonb(p)-'account_hash','settings',public.trade_real_risk_settings_json(r)));
 return jsonb_build_object('settings',public.trade_real_risk_settings_json(r),'policy',to_jsonb(p)-'account_hash');
end $$;

-- Current version + recent history (read-only).
create function public.trade_real_risk_settings_read(p_bridge text) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'settings',(select public.trade_real_risk_settings_json(r) from public.trade_real_risk_settings_versions r where r.bridge_id=p_bridge order by r.id desc limit 1),
  'history',(select coalesce(jsonb_agg(public.trade_real_risk_settings_json(r) order by r.id desc),'[]') from (select * from public.trade_real_risk_settings_versions where bridge_id=p_bridge order by id desc limit 10) r));
$$;

revoke all on function public.trade_real_risk_settings_save(text,text,text,text,timestamptz,numeric,jsonb),public.trade_real_risk_settings_read(text),
 public.trade_real_risk_settings_json(public.trade_real_risk_settings_versions),public.trade_real_risk_settings_immutable() from public,anon,authenticated;
grant execute on function public.trade_real_risk_settings_save(text,text,text,text,timestamptz,numeric,jsonb),public.trade_real_risk_settings_read(text),
 public.trade_real_risk_settings_json(public.trade_real_risk_settings_versions) to service_role;
