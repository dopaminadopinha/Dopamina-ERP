alter table public.employees add column if not exists default_hourly_rate numeric(14,2);
alter table public.employees add constraint employees_default_hourly_rate_nonnegative
  check (default_hourly_rate is null or default_hourly_rate >= 0);

create function public.save_work_shifts_batch(
  p_business_id bigint,
  p_employee_id bigint,
  p_rate_override numeric,
  p_break_minutes integer,
  p_days jsonb,
  p_notes text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_day jsonb;
  v_count integer := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then
    raise exception 'Acesso negado ao negócio';
  end if;
  if jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) = 0 then
    raise exception 'Selecione ao menos um dia trabalhado';
  end if;

  for v_day in select value from jsonb_array_elements(p_days)
  loop
    begin
      perform public.save_work_shift(
        p_business_id, p_employee_id, (v_day ->> 'shift_date')::date,
        (v_day ->> 'start_time')::time, (v_day ->> 'end_time')::time,
        p_break_minutes, p_rate_override, p_notes
      );
      v_count := v_count + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_object('shift_date', v_day ->> 'shift_date', 'error', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('created', v_count, 'errors', v_errors);
end;
$$;

revoke all on function public.save_work_shifts_batch(bigint, bigint, numeric, integer, jsonb, text) from public, anon;
grant execute on function public.save_work_shifts_batch(bigint, bigint, numeric, integer, jsonb, text) to authenticated;
