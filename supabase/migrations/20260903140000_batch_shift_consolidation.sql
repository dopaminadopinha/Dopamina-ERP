alter table public.work_shifts add column if not exists batch_id uuid;
create index if not exists work_shifts_batch_idx on public.work_shifts (business_id, batch_id) where batch_id is not null;

create or replace function public.save_work_shifts_batch(
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
  v_id bigint;
  v_batch uuid := gen_random_uuid();
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
      v_id := public.save_work_shift(
        p_business_id, p_employee_id, (v_day ->> 'shift_date')::date,
        (v_day ->> 'start_time')::time, (v_day ->> 'end_time')::time,
        p_break_minutes, p_rate_override, p_notes
      );
      update public.work_shifts set batch_id = v_batch where id = v_id and business_id = p_business_id;
      v_count := v_count + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_object('shift_date', v_day ->> 'shift_date', 'error', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('created', v_count, 'errors', v_errors, 'batch_id', v_batch);
end;
$$;

revoke all on function public.save_work_shifts_batch(bigint, bigint, numeric, integer, jsonb, text) from public, anon;
grant execute on function public.save_work_shifts_batch(bigint, bigint, numeric, integer, jsonb, text) to authenticated;

create function public.set_personnel_payment_batch(
  p_business_id bigint, p_source_type text, p_source_ids bigint[], p_paid boolean, p_payment_method text default null
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_id bigint;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then
    raise exception 'Acesso negado ao negócio';
  end if;
  foreach v_id in array p_source_ids loop
    perform public.set_personnel_payment(p_business_id, p_source_type, v_id, p_paid, p_payment_method);
  end loop;
end;
$$;

revoke all on function public.set_personnel_payment_batch(bigint, text, bigint[], boolean, text) from public, anon;
grant execute on function public.set_personnel_payment_batch(bigint, text, bigint[], boolean, text) to authenticated;
