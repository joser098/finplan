create table public.financial_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.financial_plans enable row level security;
revoke all on public.financial_plans from anon;
grant select, insert, update, delete on public.financial_plans to authenticated;
create policy "Users own their financial plan" on public.financial_plans
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
