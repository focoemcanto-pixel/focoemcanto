-- LAB participant attribution. Additive: replaces trade_setup_observe only to (1) hash each proven
-- participant's definition (config_hash, same md5 as the registry) and strip the definition from the
-- stored snapshot, (2) register participant versions in the registry and event a REGISTRY_MISMATCH.
-- One observation = one opportunity = one outcome; participants only receive analytic credit.
create or replace function public.trade_setup_observe(p_owner text,p_observation jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.trade_setup_observations; def jsonb:=p_observation->'snapshot'->'strategy'->'definition'; reg text; snap jsonb:=p_observation->'snapshot'; ev jsonb:='[]'::jsonb; p jsonb; mism jsonb:='[]'::jsonb; preg text;
begin
 insert into public.trade_strategy_versions(strategy_id,version,definition,activated_at)values(def->>'id',def->>'version',def,now())on conflict do nothing;
 select config_hash into reg from public.trade_strategy_versions where strategy_id=def->>'id' and version=def->>'version';
 for p in select * from jsonb_array_elements(coalesce(snap->'participantEvidence','[]'::jsonb)) loop
  if p->'definition' is not null and p->>'state'='CONFIRMED' then
   insert into public.trade_strategy_versions(strategy_id,version,definition,activated_at)values(p->>'strategyId',p->>'version',p->'definition',now())on conflict do nothing;
   select config_hash into preg from public.trade_strategy_versions where strategy_id=p->>'strategyId' and version=p->>'version';
   if preg is distinct from md5((p->'definition')::text) then mism:=mism||jsonb_build_object('strategyId',p->>'strategyId','version',p->>'version','registryHash',preg,'observedHash',md5((p->'definition')::text));end if;
   ev:=ev||((p-'definition')||jsonb_build_object('configHash',md5((p->'definition')::text)));
  end if;
 end loop;
 if snap ? 'participantEvidence' then snap:=jsonb_set(snap,'{participantEvidence}',ev);end if;
 insert into public.trade_setup_observations(id,owner_id,scope,source,symbol,strategy_id,version,config_hash,direction,watch_id,detected_at,confirmed_at,market_as_of,snapshot,actionability)
 values(p_observation->>'id',p_owner,p_observation->>'scope',p_observation->>'source',snap->>'symbol',def->>'id',def->>'version',md5(def::text),
  snap->>'direction',snap->>'watchId',(snap->>'detectedAt')::bigint,(snap->>'confirmedAt')::bigint,
  (snap->>'marketAsOf')::bigint,snap,p_observation->'actionability')
 on conflict do nothing returning * into o;
 if found then
  insert into public.trade_setup_observation_events(observation_id,kind,payload)values(o.id,'CONFIRMED',jsonb_build_object('marketAsOf',o.market_as_of,'configHash',o.config_hash,'actionability',o.actionability,
   'participants',(select coalesce(jsonb_agg(jsonb_build_object('strategyId',x->>'strategyId','version',x->>'version','configHash',x->>'configHash')),'[]'::jsonb) from jsonb_array_elements(ev) x)));
  if reg is distinct from o.config_hash then
   insert into public.trade_setup_observation_events(observation_id,kind,payload)values(o.id,'REGISTRY_MISMATCH',jsonb_build_object('registryHash',reg,'observedHash',o.config_hash));
  end if;
  if jsonb_array_length(mism)>0 then
   insert into public.trade_setup_observation_events(observation_id,kind,payload)values(o.id,'REGISTRY_MISMATCH',jsonb_build_object('participants',mism));
  end if;
 else
  select * into o from public.trade_setup_observations where id=p_observation->>'id' or (owner_id=p_owner and scope=p_observation->>'scope' and watch_id=snap->>'watchId') limit 1;
 end if;
 return to_jsonb(o)-'snapshot';
end $$;
revoke all on function public.trade_setup_observe(text,jsonb) from public,anon,authenticated;
grant execute on function public.trade_setup_observe(text,jsonb) to service_role;
