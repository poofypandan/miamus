"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import { useHousehold } from "@/context/household-context";
import { parseLocalDate } from "@/components/dashboard/schedule-editor";
import type { CreateScheduleInput } from "@/lib/data";
import { categoryIcon, groomingTitle, medicationTitle, vetTitle } from "@/lib/schedule-categories";
import { formatTime12h } from "@/lib/time";
import { groupProposals, type ProposalBatch } from "@/lib/proposal-batches";
import type { RoutineProposal, ScheduleCategoryName } from "@/types/database";

// Rebuilds the title the way ScheduleEditor writes it, so an approved proposal
// lands in the category the staff member picked. categorizeSchedule reads these
// prefixes back out of `title` — master_schedules has no category column — so
// skipping this would file every approved medication or grooming routine as an
// ordinary meal.
function scheduleTitleFor(category: ScheduleCategoryName, title: string): string {
  if (category === "medication") return medicationTitle(title);
  if (category === "grooming") return groomingTitle(title);
  if (category === "vet") return vetTitle(title);
  return title;
}

/**
 * Turns an approved proposal into the schedule row it describes.
 *
 * Before Phase 62 this wrote only a title and a time, so *every* approved
 * proposal became a task that recurred daily for ever — a one-off vet visit
 * approved on Monday was still asking for a photo a month later. The date
 * bounds below mirror exactly what the owner's own builders in
 * schedule-editor.tsx write for the same categories.
 *
 * A proposal filed before the migration has no scheduled_date; those stay
 * open-ended rather than being pinned to a date nobody chose.
 */
function scheduleFromProposal(proposal: RoutineProposal): CreateScheduleInput {
  const base: CreateScheduleInput = {
    entity_id: proposal.pet_id,
    title: scheduleTitleFor(proposal.category, proposal.title),
    module: "pet",
    frequency_type: "fixed_time",
    fixed_times: [proposal.time.slice(0, 5)],
  };
  const date = proposal.scheduled_date;
  if (!date) return base;

  // A medication course runs daily up to its last day; a grooming visit or a
  // one-off happens on exactly one day, so it is also pinned at the front via
  // created_at (which is what keeps it invisible until its day arrives).
  if (proposal.category === "medication") return { ...base, expires_at: date };
  return { ...base, created_at: parseLocalDate(date).toISOString(), expires_at: date };
}

// Owner-facing, so entirely English per the Phase 46 language boundary.
export function ApprovalQueue() {
  const { routineProposals } = useHousehold();
  const batches = useMemo(
    () => groupProposals(routineProposals.filter((p) => p.status === "pending")),
    [routineProposals]
  );

  if (batches.length === 0) return null;

  return (
    // mb-6 rather than mt-8: this sits directly under the date ribbon now, so
    // the spacing belongs below it instead of above.
    <section className="mb-6 flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-gray-900">
        Approval Queue <span className="text-gray-400">({batches.length})</span>
      </h3>
      <div className="flex flex-col gap-2">
        {batches.map((batch) => (
          <BatchRow key={batch.key} batch={batch} />
        ))}
      </div>
    </section>
  );
}

function BatchRow({ batch }: { batch: ProposalBatch }) {
  const { pets, createSchedulesBatch, decideRoutineProposals } = useHousehold();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const head = batch.proposals[0];
  const pet = pets.find((p) => p.id === head.pet_id) ?? null;
  const Icon = categoryIcon(head.category);
  const ids = batch.proposals.map((p) => p.id);
  const times = batch.proposals.map((p) => formatTime12h(p.time));

  async function approve() {
    setBusy("approve");
    try {
      // Schedules first, statuses second: if the insert fails the whole batch
      // stays pending and can be retried, rather than being marked approved
      // with no routines to show for it.
      await createSchedulesBatch(batch.proposals.map(scheduleFromProposal));
      await decideRoutineProposals(ids, "approved");
      toast.success(
        `Approved — ${head.title} (${ids.length} time${ids.length === 1 ? "" : "s"}) added to ${pet?.name ?? "the pet"}`
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to approve proposal");
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    setBusy("reject");
    try {
      await decideRoutineProposals(ids, "rejected");
      toast.success(`Rejected — ${head.title}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to reject proposal");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card px-3 py-3">
      <div className="flex items-center gap-2">
        {pet && <MiniPetAvatar pet={pet} className="size-8" />}
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            {head.title}
            {ids.length > 1 && (
              <span className="text-muted-foreground">({ids.length} scheduled times)</span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {pet?.name ?? "Unknown pet"} · {times.join(", ")}
          </span>
        </span>
      </div>

      {head.notes && <p className="text-xs text-muted-foreground">{head.notes}</p>}

      <div className="flex gap-2">
        <Button
          onClick={approve}
          disabled={busy !== null}
          className="min-h-[44px] flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {busy === "approve" ? <Loader2 className="animate-spin" /> : <Check />}
          Approve
        </Button>
        <Button
          onClick={reject}
          disabled={busy !== null}
          variant="outline"
          className="min-h-[44px] flex-1"
        >
          {busy === "reject" ? <Loader2 className="animate-spin" /> : <X />}
          Reject
        </Button>
      </div>
    </div>
  );
}
