-- Initial schema for MVP app
-- Run this script in Supabase SQL editor

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
  first_name text not null,
  last_name text not null,
  university text not null,
  birth_date date not null check (birth_date <= (current_date - interval '16 years')),
  interests text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  category text not null,
  campus text not null,
  starts_at timestamptz not null,
  capacity int not null check (capacity > 1),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_members (
  plan_id uuid not null references public.plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('host', 'member')),
  joined_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('user', 'plan', 'message')),
  target_id uuid not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists plans_university_idx on public.profiles(university);
create index if not exists plans_starts_at_idx on public.plans(starts_at);
create index if not exists plans_category_idx on public.plans(category);
create index if not exists plans_campus_idx on public.plans(campus);
create index if not exists plan_members_user_id_idx on public.plan_members(user_id);
create index if not exists messages_plan_id_created_at_idx on public.messages(plan_id, created_at);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

create trigger plans_set_updated_at
before update on public.plans
for each row execute procedure public.set_updated_at();
