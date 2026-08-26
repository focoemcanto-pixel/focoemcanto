-- TRAVEL CLOSET · viagens, roteiro, looks e mala
create table if not exists public.closet_trips (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null, destination text not null, start_date date not null, end_date date not null,
 latitude numeric, longitude numeric, thermal_preference smallint not null default 3 check (thermal_preference between 1 and 5),
 packing_mode text not null default 'balanced' check (packing_mode in ('compact','balanced','variety')),
 notes text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.closet_trip_moments (
 id uuid primary key default gen_random_uuid(), trip_id uuid not null references public.closet_trips(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, title text not null, starts_at timestamptz,
 location_name text, latitude numeric, longitude numeric, activity_type text, environment text check (environment in ('indoor','outdoor','mixed') or environment is null),
 expected_temp_min numeric, expected_temp_max numeric, rain_probability numeric, weather_source text,
 thermal_need smallint check (thermal_need between 1 and 5), notes text, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.closet_trip_moment_items (
 moment_id uuid not null references public.closet_trip_moments(id) on delete cascade,
 item_id uuid not null references public.closet_items(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, locked boolean not null default false,
 source text not null default 'manual' check (source in ('manual','stylist')), created_at timestamptz not null default now(), primary key(moment_id,item_id)
);
create table if not exists public.closet_trip_packing (
 trip_id uuid not null references public.closet_trips(id) on delete cascade,
 item_id uuid not null references public.closet_items(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, packed boolean not null default false,
 purchased_for_trip boolean not null default false, created_at timestamptz not null default now(), primary key(trip_id,item_id)
);
create index if not exists closet_trips_user_idx on public.closet_trips(user_id,start_date);
create index if not exists closet_trip_moments_trip_idx on public.closet_trip_moments(trip_id,starts_at);
alter table public.closet_trips enable row level security;alter table public.closet_trip_moments enable row level security;alter table public.closet_trip_moment_items enable row level security;alter table public.closet_trip_packing enable row level security;
create policy "Users manage own trips" on public.closet_trips for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "Users manage own trip moments" on public.closet_trip_moments for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "Users manage own trip looks" on public.closet_trip_moment_items for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "Users manage own packing" on public.closet_trip_packing for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
-- atributos térmicos evolutivos ficam no metadata da peça para não quebrar a tabela atual:
-- metadata.thermal_level 1..5, weather_protection: rain/wind, material, coverage.
