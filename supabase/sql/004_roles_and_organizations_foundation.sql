-- Step 1 foundation for roles, organizations and approval workflow
-- Safe to run multiple times where possible

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1) Roles and profile governance
alter table public.profiles add column if not exists role text not null default 'general_user';
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists role_assigned_at timestamptz not null default now();

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('general_user', 'event_organizer', 'admin', 'superadmin'));

-- 2) Global app settings configurable by superadmin
create table if not exists public.app_settings (
  id int primary key default 1,
  admins_can_manage_roles_globally boolean not null default true,
  default_meeting_duration_minutes int not null default 30
    check (default_meeting_duration_minutes between 15 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (id = 1)
);

insert into public.app_settings (id)
values (1)
on conflict (id) do nothing;

-- 3) Per-admin capabilities and seniority-sensitive operations
create table if not exists public.admin_capabilities (
  admin_user_id uuid primary key references public.profiles(id) on delete cascade,
  can_promote_general_users boolean not null default true,
  can_demote_newer_admins boolean not null default true,
  can_manage_roles boolean not null default true,
  can_manage_org_parameters boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger admin_capabilities_set_updated_at
before update on public.admin_capabilities
for each row execute procedure public.set_updated_at();

-- 4) Organization type parameters managed by admins
create table if not exists public.organization_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organization_types_set_updated_at
before update on public.organization_types
for each row execute procedure public.set_updated_at();

insert into public.organization_types (key, label)
values
  ('club', 'Club'),
  ('chapter', 'Capitulo'),
  ('federation', 'Federacion'),
  ('other', 'Otro')
on conflict (key) do nothing;

-- 5) Admin availability blocks (meeting slot baseline 30, configurable 15-60)
create table if not exists public.admin_availability (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  slot_minutes int not null default 30 check (slot_minutes between 15 and 60),
  default_meeting_url text not null,
  platform text not null check (platform in ('google_meet', 'zoom', 'other')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists admin_availability_admin_idx
  on public.admin_availability(admin_user_id, weekday);

create trigger admin_availability_set_updated_at
before update on public.admin_availability
for each row execute procedure public.set_updated_at();

-- 6) Organization creation requests from general users
create table if not exists public.organization_creation_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references public.profiles(id) on delete cascade,
  contact_email text not null,
  contact_phone text not null,
  organization_name text not null,
  organization_type_id uuid references public.organization_types(id) on delete set null,
  organization_type_other text,
  requested_admin_id uuid references public.profiles(id) on delete set null,
  meeting_platform text not null check (meeting_platform in ('google_meet', 'zoom', 'other')),
  meeting_link text,
  meeting_starts_at timestamptz not null,
  meeting_duration_minutes int not null default 30 check (meeting_duration_minutes between 15 and 60),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (organization_type_id is not null)
    or (organization_type_other is not null and length(trim(organization_type_other)) > 0)
  )
);

create index if not exists organization_requests_status_idx
  on public.organization_creation_requests(status, created_at desc);

create index if not exists organization_requests_requester_idx
  on public.organization_creation_requests(requester_user_id, created_at desc);

create trigger organization_requests_set_updated_at
before update on public.organization_creation_requests
for each row execute procedure public.set_updated_at();

-- 7) Approved organizations and separate organization login account
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null,
  organization_type_id uuid references public.organization_types(id) on delete set null,
  organization_type_other text,
  organization_email text not null unique,
  organization_phone text,
  manager_user_id uuid not null references public.profiles(id) on delete restrict,
  approved_request_id uuid unique references public.organization_creation_requests(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute procedure public.set_updated_at();

create table if not exists public.organization_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  email text not null unique,
  password_hash text,
  first_login_completed boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organization_accounts_set_updated_at
before update on public.organization_accounts
for each row execute procedure public.set_updated_at();

create table if not exists public.organization_one_time_codes (
  id uuid primary key default gen_random_uuid(),
  organization_account_id uuid not null references public.organization_accounts(id) on delete cascade,
  otp_code text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists org_otps_account_idx
  on public.organization_one_time_codes(organization_account_id, created_at desc);

-- 8) Audit trail for role changes
create table if not exists public.role_change_audit (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  previous_role text,
  new_role text,
  changed_by uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

-- 9) Guardrails: protect the last superadmin from role loss or deactivation
create or replace function public.prevent_last_superadmin_change()
returns trigger
language plpgsql
as $$
declare
  superadmin_count int;
begin
  if tg_op = 'UPDATE' then
    if old.role = 'superadmin' and (new.role <> 'superadmin' or new.is_active = false) then
      select count(*) into superadmin_count
      from public.profiles
      where role = 'superadmin' and is_active = true and id <> old.id;

      if superadmin_count = 0 then
        raise exception 'Cannot remove or deactivate the last superadmin';
      end if;
    end if;
  elsif tg_op = 'DELETE' then
    if old.role = 'superadmin' and old.is_active = true then
      select count(*) into superadmin_count
      from public.profiles
      where role = 'superadmin' and is_active = true and id <> old.id;

      if superadmin_count = 0 then
        raise exception 'Cannot delete the last superadmin';
      end if;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists profiles_protect_last_superadmin_update on public.profiles;
create trigger profiles_protect_last_superadmin_update
before update on public.profiles
for each row execute procedure public.prevent_last_superadmin_change();

drop trigger if exists profiles_protect_last_superadmin_delete on public.profiles;
create trigger profiles_protect_last_superadmin_delete
before delete on public.profiles
for each row execute procedure public.prevent_last_superadmin_change();

-- 10) Foundation rule: event organizers can only host their own plans (cannot join others)
create or replace function public.validate_plan_membership_by_role()
returns trigger
language plpgsql
as $$
declare
  profile_role text;
  plan_creator uuid;
begin
  select role into profile_role
  from public.profiles
  where id = new.user_id;

  if profile_role = 'event_organizer' then
    select creator_id into plan_creator
    from public.plans
    where id = new.plan_id;

    if plan_creator is null then
      raise exception 'Plan not found';
    end if;

    if plan_creator <> new.user_id then
      raise exception 'Event organizer cannot join events from other organizers';
    end if;

    if new.role <> 'host' then
      raise exception 'Event organizer must be host in their own event';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists plan_membership_role_guard on public.plan_members;
create trigger plan_membership_role_guard
before insert or update on public.plan_members
for each row execute procedure public.validate_plan_membership_by_role();
