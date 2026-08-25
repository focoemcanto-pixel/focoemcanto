-- Closet: biblioteca de looks salvos
create table if not exists public.closet_saved_looks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occasion text not null,
  title text,
  item_ids jsonb not null default '[]'::jsonb,
  favorite boolean not null default true,
  rating text,
  worn_count integer not null default 0,
  last_worn_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists closet_saved_looks_user_occasion_idx on public.closet_saved_looks(user_id,occasion,created_at desc);

alter table public.closet_saved_looks enable row level security;

drop policy if exists "closet_saved_looks_select_own" on public.closet_saved_looks;
create policy "closet_saved_looks_select_own" on public.closet_saved_looks for select using (auth.uid()=user_id);
drop policy if exists "closet_saved_looks_insert_own" on public.closet_saved_looks;
create policy "closet_saved_looks_insert_own" on public.closet_saved_looks for insert with check (auth.uid()=user_id);
drop policy if exists "closet_saved_looks_update_own" on public.closet_saved_looks;
create policy "closet_saved_looks_update_own" on public.closet_saved_looks for update using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists "closet_saved_looks_delete_own" on public.closet_saved_looks;
create policy "closet_saved_looks_delete_own" on public.closet_saved_looks for delete using (auth.uid()=user_id);
