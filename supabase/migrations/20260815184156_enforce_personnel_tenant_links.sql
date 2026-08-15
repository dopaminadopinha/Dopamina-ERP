drop policy compensation_member_all on public.employee_compensation_history;
create policy compensation_member_all on public.employee_compensation_history for all to authenticated
  using ((select private.is_business_member(business_id)))
  with check ((select private.is_business_member(business_id)) and exists (select 1 from public.employees e where e.id=employee_id and e.business_id=business_id));

drop policy employees_member_all on public.employees;
create policy employees_member_all on public.employees for all to authenticated
  using ((select private.is_business_member(business_id)))
  with check ((select private.is_business_member(business_id)) and (main_area_id is null or exists (select 1 from public.areas a where a.id=main_area_id and a.business_id=business_id)));

drop policy shifts_member_all on public.work_shifts;
create policy shifts_member_all on public.work_shifts for all to authenticated
  using ((select private.is_business_member(business_id)))
  with check ((select private.is_business_member(business_id))
    and exists (select 1 from public.employees e where e.id=employee_id and e.business_id=business_id)
    and (area_id is null or exists (select 1 from public.areas a where a.id=area_id and a.business_id=business_id)));

drop policy personnel_costs_member_all on public.personnel_cost_entries;
create policy personnel_costs_member_all on public.personnel_cost_entries for all to authenticated
  using ((select private.is_business_member(business_id)))
  with check ((select private.is_business_member(business_id))
    and (employee_id is null or exists (select 1 from public.employees e where e.id=employee_id and e.business_id=business_id))
    and (area_id is null or exists (select 1 from public.areas a where a.id=area_id and a.business_id=business_id)));

drop policy payroll_items_member_all on public.payroll_closing_items;
create policy payroll_items_member_all on public.payroll_closing_items for all to authenticated
  using (exists (select 1 from public.payroll_closings c where c.id=closing_id and (select private.is_business_member(c.business_id))))
  with check (exists (select 1 from public.payroll_closings c join public.employees e on e.business_id=c.business_id where c.id=closing_id and e.id=employee_id and (select private.is_business_member(c.business_id))));

drop policy structural_costs_member_all on public.structural_costs;
create policy structural_costs_member_all on public.structural_costs for all to authenticated
  using ((select private.is_business_member(business_id)))
  with check ((select private.is_business_member(business_id)) and (area_id is null or exists (select 1 from public.areas a where a.id=area_id and a.business_id=business_id)));
