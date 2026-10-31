create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null unique,
  nicknames text not null default '',
  usual_place_code text not null default '',
  usual_place_detail text not null default '',
  active boolean not null default true,
  note text not null default ''
);

alter table public.clubs enable row level security;

create policy "Anyone can read active clubs"
  on public.clubs
  for select
  to anon, authenticated
  using (active);

revoke all on table public.clubs from public, anon, authenticated;

grant select (
  id,
  name,
  nicknames,
  active
)
on table public.clubs
to anon, authenticated;

grant select, insert, update, delete
on table public.clubs
to service_role;

insert into public.clubs (name, nicknames, usual_place_code, usual_place_detail, active, note)
values
  ('Board Game Guild', 'BGG, board game club', 'UU', 'Room 220', true, ''),
  ('Mustang Pitch Society', 'MPS, pitch club', 'UU-PLAZA', '', true, ''),
  ('Women in Finance Circle', 'WIFC, women in finance', 'BUSINESS', 'Room 101', true, ''),
  ('Sustainability Crew', 'SC, sustainability club', 'DEXTER-LAWN', '', true, ''),
  ('Accounting Society', 'AS, accounting club', 'BUSINESS', 'Room 212', true, ''),
  ('Cal Poly Ski & Snowboard Club', 'Ski Club, snowboard club', 'REC-CENTER', '', true, '')
on conflict (name) do nothing;

alter table public.events
  add column if not exists agent_notes text[] not null default '{}';

create policy "Moderators can delete events"
  on public.events
  for delete
  to authenticated
  using (true);

grant delete
on table public.events
to authenticated;
