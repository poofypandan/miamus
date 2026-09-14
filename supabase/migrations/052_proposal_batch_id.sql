-- ============================================================================
-- Phase 52 — routine_proposals.batch_id
-- ============================================================================
-- A staff member proposing "antibiotic 2x/day for 5 days" files ten rows, one
-- per dose. batch_id ties them together so the owner sees and decides on one
-- card instead of ten, and so approving commits the whole course atomically
-- from the UI's point of view.
--
-- Nullable on purpose: proposals filed before this column existed have no
-- batch, and the Approval Queue falls back to grouping those by
-- title + pet + created-minute (see groupProposals in approval-queue.tsx).
--
-- RUN THIS BEFORE USING THE FEATURE. Until it is applied, submitting a
-- proposal fails — PostgREST rejects the unknown column with PGRST204.
-- ============================================================================

alter table routine_proposals add column if not exists batch_id text;

create index if not exists routine_proposals_batch_id_idx on routine_proposals(batch_id);

-- ============================================================================
-- Also apply: the Phase 47 undo policy, if 046 was run before it was added.
-- ============================================================================
-- Verified live on 2026-09-14: DELETE on routine_proposals is currently
-- filtered away entirely — the request returns HTTP 200 with zero rows removed
-- and the row survives. That is RLS with no DELETE policy behaving exactly as
-- designed, but it makes the staff "Batal" undo a silent no-op.
--
-- Safe to run even if it is already present.
-- ============================================================================

drop policy if exists "anon_delete_recent_routine_proposals" on routine_proposals;
create policy "anon_delete_recent_routine_proposals" on routine_proposals
  for delete to anon
  using (status = 'pending' and created_at > now() - interval '5 minutes');
