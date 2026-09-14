"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import { useHousehold } from "@/context/household-context";
import { categoryIcon, groomingTitle, medicationTitle } from "@/lib/schedule-categories";
import { formatTime12h } from "@/lib/time";
import type { RoutineProposal, ScheduleCategoryName } from "@/types/database";

// Rebuilds the title the way ScheduleEditor writes it, so an approved proposal
// lands in the same category the staff member picked. categorizeSchedule reads
// these prefixes back out of `title` — there is no category column on
// master_schedules — so skipping this would file every approved medication or
// grooming routine as an ordinary meal.
function scheduleTitleFor(category: ScheduleCategoryName, title: string): string {
  if (category === "medication") return medicationTitle(title);
  if (category === "grooming") return groomingTitle(title);
  return title;
}

// Owner-facing, so entirely English per the Phase 46 language boundary.
export function ApprovalQueue() {
  const { routineProposals } = useHousehold();
  const pending = routineProposals.filter((p) => p.status === "pending");

  if (pending.length === 0) return null;

  return (
    <section className="mt-8 flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-gray-900">
        Approval Queue <span className="text-gray-400">({pending.length})</span>
      </h3>
      <div className="flex flex-col gap-2">
        {pending.map((proposal) => (
          <ProposalRow key={proposal.id} proposal={proposal} />
        ))}
      </div>
    </section>
  );
}

function ProposalRow({ proposal }: { proposal: RoutineProposal }) {
  const { pets, createSchedule, decideRoutineProposal } = useHousehold();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const pet = pets.find((p) => p.id === proposal.pet_id) ?? null;
  const Icon = categoryIcon(proposal.category);

  async function approve() {
    setBusy("approve");
    try {
      // Schedule first, status second: if the insert fails the proposal stays
      // pending and can be retried, rather than being marked approved with no
      // routine to show for it.
      await createSchedule({
        entity_id: proposal.pet_id,
        title: scheduleTitleFor(proposal.category, proposal.title),
        module: "pet",
        frequency_type: "fixed_time",
        fixed_times: [proposal.time.slice(0, 5)],
      });
      await decideRoutineProposal(proposal.id, "approved");
      toast.success(`Approved — ${proposal.title} added to ${pet?.name ?? "the pet"}`);
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
      await decideRoutineProposal(proposal.id, "rejected");
      toast.success("Proposal rejected");
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
            {proposal.title}
          </span>
          <span className="text-xs text-muted-foreground">
            {pet?.name ?? "Unknown pet"} · {formatTime12h(proposal.time)}
          </span>
        </span>
      </div>

      {proposal.notes && <p className="text-xs text-muted-foreground">{proposal.notes}</p>}

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
