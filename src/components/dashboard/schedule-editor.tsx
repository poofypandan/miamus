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
import { useBackToClose } from "@/hooks/use-back-to-close";
import type { CreateScheduleInput } from "@/lib/data";
import {
  POTTY_TITLE,
  categorizeSchedule,
  categoryIcon,
  displayTitle,
  groomingTitle,
  medicationTitle,
  vetTitle,
} from "@/lib/schedule-categories";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";
import type { AgendaItem } from "@/lib/scheduleEngine";
import { formatTime12h } from "@/lib/time";
import type { TaskEntity, MasterSchedule } from "@/types/database";
import { LogPhotoThumbnail } from "@/components/dashboard/log-photo-thumbnail";
import { CancelRoutineButton } from "@/components/dashboard/cancel-routine-button";

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

export function formatDateShort(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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
              <SheetTitle>Manage {entity.name}&apos;s Routines</SheetTitle>
              <SheetDescription className="sr-only">
                Meals, potty routine, medications, grooming, and other one-off tasks.
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="flex flex-col gap-4">
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
                <OthersCard
                  entity={entity}
                  tasks={dogSchedules.filter((s) => categorizeSchedule(s) === "temporary")}
                  createSchedule={createSchedule}
                  deleteSchedule={deleteSchedule}
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
    </Sheet>
  );
}

export function ScheduleEditor({ entity }: { entity: TaskEntity }) {
  const { schedules } = useHousehold();
  const [manageEntity, setManageEntity] = useState<TaskEntity | null>(null);
  const dogSchedules = schedules.filter((s) => s.entity_id === entity.id);

  return (
    <div className="flex flex-col gap-4">
      <LivePreviewCard entity={entity} schedules={dogSchedules} />

      <Button
        onClick={() => setManageEntity(entity)}
        size="lg"
        className="min-h-[52px] w-full bg-zinc-900 text-base text-white hover:bg-zinc-800"
      >
        <Settings2 /> Manage Routines
      </Button>

      <ManageRoutinesSheet entity={manageEntity} onClose={() => setManageEntity(null)} />
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
      toast.error("Failed to add meal time");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeMeal(id: string) {
    try {
      await deleteSchedule(id);
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove meal time");
    }
  }

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Utensils className="size-4" /> Meal Times
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex flex-wrap gap-2">
          {meals.map((m) => (
            <Badge key={m.id} variant="secondary" className="gap-1.5 py-1 pr-1 pl-2.5 text-sm">
              {m.fixed_times?.[0] ? formatTime12h(m.fixed_times[0]) : "—"} · {m.title}
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
            <p className="text-sm text-muted-foreground">No meal times yet.</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Time</Label>
            <input
              type="time"
              step={60}
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={TIME_INPUT_CLASS}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Label (optional)</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Kibble + Salmon Oil"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Defaults to &quot;{mealLabelForTime(time)}&quot; if left blank.
        </p>

        <Button onClick={handleAdd} disabled={submitting} className="min-h-[48px] w-fit">
          {submitting ? <Loader2 className="animate-spin" /> : <Plus />}
          Add meal
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
      toast.error("No new times to add in that range");
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
      toast.success(`Added ${newSlots.length} potty ${newSlots.length === 1 ? "time" : "times"}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate potty routine");
    } finally {
      setGenerating(false);
    }
  }

  async function removeSlot(id: string) {
    try {
      await deleteSchedule(id);
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove potty time");
    }
  }

  const sortedItems = [...items].sort((a, b) =>
    (a.fixed_times?.[0] ?? "").localeCompare(b.fixed_times?.[0] ?? "")
  );

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Droplets className="size-4" /> Potty Routine
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex flex-wrap gap-2">
          {sortedItems.map((i) => (
            <Badge key={i.id} variant="secondary" className="gap-1.5 py-1 pr-1 pl-2.5 text-sm">
              {i.fixed_times?.[0] ? formatTime12h(i.fixed_times[0]) : "—"}
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
            <p className="text-sm text-muted-foreground">No potty times yet.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Start time</Label>
            <input
              type="time"
              step={60}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={TIME_INPUT_CLASS}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">End time</Label>
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
          <Label className="text-xs">Every</Label>
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
                {h}h
              </Button>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {newSlots.length > 0
            ? `Will add ${newSlots.length}: ${newSlots.map(formatTime12h).join(", ")}`
            : "No new times to add in this range."}
        </p>

        <Button
          onClick={handleGenerate}
          disabled={generating || newSlots.length === 0}
          className="min-h-[48px] w-fit"
        >
          {generating ? <Loader2 className="animate-spin" /> : <Plus />}
          Generate Routine
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
      toast.error("Give the medication a label");
      return;
    }
    if (!endDate || endDate < today) {
      toast.error("Pick an end date today or later");
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
        `${label.trim()} scheduled ${timesPerDay}x/day through ${formatDateShort(endDate)} (${totalDoses} doses)`
      );
      setLabel("");
      setEndDate("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate medication schedule");
    } finally {
      setGenerating(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteSchedule(id);
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove medication");
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
          <Pill className="size-4" /> Medicines & Vitamins
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex flex-wrap gap-2">
          {sortedItems.map((m) => (
            <Badge key={m.id} variant="secondary" className="gap-1.5 py-1 pr-1 pl-2.5 text-sm">
              {m.fixed_times?.[0] ? formatTime12h(m.fixed_times[0]) : "—"} · {displayTitle(m)}
              {m.expires_at && (
                <span className="text-muted-foreground">
                  {" "}
                  · until {formatDateShort(m.expires_at)}
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
            <p className="text-sm text-muted-foreground">No medications scheduled yet.</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs">Label</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Heartworm Pill, Antibiotics"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Times per day</Label>
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
          <Label className="text-xs">Dose times</Label>
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
          <Label className="text-xs">End date</Label>
          <Input
            type="date"
            min={today}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {totalDoses > 0
            ? `${totalDays} day${totalDays === 1 ? "" : "s"} · ${totalDoses} total doses`
            : "Pick an end date to preview the course length."}
        </p>

        <Button
          onClick={handleGenerate}
          disabled={generating || endBeforeToday}
          className="min-h-[48px] w-fit"
        >
          {generating ? <Loader2 className="animate-spin" /> : <Plus />}
          Generate Medication Schedule
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
      toast.error("Give the task a label");
      return;
    }
    if (occurrences.length === 0) {
      toast.error("Pick a start date, interval, and end date that produce at least one visit");
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
        `Scheduled ${occurrences.length} ${label.trim()} visit${occurrences.length === 1 ? "" : "s"}`
      );
      setLabel("");
      setEndDate("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate grooming schedule");
    } finally {
      setGenerating(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteSchedule(id);
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove task");
    }
  }

  const sortedItems = [...items].sort((a, b) =>
    (a.expires_at ?? "").localeCompare(b.expires_at ?? "")
  );

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Scissors className="size-4" /> Grooming & Care
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex flex-wrap gap-2">
          {sortedItems.map((g) => (
            <Badge key={g.id} variant="secondary" className="gap-1.5 py-1 pr-1 pl-2.5 text-sm">
              {g.expires_at ? formatDateShort(g.expires_at) : "—"}
              {g.fixed_times?.[0] ? `, ${formatTime12h(g.fixed_times[0])}` : ""} ·{" "}
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
            <p className="text-sm text-muted-foreground">No grooming visits scheduled yet.</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs">Label</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Bath, Nail Clipping"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Start date</Label>
            <Input
              type="date"
              min={today}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Time</Label>
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
          <Label className="text-xs">Repeat every</Label>
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
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs">End date</Label>
          <Input
            type="date"
            min={startDate || today}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {occurrences.length > 0
            ? `Will schedule ${occurrences.length} visit${occurrences.length === 1 ? "" : "s"}: ${occurrences
                .slice(0, 4)
                .map((o) => formatDateShort(o.date))
                .join(", ")}${occurrences.length > 4 ? "…" : ""}`
            : "Pick a start date, interval, and end date to preview visits."}
        </p>

        <Button
          onClick={handleGenerate}
          disabled={generating || occurrences.length === 0}
          className="min-h-[48px] w-fit"
        >
          {generating ? <Loader2 className="animate-spin" /> : <Plus />}
          Generate Grooming Schedule
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
  const today = formatDateLocal(new Date());
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("09:00");
  const [submitting, setSubmitting] = useState(false);

  const dateInPast = !!date && date < today;

  async function handleAdd() {
    if (!label.trim()) {
      toast.error("Give the visit a label");
      return;
    }
    if (!date) {
      toast.error("Pick a date");
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
      toast.success(`${label.trim()} booked for ${formatDateShort(date)}`);
      setLabel("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to add visit");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteSchedule(id);
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove visit");
    }
  }

  const sorted = [...items].sort((a, b) => (a.expires_at ?? "").localeCompare(b.expires_at ?? ""));

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Stethoscope className="size-4" /> Vet &amp; Doctor
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex flex-wrap gap-2">
          {sorted.map((v) => (
            <Badge key={v.id} variant="secondary" className="h-8 gap-1 px-2.5 text-sm">
              {v.expires_at ? formatDateShort(v.expires_at) : "—"} · {displayTitle(v)}
              <button
                type="button"
                onClick={() => remove(v.id)}
                aria-label={`Remove ${displayTitle(v)}`}
                className="ml-0.5 rounded-full p-0.5 hover:bg-background/60"
              >
                <X className="size-3.5" />
              </button>
            </Badge>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Label</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Annual checkup"
          />
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label className="text-xs">Date</Label>
            <input
              type="date"
              value={date}
              min={today}
              onChange={(e) => setDate(e.target.value)}
              className={TIME_INPUT_CLASS}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label className="text-xs">Time</Label>
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
            The date can&apos;t be before today.
          </p>
        )}

        <Button
          onClick={handleAdd}
          disabled={submitting || dateInPast}
          className="min-h-[48px] w-fit"
        >
          {submitting ? <Loader2 className="animate-spin" /> : <Plus />}
          Add Visit
        </Button>
      </CardContent>
    </Card>
  );
}

function OthersCard({
  entity,
  tasks,
  createSchedule,
  deleteSchedule,
}: {
  entity: TaskEntity;
  tasks: MasterSchedule[];
  createSchedule: CreateScheduleFn;
  deleteSchedule: DeleteScheduleFn;
}) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("08:00");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd() {
    if (!title || !expiresAt) {
      toast.error("Fill in a title and expiry date");
      return;
    }
    setSubmitting(true);
    try {
      await createSchedule({
        entity_id: entity.id,
        title,
        module: "pet",
        frequency_type: "fixed_time",
        fixed_times: [time],
        expires_at: expiresAt,
      });
      setTitle("");
      setExpiresAt("");
      toast.success("Task added");
    } catch (err) {
      console.error(err);
      toast.error("Failed to add task");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteSchedule(id);
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove task");
    }
  }

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <List className="size-4" /> Others
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex flex-col gap-2">
          {tasks.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">
                  {t.fixed_times?.[0] ? formatTime12h(t.fixed_times[0]) : "—"} · {t.title}
                </p>
                <p className="text-xs text-muted-foreground">Expires {t.expires_at}</p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => remove(t.id)}>
                <X className="size-4" />
              </Button>
            </div>
          ))}
          {tasks.length === 0 && <p className="text-sm text-muted-foreground">No other tasks.</p>}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Task title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Farm visit reminder"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Time</Label>
            <input
              type="time"
              step={60}
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="min-h-[48px] rounded-lg border border-input bg-transparent px-2.5 text-base font-medium tabular-nums outline-none [color-scheme:light] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Expires on</Label>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </div>
        <Button onClick={handleAdd} disabled={submitting} className="min-h-[48px] w-fit">
          {submitting ? <Loader2 className="animate-spin" /> : <Plus />}
          Add task
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
      toast.error("Choose at least one pet");
      return;
    }
    setCopying(true);
    try {
      const entries: CreateScheduleInput[] = [];
      for (const targetId of selected) {
        for (const s of sourceSchedules) {
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
          });
        }
      }
      await createSchedulesBatch(entries);
      const names = targets
        .filter((t) => selected.has(t.id))
        .map((t) => t.name)
        .join(", ");
      toast.success(`Schedule copied to ${names}`);
      setSelected(new Set());
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to copy schedule");
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
          <Copy /> Copy schedule to...
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Copy {entity.name}&apos;s schedule</SheetTitle>
          <SheetDescription>
            Choose which pets should get a copy of {entity.name}&apos;s{" "}
            {sourceSchedules.length} schedule{sourceSchedules.length === 1 ? "" : "s"}.
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
            Copy to {selected.size || ""} pet{selected.size === 1 ? "" : "s"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function StatusIcon({ status }: { status: AgendaItem["status"] }) {
  if (status === "completed") return <CheckCircle2 className="size-4 text-emerald-500" />;
  if (status === "overdue") return <XCircle className="size-4 text-red-500" />;
  return <Clock className="size-4 text-amber-500" />;
}

function LivePreviewCard({
  entity,
  schedules,
}: {
  entity: TaskEntity;
  schedules: MasterSchedule[];
}) {
  const { logs, selectedDate } = useHousehold();
  const dateStr = formatDateLocal(selectedDate);
  // Flattened one-row-per-schedule-item, not one-row-per-group — grouping by
  // time+title (as buildAgenda's groups do, for the Staff View's multi-dog
  // batching) would silently cram two distinct schedule rows that happen to
  // share a title+time into a single visual row with two status icons.
  // Flattening guarantees exactly one status indicator per row.
  const items = useMemo(() => {
    const groups = buildAgenda({ date: dateStr, entities: [entity], schedules, logs });
    return groups.flatMap((g) => g.items);
  }, [dateStr, entity, schedules, logs]);

  return (
    // No CardHeader: the only thing that renders this card is the Pet Profile
    // Sheet, whose section heading directly above already says
    // "<label>'s Timeline". Repeating it inside the card just restated it.
    <Card className="py-4">
      <CardContent className="flex flex-col gap-2 px-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks scheduled.</p>
        ) : (
          items.map((item) => {
            const Icon = categoryIcon(item.category);
            return (
              <div key={item.key} className="flex items-center gap-2 text-sm">
                <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                  {formatTime12h(item.time)}
                </span>
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 font-medium">{item.title}</span>
                {/* Group-level kill switch. The per-chip X buttons in the cards
                    below remove a single row; this wipes every future
                    occurrence of the routine, which is what an owner means by
                    "cancel the vet visit". Only offered for the generated
                    categories — meals and the potty routine are the standing
                    shape of the day and are edited, not cancelled. */}
                {item.category !== "meal" && item.category !== "potty" && (
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
                    <StatusIcon status={item.status} />
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
