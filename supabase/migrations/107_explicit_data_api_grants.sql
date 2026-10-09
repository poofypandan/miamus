-- ============================================================================
-- 107 — Write down the table grants Supabase used to give for free
-- ============================================================================
-- Every migration until now created its tables and relied on Supabase's
-- default privileges to make them reachable through the Data API: a table
-- made by `postgres` in `public` came with full rights for anon,
-- authenticated and service_role, and RLS alone decided which rows anyone
-- could touch. Production (created 2026-09-12) still works that way.
--
-- Projects created since then do not. Staging (2026-10-09) gives those roles
-- only TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on new tables, so although every
-- RLS policy is in place, the role check that runs before RLS refuses every
-- read and write. Onboarding was the first thing to hit it ("Couldn't create
-- your household"), but it was every table but one: household_locations
-- works only because 105 happened to grant explicitly.
--
-- So this states the grants outright, and changes the default so a table
-- added later is not born unreachable. It adds no access beyond what
-- production already has: RLS still governs every row, and on production
-- every statement here is a no-op.
--
-- Not anon. The app's sessions are all `authenticated` — owners through
-- Google, staff phones through anonymous sign-in (migrations/089) — and no
-- policy grants anon a row.
--
-- staff_profiles is the exception for authenticated: 096 revoked its
-- table-level rights and granted by column, so the bcrypt `pin` column stays
-- unreadable (and 106 added user_id the same way). A table-level grant here
-- would undo that. service_role gets the table in full, like everything else.
--
-- Functions need nothing: every RPC the app calls already carries its own
-- explicit grant, and the push/retention internals are revoked on purpose.
-- ============================================================================

do $$
declare
  t text;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
  loop
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    if t <> 'staff_profiles' then
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end if;
  end loop;
end;
$$;

-- Tables and sequences created by future migrations (which run as postgres)
-- start out reachable, as they always did on production. A table that needs
-- narrower rights — staff_profiles-style — revokes them in its own migration.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges for role postgres in schema public
  grant usage, select on sequences to authenticated, service_role;
