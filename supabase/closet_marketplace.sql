-- Closet Marketplace — fase 1: catálogo afiliado / outbound commerce
create extension if not exists pgcrypto;

create table if not exists public.closet_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  partner_type text not null default 'affiliate' check (partner_type in ('affiliate','store','brand')),
  logo_url text,
  website_url text,
  affiliate_network text,
  credit_reward integer not null default 0,
  active boolean not null default true,
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
  description text,
  price numeric(12,2),
  currency text not null default 'BRL',
  image_url text,
  product_url text not null,
  tags text[] not null default '{}',
  style_tags text[] not null default '{}',
  thermal_level integer check (thermal_level between 1 and 5),
  weather_protection jsonb not null default '{}'::jsonb,
  gender_profile text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(partner_id, external_id)
);

create table if not exists public.closet_marketplace_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  partner_id uuid references public.closet_partners(id) on delete set null,
  product_id uuid references public.closet_partner_products(id) on delete set null,
  trip_id uuid,
  moment_id uuid,
  event_type text not null check (event_type in ('impression','click','affiliate_conversion','purchase_confirmed')),
  source text,
  category text,
  query text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists closet_partner_products_active_category_idx on public.closet_partner_products(active, category);
create index if not exists closet_marketplace_events_user_idx on public.closet_marketplace_events(user_id, created_at desc);
create index if not exists closet_marketplace_events_product_idx on public.closet_marketplace_events(product_id, created_at desc);

alter table public.closet_partners enable row level security;
alter table public.closet_partner_products enable row level security;
alter table public.closet_marketplace_events enable row level security;

drop policy if exists "public read active closet partners" on public.closet_partners;
create policy "public read active closet partners" on public.closet_partners for select using (active = true);
drop policy if exists "public read active closet products" on public.closet_partner_products;
create policy "public read active closet products" on public.closet_partner_products for select using (active = true);
drop policy if exists "users insert own marketplace events" on public.closet_marketplace_events;
create policy "users insert own marketplace events" on public.closet_marketplace_events for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "users read own marketplace events" on public.closet_marketplace_events;
create policy "users read own marketplace events" on public.closet_marketplace_events for select to authenticated using (auth.uid() = user_id);

-- Parceiros afiliados iniciais. URLs dos produtos serão cadastradas por você com o link de afiliado real.
insert into public.closet_partners (name,slug,partner_type,affiliate_network,active)
values ('SHEIN','shein','affiliate','affiliate',true),('Shopee','shopee','affiliate','affiliate',true)
on conflict (slug) do update set active=excluded.active, partner_type='affiliate';

-- Exemplo de cadastro (não executado):
-- insert into public.closet_partner_products
-- (partner_id,external_id,name,category,price,image_url,product_url,tags,thermal_level)
-- select id,'SKU-OU-ID','Jaqueta puffer','Casacos e jaquetas',199.90,'https://imagem...','SEU_LINK_AFILIADO',array['puffer','frio','casaco'],5
-- from public.closet_partners where slug='shopee';
