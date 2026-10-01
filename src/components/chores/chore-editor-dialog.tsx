"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useStaffProfiles } from "@/hooks/use-staff-profiles";
import {
  CHORE_RECURRENCES,
  RECURRENCE_LABELS_EN,
  recurrenceOf,
} from "@/lib/chore-recurrence";
import {
  HOUSEHOLD_TASK_CATEGORIES,
  categoryIcon,
  categoryLabel,
} from "@/lib/household-tasks";
import type { ChoreRecurrence, HouseholdTask, HouseholdTaskCategory } from "@/types/database";

// Radix rejects an empty SelectItem value, so "nobody in particular" needs a
// real sentinel. It never reaches the database — save() maps it back to the
// null that actually means unassigned.
const UNASSIGNED = "unassigned";

/**
 * Add and edit, in one dialog (Phase 100).
 *
 * Owner-facing, so entirely English per the Phase 46 language boundary — and
 * owner-only in a stronger sense than that: this is the whole mutation surface
 * for chores, and nothing in the staff view imports it.
 *
 * `task` null is Add; a task is Edit. Deliberately one component rather than
 * two: they share every field, and the pair that existed before this phase had
 * already drifted (the add form could set a time, nothing could change one).
 *
 * Editing a repeat edits the repeat — every occurrence that has not been
 * written yet. Occurrences already completed are rows of their own and keep
 * whatever they recorded, which is the behaviour that makes a rota safe to
 * adjust halfway through a month.
 */
export function ChoreEditorDialog({
  open,
  onOpenChange,
  task,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null to create. */
  task: HouseholdTask | null;
  /** The day being browsed, used as the due date for a new chore. */
  defaultDate: string;
}) {
  const { createHouseholdTask, updateHouseholdTask, deleteHouseholdTask } = useHousehold();
  const { profiles } = useStaffProfiles();
  const editing = !!task;

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<HouseholdTaskCategory>("cleaning");
  const [assignee, setAssignee] = useState<string>(UNASSIGNED);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [recurrence, setRecurrence] = useState<ChoreRecurrence>("none");
  const [until, setUntil] = useState("");
  const [supervision, setSupervision] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useBackToClose(open, () => onOpenChange(false));

  // Reloads the form whenever the dialog opens, or opens on a different chore.
  // Keyed on `open` as well as the id so reopening Add after an edit does not
  // inherit the edited chore's fields.
  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (task) {
      setTitle(task.title);
      setCategory(task.category);
      setAssignee(task.assigned_to ?? UNASSIGNED);
      setDate(task.due_date);
      setTime(task.due_time ?? "");
      setNotes(task.notes ?? "");
      setRecurrence(recurrenceOf(task));
      setUntil(task.recurrence_until ?? "");
      setSupervision(!!task.requires_supervision);
    } else {
      setTitle("");
      setCategory("cleaning");
      setAssignee(UNASSIGNED);
      setDate(defaultDate);
      setTime("");
      setNotes("");
      setRecurrence("none");
      setUntil("");
      setSupervision(false);
    }
  }, [open, task, defaultDate]);

  const untilBeforeStart = !!until && until < date;

  async function save() {
    if (!title.trim()) {
      toast.error("Give the chore a title");
      return;
    }
    if (untilBeforeStart) {
      toast.error("The repeat cannot end before it starts");
      return;
    }
    setSaving(true);
    try {
      const fields = {
        title: title.trim(),
        category,
        // The sentinel and an empty time both collapse to null here — the
        // column's "nobody in particular" and "sometime today".
        assigned_to: assignee === UNASSIGNED ? null : assignee,
        due_date: date,
        due_time: time || null,
        notes: notes.trim() || null,
        recurrence,
        // A one-off has no end date to carry; leaving a stale one behind would
        // quietly cap the repeat if it were ever turned back on.
        recurrence_until: recurrence === "none" ? null : until || null,
        requires_supervision: supervision,
      };
      if (task) {
        await updateHouseholdTask(task.id, fields);
        toast.success(`Saved "${fields.title}"`);
      } else {
        await createHouseholdTask(fields);
        toast.success(`Added "${fields.title}"`);
      }
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(editing ? "Failed to save the chore" : "Failed to add the chore");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!task) return;
    setSaving(true);
    try {
      await deleteHouseholdTask(task.id);
      toast.success(`Deleted "${task.title}"`);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete the chore");
    } finally {
      setSaving(false);
    }
  }

  const repeats = recurrence !== "none";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Chore" : "Add Chore"}</DialogTitle>
          {editing && repeats && (
            <DialogDescription>
              This chore repeats. Changes apply to every occurrence that has not been done yet.
            </DialogDescription>
          )}
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

          <div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs">{repeats ? "Starts" : "Date"}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs">Time (optional)</Label>
              {/* A real time control, and clearable: setting a chore back to
                  "sometime today" was impossible before this phase, because
                  the only way to change a time was to delete the chore. */}
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="min-w-0 flex-1"
                />
                {time && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-[44px] shrink-0 px-2 text-xs"
                    onClick={() => setTime("")}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>
          <p className="-mt-2 text-[11px] text-muted-foreground">
            No time means &ldquo;sometime today&rdquo;, and sorts below timed chores.
          </p>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Repeat</Label>
            <div className="grid grid-cols-2 gap-2">
              {CHORE_RECURRENCES.map((r) => (
                <Button
                  key={r}
                  type="button"
                  variant={recurrence === r ? "default" : "outline"}
                  className="min-h-[44px]"
                  onClick={() => setRecurrence(r)}
                >
                  {RECURRENCE_LABELS_EN[r]}
                </Button>
              ))}
            </div>
          </div>

          {repeats && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Repeat until (optional)</Label>
              <Input
                type="date"
                value={until}
                min={date}
                onChange={(e) => setUntil(e.target.value)}
              />
              {untilBeforeStart ? (
                <p className="text-[11px] font-medium text-destructive">
                  The repeat cannot end before it starts.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Leave empty to keep repeating. Nothing is written in advance — occurrences
                  appear on the agenda as their day comes round.
                </p>
              )}
            </div>
          )}

          <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <input
              type="checkbox"
              checked={supervision}
              onChange={(e) => setSupervision(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-amber-700"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-amber-900">Requires supervision</span>
              <span className="text-[11px] text-amber-900/80">
                Flags the chore on every staff phone so they wait for you rather than starting
                on their own.
              </span>
            </span>
          </label>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. the brush is in the back store room"
            />
          </div>

          {editing && (
            <div className="flex flex-col gap-2 border-t pt-4">
              {confirmDelete ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    {repeats
                      ? "Deleting this removes the repeat and every occurrence of it, including completed ones."
                      : "This cannot be undone."}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="min-h-[44px] flex-1"
                      disabled={saving}
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      className="min-h-[44px] flex-1"
                      disabled={saving}
                      onClick={remove}
                    >
                      {saving ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  variant="ghost"
                  className="min-h-[44px] text-destructive hover:text-destructive"
                  disabled={saving}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 /> Delete chore
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={saving} className="min-h-[48px]">
            {saving ? <Loader2 className="animate-spin" /> : editing ? <Save /> : <Plus />}
            {editing ? "Save Changes" : "Add Chore"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
