-- Prevent organization account emails from colliding with active general user emails.

create or replace function public.email_belongs_to_general_user(email_to_check text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    join public.profiles p on p.id = u.id
    where lower(u.email) = lower(trim(email_to_check))
      and p.role = 'general_user'
      and p.is_active = true
  );
$$;

revoke all on function public.email_belongs_to_general_user(text) from public;
grant execute on function public.email_belongs_to_general_user(text) to authenticated;

create or replace function public.prevent_org_account_email_conflict()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if public.email_belongs_to_general_user(new.email) then
    raise exception 'Organization email cannot match a general user email';
  end if;

  return new;
end;
$$;

drop trigger if exists organization_accounts_email_conflict_guard on public.organization_accounts;
create trigger organization_accounts_email_conflict_guard
before insert or update of email on public.organization_accounts
for each row execute procedure public.prevent_org_account_email_conflict();
