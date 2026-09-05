-- Permite corrigir, depois de concluído, um inventário físico:
-- (1) a quantidade contada de um item específico, e
-- (2) a data/hora em que a contagem foi feita (e a observação).
--
-- O estoque teórico é sempre somado ao vivo a partir de stock_movements
-- (nenhum saldo fica "travado" em outra linha), então corrigir o único
-- lançamento de ajuste gerado por esta contagem é suficiente: tudo que é
-- calculado depois dele volta a bater automaticamente, sem precisar
-- recalcular outras contagens ou movimentações.

create or replace function public.update_inventory_count_item(
  p_business_id bigint,
  p_inventory_count_id bigint,
  p_item_id bigint,
  p_counted_quantity numeric
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_system numeric;
  v_cost numeric;
  v_variance numeric;
  v_movement_id bigint;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then
    raise exception 'Acesso negado ao negócio';
  end if;

  if p_counted_quantity is null or p_counted_quantity < 0 then
    raise exception 'Informe uma quantidade contada válida';
  end if;

  if not exists (
    select 1 from public.inventory_counts ic
    where ic.id = p_inventory_count_id and ic.business_id = p_business_id
  ) then
    raise exception 'Inventário não encontrado';
  end if;

  select ici.system_quantity, ici.unit_cost into v_system, v_cost
  from public.inventory_count_items ici
  where ici.inventory_count_id = p_inventory_count_id and ici.item_id = p_item_id;

  if not found then
    raise exception 'Item não encontrado neste inventário';
  end if;

  update public.inventory_count_items
    set counted_quantity = p_counted_quantity
  where inventory_count_id = p_inventory_count_id and item_id = p_item_id;

  v_variance := p_counted_quantity - v_system;

  select id into v_movement_id
  from public.stock_movements
  where business_id = p_business_id and source_table = 'inventory_counts'
    and source_id = p_inventory_count_id and item_id = p_item_id
    and movement_reason = 'inventory_correction'
  limit 1;

  if v_variance = 0 then
    if v_movement_id is not null then
      delete from public.stock_movements where id = v_movement_id;
    end if;
  else
    if v_movement_id is not null then
      update public.stock_movements
        set quantity = v_variance, unit_cost = v_cost, balance_before = v_system, balance_after = p_counted_quantity
      where id = v_movement_id;
    else
      insert into public.stock_movements (
        business_id, item_id, movement_type, movement_reason, quantity, unit_cost,
        balance_before, balance_after, occurred_at, source_table, source_id, notes, created_by
      )
      select p_business_id, p_item_id, 'inventory'::public.movement_type, 'inventory_correction',
        v_variance, v_cost, v_system, p_counted_quantity, ic.counted_at, 'inventory_counts', p_inventory_count_id,
        'Ajuste gerado pela contagem física (editado)', (select auth.uid())
      from public.inventory_counts ic where ic.id = p_inventory_count_id;
    end if;
  end if;
end;
$$;

revoke all on function public.update_inventory_count_item(bigint, bigint, bigint, numeric) from public, anon;
grant execute on function public.update_inventory_count_item(bigint, bigint, bigint, numeric) to authenticated;

create or replace function public.update_inventory_count(
  p_business_id bigint,
  p_id bigint,
  p_counted_at timestamptz,
  p_notes text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item record;
  v_raw numeric;
  v_system numeric;
  v_variance numeric;
  v_movement_id bigint;
  v_movement_quantity numeric;
  v_movement_occurred_at timestamptz;
  v_has_movement boolean;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then
    raise exception 'Acesso negado ao negócio';
  end if;

  if p_counted_at is null or p_counted_at > now() + interval '5 minutes' then
    raise exception 'Data da contagem inválida';
  end if;

  if not exists (select 1 from public.inventory_counts where id = p_id and business_id = p_business_id) then
    raise exception 'Inventário não encontrado';
  end if;

  for v_item in
    select item_id, counted_quantity, unit_cost
    from public.inventory_count_items
    where inventory_count_id = p_id
  loop
    v_raw := private.stock_theoretical_quantity(p_business_id, v_item.item_id, p_counted_at);

    v_movement_id := null;
    select id, quantity, occurred_at
      into v_movement_id, v_movement_quantity, v_movement_occurred_at
    from public.stock_movements
    where business_id = p_business_id and source_table = 'inventory_counts'
      and source_id = p_id and item_id = v_item.item_id and movement_reason = 'inventory_correction'
    limit 1;
    v_has_movement := v_movement_id is not null;

    if v_has_movement and v_movement_occurred_at <= p_counted_at then
      v_system := v_raw - v_movement_quantity;
    else
      v_system := v_raw;
    end if;

    update public.inventory_count_items
      set system_quantity = v_system
    where inventory_count_id = p_id and item_id = v_item.item_id;

    v_variance := v_item.counted_quantity - v_system;

    if v_variance = 0 then
      if v_has_movement then
        delete from public.stock_movements where id = v_movement_id;
      end if;
    else
      if v_has_movement then
        update public.stock_movements
          set quantity = v_variance, occurred_at = p_counted_at, balance_before = v_system, balance_after = v_item.counted_quantity
        where id = v_movement_id;
      else
        insert into public.stock_movements (
          business_id, item_id, movement_type, movement_reason, quantity, unit_cost,
          balance_before, balance_after, occurred_at, source_table, source_id, notes, created_by
        ) values (
          p_business_id, v_item.item_id, 'inventory'::public.movement_type, 'inventory_correction',
          v_variance, v_item.unit_cost, v_system, v_item.counted_quantity, p_counted_at,
          'inventory_counts', p_id, 'Ajuste gerado pela contagem física (editado)', (select auth.uid())
        );
      end if;
    end if;
  end loop;

  update public.inventory_counts
    set counted_at = p_counted_at, notes = nullif(trim(p_notes), '')
  where id = p_id and business_id = p_business_id;
end;
$$;

revoke all on function public.update_inventory_count(bigint, bigint, timestamptz, text) from public, anon;
grant execute on function public.update_inventory_count(bigint, bigint, timestamptz, text) to authenticated;
