-- Prevents booking the same admin slot more than once while requests are active.
-- Allows reuse if prior request is rejected or cancelled.

create unique index if not exists organization_request_unique_admin_slot_active_idx
  on public.organization_creation_requests (requested_admin_id, meeting_starts_at)
  where requested_admin_id is not null
    and status in ('pending', 'approved');
