create index if not exists expenses_area_id_idx
  on public.expenses (area_id)
  where area_id is not null;
