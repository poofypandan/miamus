-- Test data for the LOCAL Supabase only (never staging or production).
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -f supabase/seed-local.sql
-- Re-runnable. Gives:
--   household "Rumah Tes" with admin admin@test.local (no password: Google
--   sign-in isn't set up locally),
--   staff Sari (PIN 1234) and Budi (no PIN yet),
--   staff invite link: http://localhost:3400/join/staff?token=local-test-invite
-- Prints the household's house code at the end.

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'admin@test.local', false, now(), now())
on conflict (id) do nothing;

insert into public.households (id, name, owner_auth_id)
values ('00000000-0000-0000-0000-0000000000f1', 'Rumah Tes', '00000000-0000-0000-0000-00000000a001')
on conflict (id) do nothing;

insert into public.household_members (household_id, user_id, role)
select '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000a001', 'owner'
where not exists (
  select 1 from public.household_members
   where household_id = '00000000-0000-0000-0000-0000000000f1'
     and user_id = '00000000-0000-0000-0000-00000000a001'
);

insert into public.staff_profiles (id, household_id, name, pin, has_pin) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', 'Sari',
   extensions.crypt('1234', extensions.gen_salt('bf')), true),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f1', 'Budi', null, false)
on conflict (id) do update
  set pin = excluded.pin, has_pin = excluded.has_pin, failed_pin_attempts = 0, pin_locked_until = null;

-- A password for the local admin, so the owner screens can be tested without
-- Google (local only): admin@test.local / local-test-only
update auth.users
   set encrypted_password = extensions.crypt('local-test-only', extensions.gen_salt('bf')),
       email_confirmed_at = coalesce(email_confirmed_at, now()),
       confirmation_token = coalesce(confirmation_token, ''),
       recovery_token = coalesce(recovery_token, ''),
       email_change = coalesce(email_change, ''),
       email_change_token_new = coalesce(email_change_token_new, '')
 where id = '00000000-0000-0000-0000-00000000a001';

delete from public.staff_invites where token = 'local-test-invite';
insert into public.staff_invites (household_id, token, expires_at)
values ('00000000-0000-0000-0000-0000000000f1', 'local-test-invite', now() + interval '7 days');

select 'house code: ' || code from public.household_join_codes
 where household_id = '00000000-0000-0000-0000-0000000000f1';
