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
 * for overdue describe progress, not what kind of task it is. The Overdue
 * section's red frame (Phase 113) is the same kind of signal — "this should
 * already have happened" — and frames amber chores rather than recolouring
 * them.
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
  /**
   * An event block in the Week grid (Phase 113): a pale face with a strong
   * left edge, so a block is identifiable by colour even when it is too
   * narrow for its title.
   */
  block: string;
  /**
   * A finished row's left edge (Phase 132). Done turns every row the same
   * green, which lost what kind of task it was; this thin edge in the
   * category's own colour keeps that, without competing with the green.
   */
  doneEdge: string;
}

export const AGENDA_TONES: Record<AgendaTone, ToneStyle> = {
  critical: {
    tint: "border-red-200 bg-red-50",
    tintStrong: "border-red-300 bg-red-100",
    icon: "text-red-600",
    badge: "bg-red-100 text-red-800",
    block: "border-l-red-500 bg-red-50 text-red-950",
    doneEdge: "border-l-[3px] border-l-red-400",
  },
  routine: {
    tint: "",
    tintStrong: "",
    icon: "text-zinc-500",
    badge: "bg-zinc-100 text-zinc-700",
    block: "border-l-zinc-400 bg-zinc-100 text-zinc-900",
    doneEdge: "border-l-[3px] border-l-zinc-400",
  },
  chore: {
    tint: "border-amber-200 bg-amber-50",
    tintStrong: "border-amber-300 bg-amber-100",
    icon: "text-amber-600",
    badge: "bg-amber-100 text-amber-900",
    block: "border-l-amber-500 bg-amber-50 text-amber-950",
    doneEdge: "border-l-[3px] border-l-amber-400",
  },
};

/**
 * The finished state (Phase 114): the staff view's green, now on every row
 * that is done — the owner's Agenda, and chore cards on both sides. A status,
 * like the overdue red, so it replaces the category tone rather than mixing
 * with it: once something is done, what kind of task it was matters less than
 * that nobody needs to look at it.
 */
export const DONE_TONE = {
  tint: "border-emerald-500/30 bg-emerald-500/5",
  icon: "text-emerald-700",
  check: "text-emerald-600",
} as const;

/** Which colour a pet routine wears. Sick reports file as medication, so they are red too. */
export function routineTone(category: ScheduleCategory): AgendaTone {
  return category === "medication" || category === "vet" ? "critical" : "routine";
}
