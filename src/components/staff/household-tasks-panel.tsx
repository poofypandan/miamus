"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Hand, Loader2, UserRound, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { PhotoPicker } from "@/components/photo-picker";
import { useStaffIdentity } from "@/components/auth/staff-login-gate";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import {
  categoryClass,
  categoryIcon,
  categoryLabel,
  splitByStatus,
  tasksForStaff,
} from "@/lib/household-tasks";
import { formatTime12h } from "@/lib/time";
import type { HouseholdTask } from "@/types/database";

/**
 * "Tugas Rumah" — the chores the owner has delegated for the day being
 * browsed, filtered down to the ones that are this person's business.
 *
 * Staff-facing, so entirely Bahasa Indonesia per the Phase 46 language
 * boundary. Sits below the pet agenda: the dogs come first, the house second.
 */
export function HouseholdTasksPanel() {
  const { householdTasks } = useHousehold();
  const { staffId } = useStaffIdentity();

  // A chore someone else has already claimed is deliberately not here — it is
  // no longer this person's job, and showing it invites two people doing it.
  const mine = useMemo(() => tasksForStaff(householdTasks, staffId), [householdTasks, staffId]);
  const { pending, completed } = useMemo(() => splitByStatus(mine), [mine]);

  // Nothing delegated for this day at all: stay out of the way rather than
  // adding an empty heading to a screen that is mostly a checklist.
  if (mine.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-900">Tugas Rumah</h2>

      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">Semua tugas rumah sudah selesai. 🎉</p>
      ) : (
        <div className="flex flex-col gap-2">
          {pending.map((task) => (
            <ChoreCard key={task.id} task={task} staffId={staffId} />
          ))}
        </div>
      )}

      {/* Kept on screen for the rest of the day rather than disappearing on
          completion, so the person can see what they have already cleared. */}
      {completed.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-gray-500">Sudah Selesai</h3>
          {completed.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2.5 text-sm"
            >
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              <span className="min-w-0 flex-1 truncate text-muted-foreground line-through">
                {task.title}
              </span>
              {task.completed_at && (
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatTime12h(new Date(task.completed_at))}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ChoreCard({ task, staffId }: { task: HouseholdTask; staffId: string | null }) {
  const { claimHouseholdTask } = useHousehold();
  const CategoryIcon = categoryIcon(task.category);
  const [claiming, setClaiming] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);

  const unassigned = !task.assigned_to;
  const mine = !!staffId && task.assigned_to === staffId;

  async function handleClaim() {
    setClaiming(true);
    try {
      await claimHouseholdTask(task.id);
      toast.success(`"${task.title}" jadi tugas kamu`);
    } catch (err) {
      console.error(err);
      // The provider's `is("assigned_to", null)` guard is what makes the
      // losing half of a double-claim land here instead of silently taking a
      // chore someone else already has.
      toast.error("Tugas ini sudah diambil orang lain");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <>
      <div
        className={
          // An unclaimed chore gets the tinted card: it is the one thing on
          // this screen asking to be picked up, and the app's tints mean
          // "needs a decision" everywhere else too.
          unassigned
            ? "flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3"
            : "flex flex-col gap-2 rounded-xl border bg-card p-3"
        }
      >
        <p className="text-sm font-medium break-words">{task.title}</p>

        {task.notes && <p className="text-xs text-muted-foreground">{task.notes}</p>}

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className={`h-5 gap-1 px-1.5 text-[10px] ${categoryClass(task.category)}`}>
            <CategoryIcon className="size-3" />
            {categoryLabel(task.category, "id")}
          </Badge>

          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {task.due_time ? formatTime12h(task.due_time) : "Kapan saja hari ini"}
          </Badge>

          <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px] font-normal">
            {unassigned ? (
              <>
                <Users className="size-3" /> Semua Petugas
              </>
            ) : (
              <>
                <UserRound className="size-3" /> Untuk Kamu
              </>
            )}
          </Badge>
        </div>

        {unassigned ? (
          <Button
            variant="outline"
            className="min-h-[48px] w-full bg-white"
            disabled={claiming}
            onClick={handleClaim}
          >
            {claiming ? <Loader2 className="animate-spin" /> : <Hand />} Ambil Tugas
          </Button>
        ) : mine ? (
          <Button className="min-h-[48px] w-full" onClick={() => setFinishOpen(true)}>
            <CheckCircle2 /> Selesaikan
          </Button>
        ) : null}
      </div>

      <FinishChoreSheet task={task} open={finishOpen} onOpenChange={setFinishOpen} />
    </>
  );
}

/**
 * Closing a chore, which means producing proof of it.
 *
 * The photo is not optional: a chore the owner cannot see the result of is no
 * better than a WhatsApp message saying it's done, which is what this feature
 * replaces. The upload happens first (PhotoPicker owns it) and the row only
 * flips once there is a URL to attach, so a failed upload leaves the chore
 * open rather than completed with nothing to show.
 */
function FinishChoreSheet({
  task,
  open,
  onOpenChange,
}: {
  task: HouseholdTask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { updateHouseholdTaskStatus } = useHousehold();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useBackToClose(open, () => onOpenChange(false));

  async function handleFinish() {
    if (!photoUrl) {
      toast.error("Ambil foto dulu sebagai bukti");
      return;
    }
    setSaving(true);
    try {
      await updateHouseholdTaskStatus(task.id, "completed", { photo_url: photoUrl });
      toast.success(`"${task.title}" selesai ✅`);
      setPhotoUrl(null);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Gagal menyimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        // Deliberately keeps an uploaded photo across a dismissal: the image is
        // already in storage, and clearing it would mean walking back to the
        // terrace to take it again.
        if (!next) setSaving(false);
      }}
    >
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{task.title}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4">
          <div className="flex flex-col gap-1.5">
            <Label>Foto Bukti</Label>
            <PhotoPicker
              pathPrefix={`household/${task.id}`}
              value={photoUrl}
              onChange={setPhotoUrl}
              label="Ambil Foto"
              busyLabel="Mengunggah..."
              errorMessage="Gagal mengunggah foto"
            />
            <p className="text-[11px] text-muted-foreground">
              Fotonya wajib — itu bukti tugas sudah dikerjakan.
            </p>
          </div>
        </div>
        <SheetFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button
            onClick={handleFinish}
            disabled={saving || !photoUrl}
            className="min-h-[48px]"
          >
            {saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Selesaikan
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
