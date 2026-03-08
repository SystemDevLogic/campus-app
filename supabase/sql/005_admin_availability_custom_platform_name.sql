-- Adds optional custom name for "other" platform in admin availability.
-- Run before using the updated admin availability form.

alter table public.admin_availability
add column if not exists custom_platform_name text;

create index if not exists admin_availability_platform_name_idx
  on public.admin_availability(admin_user_id, platform, custom_platform_name);
