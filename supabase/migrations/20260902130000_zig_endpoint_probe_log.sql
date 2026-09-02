create table public.zig_endpoint_probe_log (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  requested_date date not null,
  endpoint_path text not null,
  http_status integer,
  ok boolean not null default false,
  body_snippet text,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.zig_endpoint_probe_log enable row level security;

create policy zig_endpoint_probe_log_member_select
on public.zig_endpoint_probe_log for select to authenticated
using ((select private.is_business_member(business_id)));

grant select on table public.zig_endpoint_probe_log to authenticated;
grant select, insert on table public.zig_endpoint_probe_log to service_role;
grant usage, select on sequence public.zig_endpoint_probe_log_id_seq to service_role;
