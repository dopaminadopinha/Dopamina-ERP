create index if not exists purchases_expense_id_idx on public.purchases (expense_id);
create index if not exists supplier_items_item_id_idx on public.supplier_items (item_id);
create index if not exists supplier_items_created_by_idx on public.supplier_items (created_by);
create index if not exists purchase_receipts_received_by_idx on public.purchase_receipts (received_by);
