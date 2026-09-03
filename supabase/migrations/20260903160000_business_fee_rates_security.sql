create table if not exists public.business_fee_rates (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id),
  name text not null,
  category text not null check (category in ('tax', 'card_fee', 'platform_fee', 'other')),
  percentage numeric(6,4) not null check (percentage >= 0 and percentage <= 1),
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  notes text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_fee_rates_valid_period check (effective_to is null or effective_to >= effective_from)
);

create index if not exists business_fee_rates_business_period_idx
  on public.business_fee_rates (business_id, effective_from, effective_to);

alter table public.business_fee_rates enable row level security;

drop policy if exists business_fee_rates_member_all on public.business_fee_rates;
drop policy if exists business_fee_rates_member_select on public.business_fee_rates;
drop policy if exists business_fee_rates_member_insert on public.business_fee_rates;
drop policy if exists business_fee_rates_member_update on public.business_fee_rates;
create policy business_fee_rates_member_select on public.business_fee_rates for select to authenticated
  using ((select private.is_business_member(business_id)));
create policy business_fee_rates_member_insert on public.business_fee_rates for insert to authenticated
  with check ((select private.is_business_member(business_id)) and created_by = auth.uid());
create policy business_fee_rates_member_update on public.business_fee_rates for update to authenticated
  using ((select private.is_business_member(business_id)))
  with check ((select private.is_business_member(business_id)));

drop trigger if exists business_fee_rates_set_updated_at on public.business_fee_rates;
create trigger business_fee_rates_set_updated_at
  before update on public.business_fee_rates
  for each row execute function public.set_updated_at();
