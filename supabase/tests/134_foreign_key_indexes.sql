-- Migration 134 checks: each flagged foreign key has an index on its columns,
-- the single-column indexes it replaced are gone, and the advisor's own rule
-- (an index whose leading columns are the key's columns) finds nothing left in
-- public except repair_costs_repair_fkey, skipped on purpose (its repair_id is
-- the primary key).
-- LOCAL DATABASE ONLY. Read-only, one transaction, rolled back:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t \
--     -f supabase/tests/134_foreign_key_indexes.sql
\set ON_ERROR_STOP on
\pset footer off
begin;

create function pg_temp.ok(cond boolean, label text) returns text language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'ok  ' || label;
end $$;

-- The columns of an index, in order, by name.
create function pg_temp.index_cols(idx text) returns text[] language sql as $$
  select array_agg(a.attname::text order by k.ord)
    from pg_index i
    cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
   where i.indexrelid = to_regclass('public.' || idx) and i.indisvalid
$$;

-- --- The new and swapped indexes exist, on the key's columns ------------------
select pg_temp.ok(pg_temp.index_cols('households_has_pets_set_by_idx') = array['has_pets_set_by'],
  'households_has_pets_set_by_idx on (has_pets_set_by)');
select pg_temp.ok(pg_temp.index_cols('household_deletions_requested_by_idx') = array['requested_by'],
  'household_deletions_requested_by_idx on (requested_by)');
select pg_temp.ok(pg_temp.index_cols('household_locations_parent_household_idx') = array['parent_id', 'household_id'],
  'household_locations_parent_household_idx on (parent_id, household_id)');
select pg_temp.ok(pg_temp.index_cols('household_tasks_repair_household_idx') = array['repair_id', 'household_id'],
  'household_tasks_repair_household_idx on (repair_id, household_id)');
select pg_temp.ok(pg_temp.index_cols('repairs_location_household_idx') = array['location_id', 'household_id'],
  'repairs_location_household_idx on (location_id, household_id)');
select pg_temp.ok(pg_temp.index_cols('repair_notes_repair_household_idx') = array['repair_id', 'household_id'],
  'repair_notes_repair_household_idx on (repair_id, household_id)');

-- --- The indexes they replaced are gone (one index per key, not two) ----------
select pg_temp.ok(to_regclass('public.household_locations_parent_id_idx') is null, 'household_locations_parent_id_idx dropped');
select pg_temp.ok(to_regclass('public.household_tasks_repair_id_idx') is null, 'household_tasks_repair_id_idx dropped');
select pg_temp.ok(to_regclass('public.repairs_location_idx') is null, 'repairs_location_idx dropped');
select pg_temp.ok(to_regclass('public.repair_notes_repair_idx') is null, 'repair_notes_repair_idx dropped');

-- --- The advisor's rule finds only the skipped key ----------------------------
-- A foreign key counts as indexed when some valid index starts with exactly
-- its columns, in the key's order (Supabase lint 0001).
create temp table unindexed as
select c.conname::text as fkey
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
 where c.contype = 'f' and n.nspname = 'public'
   and not exists (
     select 1 from pg_index i
      where i.indrelid = c.conrelid and i.indisvalid
        and (string_to_array(i.indkey::text, ' ')::smallint[])[1:cardinality(c.conkey)] = c.conkey
   );
select pg_temp.ok((select coalesce(array_agg(fkey order by fkey), '{}') from unindexed) = array['repair_costs_repair_fkey'],
  'only repair_costs_repair_fkey left unindexed (found: '
  || (select coalesce(string_agg(fkey, ', ' order by fkey), 'none') from unindexed) || ')');

rollback;
