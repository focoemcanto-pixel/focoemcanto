-- CLOSET AI · carteira e ledger de créditos
create table if not exists public.closet_ai_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  lifetime_earned integer not null default 0,
  lifetime_spent integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.closet_ai_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount <> 0),
  kind text not null check (kind in ('purchase','partner_reward','promo','referral','admin','ai_usage','refund')),
  operation text,
  partner_id text,
  campaign_id text,
  external_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists closet_ai_credit_ledger_user_created_idx on public.closet_ai_credit_ledger(user_id,created_at desc);
create unique index if not exists closet_ai_credit_ledger_external_ref_idx on public.closet_ai_credit_ledger(external_reference) where external_reference is not null;

alter table public.closet_ai_wallets enable row level security;
alter table public.closet_ai_credit_ledger enable row level security;
create policy "Users can view own AI wallet" on public.closet_ai_wallets for select using (auth.uid()=user_id);
create policy "Users can view own AI credit ledger" on public.closet_ai_credit_ledger for select using (auth.uid()=user_id);

-- Créditos só podem ser alterados pelo backend/service role.
-- Assim o cliente nunca consegue fabricar saldo.
create or replace function public.closet_grant_ai_credits(p_user_id uuid,p_amount integer,p_kind text,p_operation text default null,p_partner_id text default null,p_campaign_id text default null,p_external_reference text default null,p_metadata jsonb default '{}'::jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare new_balance integer;
begin
 if p_amount <= 0 then raise exception 'grant amount must be positive'; end if;
 if p_kind not in ('purchase','partner_reward','promo','referral','admin','refund') then raise exception 'invalid grant kind'; end if;
 insert into closet_ai_wallets(user_id,balance,lifetime_earned) values(p_user_id,p_amount,p_amount)
 on conflict(user_id) do update set balance=closet_ai_wallets.balance+p_amount,lifetime_earned=closet_ai_wallets.lifetime_earned+p_amount,updated_at=now()
 returning balance into new_balance;
 insert into closet_ai_credit_ledger(user_id,amount,kind,operation,partner_id,campaign_id,external_reference,metadata) values(p_user_id,p_amount,p_kind,p_operation,p_partner_id,p_campaign_id,p_external_reference,p_metadata);
 return new_balance;
end;$$;

create or replace function public.closet_spend_ai_credits(p_user_id uuid,p_amount integer,p_operation text,p_external_reference text default null,p_metadata jsonb default '{}'::jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare new_balance integer;
begin
 if p_amount <= 0 then raise exception 'spend amount must be positive'; end if;
 update closet_ai_wallets set balance=balance-p_amount,lifetime_spent=lifetime_spent+p_amount,updated_at=now() where user_id=p_user_id and balance>=p_amount returning balance into new_balance;
 if new_balance is null then raise exception 'insufficient_ai_credits'; end if;
 insert into closet_ai_credit_ledger(user_id,amount,kind,operation,external_reference,metadata) values(p_user_id,-p_amount,'ai_usage',p_operation,p_external_reference,p_metadata);
 return new_balance;
end;$$;

revoke all on function public.closet_grant_ai_credits(uuid,integer,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.closet_spend_ai_credits(uuid,integer,text,text,jsonb) from public,anon,authenticated;
