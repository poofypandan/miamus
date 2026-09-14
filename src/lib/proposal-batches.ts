import type { ProposalStatus, RoutineProposal } from "@/types/database";

export interface ProposalBatch {
  key: string;
  proposals: RoutineProposal[];
  /** One status for the whole batch — see batchStatus below. */
  status: ProposalStatus;
}

/**
 * One batch per submission rather than per row.
 *
 * `batch_id` groups the rows of a single multi-dose submission. Proposals
 * filed before Phase 52 have none, so they fall back to pet + title + the
 * minute they were created — near enough to reunite a batch that predates the
 * column, precise enough that two unrelated proposals don't merge.
 *
 * Shared by the owner's Approval Queue and the staff list so the two can never
 * disagree about what constitutes one submission.
 */
export function groupProposals(proposals: RoutineProposal[]): ProposalBatch[] {
  const batches = new Map<string, RoutineProposal[]>();
  for (const proposal of proposals) {
    const key =
      proposal.batch_id ??
      `${proposal.pet_id}|${proposal.title}|${proposal.created_at.slice(0, 16)}`;
    const existing = batches.get(key);
    if (existing) existing.push(proposal);
    else batches.set(key, [proposal]);
  }
  return [...batches.entries()].map(([key, rows]) => {
    const proposals = [...rows].sort((a, b) => a.time.localeCompare(b.time));
    return { key, proposals, status: batchStatus(proposals) };
  });
}

/**
 * Collapses a batch's row statuses into one.
 *
 * Pending wins outright — while any row still awaits a decision the submission
 * as a whole does. Otherwise a batch that got anything approved reads as
 * approved; only a wholly-rejected one reads as rejected. A partial decision
 * is possible in principle (the owner decides per batch, but rows could be
 * touched individually), so this never silently reports "rejected" for a
 * submission that actually produced schedules.
 */
export function batchStatus(proposals: RoutineProposal[]): ProposalStatus {
  if (proposals.some((p) => p.status === "pending")) return "pending";
  if (proposals.some((p) => p.status === "approved")) return "approved";
  return "rejected";
}

/** Most recent creation time in the batch, as an ISO string. */
export function batchCreatedAt(batch: ProposalBatch): string {
  return batch.proposals.reduce(
    (latest, p) => (p.created_at > latest ? p.created_at : latest),
    batch.proposals[0].created_at
  );
}
