create index item_cost_history_created_by_idx
  on public.item_cost_history (created_by);

create index recipes_created_by_idx
  on public.recipes (created_by);
