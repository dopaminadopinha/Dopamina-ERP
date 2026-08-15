create or replace function public.update_structural_cost(
  p_business_id bigint,p_id bigint,p_area_id bigint,p_name text,p_structure_type text,p_monthly_amount numeric,
  p_effective_from date,p_effective_to date default null,p_notes text default null
) returns void language plpgsql security invoker set search_path='' as $$
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then raise exception 'Acesso negado ao negócio'; end if;
  update public.structural_costs set
    area_id=p_area_id,name=trim(p_name),structure_type=p_structure_type,monthly_amount=p_monthly_amount,
    effective_from=p_effective_from,effective_to=p_effective_to,notes=nullif(trim(p_notes),''),updated_at=now()
  where id=p_id and business_id=p_business_id;
  if not found then raise exception 'Custo estrutural não encontrado'; end if;
  update public.expenses set
    area_id=p_area_id,description=trim(p_name),amount=p_monthly_amount,
    expense_date=p_effective_from,due_date=p_effective_from,recurrence_end=p_effective_to
  where business_id=p_business_id and source_type='structural_cost' and source_id=p_id;
end $$;

create or replace function public.delete_structural_cost(p_business_id bigint,p_id bigint)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then raise exception 'Acesso negado ao negócio'; end if;
  delete from public.expenses where business_id=p_business_id and source_type='structural_cost' and source_id=p_id;
  delete from public.structural_costs where id=p_id and business_id=p_business_id;
  if not found then raise exception 'Custo estrutural não encontrado'; end if;
end $$;

revoke all on function public.update_structural_cost(bigint,bigint,bigint,text,text,numeric,date,date,text) from public,anon;
revoke all on function public.delete_structural_cost(bigint,bigint) from public,anon;
grant execute on function public.update_structural_cost(bigint,bigint,bigint,text,text,numeric,date,date,text) to authenticated;
grant execute on function public.delete_structural_cost(bigint,bigint) to authenticated;
