-- PAPER risk management. Additive. Replaces the hardcoded R$100 PAPER compatibility limit with a
-- persisted, versioned configuration. Operational capital is a planning number typed by the user,
-- never the broker balance; nothing here reads or moves the XP account. Nothing here can enable REAL:
-- no execution policy, kill switch, authorization, session or command is read or written.
--
-- 1R = fixed BRL, or capital × percent / 100 — computed here (the backend is the authority).
-- Every save is a new immutable version with a config hash; proposals snapshot the version they were
-- sized with, so a future change of 1R never rewrites history.
create table public.trade_risk_settings_versions (
 id bigint generated always as identity primary key,
 owner_id text not null,
 mode text not null default 'PAPER' check(mode='PAPER'),
 capital_brl numeric not null check(capital_brl>0 and capital_brl<=100000000),
 risk_model text not null check(risk_model in ('FIXED_BRL','PCT_CAPITAL')),
 risk_value numeric not null check(risk_value>0),
 one_r_brl numeric not null check(one_r_brl>0),
 daily_loss_unit text not null check(daily_loss_unit in ('R','BRL')),
 daily_loss_value numeric not null check(daily_loss_value>0),
 daily_loss_brl numeric not null check(daily_loss_brl>0),
 max_contracts int not null check(max_contracts between 1 and 20),
 max_trades_per_day int not null check(max_trades_per_day between 1 and 50),
 config_hash text not null,
 created_at timestamptz not null default now(),
 check(risk_model<>'PCT_CAPITAL' or risk_value<=10),
 check(one_r_brl<=capital_brl)
);
create index trade_risk_settings_owner on public.trade_risk_settings_versions(owner_id,id desc);
alter table public.trade_risk_settings_versions enable row level security;
revoke all on public.trade_risk_settings_versions from public,anon,authenticated;
grant select,insert on public.trade_risk_settings_versions to service_role;
create function public.trade_risk_settings_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'Risk settings versions are append-only'; end $$;
create trigger trade_risk_settings_append_only before update or delete on public.trade_risk_settings_versions for each row execute function public.trade_risk_settings_immutable();

-- Save a new version. Only the listed fields are read; everything else in the payload is ignored.
create function public.trade_risk_settings_save(p_owner text,p_settings jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cap numeric; model text:=p_settings->>'riskModel'; val numeric; one numeric; unit text:=p_settings->>'dailyLossUnit'; dl numeric; dlb numeric;
 mc int; mt int; canon jsonb; r public.trade_risk_settings_versions;
begin
 begin
  cap:=(p_settings->>'capitalBRL')::numeric; val:=(p_settings->>'riskValue')::numeric; dl:=(p_settings->>'dailyLossValue')::numeric;
  mc:=(p_settings->>'maxContracts')::int; mt:=(p_settings->>'maxTradesPerDay')::int;
 exception when others then raise exception 'RISK_SETTINGS_INVALID: valores numéricos inválidos';
 end;
 if cap is null or cap<=0 then raise exception 'RISK_SETTINGS_INVALID: capital operacional deve ser positivo';end if;
 if model not in ('FIXED_BRL','PCT_CAPITAL') then raise exception 'RISK_SETTINGS_INVALID: modelo de 1R inválido';end if;
 if val is null or val<=0 then raise exception 'RISK_SETTINGS_INVALID: valor de risco deve ser positivo';end if;
 if model='PCT_CAPITAL' and val>10 then raise exception 'RISK_SETTINGS_INVALID: risco acima de 10%% do capital por operação';end if;
 one:=round(case when model='FIXED_BRL' then val else cap*val/100 end,2);
 if one<=0 or one>cap then raise exception 'RISK_SETTINGS_INVALID: 1R deve ser positivo e não maior que o capital';end if;
 if unit not in ('R','BRL') then raise exception 'RISK_SETTINGS_INVALID: unidade da perda diária inválida';end if;
 if dl is null or dl<=0 then raise exception 'RISK_SETTINGS_INVALID: perda máxima diária deve ser positiva';end if;
 dlb:=round(case when unit='R' then dl*one else dl end,2);
 if dlb>cap then raise exception 'RISK_SETTINGS_INVALID: perda máxima diária maior que o capital';end if;
 if mc is null or mc<1 or mc>20 then raise exception 'RISK_SETTINGS_INVALID: máximo de contratos entre 1 e 20';end if;
 if mt is null or mt<1 or mt>50 then raise exception 'RISK_SETTINGS_INVALID: máximo de operações por dia entre 1 e 50';end if;
 canon:=jsonb_build_object('mode','PAPER','capitalBRL',cap,'riskModel',model,'riskValue',val,'oneRBRL',one,'dailyLossUnit',unit,'dailyLossValue',dl,'dailyLossBRL',dlb,'maxContracts',mc,'maxTradesPerDay',mt);
 insert into public.trade_risk_settings_versions(owner_id,capital_brl,risk_model,risk_value,one_r_brl,daily_loss_unit,daily_loss_value,daily_loss_brl,max_contracts,max_trades_per_day,config_hash)
 values(p_owner,cap,model,val,one,unit,dl,dlb,mc,mt,md5(canon::text)) returning * into r;
 return public.trade_risk_settings_json(r);
end $$;

create function public.trade_risk_settings_json(r public.trade_risk_settings_versions) returns jsonb language sql immutable security invoker set search_path='' as $$
 select case when r.id is null then null else jsonb_build_object('version',r.id,'configHash',r.config_hash,'mode',r.mode,'capitalBRL',r.capital_brl,'riskModel',r.risk_model,'riskValue',r.risk_value,
  'oneRBRL',r.one_r_brl,'dailyLossUnit',r.daily_loss_unit,'dailyLossValue',r.daily_loss_value,'dailyLossBRL',r.daily_loss_brl,'maxContracts',r.max_contracts,
  'maxTradesPerDay',r.max_trades_per_day,'createdAt',r.created_at) end;
$$;

-- Current settings + today's PAPER consumption (BRT day). Only PAPER trades actually accepted count;
-- LIVE_DETECTED/hypothetical observations and discarded/expired/blocked proposals never consume it.
create function public.trade_risk_status(p_owner text) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare r public.trade_risk_settings_versions; day_start timestamptz:=((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo';
 trades int; realized numeric; open_risk numeric; loss numeric;
begin
 select * into r from public.trade_risk_settings_versions where owner_id=p_owner order by id desc limit 1;
 select count(*),coalesce(sum(case when execution->>'exitTime' is not null then (execution->>'resultBRL')::numeric end),0)
  into trades,realized from public.trade_operation_proposals
  where owner_id=p_owner and payload->>'mode'='PAPER' and state='CONFIRMADA' and confirmed_at>=day_start;
 select coalesce(sum((payload->>'riskBRL')::numeric),0) into open_risk from public.trade_operation_proposals
  where owner_id=p_owner and payload->>'mode'='PAPER' and state='CONFIRMADA' and (execution is null or execution->>'exitTime' is null);
 loss:=greatest(0,-realized);
 return jsonb_build_object('settings',public.trade_risk_settings_json(r),'day',(now() at time zone 'America/Sao_Paulo')::date,
  'tradesToday',trades,'realizedTodayBRL',realized,'lossTodayBRL',loss,'lossTodayR',case when r.id is null then null else round(loss/r.one_r_brl,2) end,'openRiskBRL',open_risk,
  'dailyLossRemainingBRL',case when r.id is null then null else greatest(0,r.daily_loss_brl-loss-open_risk) end,
  'tradesRemaining',case when r.id is null then null else greatest(0,r.max_trades_per_day-trades) end,
  'blocked',case when r.id is null then 'RISK_SETTINGS_MISSING' when loss>=r.daily_loss_brl then 'DAILY_LOSS_LIMIT_REACHED' when trades>=r.max_trades_per_day then 'DAILY_TRADE_LIMIT_REACHED' end);
end $$;

-- Authoritative PAPER entry gate. Called by the backend right before a PAPER approval.
create function public.trade_paper_entry_check(p_owner text,p_risk_brl numeric,p_settings_version bigint) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s jsonb:=public.trade_risk_status(p_owner); cfg jsonb:=s->'settings';
begin
 if cfg is null then return s||jsonb_build_object('allowed',false,'code','RISK_SETTINGS_MISSING','message','Gestão de risco PAPER não configurada.');end if;
 if s->>'blocked' is not null then return s||jsonb_build_object('allowed',false,'code',s->>'blocked','message',case s->>'blocked' when 'DAILY_LOSS_LIMIT_REACHED' then 'Perda máxima diária PAPER atingida. Novas entradas bloqueadas até o próximo pregão; scanner e LAB continuam.' else 'Máximo de operações PAPER do dia atingido. Scanner e LAB continuam.' end);end if;
 if p_settings_version is distinct from (cfg->>'version')::bigint then return s||jsonb_build_object('allowed',false,'code','RISK_SETTINGS_CHANGED','message','A gestão de risco mudou depois desta proposta. Aguarde uma nova proposta.');end if;
 if p_risk_brl is null or p_risk_brl<=0 or p_risk_brl>(cfg->>'oneRBRL')::numeric+0.000001 then return s||jsonb_build_object('allowed',false,'code','RISK_ABOVE_1R','message','Risco da proposta acima do 1R configurado.');end if;
 if p_risk_brl>(s->>'dailyLossRemainingBRL')::numeric+0.000001 then return s||jsonb_build_object('allowed',false,'code','DAILY_LOSS_LIMIT_WOULD_EXCEED','message','Esta entrada pode ultrapassar a perda máxima diária (perdas do dia + risco em aberto + esta operação).');end if;
 return s||jsonb_build_object('allowed',true,'code','OK');
end $$;

revoke all on function public.trade_risk_settings_save(text,jsonb),public.trade_risk_settings_json(public.trade_risk_settings_versions),public.trade_risk_status(text),public.trade_paper_entry_check(text,numeric,bigint) from public,anon,authenticated;
grant execute on function public.trade_risk_settings_save(text,jsonb),public.trade_risk_settings_json(public.trade_risk_settings_versions),public.trade_risk_status(text),public.trade_paper_entry_check(text,numeric,bigint) to service_role;
