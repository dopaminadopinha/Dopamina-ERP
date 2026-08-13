create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_business_id bigint;
begin
  insert into public.profiles (user_id, full_name, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email
  );

  select id into target_business_id
  from public.businesses
  where slug = 'dopamina'
  limit 1;

  insert into public.business_members (business_id, user_id, role, status)
  values (
    target_business_id,
    new.id,
    'manager'::public.member_role,
    'pending'::public.member_status
  );

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
