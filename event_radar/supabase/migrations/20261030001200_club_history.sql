alter table public.events
  drop constraint if exists events_status_check;

alter table public.events
  add constraint events_status_check
  check (status in ('published', 'waiting', 'rejected', 'archived', 'replaced'));

alter table public.events
  add column if not exists replaced_by uuid,
  add column if not exists updates_id uuid;

drop policy if exists "Moderators can update review fields" on public.events;

create policy "Moderators can update review fields"
  on public.events
  for update
  to authenticated
  using (true)
  with check (status in ('published', 'waiting', 'rejected', 'archived', 'replaced'));
