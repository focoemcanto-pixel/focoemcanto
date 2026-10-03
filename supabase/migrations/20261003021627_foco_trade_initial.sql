-- Additive, isolated schema. Does not expose trade data in Supabase's public Data API.
-- FocoOS V1 retains its admin cookie + KV principal. UUID ownership below is for the
-- future per-user Supabase integration; never manufacture a shared auth.users row.
create schema if not exists foco_trade;
revoke all on schema foco_trade from public, anon;
grant usage on schema foco_trade to authenticated, service_role;
create table foco_trade.instruments (
 symbol text primary key, name text not null, exchange text not null,
 tick_size numeric not null check(tick_size>0), point_value numeric,
 timezone text not null default 'America/Sao_Paulo', metadata jsonb not null default '{}'
);
create table foco_trade.market_sessions (
 id uuid primary key default gen_random_uuid(), symbol text not null references foco_trade.instruments,
 session_date date not null, opens_at timestamptz, closes_at timestamptz,
 source text not null check(source in ('mock','historical','live')), status text not null,
 check(closes_at is null or opens_at is null or closes_at>opens_at), unique(symbol,session_date,source)
);
create table foco_trade.candles (
 symbol text not null references foco_trade.instruments, timestamp timestamptz not null,
 timeframe text not null check(timeframe in ('1m','5m','15m','1h')), source text not null check(source in ('mock','historical','live')),
 open numeric not null, high numeric not null, low numeric not null, close numeric not null,
 volume numeric not null check(volume>=0), provider text not null, finalized boolean not null default false,
 primary key(symbol,timestamp,timeframe,source), check(high>=greatest(open,close) and low<=least(open,close) and high>=low)
);
create table foco_trade.strategies (
 id text primary key, name text not null, family text not null, description text not null,
 created_at timestamptz not null default now()
);
create table foco_trade.strategy_versions (
 id uuid primary key default gen_random_uuid(), strategy_id text not null references foco_trade.strategies,
 version text not null, stage text not null check(stage in ('research','backtest','paper','live-monitoring')),
 live_authorized boolean not null default false, parameters jsonb not null, code_hash text,
 validated_at timestamptz, created_at timestamptz not null default now(),
 check(not live_authorized or (stage='live-monitoring' and validated_at is not null)), unique(strategy_id,version)
);
create table foco_trade.strategy_runs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 strategy_version_id uuid not null references foco_trade.strategy_versions, symbol text not null references foco_trade.instruments,
 mode text not null check(mode in ('backtest','paper','replay','live-monitoring')),
 source text not null check(source in ('mock','historical','live')), dataset_hash text not null, parameter_snapshot jsonb not null,
 starts_at timestamptz not null, as_of timestamptz not null, created_at timestamptz not null default now(),
 unique(id,user_id), check(as_of>=starts_at)
);
create table foco_trade.setups (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 run_id uuid not null, strategy_version_id uuid not null references foco_trade.strategy_versions,
 symbol text not null references foco_trade.instruments, timestamp timestamptz not null,
 direction text not null check(direction in ('long','short')), entry_reference numeric not null,
 invalidation numeric not null, targets jsonb not null, risk_points numeric not null check(risk_points>0),
 potential_points numeric not null check(potential_points>0), rr numeric not null check(rr>0),
 context jsonb not null, conflicts jsonb not null default '[]', explanation text not null,
 unique(id,user_id), foreign key(run_id,user_id) references foco_trade.strategy_runs(id,user_id) on delete cascade,
 unique(run_id,strategy_version_id,timestamp,direction),
 check((direction='long' and invalidation<entry_reference) or (direction='short' and invalidation>entry_reference))
);
create table foco_trade.setup_conditions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 setup_id uuid not null, key text not null, label text not null, met boolean not null,
 measured jsonb not null, thresholds jsonb not null, explanation text not null,
 foreign key(setup_id,user_id) references foco_trade.setups(id,user_id) on delete cascade, unique(setup_id,key)
);
create table foco_trade.signals (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 setup_id uuid not null, emitted_at timestamptz not null, mode text not null check(mode in ('paper','replay','live-monitoring')),
 foreign key(setup_id,user_id) references foco_trade.setups(id,user_id) on delete cascade, unique(setup_id,mode)
);
create table foco_trade.paper_trades (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 setup_id uuid not null, entry_at timestamptz not null, entry numeric not null,
 stop numeric not null, target numeric not null, exit_at timestamptz, exit numeric,
 result_r numeric, duration_seconds integer check(duration_seconds>=0),
 status text not null check(status in ('open','target','stop','cancelled')),
 ambiguous_bar boolean not null default false, slippage_points numeric not null default 0,
 cost_points numeric not null default 0, conditions jsonb not null, context jsonb not null,
 unique(id,user_id), foreign key(setup_id,user_id) references foco_trade.setups(id,user_id) on delete cascade,
 check(exit_at is null or exit_at>=entry_at), check((result_r is null and exit is null) or (result_r is not null and exit is not null))
);
create table foco_trade.trade_journal (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 paper_trade_id uuid, note text not null check(length(note) between 1 and 3000),
 as_of timestamptz, source text not null, tags text[] not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(paper_trade_id,user_id) references foco_trade.paper_trades(id,user_id) on delete cascade
);
create table foco_trade.backtests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 run_id uuid not null, status text not null check(status in ('queued','running','completed','failed')),
 cost_model jsonb not null, execution_policy text not null,
 starts_at timestamptz not null, ends_at timestamptz not null,
 created_at timestamptz not null default now(), unique(id,user_id),
 foreign key(run_id,user_id) references foco_trade.strategy_runs(id,user_id) on delete cascade,
 check(ends_at>=starts_at)
);
create table foco_trade.backtest_results (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 backtest_id uuid not null, strategy_version_id uuid not null references foco_trade.strategy_versions,
 session_hour integer check(session_hour between 0 and 23), regime text not null,
 occurrences integer not null check(occurrences>=0), win_rate numeric check(win_rate between 0 and 1),
 payoff numeric, expectancy_r numeric, profit_factor numeric, drawdown_r numeric check(drawdown_r>=0),
 net_r numeric, trades jsonb not null default '[]',
 foreign key(backtest_id,user_id) references foco_trade.backtests(id,user_id) on delete cascade
);
create table foco_trade.user_learning_progress (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 as_of timestamptz not null, question text not null, answer text not null,
 engine_context jsonb not null, explanation text, topic text not null, created_at timestamptz not null default now()
);
-- Catalog is read-only for authenticated users. All writes and live authorization are server controlled.
do $$ declare t text; begin
 foreach t in array array['instruments','market_sessions','candles','strategies','strategy_versions'] loop
  execute format('alter table foco_trade.%I enable row level security',t);
  execute format('create policy catalog_read on foco_trade.%I for select to authenticated using (true)',t);
  execute format('grant select on foco_trade.%I to authenticated',t);
 end loop;
 foreach t in array array['strategy_runs','setups','setup_conditions','signals','paper_trades','trade_journal','backtests','backtest_results','user_learning_progress'] loop
  execute format('alter table foco_trade.%I enable row level security',t);
  execute format('create policy owner_read on foco_trade.%I for select to authenticated using ((select auth.uid()) = user_id)',t);
  -- Calculated financial references cannot be forged by clients. Only notes/learning accept user writes.
  execute format('grant select on foco_trade.%I to authenticated',t);
  execute format('create index on foco_trade.%I (user_id)',t);
 end loop;
 foreach t in array array['trade_journal','user_learning_progress'] loop
  execute format('create policy owner_write on foco_trade.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t);
  execute format('grant insert, update, delete on foco_trade.%I to authenticated',t);
 end loop;
end $$;
grant all on all tables in schema foco_trade to service_role;
create index on foco_trade.setups(strategy_version_id,timestamp);
create index on foco_trade.paper_trades(user_id,entry_at);
create index on foco_trade.strategy_runs(strategy_version_id,symbol,as_of);
create index on foco_trade.candles(symbol,timeframe,timestamp) where finalized;
insert into foco_trade.instruments(symbol,name,exchange,tick_size,metadata)
 values('WIN','Mini índice · símbolo lógico','B3',5,'{"live_connected":false,"contract_resolution_required":true,"monetary_risk_enabled":false}');
insert into foco_trade.strategies(id,name,family,description) values
 ('trend_pullback_confirmation_v1','Tendência + pullback + confirmação','trend-continuation','Hipótese candidata: contexto 15m, estrutura 5m e confirmação/gatilho 1m. Não validada para uso ao vivo.');
insert into foco_trade.strategy_versions(strategy_id,version,stage,parameters)
 values('trend_pullback_confirmation_v1','1.0.0','paper','{"contextFastPeriod":4,"contextSlowPeriod":8,"contextSlopeBars":2,"minContextSeparationPoints":20,"structureLookbackBars":10,"minImpulsePoints":150,"pullbackMinRatio":0.12,"pullbackMaxRatio":0.75,"supportTolerancePoints":65,"reactionBodyMinPoints":15,"confirmationCloses":2,"triggerBufferTicks":1,"stopBufferTicks":2,"minStopPoints":20,"maxStopPoints":650,"targetR":2,"cooldownMinutes":15}');
