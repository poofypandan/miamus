import { isMockMode } from "@/lib/data";
import { supabase } from "@/lib/supabase/client";
import { getActiveHouseholdId } from "@/lib/tenant";
import type { FeedbackCategory } from "@/types/database";

/**
 * Feedback ("Send feedback" / "Kirim masukan", roadmap item 9;
 * migrations/135). A short note to the people who make Miamus, with only
 * what helps read it attached: the household, who sent it (the server
 * stamps the session; staff phones name the person on duty), the build and
 * the screen. Nothing about the device.
 */

/** The database refuses more (feedback_message_length). */
export const FEEDBACK_MAX_LENGTH = 1000;

export const FEEDBACK_CATEGORIES: FeedbackCategory[] = ["idea", "problem", "other"];

/** Words for each category, owner side in both languages; staff use "id". */
export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, { en: string; id: string }> = {
  idea: { en: "Idea", id: "Ide" },
  problem: { en: "Problem", id: "Masalah" },
  other: { en: "Other", id: "Lainnya" },
};

/**
 * The app's own view parameters: enough to know which screen, nothing a
 * link might carry (an invite token, an email).
 */
const PAGE_PARAMS = ["tab", "view", "module", "chores", "page"];
const PAGE_MAX_LENGTH = 200;

/** "/dashboard?tab=staff", from a pathname and its query, kept short. */
export function feedbackPage(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of PAGE_PARAMS) {
    const value = params.get(key);
    if (value) kept.set(key, value.slice(0, 40));
  }
  const query = kept.toString();
  return `${pathname}${query ? `?${query}` : ""}`.slice(0, PAGE_MAX_LENGTH);
}

/** The build this phone runs (next.config.ts), or null. */
export function feedbackAppVersion(): string | null {
  return process.env.NEXT_PUBLIC_BUILD_ID?.slice(0, 64) ?? null;
}

export interface FeedbackInput {
  message: string;
  category: FeedbackCategory | null;
  /** The person on duty, for a staff phone; the server ignores it for owners. */
  staffId: string | null;
  page: string | null;
}

/** Why a send was refused, in the app's terms. */
export type FeedbackError = "too_many" | "who" | "failed";

export function feedbackErrorKind(err: unknown): FeedbackError {
  const message =
    err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
  if (message.includes("feedback_daily_limit")) return "too_many";
  if (message.includes("feedback_staff_required") || message.includes("feedback_not_this_staff")) return "who";
  return "failed";
}

/**
 * Sends it. Not queued for later like a log (lib/offline*): a failure
 * leaves the text in the box to try again. No row comes back, because a
 * staff phone may not read feedback, not even its own.
 */
export async function sendFeedback(input: FeedbackInput): Promise<void> {
  const message = input.message.trim().slice(0, FEEDBACK_MAX_LENGTH);
  if (!message) throw new Error("feedback_message_length");
  // The demo build (no Supabase): nothing to send to.
  if (isMockMode || !supabase) return;
  const { error } = await supabase.from("feedback").insert({
    household_id: getActiveHouseholdId(),
    message,
    category: input.category,
    staff_id: input.staffId,
    app_version: feedbackAppVersion(),
    page: input.page,
  });
  if (error) throw error;
}
