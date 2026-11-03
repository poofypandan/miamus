"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pill, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/context/household-context";
import { useToday } from "@/hooks/use-today";
import {
  medicationCourseAlerts,
  shiftDay,
  type CourseAlert,
} from "@/lib/medication-courses";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";

const DISMISSED_KEY = "miamus_dismissed_course_alerts";

/** How long to extend or restart by. */
const LENGTHS = [
  { days: 3, label: "3 days" },
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
] as const;

/**
 * Ended courses the owner has said "that's right" to, on this device.
 *
 * Local rather than a column, matching the staff panel's dismissed proposals
 * (staff-reports-panel.tsx): acknowledging is a reading state. The cost is
 * that each admin dismisses for themselves — acceptable for a notice that
 * also expires on its own after ENDED_WITHIN_DAYS.
 */
function useDismissed() {
  // Filled after mount: localStorage does not exist during SSR, and reading it
  // while rendering would make the first client paint disagree with the HTML.
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DISMISSED_KEY);
      if (raw) setDismissed(JSON.parse(raw) as string[]);
    } catch {
      // Blocked or corrupt storage: nothing dismissed is the safe default.
    }
  }, []);
  function dismiss(key: string) {
    setDismissed((prev) => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      try {
        window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
      } catch {
        // Still hidden for this session.
      }
      return next;
    });
  }
  return { dismissed, dismiss };
}

function shortDate(key: string): string {
  return new Date(`${key}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Medicine courses that are ending, have ended, or never ran (Phase 144).
 *
 * A course stops on its last day without a word to anyone — that is how all
 * of a post-operative dog's medicines stopped in the live household, noticed
 * a fortnight later. This asks the question at the moment it matters: still
 * running and about to stop ("Extend"), or already stopped ("Restart" or
 * dismiss). See lib/medication-courses.ts.
 *
 * Red family, as everything about a dog's health is in the Agenda
 * (agenda-tones.ts). Renders nothing when there is nothing to ask.
 *
 * Owner-facing, so English.
 */
export function MedicationCourseAlerts() {
  const { schedules, pets } = useHousehold();
  const today = formatDateLocal(useToday());
  const { dismissed, dismiss } = useDismissed();

  const alerts = useMemo(
    () =>
      medicationCourseAlerts({ schedules, pets, today }).filter(
        // Only what has already stopped can be dismissed; a course still
        // running speaks until it ends, then becomes an "ended" notice.
        (a) => a.kind === "ending" || !dismissed.includes(a.key)
      ),
    [schedules, pets, today, dismissed]
  );

  if (alerts.length === 0) return null;

  return (
    <section
      aria-labelledby="course-alerts-title"
      className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50/60 p-3"
    >
      <h2
        id="course-alerts-title"
        className="flex items-center gap-1.5 text-sm font-semibold text-red-950"
      >
        <Pill className="size-4 text-red-600" /> Medicine courses
      </h2>
      <div className="flex flex-col divide-y divide-red-200/70">
        {alerts.map((alert) => (
          <CourseAlertRow
            key={alert.key}
            alert={alert}
            today={today}
            onDismiss={() => dismiss(alert.key)}
          />
        ))}
      </div>
    </section>
  );
}

function CourseAlertRow({
  alert,
  today,
  onDismiss,
}: {
  alert: CourseAlert;
  today: string;
  onDismiss: () => void;
}) {
  const { updateSchedule, createSchedulesBatch } = useHousehold();
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = alert.kind === "ending";
  const doses = alert.courses.flatMap((c) => c.schedules);
  const medicines = alert.courses.length === 1 ? alert.courses[0].label : `${alert.courses.length} medicines`;

  const status =
    alert.kind === "ending"
      ? alert.daysLeft === 0
        ? "Last dose today"
        : alert.daysLeft === 1
          ? "Last dose tomorrow"
          : `Last dose ${shortDate(alert.endDate)} · ${alert.daysLeft} days left`
      : alert.kind === "ended"
        ? alert.daysAgo === 1
          ? "Ended yesterday"
          : `Ended ${shortDate(alert.endDate)} · ${alert.daysAgo} days ago`
        : // Approved after its own last day, so created already over.
          `Never ran — its last day (${shortDate(alert.endDate)}) was before it started (${shortDate(alert.courses[0].startDate)})`;

  async function apply(days: number) {
    setBusy(true);
    try {
      if (running) {
        // Still running, so moving the last day is seamless: no day in
        // between was ever unscheduled.
        const newEnd = shiftDay(alert.endDate, days);
        for (const dose of doses) await updateSchedule(dose.id, { expires_at: newEnd });
        toast.success(`${medicines} for ${alert.petName} extended to ${shortDate(newEnd)}`);
      } else {
        // Already stopped, so new rows from today — never the old ones
        // stretched. Extending a course that ended on the 19th would mark the
        // 20th onward as scheduled after the fact, and those days would show
        // as missed doses that nobody had been asked to give.
        const newEnd = shiftDay(today, days - 1);
        await createSchedulesBatch(
          doses.map((d) => ({
            entity_id: d.entity_id,
            title: d.title,
            module: d.module,
            frequency_type: d.frequency_type,
            interval_hours: d.interval_hours,
            fixed_times: d.fixed_times,
            start_time: d.start_time,
            end_time: d.end_time,
            expires_at: newEnd,
          }))
        );
        toast.success(`${medicines} for ${alert.petName} restarted, through ${shortDate(newEnd)}`);
      }
      setChoosing(false);
    } catch (err) {
      console.error(err);
      toast.error(running ? "Couldn't extend the course" : "Couldn't restart the course");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* The count on the name line, which never truncates: on the list
              line below, "+2 more" was the part a phone cut off. */}
          <span className="text-sm font-medium text-gray-900">
            {alert.petName}
            {alert.courses.length > 1 && (
              <span className="font-normal text-muted-foreground">
                {" "}
                · {alert.courses.length} medicines
              </span>
            )}
          </span>
          <span
            className="truncate text-xs text-gray-700"
            title={alert.courses.map((c) => c.label).join(", ")}
          >
            {alert.courses.map((c) => c.label).join(", ")}
          </span>
          <span
            className={cn(
              "text-xs font-medium",
              running ? "text-amber-800" : "text-red-700"
            )}
          >
            {status}
          </span>
        </div>
        {!choosing && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="min-h-[36px] bg-white"
              onClick={() => setChoosing(true)}
            >
              {running ? "Extend" : alert.kind === "never_ran" ? "Start now" : "Restart"}
            </Button>
            {!running && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label={`Dismiss — ${alert.petName}'s course was meant to end`}
                className="flex size-9 items-center justify-center rounded-lg text-muted-foreground active:bg-red-100"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {choosing && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            {running ? "Add" : "Run for"}
          </span>
          {LENGTHS.map(({ days, label }) => (
            <Button
              key={days}
              size="sm"
              className="min-h-[36px]"
              disabled={busy}
              onClick={() => apply(days)}
            >
              {running ? `+${label}` : label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="min-h-[36px]"
            disabled={busy}
            onClick={() => setChoosing(false)}
          >
            {busy ? <Loader2 className="animate-spin" /> : "Cancel"}
          </Button>
        </div>
      )}
    </div>
  );
}
