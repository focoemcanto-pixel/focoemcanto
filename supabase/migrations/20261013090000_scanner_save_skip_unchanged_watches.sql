-- DB incident 2026-10-12 15:59-16:04 / 16:33: every trade_scanner_save rewrote every watch carried in the
-- payload (up to ~170 rows of ~3.4 KB, plus TOAST and full-page images: ~5 MB of WAL per call) even when
-- nothing changed, on a Micro instance already loaded by /trade polling. Same semantics: a watch is only
-- rewritten when its state or payload actually differs; decided watches stay protected as before.
create or replace function public.trade_scanner_save(p_owner text,p_scope text,p_expected bigint,p_payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare old public.trade_scanner_state; w jsonb;c jsonb;e jsonb;
begin
 perform pg_advisory_xact_lock(hashtext(p_owner||':'||p_scope));
 select * into old from public.trade_scanner_state where owner_id=p_owner and scope=p_scope;
 if found and old.as_of<>p_expected then return old.payload;end if;
 if (p_payload->>'asOf')::bigint<p_expected then raise exception 'Future state cannot enter earlier replay';end if;
 for c in select value from jsonb_array_elements(p_payload->'scan'->'candidates') loop
 insert into public.trade_strategy_versions(strategy_id,version,definition)values(c->'definition'->>'id',c->'definition'->>'version',c->'definition')on conflict do nothing;
 insert into public.trade_strategy_evaluations values(p_owner,p_scope,(p_payload->>'asOf')::bigint,c->'definition'->>'id',c->'definition'->>'version',c->>'state',c)on conflict do nothing;
 end loop;
 for e in select value from jsonb_array_elements(coalesce(p_payload->'evaluations','[]'::jsonb)) loop
 for c in select value from jsonb_array_elements(e->'candidates') loop
 insert into public.trade_strategy_evaluations values(p_owner,p_scope,(e->>'asOf')::bigint,c->>'id',c->>'version',c->>'state',c)on conflict do nothing;
 end loop;end loop;
 p_payload=p_payload-'evaluations';
 for w in select value from jsonb_array_elements(p_payload->'watches') loop
 insert into public.trade_setup_watches values(p_owner,p_scope,w->>'id',w->'candidate'->'definition'->>'id',w->'candidate'->'definition'->>'version',w->>'state',(w->>'detectedAt')::bigint,(w->>'validUntil')::bigint,w)
 on conflict(owner_id,scope,id) do update set state=excluded.state,payload=excluded.payload
 where public.trade_setup_watches.state not in ('PROPOSED','ACCEPTED','REJECTED_BY_USER','OPEN_PAPER','CLOSED_PAPER')
 and (public.trade_setup_watches.state is distinct from excluded.state or public.trade_setup_watches.payload is distinct from excluded.payload);
 end loop;
 -- Decisions committed between read and save take precedence over the scanner copy.
 select coalesce(jsonb_agg(t.payload order by t.detected_at),'[]'::jsonb) into w from (select payload,detected_at from public.trade_setup_watches where owner_id=p_owner and scope=p_scope order by detected_at desc limit 100)t;
 p_payload=jsonb_set(p_payload,'{watches}',w);
 insert into public.trade_scanner_state values(p_owner,p_scope,(p_payload->>'asOf')::bigint,p_payload,now())on conflict(owner_id,scope)do update set as_of=excluded.as_of,payload=excluded.payload,updated_at=now();
 return p_payload;
end $$;
