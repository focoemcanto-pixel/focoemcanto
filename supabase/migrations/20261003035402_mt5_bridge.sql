-- Dedicated server-only bridge storage. No client Data API grants.
create table public.trade_bridge_state (
 bridge_id text primary key, symbol text not null, session text not null,
 account_hash text not null, received_at timestamptz not null default now(),
 state jsonb not null, tick jsonb, kill_switch boolean not null default true
);
create table public.trade_bridge_batches (
 bridge_id text not null, session text not null, batch bigint not null,
 received_at timestamptz not null default now(), primary key(bridge_id,session,batch)
);
create table public.trade_bridge_ticks (
 bridge_id text not null, session text not null, batch bigint not null, ordinal bigint not null,
 symbol text not null, time_msc bigint not null, payload jsonb not null,
 primary key(bridge_id,session,batch,ordinal)
);
create index trade_bridge_tick_time on public.trade_bridge_ticks(bridge_id,time_msc desc);
create table public.trade_bridge_candles (
 bridge_id text not null, symbol text not null, timestamp bigint not null,
 payload jsonb not null, primary key(bridge_id,symbol,timestamp)
);
create table public.trade_bridge_commands (
 id uuid primary key, bridge_id text not null, payload jsonb not null,
 state text not null default 'queued' check(state in ('queued','dispatch_unknown','submitted','rejected','observed','expired','cancelled')),
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 dispatched_session text, result jsonb
);
create index trade_bridge_command_queue on public.trade_bridge_commands(bridge_id,created_at);
create table public.trade_bridge_events (
 bridge_id text not null, event_id text not null, received_at timestamptz not null default now(),
 payload jsonb not null, primary key(bridge_id,event_id)
);
create table public.trade_bridge_audit (
 id bigint generated always as identity primary key, bridge_id text not null,
 created_at timestamptz not null default now(), action text not null, payload jsonb not null
);
do $$ declare t text; begin foreach t in array array['state','batches','ticks','candles','commands','events','audit'] loop
 execute format('alter table public.trade_bridge_%I enable row level security',t);
 execute format('revoke all on public.trade_bridge_%I from anon, authenticated',t);
 execute format('grant all on public.trade_bridge_%I to service_role',t);
end loop; end $$;
grant usage,select on sequence public.trade_bridge_audit_id_seq to service_role;

create function public.trade_bridge_exchange(p_batch jsonb,p_execution boolean,p_max integer,p_account text,p_max_age integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b text:=p_batch->>'bridgeId'; s public.trade_bridge_state; cmd public.trade_bridge_commands; ev jsonb; inserted integer; last_tick jsonb;
begin
 perform pg_advisory_xact_lock(hashtext(b));
 select * into s from public.trade_bridge_state where bridge_id=b for update;
 if found and s.session<>p_batch->>'session' and s.received_at>now()-interval '15 seconds' then raise exception 'Another EA session owns the lease'; end if;
 insert into public.trade_bridge_batches(bridge_id,session,batch) values(b,p_batch->>'session',(p_batch->>'batch')::bigint) on conflict do nothing;
 get diagnostics inserted=row_count;
 -- A repeated/lost-response batch never redispatches its command.
 if inserted=0 then return jsonb_build_object('command',null,'duplicate',true); end if;
 insert into public.trade_bridge_ticks select b,p_batch->>'session',(p_batch->>'batch')::bigint,ordinality,x->>'symbol',(x->>'timeMsc')::bigint,x from jsonb_array_elements(p_batch->'ticks') with ordinality as a(x,ordinality);
 select payload into last_tick from public.trade_bridge_ticks where bridge_id=b and symbol=p_batch->>'symbol' order by time_msc desc limit 1;
 insert into public.trade_bridge_candles select b,x->>'symbol',(x->>'timestamp')::bigint,x from jsonb_array_elements(p_batch->'candles') x
 on conflict(bridge_id,symbol,timestamp) do update set payload=excluded.payload;
 insert into public.trade_bridge_state(bridge_id,symbol,session,account_hash,state,tick) values(b,p_batch->>'symbol',p_batch->>'session',p_batch->>'accountHash',p_batch->'state',last_tick)
 on conflict(bridge_id) do update set symbol=excluded.symbol,session=excluded.session,account_hash=excluded.account_hash,state=excluded.state,tick=excluded.tick,received_at=now();
 for ev in select value from jsonb_array_elements(p_batch->'events') loop
 insert into public.trade_bridge_events values(b,ev->>'id',now(),ev) on conflict do nothing;
 if ev->>'kind' in ('submitted','rejected','observed') and ev->>'commandId' ~ '^[0-9a-f-]{36}$' then
 update public.trade_bridge_commands set state=case when state='observed' then state else ev->>'kind' end,result=ev
 where id=(ev->>'commandId')::uuid and bridge_id=b and state in ('dispatch_unknown','submitted','observed');
 end if;
 end loop;
 update public.trade_bridge_commands set state='expired' where bridge_id=b and state='queued' and expires_at<=now();
 select * into s from public.trade_bridge_state where bridge_id=b;
 if p_execution and not s.kill_switch and s.account_hash=p_account and (s.state->>'connected')::boolean and (s.state->>'executionAllowed')::boolean
 and (last_tick->>'timeMsc')::bigint between (extract(epoch from now())*1000)::bigint-p_max_age and (extract(epoch from now())*1000)::bigint+2000 then
 select * into cmd from public.trade_bridge_commands where bridge_id=b and state='queued' and expires_at>now() order by created_at limit 1 for update;
 if found then
 -- Claim before delivery. Unknown delivery is quarantined, NEVER leased again.
 update public.trade_bridge_commands set state='dispatch_unknown',dispatched_session=p_batch->>'session' where id=cmd.id;
 insert into public.trade_bridge_audit(bridge_id,action,payload) values(b,'dispatch',cmd.payload);
 return jsonb_build_object('command',cmd.payload);
 end if;
 end if;
 return jsonb_build_object('command',null);
end $$;

create function public.trade_bridge_read(p_bridge text) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('state',s.state,'receivedAt',s.received_at,'tick',s.tick,'killSwitch',s.kill_switch,
 'candles',(select coalesce(jsonb_agg(c.payload order by c.timestamp),'[]'::jsonb) from (select * from public.trade_bridge_candles where bridge_id=p_bridge and symbol=s.symbol order by timestamp desc limit 2000)c),
 'commands',(select coalesce(jsonb_agg(c),'[]'::jsonb) from (select id,state,created_at,result from public.trade_bridge_commands where bridge_id=p_bridge order by created_at desc limit 30)c))
 from public.trade_bridge_state s where s.bridge_id=p_bridge;
$$;
create function public.trade_bridge_enqueue(p_bridge text,p_command jsonb,p_max integer,p_account text,p_max_age integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.trade_bridge_state; old public.trade_bridge_commands; exposure numeric;
begin
 perform pg_advisory_xact_lock(hashtext(p_bridge));
 select * into old from public.trade_bridge_commands where id=(p_command->>'id')::uuid;
 if found then if old.bridge_id<>p_bridge or old.payload<>p_command then raise exception 'Idempotency conflict'; end if; return jsonb_build_object('id',old.id,'state',old.state); end if;
 select * into s from public.trade_bridge_state where bridge_id=p_bridge for update;
 if not found or s.kill_switch or s.account_hash<>p_account or p_account='' or s.symbol<>p_command->>'symbol' or s.received_at<now()-make_interval(secs=>p_max_age/1000.0) or not (s.state->>'connected')::boolean or not (s.state->>'executionAllowed')::boolean then raise exception 'Execution gates closed'; end if;
 if (s.tick->>'timeMsc')::bigint < (extract(epoch from now())*1000)::bigint-p_max_age then raise exception 'Stale feed'; end if;
 if to_timestamp((p_command->>'expiresAt')::numeric/1000)<=now() or to_timestamp((p_command->>'expiresAt')::numeric/1000)>now()+interval '30 seconds' then raise exception 'Expired command'; end if;
 if exists(select 1 from public.trade_bridge_commands where bridge_id=p_bridge and state in ('queued','dispatch_unknown','submitted')) then raise exception 'Unresolved command requires reconciliation'; end if;
 select coalesce(sum((x->>'volume')::numeric),0) into exposure from (select value x from jsonb_array_elements(s.state->'positions') union all select value x from jsonb_array_elements(s.state->'orders')) exposures where x->>'symbol'=s.symbol;
 if p_command->>'action' in ('BUY','SELL') and exposure+(p_command->>'volume')::numeric>p_max then raise exception 'Exposure exceeds limit'; end if;
 insert into public.trade_bridge_commands(id,bridge_id,payload,expires_at) values((p_command->>'id')::uuid,p_bridge,p_command,to_timestamp((p_command->>'expiresAt')::numeric/1000));
 insert into public.trade_bridge_audit(bridge_id,action,payload) values(p_bridge,'enqueue',p_command);
 return jsonb_build_object('id',p_command->>'id','state','queued');
end $$;
create function public.trade_bridge_kill(p_bridge text,p_enabled boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(p_bridge));
 update public.trade_bridge_state set kill_switch=p_enabled where bridge_id=p_bridge;
 if p_enabled then update public.trade_bridge_commands set state='cancelled' where bridge_id=p_bridge and state='queued'; end if;
 insert into public.trade_bridge_audit(bridge_id,action,payload)values(p_bridge,'kill_switch',jsonb_build_object('enabled',p_enabled));
 return jsonb_build_object('killSwitch',p_enabled);
end $$;
revoke all on function public.trade_bridge_exchange(jsonb,boolean,integer,text,integer),public.trade_bridge_read(text),public.trade_bridge_enqueue(text,jsonb,integer,text,integer),public.trade_bridge_kill(text,boolean) from public,anon,authenticated;
grant execute on function public.trade_bridge_exchange(jsonb,boolean,integer,text,integer),public.trade_bridge_read(text),public.trade_bridge_enqueue(text,jsonb,integer,text,integer),public.trade_bridge_kill(text,boolean) to service_role;
