-- ============================================================
-- CLOSET MARKETPLACE · parceiros, produtos e atribuição
-- ============================================================
create table if not exists public.closet_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  website_url text,
  active boolean not null default true,
  credit_reward integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.closet_partner_products (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.closet_partners(id) on delete cascade,
  external_id text,
  name text not null,
  category text not null,
  subcategory text,
  price numeric,
  currency text not null default 'BRL',
  image_url text,
  product_url text not null,
  tags text[] not null default '{}',
  thermal_level smallint check (thermal_level between 1 and 5),
  weather_protection jsonb not null default '{}'::jsonb,
  style_tags text[] not null default '{}',
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(partner_id, external_id)
);

create table if not exists public.closet_marketplace_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  partner_id uuid references public.closet_partners(id) on delete set null,
  product_id uuid references public.closet_partner_products(id) on delete set null,
  trip_id uuid references public.closet_trips(id) on delete set null,
  moment_id uuid references public.closet_trip_moments(id) on delete set null,
  event_type text not null check (event_type in ('impression','click','purchase','credit_reward')),
  source text not null default 'stylist_gap',
  category text,
  query text,
  external_order_id text,
  value numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists closet_partner_products_active_idx on public.closet_partner_products(active, category);
create index if not exists closet_marketplace_events_user_idx on public.closet_marketplace_events(user_id, created_at desc);
create index if not exists closet_marketplace_events_trip_idx on public.closet_marketplace_events(trip_id, moment_id, created_at desc);

alter table public.closet_partners enable row level security;
alter table public.closet_partner_products enable row level security;
alter table public.closet_marketplace_events enable row level security;

create policy "Public read active closet partners" on public.closet_partners for select using(active=true);
create policy "Public read active closet products" on public.closet_partner_products for select using(active=true);
create policy "Users create own marketplace events" on public.closet_marketplace_events for insert with check(auth.uid()=user_id or user_id is null);
create policy "Users read own marketplace events" on public.closet_marketplace_events for select using(auth.uid()=user_id);

-- Compras confirmadas e créditos promocionais devem ser gravados por backend/service role.
-- Isso evita que o cliente consiga forjar purchase/credit_reward.
