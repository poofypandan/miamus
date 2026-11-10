import { supabase } from "@/lib/supabase/client";
import type { PushStatus } from "@/lib/push-prompt";

/**
 * Notifications on staff phones (Phase 166, migrations/141).
 *
 * A staff phone's push subscription is saved exactly as an owner's is
 * (lib/push.ts, under the phone's anonymous session). What is new is the
 * list of people each phone gives notifications for: one phone can serve
 * several people, and only the server decides who gets what. These are the
 * calls around that list, plus the rules for when staff Today asks.
 *
 * Every call is a no-op without Supabase (mock mode), and a database before
 * 141 answers with an error the callers treat as "not available".
 */

/** Fired when this phone's list changes, so every copy re-reads it. */
export const STAFF_PUSH_CHANGED_EVENT = "miamus:staff-push-changed";

export function announceStaffPushChange(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(STAFF_PUSH_CHANGED_EVENT));
}

export interface PhonePushPeople {
  people: { staff_id: string; name: string }[];
  /** Two or more people use this phone (D5): pushes say only whose they are. */
  shared: boolean;
  /** The owner's switch (D8). */
  household_on: boolean;
}

export type SetPushPersonResult =
  | { status: "ok" }
  | { status: "pin_required" }
  | { status: "wrong_pin"; attempts_left: number }
  | { status: "locked"; locked_until: string }
  | { status: "no_pin" };

export interface StaffPushOverview {
  enabled: boolean;
  people: { staff_id: string; phones_on: number }[];
  /** Keyed by device_sessions.id, as list_linked_phones returns it. */
  phones: { device_session_id: string; names: string[] }[];
}

/** This phone's list. Null in mock mode; throws on a database before 141. */
export async function myPhonePushPeople(): Promise<PhonePushPeople | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_phone_push_people");
  if (error) throw error;
  // Anything but the expected shape is "not available here", never a crash.
  if (!data || typeof data !== "object" || !Array.isArray((data as PhonePushPeople).people)) return null;
  return data;
}

/**
 * Adds or removes a person on this phone's list. Adding needs this phone's
 * last PIN sign-in to be them, or their PIN ("pin_required" asks for it).
 */
export async function setMyPushPerson(
  staffId: string,
  on: boolean,
  pin?: string
): Promise<SetPushPersonResult> {
  if (!supabase) return { status: "ok" };
  const { data, error } = await supabase.rpc("set_my_push_person", {
    p_staff_id: staffId,
    p_on: on,
    ...(pin ? { p_pin: pin } : {}),
  });
  if (error) throw error;
  announceStaffPushChange();
  if (!data || typeof data !== "object" || typeof (data as { status?: unknown }).status !== "string") {
    throw new Error("Unexpected answer from set_my_push_person");
  }
  return data;
}

/** Admins: the switch, who has notifications on, and each phone's names. */
export async function fetchStaffPushOverview(): Promise<StaffPushOverview | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("staff_push_overview");
  if (error) throw error;
  const overview = data as StaffPushOverview | null;
  if (!overview || !Array.isArray(overview.people) || !Array.isArray(overview.phones)) return null;
  return overview;
}

export async function setHouseholdStaffPush(on: boolean): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("set_household_staff_push", { p_on: on });
  if (error) throw error;
}

/**
 * Admins, right after a save: which of these people a push reaches now.
 * Never throws: a failed check only means the plain "Saved" toast.
 */
export async function staffWillBeNotified(staffIds: string[]): Promise<string[]> {
  const ids = [...new Set(staffIds.filter(Boolean))];
  if (!supabase || ids.length === 0) return [];
  try {
    const { data, error } = await supabase.rpc("staff_will_be_notified", { p_staff_ids: ids });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(err);
    return [];
  }
}

// --- When staff Today asks (D9) ------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Nanti saja" hides the card for 14 days; after three, only settings offer it. */
export const STAFF_PUSH_LATER_DAYS = 14;
export const STAFF_PUSH_MAX_LATER = 3;
/** Blocked, iPhone in a tab, or a browser that can't: "Mengerti" rests it 30 days. */
export const STAFF_PUSH_INFO_DAYS = 30;

/** Per person on this phone: when the card may show again, and how many "Nanti saja". */
export interface StaffPushSnooze {
  until: number | null;
  later: number;
}

export function staffPushSnoozeKey(staffId: string): string {
  return `miamus.staff-push-card.${staffId}`;
}

export function readStaffPushSnooze(staffId: string): StaffPushSnooze {
  try {
    const raw = localStorage.getItem(staffPushSnoozeKey(staffId));
    if (!raw) return { until: null, later: 0 };
    const parsed = JSON.parse(raw) as Partial<StaffPushSnooze>;
    return {
      until: typeof parsed.until === "number" ? parsed.until : null,
      later: typeof parsed.later === "number" ? parsed.later : 0,
    };
  } catch {
    return { until: null, later: 0 };
  }
}

export function writeStaffPushSnooze(staffId: string, snooze: StaffPushSnooze): void {
  try {
    localStorage.setItem(staffPushSnoozeKey(staffId), JSON.stringify(snooze));
  } catch {
    // Storage off: the card just shows again next visit.
  }
}

/** After "Nanti saja" (status off) or "Mengerti" (anything else). */
export function snoozeAfter(status: PushStatus, prev: StaffPushSnooze, now: number): StaffPushSnooze {
  if (status === "off" || status === "on") {
    return { until: now + STAFF_PUSH_LATER_DAYS * DAY_MS, later: prev.later + 1 };
  }
  return { until: now + STAFF_PUSH_INFO_DAYS * DAY_MS, later: prev.later };
}

/** What the card on staff Today shows, if anything. */
export type StaffPushCardKind = "turn-on" | "blocked" | "ios" | "unsupported";

/**
 * Whether staff Today shows the card, and which.
 *
 * - Never to an admin in staff view (they get owner pushes), before the
 *   phone's list has loaded, when the owner has switched staff pushes off,
 *   or for someone who already has notifications on here.
 * - "turn-on" while this phone's browser can subscribe (off), or already does
 *   for someone else (on, but not for me): until three "Nanti saja".
 * - blocked / iPhone in a tab / a browser that can't: once a month.
 */
export function staffPushCardKind(input: {
  status: PushStatus;
  isAdmin: boolean;
  people: PhonePushPeople | null;
  staffId: string | null;
  snooze: StaffPushSnooze;
  now: number;
}): StaffPushCardKind | null {
  const { status, isAdmin, people, staffId, snooze, now } = input;
  if (isAdmin || !staffId || !people || !people.household_on) return null;
  const mine = people.people.some((p) => p.staff_id === staffId);
  if (status === "on" && mine) return null;
  if (snooze.until !== null && now < snooze.until) return null;
  switch (status) {
    case "off":
    case "on":
      return snooze.later >= STAFF_PUSH_MAX_LATER ? null : "turn-on";
    case "denied":
      return "blocked";
    case "ios-install-first":
      return "ios";
    case "unsupported":
      return "unsupported";
    default:
      return null;
  }
}

/** The Lapor row's word for this phone: Aktif / Mati / Diblokir (glossary). */
export function staffPushStatusLabel(status: PushStatus, onForMe: boolean): string | null {
  if (status === "loading") return null;
  if (status === "denied") return "Diblokir";
  if (status === "on" && onForMe) return "Aktif";
  return "Mati";
}
