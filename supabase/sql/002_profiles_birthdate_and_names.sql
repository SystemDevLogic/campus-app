-- Migration for existing projects
-- Adds first/last names and birth_date, and keeps old columns for backward safety

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

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  university text,
  birth_date date,
  interests text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists birth_date date;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists age int;
alter table public.profiles add column if not exists university text;
alter table public.profiles add column if not exists interests text[] not null default '{}';
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- Best-effort backfill from full_name if available.
update public.profiles
set first_name = coalesce(first_name, split_part(trim(full_name), ' ', 1))
where coalesce(first_name, '') = '' and coalesce(full_name, '') <> '';

update public.profiles
set last_name = coalesce(last_name, nullif(regexp_replace(trim(full_name), '^\\S+\\s*', ''), ''))
where coalesce(last_name, '') = '' and coalesce(full_name, '') <> '';

-- If age existed, approximate birth_date as Jan 1st of inferred year.
update public.profiles
set birth_date = make_date(extract(year from now())::int - age, 1, 1)
where birth_date is null and age is not null and age >= 16;

-- Validation for 16+ users.
alter table public.profiles drop constraint if exists profiles_birth_date_check;
alter table public.profiles
  add constraint profiles_birth_date_check
  check (birth_date is null or birth_date <= (current_date - interval '16 years'));

create index if not exists profiles_university_idx on public.profiles(university);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();
