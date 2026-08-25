-- CLOSET · PLANEJADOR DE LOOKS
create table if not exists public.closet_planned_looks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_date date not null,
  occasion text not null,
  title text,
  item_ids uuid[] not null default '{}',
  saved_look_id uuid references public.closet_saved_looks(id) on delete set null,
  note text,
  weather jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, planned_date, occasion)
);
create index if not exists closet_planned_looks_user_date_idx on public.closet_planned_looks(user_id,planned_date);
alter table public.closet_planned_looks enable row level security;
drop policy if exists "Users can view own planned looks" on public.closet_planned_looks;
create policy "Users can view own planned looks" on public.closet_planned_looks for select using(auth.uid()=user_id);
drop policy if exists "Users can insert own planned looks" on public.closet_planned_looks;
create policy "Users can insert own planned looks" on public.closet_planned_looks for insert with check(auth.uid()=user_id);
drop policy if exists "Users can update own planned looks" on public.closet_planned_looks;
create policy "Users can update own planned looks" on public.closet_planned_looks for update using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "Users can delete own planned looks" on public.closet_planned_looks;
create policy "Users can delete own planned looks" on public.closet_planned_looks for delete using(auth.uid()=user_id);
