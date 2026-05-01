-- Base analytics events for MVP funnel tracking

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null
    check (event_name in ('signup_completed', 'onboarding_completed', 'plan_created', 'plan_joined', 'message_sent')),
  user_id uuid references auth.users(id) on delete set null,
  source text not null default 'web' check (source in ('web', 'server', 'client')),
  session_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_at_idx
  on public.analytics_events(created_at desc);

create index if not exists analytics_events_event_name_idx
  on public.analytics_events(event_name, created_at desc);

create index if not exists analytics_events_user_id_idx
  on public.analytics_events(user_id, created_at desc);

-- Avoid duplicated signup events for the same user.
create unique index if not exists analytics_events_signup_once_idx
  on public.analytics_events(user_id, event_name)
  where event_name = 'signup_completed' and user_id is not null;
