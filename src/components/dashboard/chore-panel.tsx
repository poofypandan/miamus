"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Plus, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PhotoLightbox } from "@/components/dashboard/photo-lightbox";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useStaffProfiles, useStaffNameLookup } from "@/hooks/use-staff-profiles";
import {
  HOUSEHOLD_TASK_CATEGORIES,
  categoryClass,
  categoryIcon,
  categoryLabel,
  splitByStatus,
} from "@/lib/household-tasks";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { formatTime12h } from "@/lib/time";
import type { HouseholdTask, HouseholdTaskCategory } from "@/types/database";
import { photoSrc } from "@/lib/photos";

// Radix rejects an empty SelectItem value, so "nobody in particular" needs a
// real sentinel rather than "". It never reaches the database — handleCreate
// maps it back to the null that actually means unassigned.
const UNASSIGNED = "unassigned";

/**
 * The owner's chore delegation panel: what the house needs doing on the
 * selected day, who it is on, and what came back.
 *
 * Owner-facing, so entirely English per the Phase 46 language boundary.
 */
export function ChorePanel() {
  const { householdTasks, selectedDate } = useHousehold();
  const { profiles } = useStaffProfiles();
  // Default fallback ("Staff"), not "Unassigned": the two null cases mean
  // different things. An absent assigned_to is genuinely unassigned and is
  // spelled out at the badge; an id this roster cannot resolve — a profile
  // still loading — is a name we don't have, not an empty chore.
  const staffName = useStaffNameLookup(profiles);
  const [addOpen, setAddOpen] = useState(false);

  const { pending, completed } = useMemo(() => splitByStatus(householdTasks), [householdTasks]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Chores</h2>
        <Button
          variant="outline"
          className="min-h-[36px] shrink-0 px-3 text-xs"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="size-3.5" /> Add Chore
        </Button>
      </div>

      {householdTasks.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card px-3 py-6 text-center text-sm text-muted-foreground">
          No chores for this day. Add one and it appears on every staff phone
          straight away.
        </p>
      ) : (
        <>
          <ChoreList
            title="Pending"
            count={pending.length}
            empty="Everything on this day is done."
            tasks={pending}
            staffName={staffName}
          />
          <ChoreList
            title="Completed"
            count={completed.length}
            empty="Nothing completed yet."
            tasks={completed}
            staffName={staffName}
          />
        </>
      )}

      <AddChoreDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        dueDate={formatDateLocal(selectedDate)}
        profiles={profiles}
      />
    </section>
  );
}

function ChoreList({
  title,
  count,
  empty,
  tasks,
  staffName,
}: {
  title: string;
  count: number;
  empty: string;
  tasks: HouseholdTask[];
  staffName: (id: string | null | undefined) => string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
        {title}
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
          {count}
        </Badge>
      </h3>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        tasks.map((task) => <ChoreRow key={task.id} task={task} staffName={staffName} />)
      )}
    </div>
  );
}

function ChoreRow({
  task,
  staffName,
}: {
  task: HouseholdTask;
  staffName: (id: string | null | undefined) => string;
}) {
  const CategoryIcon = categoryIcon(task.category);
  const done = task.status === "completed";

  return (
    <div
      className={
        // A completed chore is deliberately the quieter of the two: the panel is
        // read to find out what is still outstanding, so the open rows get the
        // plain card and the finished ones recede.
        done
          ? "flex items-start gap-3 rounded-xl border bg-muted/40 px-3 py-2.5"
          : "flex items-start gap-3 rounded-xl border bg-card px-3 py-2.5"
      }
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="flex items-start gap-1.5 text-sm font-medium">
          {done && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />}
          <span className="min-w-0 break-words">{task.title}</span>
        </p>

        {task.notes && <p className="text-xs text-muted-foreground">{task.notes}</p>}

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className={`h-5 gap-1 px-1.5 text-[10px] ${categoryClass(task.category)}`}>
            <CategoryIcon className="size-3" />
            {categoryLabel(task.category, "en")}
          </Badge>

          {task.due_time && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {formatTime12h(task.due_time)}
            </Badge>
          )}

          {/* Two different questions, so two different badges: who it was given
              to, and — once it is done — who actually did it. They are usually
              the same person and occasionally not, which is the whole reason
              completed_by is its own column. */}
          <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px] font-normal">
            <UserRound className="size-3" />
            {task.assigned_to ? staffName(task.assigned_to) : "Unassigned"}
          </Badge>

          {done && (
            <span className="text-[10px] text-muted-foreground">
              Done by {staffName(task.completed_by)}
              {task.completed_at && ` · ${formatTime12h(new Date(task.completed_at))}`}
            </span>
          )}
        </div>
      </div>

      {done && task.photo_url && <ProofThumbnail task={task} />}
    </div>
  );
}

// The proof photo, tappable into the same lightbox the task photos use. Not
// LogPhotoThumbnail: that one is built around a TaskLog and its long-press
// deletes the log, which would be the wrong gesture on a chore.
function ProofThumbnail({ task }: { task: HouseholdTask }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View proof photo for ${task.title}`}
        className="size-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-border"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoSrc(task.photo_url)} alt="" className="h-full w-full object-cover" />
      </button>

      <PhotoLightbox
        open={open}
        onClose={() => setOpen(false)}
        items={[
          {
            src: task.photo_url ?? undefined,
            alt: task.title,
            title: task.title,
            description: task.completed_at ? (
              <span>Completed {formatTime12h(new Date(task.completed_at))}</span>
            ) : undefined,
          },
        ]}
      />
    </>
  );
}

function AddChoreDialog({
  open,
  onOpenChange,
  dueDate,
  profiles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dueDate: string;
  profiles: ReturnType<typeof useStaffProfiles>["profiles"];
}) {
  const { createHouseholdTask } = useHousehold();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<HouseholdTaskCategory>("cleaning");
  const [assignee, setAssignee] = useState<string>(UNASSIGNED);
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  useBackToClose(open, () => onOpenChange(false));

  function reset() {
    setTitle("");
    setCategory("cleaning");
    setAssignee(UNASSIGNED);
    setTime("");
    setNotes("");
  }

  async function handleCreate() {
    if (!title.trim()) {
      toast.error("Give the chore a title");
      return;
    }
    setSaving(true);
    try {
      await createHouseholdTask({
        title: title.trim(),
        category,
        // The sentinel and an empty time both collapse to null here — the
        // column's "nobody in particular" and "sometime today".
        assigned_to: assignee === UNASSIGNED ? null : assignee,
        due_date: dueDate,
        due_time: time || null,
        notes: notes.trim() || null,
      });
      toast.success(`Added "${title.trim()}"`);
      reset();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to add chore — has the Phase 82 migration been run?");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Chore</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Mop the terrace"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Category</Label>
            <div className="grid grid-cols-2 gap-2">
              {HOUSEHOLD_TASK_CATEGORIES.map((c) => {
                const Icon = categoryIcon(c);
                return (
                  <Button
                    key={c}
                    type="button"
                    variant={category === c ? "default" : "outline"}
                    className="min-h-[44px]"
                    onClick={() => setCategory(c)}
                  >
                    <Icon /> {categoryLabel(c, "en")}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Assignee</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="min-h-[48px] w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* First, and the default: a chore nobody is named on gets
                    picked up by whoever is free, which is how most of these
                    actually get done. */}
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {(profiles ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Time (optional)</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              Leave empty for &ldquo;sometime today&rdquo;.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. the brush is in the back store room"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleCreate} disabled={saving} className="min-h-[48px]">
            {saving ? <Loader2 className="animate-spin" /> : <Plus />} Add Chore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
