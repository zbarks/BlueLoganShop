-- =============================================================
--  Blue Logan portal access
--  Uses the shared client-portal pattern already in the Clientside
--  project: public.portal_members maps a login (auth.users) to a
--  business. Blue's login is business 'bluelogan'. The API and the
--  /portal pages only let in a logged-in user with that row.
--
--  The table below already exists in the Clientside project; the
--  guarded create is only for a fresh/local database.
-- =============================================================

create table if not exists public.portal_members (
  user_id    uuid not null,
  business   text not null,
  role       text not null default 'owner',
  created_at timestamptz not null default now()
);

-- After creating Blue's login in Supabase (Authentication > Users > Add user),
-- run this once with his email:
--   insert into public.portal_members (user_id, business, role)
--   select id, 'bluelogan', 'owner' from auth.users where email = 'BLUE_EMAIL_HERE';
