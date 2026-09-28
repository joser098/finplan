-- Compatibility upgrade for projects that applied the earlier two-argument RPC.
-- No financial data is changed. Safe after either version of migration 002.
begin;
create or replace function public.finance_write(p_expected_revision bigint, p_changes jsonb, p_account uuid)
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


drop function if exists public.finance_write(bigint,jsonb);
notify pgrst, 'reload schema';
commit;
