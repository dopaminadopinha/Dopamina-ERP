alter table public.expenses
  add column if not exists cost_behavior text not null default 'variable';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'expenses_cost_behavior_valid'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_cost_behavior_valid
      check (cost_behavior in ('fixed', 'variable'));
  end if;
end
$$;

comment on column public.expenses.cost_behavior is
  'Classifica a despesa operacional como fixa ou variavel.';
