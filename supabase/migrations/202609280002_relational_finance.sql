begin;
-- Relational source of truth. financial_plans remains as a read-only legacy backup.
create table public.finance_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  initialized boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.categories (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null, name text not null check (length(btrim(name)) between 1 and 100),
  position integer not null default 0,
  primary key(user_id,id), unique(user_id,name), check(id = name)
);
create unique index categories_name_ci on public.categories(user_id,lower(name));
create table public.credit_cards (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null, name text not null check(length(btrim(name)) between 1 and 100),
  primary key(user_id,id), check(id = name)
);
create table public.payments (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check(length(id) between 1 and 100 and position(':' in id) = 0),
  name text not null check(length(btrim(name)) between 1 and 100),
  amount numeric(16,2) not null check(amount > 0),
  currency text not null check(currency in ('ARS','USD')),
  category_id text not null, card_id text,
  due_date date not null,
  status text not null check(status in ('Pendiente','Pagado','Programado')),
  variable boolean not null default false, notes text not null default '',
  end_month text check(end_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  position integer not null default 0,
  primary key(user_id,id),
  foreign key(user_id,category_id) references public.categories(user_id,id) deferrable initially deferred,
  foreign key(user_id,card_id) references public.credit_cards(user_id,id) deferrable initially deferred
);
create table public.incomes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check(length(id) between 1 and 100 and position(':' in id) = 0),
  name text not null check(length(btrim(name)) between 1 and 100),
  amount numeric(16,2) not null check(amount > 0),
  currency text not null check(currency in ('ARS','USD')),
  due_date date not null,
  status text not null check(status in ('Estimado','Confirmado','Cobrado')),
  variable boolean not null default false, notes text not null default '',
  end_month text check(end_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  position integer not null default 0,
  primary key(user_id,id)
);
create table public.recurrences (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null, payment_id text, income_id text,
  interval_months integer not null check(interval_months in (1,2,3,6,12)),
  primary key(user_id,id), unique(user_id,payment_id), unique(user_id,income_id),
  check(num_nonnulls(payment_id,income_id) = 1),
  check(id = case when payment_id is not null then 'payment:' || payment_id else 'income:' || income_id end),
  foreign key(user_id,payment_id) references public.payments(user_id,id) on delete cascade,
  foreign key(user_id,income_id) references public.incomes(user_id,id) on delete cascade
);
create table public.installment_plans (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null, payment_id text not null,
  total_installments integer not null check(total_installments between 1 and 120),
  primary key(user_id,id), unique(user_id,payment_id), check(id = payment_id),
  foreign key(user_id,payment_id) references public.payments(user_id,id) on delete cascade
);
create table public.monthly_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null, payment_id text, income_id text,
  month text not null check(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  name text check(length(btrim(name)) between 1 and 100),
  amount numeric(16,2) check(amount > 0),
  currency text check(currency in ('ARS','USD')),
  category_id text, card_id text, due_date date, status text,
  interval_months integer check(interval_months in (0,1,2,3,6,12)),
  variable boolean, notes text,
  end_month text check(end_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  total_installments integer check(total_installments between 1 and 120),
  primary key(user_id,id), unique(user_id,payment_id,month), unique(user_id,income_id,month),
  check(num_nonnulls(payment_id,income_id) = 1),
  check(id = coalesce(payment_id,income_id) || ':' || month),
  check(due_date is null or to_char(due_date,'YYYY-MM') = month),
  check((payment_id is not null and (status is null or status in ('Pendiente','Pagado','Programado'))) or (income_id is not null and (status is null or status in ('Estimado','Confirmado','Cobrado')))),
  check(income_id is null or (category_id is null and card_id is null and total_installments is null)),
  foreign key(user_id,payment_id) references public.payments(user_id,id) on delete cascade,
  foreign key(user_id,income_id) references public.incomes(user_id,id) on delete cascade,
  foreign key(user_id,category_id) references public.categories(user_id,id) deferrable initially deferred,
  foreign key(user_id,card_id) references public.credit_cards(user_id,id) deferrable initially deferred
);
create index payments_month on public.payments(user_id,due_date);
create index payments_category on public.payments(user_id,category_id);
create index payments_card on public.payments(user_id,card_id);
create index incomes_month on public.incomes(user_id,due_date);
create index overrides_month on public.monthly_overrides(user_id,month);
create index overrides_category on public.monthly_overrides(user_id,category_id);
create index overrides_card on public.monthly_overrides(user_id,card_id);

-- Clients may read their own rows. Writes go through the atomic revision-checked RPC.
do $$
declare t text;
begin
  foreach t in array array['finance_accounts','categories','credit_cards','payments','incomes','recurrences','installment_plans','monthly_overrides'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy own_rows on public.%I for select to authenticated using ((select auth.uid()) = user_id)',t);
  end loop;
end $$;

-- Private helper: fixed allow-list, quoted identifiers, parameterized values.
create function public.finance_apply_rows(p_user uuid, p_changes jsonb)
returns void language plpgsql set search_path = '' as $$
declare t text; r jsonb; assignments text;
begin
  foreach t in array array['categories','credit_cards','payments','incomes','recurrences','installment_plans','monthly_overrides'] loop
    select string_agg(format('%I = excluded.%I',a.attname,a.attname),',') into assignments
      from pg_catalog.pg_attribute a where a.attrelid = format('public.%I',t)::regclass
      and a.attnum > 0 and not a.attisdropped and a.attname not in ('user_id','id');
    for r in select value from jsonb_array_elements(coalesce(p_changes->t->'upsert','[]'::jsonb)) loop
      execute format('insert into public.%1$I select * from jsonb_populate_record(null::public.%1$I,$1) on conflict(user_id,id) do update set %2$s',t,assignments)
        using r || jsonb_build_object('user_id',p_user);
    end loop;
  end loop;
  foreach t in array array['monthly_overrides','installment_plans','recurrences','payments','incomes','credit_cards','categories'] loop
    execute format('delete from public.%I where user_id=$1 and id in (select jsonb_array_elements_text($2))',t)
      using p_user,coalesce(p_changes->t->'remove','[]'::jsonb);
  end loop;
end $$;
revoke all on function public.finance_apply_rows(uuid,jsonb) from public,anon,authenticated;

create function public.finance_read()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); account public.finance_accounts; tables jsonb := '{}'::jsonb; rows jsonb; t text;
begin
  if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
  insert into public.finance_accounts(user_id) values(u) on conflict do nothing;
  -- Shared lock prevents a mixed snapshot while another device commits changes.
  select * into account from public.finance_accounts where user_id=u for share;
  foreach t in array array['categories','credit_cards','payments','incomes','recurrences','installment_plans','monthly_overrides'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) - ''user_id'' order by r.id),''[]''::jsonb) from public.%I r where user_id=$1',t) into rows using u;
    tables := tables || jsonb_build_object(t,rows);
  end loop;
  return jsonb_build_object('revision',account.revision,'initialized',account.initialized,'tables',tables);
end $$;
revoke all on function public.finance_read() from public,anon;
grant execute on function public.finance_read() to authenticated;

create function public.finance_write(p_expected_revision bigint, p_changes jsonb, p_account uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); current_revision bigint;
begin
  if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_account is distinct from u then raise exception 'Account changed. Sign in again.' using errcode='42501'; end if;
  insert into public.finance_accounts(user_id) values(u) on conflict do nothing;
  select revision into current_revision from public.finance_accounts where user_id=u for update;
  if p_expected_revision is null or current_revision <> p_expected_revision then
    raise exception 'FINPLAN_CONFLICT: Your plan changed on another device. Reload before saving.' using errcode='40001';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'object' then raise exception 'Invalid changes' using errcode='22023'; end if;
  perform public.finance_apply_rows(u,p_changes);
  -- Every account keeps the three categories used by projection totals.
  if (select count(*) from public.categories where user_id=u and id in ('Tarjetas','Préstamos','Otros')) <> 3 then
    raise exception 'System categories are required' using errcode='23514';
  end if;
  if exists(select 1 from public.payments p join public.incomes i on i.user_id=p.user_id and i.id=p.id where p.user_id=u) then
    raise exception 'Payment and income identifiers must be distinct' using errcode='23514';
  end if;
  if exists(select 1 from public.installment_plans i left join public.recurrences r on r.user_id=i.user_id and r.payment_id=i.payment_id where i.user_id=u and (r.interval_months is distinct from 1)) then
    raise exception 'Installments require a monthly recurrence' using errcode='23514';
  end if;
  update public.finance_accounts set revision=revision+1,initialized=true,updated_at=now() where user_id=u returning revision into current_revision;
  return current_revision;
end $$;
revoke all on function public.finance_write(bigint,jsonb,uuid) from public,anon;
grant execute on function public.finance_write(bigint,jsonb,uuid) to authenticated;

-- One-time conversion of v1 backups. A malformed backup aborts the migration;
-- the original financial_plans row is never edited or deleted.
create function public.finance_import_legacy(p_user uuid, p_data jsonb)
returns void language plpgsql set search_path = '' as $$
declare e jsonb; o jsonb; k text; kind text; n text; pos integer; entry_id text; period text; payment boolean;
begin
  if jsonb_typeof(p_data->'payments') is distinct from 'array' or jsonb_typeof(p_data->'incomes') is distinct from 'array' then
    raise exception 'Invalid legacy plan for user %',p_user;
  end if;
  pos := 0;
  for n in select value from jsonb_array_elements_text(coalesce(p_data->'categories','["Vivienda","Servicios","Suscripciones","Tarjetas","Préstamos","Impuestos","Otros"]'::jsonb)) loop
    insert into public.categories(user_id,id,name,position) values(p_user,n,n,pos) on conflict do nothing; pos:=pos+1;
  end loop;
  for n in select unnest(array['Tarjetas','Préstamos','Otros']) union select value->>'category' from jsonb_array_elements(p_data->'payments') union select value->>'category' from jsonb_each(coalesce(p_data->'overrides','{}'::jsonb)) where value->>'category' is not null and value->>'category' <> 'Ingreso' loop
    insert into public.categories(user_id,id,name,position) values(p_user,n,n,pos) on conflict do nothing; pos:=pos+1;
  end loop;
  for n in select value->>'card' from jsonb_array_elements(p_data->'payments') where nullif(value->>'card','') is not null union select value->>'card' from jsonb_each(coalesce(p_data->'overrides','{}'::jsonb)) where nullif(value->>'card','') is not null loop
    insert into public.credit_cards(user_id,id,name) values(p_user,n,n) on conflict do nothing;
  end loop;
  foreach kind in array array['payments','incomes'] loop
    pos:=0;
    for e in select value from jsonb_array_elements(p_data->kind) loop
      if kind='payments' then
        insert into public.payments(user_id,id,name,amount,currency,category_id,card_id,due_date,status,variable,notes,end_month,position)
          values(p_user,e->>'id',e->>'name',(e->>'amount')::numeric,e->>'currency',e->>'category',nullif(e->>'card',''),(e->>'date')::date,e->>'status',coalesce((e->>'variable')::boolean,false),coalesce(e->>'notes',''),e->>'end',pos);
      else
        insert into public.incomes(user_id,id,name,amount,currency,due_date,status,variable,notes,end_month,position)
          values(p_user,e->>'id',e->>'name',(e->>'amount')::numeric,e->>'currency',(e->>'date')::date,e->>'status',coalesce((e->>'variable')::boolean,false),coalesce(e->>'notes',''),e->>'end',pos);
      end if;
      if coalesce((e->>'interval')::integer,0)>0 then
        insert into public.recurrences(user_id,id,payment_id,income_id,interval_months) values(p_user,(case when kind='payments' then 'payment:' else 'income:' end)|| (e->>'id'),case when kind='payments' then e->>'id' end,case when kind='incomes' then e->>'id' end,(e->>'interval')::integer);
      end if;
      if e->>'installments' is not null then
        if kind='incomes' or (e->>'interval')::integer is distinct from 1 then raise exception 'Invalid legacy installments'; end if;
        insert into public.installment_plans(user_id,id,payment_id,total_installments) values(p_user,e->>'id',e->>'id',(e->>'installments')::integer);
      end if;
      pos:=pos+1;
    end loop;
  end loop;
  for k,o in select key,value from jsonb_each(coalesce(p_data->'overrides','{}'::jsonb)) loop
    if o='null'::jsonb then continue; end if;
    entry_id:=left(k,length(k)-8); period:=right(k,7);
    payment:=exists(select 1 from public.payments where user_id=p_user and id=entry_id);
    insert into public.monthly_overrides(user_id,id,payment_id,income_id,month,name,amount,currency,category_id,card_id,due_date,status,interval_months,variable,notes,end_month,total_installments)
      values(p_user,k,case when payment then entry_id end,case when not payment then entry_id end,period,o->>'name',(o->>'amount')::numeric,o->>'currency',case when payment then o->>'category' end,case when payment then nullif(o->>'card','') end,(o->>'date')::date,o->>'status',(o->>'interval')::integer,(o->>'variable')::boolean,o->>'notes',o->>'end',(o->>'installments')::integer);
  end loop;
  if exists(select 1 from public.payments p join public.incomes i on i.user_id=p.user_id and i.id=p.id where p.user_id=p_user) then raise exception 'Duplicate legacy identifiers'; end if;
  insert into public.finance_accounts(user_id,initialized,revision) values(p_user,true,1);
end $$;
revoke all on function public.finance_import_legacy(uuid,jsonb) from public,anon,authenticated;
do $$
declare r record;
begin
  for r in select user_id,data from public.financial_plans loop
    perform public.finance_import_legacy(r.user_id,r.data);
  end loop;
end $$;
drop function public.finance_import_legacy(uuid,jsonb);
revoke insert,update,delete on public.financial_plans from authenticated;
comment on table public.financial_plans is 'Read-only v1 backup. Migrated into relational tables by 202609280002.';

commit;

