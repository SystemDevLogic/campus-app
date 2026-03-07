-- Allow plans without capacity limit

alter table public.plans alter column capacity drop not null;

alter table public.plans drop constraint if exists plans_capacity_check;
alter table public.plans
  add constraint plans_capacity_check
  check (capacity is null or capacity > 1);
