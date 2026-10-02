/**
 * The Agenda's three colours (Phase 112), in one place so no row can drift.
 *
 *   red    critical pet health — medicine, vet visits, sick reports
 *   gray   routine pet care — meals, potty, grooming, one-off pet tasks
 *   amber  every household chore, timed or anytime
 *
 * Three, deliberately. The day used to wear six hues (emerald potty, amber
 * meals, rose medicine, indigo vet, cyan grooming, and a colour per chore
 * category), which made colour a legend to learn rather than a signal. Now
 * it answers one question at a glance — is this the dogs' health, the dogs'
 * routine, or the house? — and red only ever means "this is about a dog's
 * health", so it is never spent on anything less.
 *
 * Status colours are separate and unchanged: emerald for done and a red mark
 * for overdue describe progress, not what kind of task it is.
 *
 * No dark-mode variants: the app pins itself to a light scheme (Phase 37).
 */
import type { ScheduleCategory } from "@/lib/schedule-categories";

export type AgendaTone = "critical" | "routine" | "chore";

interface ToneStyle {
  /** Card or row face. Empty for routine: most of the day stays neutral. */
  tint: string;
  /** A deeper face, for the one-dog close-up in the pet profile sheet. */
  tintStrong: string;
  /** The category icon. */
  icon: string;
  /** A small pill (category badge) in the same family. */
  badge: string;
}

export const AGENDA_TONES: Record<AgendaTone, ToneStyle> = {
  critical: {
    tint: "border-red-200 bg-red-50",
    tintStrong: "border-red-300 bg-red-100",
    icon: "text-red-600",
    badge: "bg-red-100 text-red-800",
  },
  routine: {
    tint: "",
    tintStrong: "",
    icon: "text-zinc-500",
    badge: "bg-zinc-100 text-zinc-700",
  },
  chore: {
    tint: "border-amber-200 bg-amber-50",
    tintStrong: "border-amber-300 bg-amber-100",
    icon: "text-amber-600",
    badge: "bg-amber-100 text-amber-900",
  },
};

/** Which colour a pet routine wears. Sick reports file as medication, so they are red too. */
export function routineTone(category: ScheduleCategory): AgendaTone {
  return category === "medication" || category === "vet" ? "critical" : "routine";
}
