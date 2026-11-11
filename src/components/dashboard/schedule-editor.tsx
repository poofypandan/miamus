"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  Copy,
  Droplets,
  List,
  Loader2,
  Pill,
  Plus,
  Scissors,
  Settings2,
  Stethoscope,
  Utensils,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { DATE_LOCALE } from "@/lib/owner-locale";
import { useBackToClose } from "@/hooks/use-back-to-close";
import type { CreateScheduleInput } from "@/lib/data";
import {
  POTTY_TITLE,
  categorizeSchedule,
  categoryCardTintStrong,
  categoryIcon,
  categoryIconColor,
  displayTitle,
  groomingTitle,
  medicationTitle,
  vetTitle,
} from "@/lib/schedule-categories";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";
import type { AgendaGroup, AgendaItem } from "@/lib/scheduleEngine";
import { useFormatTime } from "@/components/ui/ui-labels";
import { cn } from "@/lib/utils";
import type { TaskEntity, MasterSchedule } from "@/types/database";
import { LogPhotoThumbnail } from "@/components/dashboard/log-photo-thumbnail";
import { CancelRoutineButton } from "@/components/dashboard/cancel-routine-button";
import { AddRoutineSheet, type AddRoutineTarget } from "@/components/dashboard/add-routine-sheet";
import { routineIcon } from "@/lib/schedule-categories";
import { groupRows, isOnceRow } from "@/lib/routine-groups";
import { routineKindInfo } from "@/lib/pet-routine-kinds";
import { useToday } from "@/hooks/use-today";

const INTERVAL_HOUR_OPTIONS = [1, 2, 3, 4];
export const DOSE_COUNT_OPTIONS = [1, 2, 3, 4];
export const DEFAULT_DOSE_TIMES = ["09:00", "21:00", "13:00", "17:00"];
export const INTERVAL_UNIT_OPTIONS = [
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
] as const;
export type IntervalUnit = (typeof INTERVAL_UNIT_OPTIONS)[number]["value"];
// Defensive ceiling on how many occurrences one "generate" click can create —
// keeps a fat-fingered "every 1 day for 10 years" from hammering the DB.
const MAX_GENERATED_OCCURRENCES = 500;

// w-full + min-w-0 so the control fills its column and can shrink inside a
// flex/grid parent instead of forcing overflow; px-2 rather than px-3 because
// a native date/time input spends part of its width on the picker indicator,
// and on a 320px phone the extra padding was enough to clip the value itself
// ("09." instead of "09.00", "14/0" instead of the date).
export const TIME_INPUT_CLASS =
  "min-h-[48px] w-full min-w-0 rounded-xl border border-input bg-transparent px-2 text-base font-medium tabular-nums outline-none [color-scheme:light] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function mealLabelForTime(time: string): string {
  const hour = Number(time.slice(0, 2));
  if (hour < 10) return "Sarapan";
  if (hour < 15) return "Makan Siang";
  if (hour < 19) return "Makan Malam";
  return "Snack Malam";
}

function toMinutes(time: string): number {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(minutes: number): string {
  const h = String(Math.floor(minutes / 60) % 24).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function generateSlots(start: string, end: string, intervalHours: number): string[] {
  const startM = toMinutes(start);
  const endM = toMinutes(end);
  if (endM <= startM || intervalHours <= 0) return [];
  const step = intervalHours * 60;
  const slots: string[] = [];
  for (let m = startM; m <= endM; m += step) {
    slots.push(toHHMM(m));
  }
  return slots;
}

// Parses a "YYYY-MM-DD" input-date value as browser-LOCAL midnight (not
// UTC) so day-level arithmetic never drifts a day off in negative-UTC-offset
// timezones — the classic `new Date("2026-03-20")` pitfall.
export function parseLocalDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

export function daysBetweenInclusive(startStr: string, endStr: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = parseLocalDate(endStr).getTime() - parseLocalDate(startStr).getTime();
  return Math.round(diff / msPerDay) + 1;
}

export function formatDateShort(dateStr: string, locale: "en" | "id" = "en"): string {
  return parseLocalDate(dateStr).toLocaleDateString(DATE_LOCALE[locale], { month: "short", day: "numeric" });
}

/** The owner's "Days" / "Weeks" (INTERVAL_UNIT_OPTIONS stays English for staff-routine-sheet's own map). */
const INTERVAL_UNIT_IDS: Record<IntervalUnit, string> = { days: "Hari", weeks: "Minggu" };

// Walks start -> end in `intervalValue` day/week steps using Date's native
// setDate/getDate, which correctly rolls over month boundaries and leap
// years (Date normalizes out-of-range day numbers for you).
//
// A blank end date falls back to the start date, so "no end" means one visit
// on the day chosen rather than nothing at all. Previously it returned an
// empty list, which left the Generate button disabled with no explanation of
// what was missing — the failure was silent rather than runaway, but a
// single occurrence is what the owner meant either way. The walk is still
// bounded twice over: by `end`, and by MAX_GENERATED_OCCURRENCES.
export function generateGroomingOccurrences(
  startDateStr: string,
  time: string,
  intervalValue: number,
  intervalUnit: IntervalUnit,
  endDateStr: string
): { date: string; time: string }[] {
  const stepDays = intervalUnit === "weeks" ? intervalValue * 7 : intervalValue;
  if (stepDays <= 0 || !startDateStr) return [];
  const finalEndDate = endDateStr || startDateStr;
  const end = parseLocalDate(finalEndDate);
  let current = parseLocalDate(startDateStr);
  if (current.getTime() > end.getTime()) return [];

  const occurrences: { date: string; time: string }[] = [];
  while (current.getTime() <= end.getTime() && occurrences.length < MAX_GENERATED_OCCURRENCES) {
    occurrences.push({ date: formatDateLocal(current), time });
    const next = new Date(current);
    next.setDate(next.getDate() + stepDays);
    current = next;
  }
  return occurrences;
}

type CreateScheduleFn = (input: CreateScheduleInput) => Promise<MasterSchedule>;
type CreateSchedulesBatchFn = (entries: CreateScheduleInput[]) => Promise<MasterSchedule[]>;
type DeleteScheduleFn = (id: string) => Promise<void>;

/**
 * The routine editor itself, as a standalone slide-out.
 *
 * `entity` doubles as the open state — a non-null pet means "show this pet's
 * routines" — which keeps callers from having to hold a boolean and a pet in
 * step with each other. The dashboard's routine picker opens it straight from
 * a pet row; ScheduleEditor below opens it from the pet profile sheet.
 */
export function ManageRoutinesSheet({
  entity,
  onClose,
}: {
  entity: TaskEntity | null;
  onClose: () => void;
}) {
  const { pets, schedules, createSchedule, createSchedulesBatch, deleteSchedule } = useHousehold();
  const tr = useT();
  // The Add routine sheet (Phase 173), over this one: a new routine for this
  // pet, or a routine from Other routines to edit.
  const [routineTarget, setRoutineTarget] = useState<AddRoutineTarget | null>(null);

  // Claims its own history entry, so Back closes this sheet and leaves
  // whatever opened it (the picker, the profile sheet) standing.
  useBackToClose(!!entity, onClose);

  const dogSchedules = entity ? schedules.filter((s) => s.entity_id === entity.id) : [];

  return (
    <Sheet open={!!entity} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full max-w-none gap-0 p-0 sm:max-w-none">
        {entity && (
          <>
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle>
                {tr(`Manage ${entity.name}'s Routines`, `Kelola Rutinitas ${entity.name}`)}
              </SheetTitle>
              <SheetDescription className="sr-only">
                {tr(
                  "Meals, potty routine, medications, grooming, and other one-off tasks.",
                  "Makan, rutinitas Pipis & Pup, obat, grooming, dan tugas sekali lainnya."
                )}
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="flex flex-col gap-4">
                <Button
                  variant="outline"
                  onClick={() => setRoutineTarget({ petIds: [entity.id] })}
                  className="min-h-[48px] w-full rounded-xl"
                >
                  <Plus /> {tr("Add routine", "Tambah rutinitas")}
                </Button>
                <MealTimesCard
                  entity={entity}
                  meals={dogSchedules.filter((s) => categorizeSchedule(s) === "meal")}
                  createSchedule={createSchedule}
                  deleteSchedule={deleteSchedule}
                />
                <PottyRoutineCard
                  entity={entity}
                  items={dogSchedules.filter((s) => categorizeSchedule(s) === "potty")}
                  createSchedulesBatch={createSchedulesBatch}
                  deleteSchedule={deleteSchedule}
                />
                {/* Order: meals -> potty -> vet -> medicines -> grooming ->
                    others. The two standing daily routines lead; appointments
                    and courses follow. */}
                <VetVisitsCard
                  entity={entity}
                  items={dogSchedules.filter((s) => categorizeSchedule(s) === "vet")}
                  createSchedule={createSchedule}
                  deleteSchedule={deleteSchedule}
                />
                <MedicationsCard
                  entity={entity}
                  items={dogSchedules.filter((s) => categorizeSchedule(s) === "medication")}
                  createSchedulesBatch={createSchedulesBatch}
                  deleteSchedule={deleteSchedule}
                />
                <GroomingCareCard
                  entity={entity}
                  items={dogSchedules.filter((s) => categorizeSchedule(s) === "grooming")}
                  createSchedulesBatch={createSchedulesBatch}
                  deleteSchedule={deleteSchedule}
                />
                {/* "Others" became Other routines (Phase 173, D5): routines from
                    the Add routine sheet, and the old one-off rows, untouched. */}
                <OtherRoutinesCard
                  entity={entity}
                  schedules={schedules}
                  onAdd={() => setRoutineTarget({ petIds: [entity.id] })}
                  onEdit={(rows) => setRoutineTarget({ rows })}
                />
                <CopyScheduleDrawer
                  entity={entity}
                  pets={pets}
                  sourceSchedules={dogSchedules}
                  createSchedulesBatch={createSchedulesBatch}
                />
              </div>
            </div>
          </>
        )}
      </SheetContent>
      <AddRoutineSheet target={routineTarget} onClose={() => setRoutineTarget(null)} />
    </Sheet>
  );
}

export function ScheduleEditor({ entity }: { entity: TaskEntity }) {
  const { schedules } = useHousehold();
  const tr = useT();
  const [manageEntity, setManageEntity] = useState<TaskEntity | null>(null);
  const [routineTarget, setRoutineTarget] = useState<AddRoutineTarget | null>(null);
  const dogSchedules = schedules.filter((s) => s.entity_id === entity.id);

  return (
    <div className="flex flex-col gap-4">
      <LivePreviewCard entity={entity} schedules={dogSchedules} />

      {/* Add routine beside Manage routines (Phase 173, D1): for this pet. */}
      <div className="flex gap-2">
        <Button
          onClick={() => setManageEntity(entity)}
          size="lg"
          className="min-h-[52px] flex-1 rounded-xl bg-zinc-900 text-base text-white hover:bg-zinc-800"
        >
          <Settings2 /> {tr("Manage Routines", "Kelola Rutinitas")}
        </Button>
        <Button
          onClick={() => setRoutineTarget({ petIds: [entity.id] })}
          size="lg"
          variant="outline"
          className="min-h-[52px] flex-1 rounded-xl text-base"
        >
          <Plus /> {tr("Add routine", "Tambah rutinitas")}
        </Button>
      </div>

      <ManageRoutinesSheet entity={manageEntity} onClose={() => setManageEntity(null)} />
      <AddRoutineSheet target={routineTarget} onClose={() => setRoutineTarget(null)} />
    </div>
  );
}

function MealTimesCard({
  entity,
  meals,
  createSchedule,
  deleteSchedule,
}: {
  entity: TaskEntity;
  meals: MasterSchedule[];
  createSchedule: CreateScheduleFn;
  deleteSchedule: DeleteScheduleFn;
}) {
  const formatTime = useFormatTime();
  const tr = useT();
  const [time, setTime] = useState("12:00");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd() {
    setSubmitting(true);
    try {
      await createSchedule({
        entity_id: entity.id,
        title: label.trim() || mealLabelForTime(time),
        module: "pet",
        frequency_type: "fixed_time",
        fixed_times: [time],
      });
      setLabel("");
    } catch (err) {
      console.error(err);
      toast.error(tr("Failed to add meal time", "Jam makan gagal ditambahkan"));
    } finally {
      setSubmitting(false);
    }
  }

  async function removeMeal(id: string) {
    try {
      await deleteSchedule(id);
    } catch (err) {
      console.error(err);
      toast.error(tr("Failed to remove meal time", "Jam makan gagal dihapus"));
    }
  }

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Utensils className="size-4" /> {tr("Meal Times", "Jam Makan")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex flex-wrap gap-2">
          {meals.map((m) => (
            <Badge key={m.id} variant="secondary" className="gap-1.5 py-1 pr-1 pl-2.5 text-sm">
              {m.fixed_times?.[0] ? formatTime(m.fixed_times[0]) : "—"} · {m.title}
              <button
                type="button"
                onClick={() => removeMeal(m.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-background/60"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          {meals.length === 0 && (
            <p className="text-sm text-muted-foreground">{tr("No meal times yet.", "Belum ada jam makan.")}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{tr("Time", "Jam")}</Label>
            <input
              type="time"
              step={60}
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={TIME_INPUT_CLASS}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{tr("Label (optional)", "Nama (opsional)")}</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={tr("e.g. Kibble + Salmon Oil", "mis. Kibble + Minyak Salmon")}
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {tr(
            `Defaults to "${mealLabelForTime(time)}" if left blank.`,
            `Otomatis "${mealLabelForTime(time)}" jika dikosongkan.`
          )}
        </p>

        <Button onClick={handleAdd} disabled={submitting} className="min-h-[48px] w-fit">
          {submitting ? <Loader2 className="animate-spin" /> : <Plus />}
          {tr("Add meal", "Tambah jam makan")}
        </Button>
      </CardContent>
    </Card>
  );
}

function PottyRoutineCard({
  entity,
  items,
  createSchedulesBatch,
  deleteSchedule,
}: {
  entity: TaskEntity;
  items: MasterSchedule[];
  createSchedulesBatch: CreateSchedulesBatchFn;
  deleteSchedule: DeleteScheduleFn;
}) {
  const formatTime = useFormatTime();
  const tr = useT();
  const [start, setStart] = useState("06:00");
  const [end, setEnd] = useState("22:00");
  const [intervalHours, setIntervalHours] = useState(2);
  const [generating, setGenerating] = useState(false);

  const newSlots = useMemo(() => {
    const existingTimes = new Set(items.map((i) => i.fixed_times?.[0]?.slice(0, 5)));
    return generateSlots(start, end, intervalHours).filter((t) => !existingTimes.has(t));
  }, [start, end, intervalHours, items]);

  async function handleGenerate() {
    if (newSlots.length === 0) {
      toast.error(tr("No new times to add in that range", "Tidak ada jam baru di rentang itu"));
      return;
    }
    setGenerating(true);
    try {
      await createSchedulesBatch(
        newSlots.map((time) => ({
          entity_id: entity.id,
          title: POTTY_TITLE,
          module: "pet",
          frequency_type: "fixed_time",
          fixed_times: [time],
        }))
      );
      toast.success(
        tr(
          `Added ${newSlots.length} potty ${newSlots.length === 1 ? "time" : "times"}`,
          `${newSlots.length} jam Pipis & Pup ditambahkan`
        )
      );
    } catch (err) {
      console.error(err);
      toast.error(tr("Failed to generate potty routine", "Rutinitas Pipis & Pup gagal dibuat"));
    } finally {
      setGenerating(false);
    }
  }

  async function removeSlot(id: string) {
    try {
      await deleteSchedule(id);
    } catch (err) {
      console.error(err);
      toast.error(tr("Failed to remove potty time", "Jam Pipis & Pup gagal dihapus"));
    }
  }

  const sortedItems = [...items].sort((a, b) =>
    (a.fixed_times?.[0] ?? "").localeCompare(b.fixed_times?.[0] ?? "")
  );

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Droplets className="size-4" /> {tr("Potty Routine", "Rutinitas Pipis & Pup")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex flex-wrap gap-2">
          {sortedItems.map((i) => (
            <Badge key={i.id} variant="secondary" className="gap-1.5 py-1 pr-1 pl-2.5 text-sm">
              {i.fixed_times?.[0] ? formatTime(i.fixed_times[0]) : "—"}
              <button
                type="button"
                onClick={() => removeSlot(i.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-background/60"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">{tr("No potty times yet.", "Belum ada jam Pipis & Pup.")}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{tr("Start time", "Jam mulai")}</Label>
            <input
              type="time"
              step={60}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={TIME_INPUT_CLASS}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{tr("End time", "Jam selesai")}</Label>
            <input
              type="time"
              step={60}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={TIME_INPUT_CLASS}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{tr("Every", "Setiap")}</Label>
          <div className="flex gap-1.5">
            {INTERVAL_HOUR_OPTIONS.map((h) => (
              <Button
                key={h}
                type="button"
                size="sm"
                variant={intervalHours === h ? "default" : "outline"}
                className="min-h-[48px] flex-1"
                onClick={() => setIntervalHours(h)}
              >
                {tr(`${h}h`, `${h} jam`)}
              </Button>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {newSlots.length > 0
            ? tr(
                `Will add ${newSlots.length}: ${newSlots.map(formatTime).join(", ")}`,
                `Akan menambah ${newSlots.length}: ${newSlots.map(formatTime).join(", ")}`
              )
            : tr("No new times to add in this range.", "Tidak ada jam baru di rentang ini.")}
        </p>

        <Button
          onClick={handleGenerate}
          disabled={generating || newSlots.length === 0}
          className="min-h-[48px] w-fit"
        >
          {generating ? <Loader2 className="animate-spin" /> : <Plus />}
          {tr("Generate Routine", "Buat Rutinitas")}
        </Button>
      </CardContent>
    </Card>
  );
}

function MedicationsCard({
  entity,
  items,
  createSchedulesBatch,
  deleteSchedule,
}: {
  entity: TaskEntity;
  items: MasterSchedule[];
  createSchedulesBatch: CreateSchedulesBatchFn;
  deleteSchedule: DeleteScheduleFn;
}) {
  const formatTime = useFormatTime();
  const tr = useT();
  const locale = useOwnerLocale();
  const today = formatDateLocal(new Date());
  const [label, setLabel] = useState("");
  const [timesPerDay, setTimesPerDay] = useState(1);
  const [doseTimes, setDoseTimes] = useState<string[]>(["09:00"]);
  const [endDate, setEndDate] = useState("");
  const [generating, setGenerating] = useState(false);

  function changeFrequency(count: number) {
    setTimesPerDay(count);
    setDoseTimes((prev) => {
      const next = prev.slice(0, count);
      while (next.length < count) next.push(DEFAULT_DOSE_TIMES[next.length] ?? "09:00");
      return next;
    });
  }

  function updateDoseTime(index: number, value: string) {
    setDoseTimes((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  // `min` on a date input is advisory, so the range is re-checked here.
  const endBeforeToday = !!endDate && endDate < today;
  const totalDays = endDate && !endBeforeToday ? Math.max(0, daysBetweenInclusive(today, endDate)) : 0;
  const totalDoses = totalDays * timesPerDay;

  async function handleGenerate() {
    if (!label.trim()) {
      toast.error(tr("Give the medication a label", "Beri nama obatnya"));
      return;
    }
    if (!endDate || endDate < today) {
      toast.error(tr("Pick an end date today or later", "Pilih tanggal selesai hari ini atau sesudahnya"));
      return;
    }
    setGenerating(true);
    try {
      await createSchedulesBatch(
        doseTimes.map((time) => ({
          entity_id: entity.id,
          title: medicationTitle(label.trim()),
          module: "pet",
          frequency_type: "fixed_time",
          fixed_times: [time],
          expires_at: endDate,
        }))
      );
      toast.success(
        tr(
          `${label.trim()} scheduled ${timesPerDay}x/day through ${formatDateShort(endDate, locale)} (${totalDoses} doses)`,
          `${label.trim()} dijadwalkan ${timesPerDay}x/hari sampai ${formatDateShort(endDate, locale)} (${totalDoses} dosis)`
        )
      );
      setLabel("");
      setEndDate("");
    } catch (err) {
      console.error(err);
      toast.error(tr("Failed to generate medication schedule", "Jadwal obat gagal dibuat"));
    } finally {
      setGenerating(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteSchedule(id);
    } catch (err) {
      console.error(err);
      toast.error(tr("Failed to remove medication", "Obat gagal dihapus"));
    }
  }

  const sortedItems = [...items].sort((a, b) => {
    const titleCompare = displayTitle(a).localeCompare(displayTitle(b));
    if (titleCompare !== 0) return titleCompare;
    return (a.fixed_times?.[0] ?? "").localeCompare(b.fixed_times?.[0] ?? "");
  });

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Pill className="size-4" /> {tr("Medicines & Vitamins", "Obat & Vitamin")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex flex-wrap gap-2">
          {sortedItems.map((m) => (
            <Badge key={m.id} variant="secondary" className="gap-1.5 py-1 pr-1 pl-2.5 text-sm">
              {m.fixed_times?.[0] ? formatTime(m.fixed_times[0]) : "—"} · {displayTitle(m)}
              {m.expires_at && (
                <span className="text-muted-foreground">
                  {" "}
                  · {tr("until", "sampai")} {formatDateShort(m.expires_at, locale)}
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(m.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-background/60"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {tr("No medications scheduled yet.", "Belum ada jadwal obat.")}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs">{tr("Label", "Nama")}</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={tr("e.g. Heartworm Pill, Antibiotics", "mis. Obat Cacing Jantung, Antibiotik")}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{tr("Times per day", "Kali per hari")}</Label>
          <div className="flex gap-1.5">
            {DOSE_COUNT_OPTIONS.map((n) => (
              <Button
                key={n}
                type="button"
                size="sm"
                variant={timesPerDay === n ? "default" : "outline"}
                className="min-h-[48px] flex-1"
                onClick={() => changeFrequency(n)}
              >
                {n}x
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-xs">{tr("Dose times", "Jam minum obat")}</Label>
          <div className="grid grid-cols-2 gap-2">
            {doseTimes.map((t, i) => (
              <input
                key={i}
                type="time"
                step={60}
                value={t}
                onChange={(e) => updateDoseTime(i, e.target.value)}
                className={TIME_INPUT_CLASS}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs">{tr("End date", "Tanggal selesai")}</Label>
          <Input
            type="date"
            min={today}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {totalDoses > 0
            ? tr(
                `${totalDays} day${totalDays === 1 ? "" : "s"} · ${totalDoses} total doses`,
                `${totalDays} hari · total ${totalDoses} dosis`
              )
            : tr(
                "Pick an end date to preview the course length.",
                "Pilih tanggal selesai untuk melihat lamanya pengobatan."
              )}
        </p>

        <Button
          onClick={handleGenerate}
          disabled={generating || endBeforeToday}
          className="min-h-[48px] w-fit"
        >
          {generating ? <Loader2 className="animate-spin" /> : <Plus />}
          {tr("Generate Medication Schedule", "Buat Jadwal Obat")}
        </Button>
      </CardContent>
    </Card>
  );
}

function GroomingCareCard({
  entity,
  items,
  createSchedulesBatch,
  deleteSchedule,
}: {
  entity: TaskEntity;
  items: MasterSchedule[];
  createSchedulesBatch: CreateSchedulesBatchFn;
  deleteSchedule: DeleteScheduleFn;
}) {
  const formatTime = useFormatTime();
  const tr = useT();
  const locale = useOwnerLocale();
  const today = formatDateLocal(new Date());
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [time, setTime] = useState("09:00");
  const [intervalValue, setIntervalValue] = useState(2);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>("weeks");
  const [endDate, setEndDate] = useState("");
  const [generating, setGenerating] = useState(false);

  const occurrences = useMemo(
    () => generateGroomingOccurrences(startDate, time, intervalValue, intervalUnit, endDate),
    [startDate, time, intervalValue, intervalUnit, endDate]
  );

  async function handleGenerate() {
    if (!label.trim()) {
      toast.error(tr("Give the task a label", "Beri nama tugasnya"));
      return;
    }
    if (occurrences.length === 0) {
      toast.error(
        tr(
          "Pick a start date, interval, and end date that produce at least one visit",
          "Pilih tanggal mulai, jarak, dan tanggal selesai yang menghasilkan minimal satu kunjungan"
        )
      );
      return;
    }
    setGenerating(true);
    try {
      await createSchedulesBatch(
        occurrences.map(({ date, time: occTime }) => ({
          entity_id: entity.id,
          title: groomingTitle(label.trim()),
          module: "pet",
          frequency_type: "fixed_time",
          fixed_times: [occTime],
          created_at: parseLocalDate(date).toISOString(),
          expires_at: date,
        }))
      );
      toast.success(
        tr(
          `Scheduled ${occurrences.length} ${label.trim()} visit${occurrences.length === 1 ? "" : "s"}`,
          `${occurrences.length} kunjungan ${label.trim()} dijadwalkan`
        )
      );
      setLabel("");
      setEndDate("");
    } catch (err) {
      console.error(err);
      toast.error(tr("Failed to generate grooming schedule", "Jadwal grooming gagal dibuat"));
    } finally {
      setGenerating(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteSchedule(id);
    } catch (err) {
      console.error(err);
      toast.error(tr("Failed to remove task", "Tugas gagal dihapus"));
    }
  }

  const sortedItems = [...items].sort((a, b) =>
    (a.expires_at ?? "").localeCompare(b.expires_at ?? "")
  );

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Scissors className="size-4" /> {tr("Grooming & Care", "Grooming & Perawatan")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex flex-wrap gap-2">
          {sortedItems.map((g) => (
            <Badge key={g.id} variant="secondary" className="gap-1.5 py-1 pr-1 pl-2.5 text-sm">
              {g.expires_at ? formatDateShort(g.expires_at, locale) : "—"}
              {g.fixed_times?.[0] ? `, ${formatTime(g.fixed_times[0])}` : ""} ·{" "}
              {displayTitle(g)}
              <button
                type="button"
                onClick={() => remove(g.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-background/60"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {tr("No grooming visits scheduled yet.", "Belum ada jadwal grooming.")}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs">{tr("Label", "Nama")}</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={tr("e.g. Bath, Nail Clipping", "mis. Mandi, Potong Kuku")}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{tr("Start date", "Tanggal mulai")}</Label>
            <Input
              type="date"
              min={today}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{tr("Time", "Jam")}</Label>
            <input
              type="time"
              step={60}
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={TIME_INPUT_CLASS}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{tr("Repeat every", "Ulangi setiap")}</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              max={52}
              value={intervalValue}
              onChange={(e) => setIntervalValue(Math.max(1, Number(e.target.value) || 1))}
              className="w-20"
            />
            <div className="flex flex-1 gap-1.5">
              {INTERVAL_UNIT_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  size="sm"
                  variant={intervalUnit === opt.value ? "default" : "outline"}
                  className="min-h-[48px] flex-1"
                  onClick={() => setIntervalUnit(opt.value)}
                >
                  {locale === "id" ? INTERVAL_UNIT_IDS[opt.value] : opt.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs">{tr("End date", "Tanggal selesai")}</Label>
          <Input
            type="date"
            min={startDate || today}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {occurrences.length > 0
            ? tr(
                `Will schedule ${occurrences.length} visit${occurrences.length === 1 ? "" : "s"}: `,
                `Akan menjadwalkan ${occurrences.length} kunjungan: `
              ) +
              occurrences
                .slice(0, 4)
                .map((o) => formatDateShort(o.date, locale))
                .join(", ") +
              (occurrences.length > 4 ? "…" : "")
            : tr(
                "Pick a start date, interval, and end date to preview visits.",
                "Pilih tanggal mulai, jarak, dan tanggal selesai untuk melihat kunjungannya."
              )}
        </p>

        <Button
          onClick={handleGenerate}
          disabled={generating || occurrences.length === 0}
          className="min-h-[48px] w-fit"
        >
          {generating ? <Loader2 className="animate-spin" /> : <Plus />}
          {tr("Generate Grooming Schedule", "Buat Jadwal Grooming")}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * A vet or doctor appointment: one label, one day, one time.
 *
 * Deliberately has no interval or end-date field. Every other generated
 * category can repeat, and that generality is what let a single appointment
 * become a task recurring for ever (Phase 62). Pinning created_at and
 * expires_at to the same chosen day makes exactly one occurrence structurally
 * impossible to get wrong — created_at also keeps it invisible until the day
 * arrives, so a booking made now doesn't read as overdue all week.
 */
function VetVisitsCard({
  entity,
  items,
  createSchedule,
  deleteSchedule,
}: {
  entity: TaskEntity;
  items: MasterSchedule[];
  createSchedule: CreateScheduleFn;
  deleteSchedule: DeleteScheduleFn;
}) {
  const tr = useT();
  const locale = useOwnerLocale();
  const today = formatDateLocal(new Date());
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("09:00");
  const [submitting, setSubmitting] = useState(false);

  const dateInPast = !!date && date < today;

  async function handleAdd() {
    if (!label.trim()) {
      toast.error(tr("Give the visit a label", "Beri nama kunjungannya"));
      return;
    }
    if (!date) {
      toast.error(tr("Pick a date", "Pilih tanggal"));
      return;
    }
    setSubmitting(true);
    try {
      await createSchedule({
        entity_id: entity.id,
        title: vetTitle(label.trim()),
        module: "pet",
        frequency_type: "fixed_time",
        fixed_times: [time],
        created_at: parseLocalDate(date).toISOString(),
        expires_at: date,
      });
      toast.success(
        tr(
          `${label.trim()} booked for ${formatDateShort(date, locale)}`,
          `${label.trim()} dijadwalkan pada ${formatDateShort(date, locale)}`
        )
      );
      setLabel("");
    } catch (err) {
      console.error(err);
      toast.error(tr("Failed to add visit", "Kunjungan gagal ditambahkan"));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteSchedule(id);
    } catch (err) {
      console.error(err);
      toast.error(tr("Failed to remove visit", "Kunjungan gagal dihapus"));
    }
  }

  const sorted = [...items].sort((a, b) => (a.expires_at ?? "").localeCompare(b.expires_at ?? ""));

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Stethoscope className="size-4" /> {tr("Vet & Doctor", "Dokter Hewan")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex flex-wrap gap-2">
          {sorted.map((v) => (
            <Badge key={v.id} variant="secondary" className="h-8 gap-1 px-2.5 text-sm">
              {v.expires_at ? formatDateShort(v.expires_at, locale) : "—"} · {displayTitle(v)}
              <button
                type="button"
                onClick={() => remove(v.id)}
                aria-label={tr(`Remove ${displayTitle(v)}`, `Hapus ${displayTitle(v)}`)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-background/60"
              >
                <X className="size-3.5" />
              </button>
            </Badge>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{tr("Label", "Nama")}</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={tr("e.g. Annual checkup", "mis. Pemeriksaan tahunan")}
          />
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label className="text-xs">{tr("Date", "Tanggal")}</Label>
            <input
              type="date"
              value={date}
              min={today}
              onChange={(e) => setDate(e.target.value)}
              className={TIME_INPUT_CLASS}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label className="text-xs">{tr("Time", "Jam")}</Label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={TIME_INPUT_CLASS}
            />
          </div>
        </div>
        {dateInPast && (
          <p className="text-xs font-medium text-destructive">
            {tr("The date can't be before today.", "Tanggal tidak boleh sebelum hari ini.")}
          </p>
        )}

        <Button
          onClick={handleAdd}
          disabled={submitting || dateInPast}
          className="min-h-[48px] w-fit"
        >
          {submitting ? <Loader2 className="animate-spin" /> : <Plus />}
          {tr("Add Visit", "Tambah Kunjungan")}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Other routines / Rutinitas lain (Phase 173, D5; was "Others"): this pet's
 * routines from the Add routine sheet, one row per routine (a routine for
 * two pets is one row, edited for both), and the old one-off rows, untouched,
 * with their "Until" line. A row opens the sheet filled in; the button opens
 * it for this pet.
 */
function OtherRoutinesCard({
  entity,
  schedules,
  onAdd,
  onEdit,
}: {
  entity: TaskEntity;
  schedules: MasterSchedule[];
  onAdd: () => void;
  onEdit: (rows: MasterSchedule[]) => void;
}) {
  const formatTime = useFormatTime();
  const tr = useT();
  const locale = useOwnerLocale();
  const { pets } = useHousehold();
  const today = formatDateLocal(useToday());

  const entries = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; rows: MasterSchedule[]; first: MasterSchedule }[] = [];
    for (const row of schedules) {
      if (row.entity_id !== entity.id) continue;
      const category = categorizeSchedule(row);
      if (category === "routine") {
        // Ended by an edit, or a one-off already past: no longer a routine.
        if (row.expires_at && row.expires_at < today) continue;
      } else if (category !== "temporary") {
        continue;
      }
      const key = row.routine_group_id ?? row.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const rows = groupRows(schedules, row);
      out.push({ key, rows, first: row });
    }
    return out.sort((a, b) =>
      (a.first.fixed_times?.[0] ?? "").localeCompare(b.first.fixed_times?.[0] ?? "")
    );
  }, [schedules, entity.id, today]);

  const days = (list: number[]) => {
    const names = locale === "id" ? ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return [...list].sort((a, b) => a - b).map((d) => names[d - 1]).join(", ");
  };
  function when(first: MasterSchedule): string {
    const once = !!first.expires_at && first.expires_at === formatDateLocal(new Date(first.created_at));
    if (once) return tr(`Once, ${formatDateShort(first.expires_at!, locale)}`, `Sekali, ${formatDateShort(first.expires_at!, locale)}`);
    const repeat = first.days_of_week?.length ? days(first.days_of_week) : tr("Every day", "Setiap hari");
    return first.expires_at
      ? `${repeat} · ${tr("until", "sampai")} ${formatDateShort(first.expires_at, locale)}`
      : repeat;
  }

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <List className="size-4" /> {tr("Other routines", "Rutinitas lain")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex flex-col gap-2">
          {entries.map(({ key, rows, first }) => {
            const Icon = routineIcon(categorizeSchedule(first), first.kind);
            const times = [...new Set(rows.map((r) => r.fixed_times?.[0]).filter(Boolean) as string[])].sort();
            const others = [...new Set(rows.map((r) => r.entity_id))]
              .filter((id) => id !== entity.id)
              .map((id) => pets.find((p) => p.id === id)?.name)
              .filter(Boolean);
            const title = first.kind && first.kind !== "other" ? (routineKindInfo(first.kind)?.[locale] ?? first.title) : first.title;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onEdit(rows)}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm active:bg-muted/60"
              >
                <Icon className="size-4 shrink-0 text-zinc-500" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {times.map((t) => formatTime(t)).join(", ") || "—"} · {title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {when(first)}
                    {others.length > 0 ? ` · ${tr("also", "juga")} ${others.join(", ")}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground">{tr("No other routines.", "Belum ada rutinitas lain.")}</p>
          )}
        </div>
        <Button onClick={onAdd} variant="outline" className="min-h-[48px] w-fit rounded-xl">
          <Plus /> {tr("Add routine", "Tambah rutinitas")}
        </Button>
      </CardContent>
    </Card>
  );
}

function CopyScheduleDrawer({
  entity,
  pets,
  sourceSchedules,
  createSchedulesBatch,
}: {
  entity: TaskEntity;
  pets: TaskEntity[];
  sourceSchedules: MasterSchedule[];
  createSchedulesBatch: CreateSchedulesBatchFn;
}) {
  const targets = pets.filter((p) => p.id !== entity.id);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copying, setCopying] = useState(false);
  const tr = useT();
  // Above the early return below — hooks can't run conditionally.
  useBackToClose(open, () => setOpen(false));

  if (targets.length === 0) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCopy() {
    if (selected.size === 0) {
      toast.error(tr("Choose at least one pet", "Pilih minimal satu hewan"));
      return;
    }
    setCopying(true);
    try {
      const entries: CreateScheduleInput[] = [];
      for (const targetId of selected) {
        // Copies don't join the source's group (Phase 173): each copied group
        // gets its own id per pet, so editing Mocha's lights later doesn't
        // move Coco's.
        const groupIds = new Map<string, string>();
        for (const s of sourceSchedules) {
          let groupId: string | null = null;
          if (s.routine_group_id) {
            groupId = groupIds.get(s.routine_group_id) ?? crypto.randomUUID();
            groupIds.set(s.routine_group_id, groupId);
          }
          entries.push({
            entity_id: targetId,
            title: s.title,
            module: s.module,
            frequency_type: s.frequency_type,
            interval_hours: s.interval_hours,
            fixed_times: s.fixed_times,
            start_time: s.start_time,
            end_time: s.end_time,
            expires_at: s.expires_at,
            // Without these a copied walk would become a meal.
            ...(s.kind
              ? {
                  kind: s.kind,
                  routine_group_id: groupId,
                  days_of_week: s.days_of_week ?? null,
                  note: s.note ?? null,
                  staff_id: s.staff_id ?? null,
                }
              : {}),
            ...(s.proof && s.proof !== "photo" ? { proof: s.proof } : {}),
            // A start date that is part of the row: a one-off's day, or a
            // visit anchored on a later day. Without it the copy starts today
            // and shows every day until its end (Codex, PR #85).
            ...(isOnceRow(s) || new Date(s.created_at).getTime() > Date.now() ? { created_at: s.created_at } : {}),
          });
        }
      }
      await createSchedulesBatch(entries);
      const names = targets
        .filter((t) => selected.has(t.id))
        .map((t) => t.name)
        .join(", ");
      toast.success(tr(`Schedule copied to ${names}`, `Jadwal disalin ke ${names}`));
      setSelected(new Set());
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(tr("Failed to copy schedule", "Jadwal gagal disalin"));
    } finally {
      setCopying(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          className="min-h-[48px] w-full"
          disabled={sourceSchedules.length === 0}
        >
          <Copy /> {tr("Copy schedule to...", "Salin jadwal ke...")}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{tr(`Copy ${entity.name}'s schedule`, `Salin jadwal ${entity.name}`)}</SheetTitle>
          <SheetDescription>
            {tr(
              `Choose which pets should get a copy of ${entity.name}'s ${sourceSchedules.length} schedule${sourceSchedules.length === 1 ? "" : "s"}.`,
              `Pilih hewan mana yang mendapat salinan ${sourceSchedules.length} jadwal ${entity.name}.`
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4">
          {targets.map((t) => (
            <label
              key={t.id}
              className="flex min-h-[48px] items-center gap-3 rounded-lg border px-3"
            >
              <input
                type="checkbox"
                checked={selected.has(t.id)}
                onChange={() => toggle(t.id)}
                className="size-4"
              />
              <span className="font-medium">{t.name}</span>
            </label>
          ))}
        </div>
        <SheetFooter>
          <Button onClick={handleCopy} disabled={copying || selected.size === 0}>
            {copying ? <Loader2 className="animate-spin" /> : <Copy />}
            {tr(
              `Copy to ${selected.size || ""} pet${selected.size === 1 ? "" : "s"}`,
              `Salin ke ${selected.size || ""} hewan`
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// `tinted` darkens each state by two steps for the deeper medicine/vet/
// grooming rows. Measured on those backgrounds, the ordinary 500-weights fall
// to 2.0:1 (completed) and 1.8:1 (pending) — under the 3:1 a meaningful icon
// needs, and these are the two states a medicine row spends all day in.
function StatusIcon({
  status,
  tinted = false,
}: {
  status: AgendaItem["status"];
  tinted?: boolean;
}) {
  if (status === "completed") {
    return (
      <CheckCircle2 className={cn("size-4", tinted ? "text-emerald-700" : "text-emerald-500")} />
    );
  }
  if (status === "overdue") {
    return <XCircle className={cn("size-4", tinted ? "text-red-700" : "text-red-500")} />;
  }
  return <Clock className={cn("size-4", tinted ? "text-amber-700" : "text-amber-500")} />;
}

/** One line of the profile sheet's timeline: a single task, or a medicine batch. */
type TimelineRow =
  | { kind: "item"; key: string; item: AgendaItem }
  | { kind: "group"; key: string; group: AgendaGroup };

function LivePreviewCard({
  entity,
  schedules,
}: {
  entity: TaskEntity;
  schedules: MasterSchedule[];
}) {
  const formatTime = useFormatTime();
  const { logs, selectedDate } = useHousehold();
  const tr = useT();
  const dateStr = formatDateLocal(selectedDate);
  // Flattened one-row-per-schedule-item, not one-row-per-group — grouping by
  // time+title (as buildAgenda's groups do, for the Staff View's multi-dog
  // batching) would silently cram two distinct schedule rows that happen to
  // share a title+time into a single visual row with two status icons.
  // Flattening guarantees exactly one status indicator per row.
  //
  // The one exception is a dog's medicines at the same time (Phase 81). Those
  // really are one errand settled by one photo, so they stay as a group and
  // render as a checklist — with a delete beside each medicine, since the
  // whole point of listing them is being able to act on one.
  const rows = useMemo<TimelineRow[]>(() => {
    const groups = buildAgenda({ date: dateStr, entities: [entity], schedules, logs });
    return groups.flatMap((g): TimelineRow[] =>
      g.category === "medication" && g.titles.length > 1
        ? [{ kind: "group" as const, key: `${g.time}|medication`, group: g }]
        : g.items.map((item) => ({ kind: "item" as const, key: item.key, item }))
    );
  }, [dateStr, entity, schedules, logs]);

  return (
    // No CardHeader: the only thing that renders this card is the Pet Profile
    // Sheet, whose section heading directly above already says
    // "<label>'s Timeline". Repeating it inside the card just restated it.
    <Card className="py-4">
      <CardContent className="flex flex-col gap-2 px-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tr("No tasks scheduled.", "Tidak ada tugas terjadwal.")}</p>
        ) : (
          rows.map((row) => {
            if (row.kind === "group") {
              return <MedicineGroupRow key={row.key} group={row.group} entity={entity} />;
            }
            const item = row.item;
            const Icon = routineIcon(item.category, item.kind);
            // Deeper than the dashboard's tint on purpose — see
            // categoryCardTintStrong. Padding and a transparent border on every
            // row so a tinted one lines up with its neighbours instead of
            // jogging sideways.
            const tint = categoryCardTintStrong(item.category);
            return (
              <div
                key={item.key}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-sm",
                  tint
                )}
              >
                <span
                  className={cn(
                    "w-16 shrink-0 text-xs tabular-nums",
                    tint ? "text-zinc-700" : "text-muted-foreground"
                  )}
                >
                  {formatTime(item.time)}
                </span>
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    tint ? categoryIconColor(item.category) : "text-muted-foreground"
                  )}
                />
                <span className="flex-1 font-medium">{item.title}</span>
                {/* Group-level kill switch. The per-chip X buttons in the cards
                    below remove a single row; this wipes every future
                    occurrence of the routine, which is what an owner means by
                    "cancel the vet visit". Only offered for the generated
                    categories — meals and the potty routine are the standing
                    shape of the day and are edited, not cancelled. */}
                {item.category !== "meal" && item.category !== "potty" && item.category !== "routine" && (
                  <CancelRoutineButton
                    entity={entity}
                    title={item.title}
                    category={item.category}
                  />
                )}
                {item.log?.photo_url ? (
                  <LogPhotoThumbnail
                    log={item.log}
                    title={item.title}
                    className="size-9 shrink-0 rounded-md ring-1 ring-border"
                  />
                ) : (
                  <span className="shrink-0">
                    <StatusIcon status={item.status} tinted={!!tint} />
                  </span>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

/**
 * A dog's medicines for one time slot, as a single row with a checklist.
 *
 * Owner-facing, in the owner's language. The row carries one status and one photo because
 * that is the truth of it — the staff member took one photo for the lot — while
 * each medicine keeps its own delete, since cancelling a course of Albumin
 * should not cancel the Postbiotik alongside it.
 */
function MedicineGroupRow({ group, entity }: { group: AgendaGroup; entity: TaskEntity }) {
  const formatTime = useFormatTime();
  const tr = useT();
  const Icon = categoryIcon("medication");
  const tint = categoryCardTintStrong("medication");
  // Every medicine has to be logged before the slot counts as done; the worst
  // status wins so a half-finished round never reads as complete.
  const done = group.items.every((i) => i.status === "completed");
  const status = done
    ? "completed"
    : group.items.some((i) => i.status === "overdue")
      ? "overdue"
      : "pending";
  const photoLog = group.items.find((i) => i.log?.photo_url)?.log;

  return (
    <div className={cn("flex flex-col gap-1.5 rounded-lg border border-transparent px-2 py-1.5 text-sm", tint)}>
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-xs tabular-nums text-zinc-700">
          {formatTime(group.time)}
        </span>
        <Icon className={cn("size-4 shrink-0", categoryIconColor("medication"))} />
        <span className="flex-1 font-medium">
          {tr("Medicines", "Obat")} ({group.titles.length})
        </span>
        {photoLog?.photo_url ? (
          <LogPhotoThumbnail
            log={photoLog}
            title={`${tr("Medicines", "Obat")} · ${group.titles.join(", ")}`}
            className="size-9 shrink-0 rounded-md ring-1 ring-border"
          />
        ) : (
          <span className="shrink-0">
            <StatusIcon status={status} tinted />
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-0.5 pl-[4.5rem]">
        {group.titles.map((title) => (
          <li key={title} className="flex items-center gap-1.5 text-sm">
            <span aria-hidden className="text-rose-400">
              •
            </span>
            <span className="min-w-0 flex-1 truncate">{title}</span>
            <CancelRoutineButton entity={entity} title={title} category="medication" />
          </li>
        ))}
      </ul>
    </div>
  );
}
