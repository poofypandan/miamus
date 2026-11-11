import { supabase } from "@/lib/supabase/client";

/**
 * Is this phone (or account) still linked to the household? Asked by the save
 * queue only after the server refused its sign-in (pre-launch audit L4), to
 * tell "the phone was unlinked" (removed by an admin, the person archived,
 * unused for 60 days) from a sign-in that is only being renewed.
 *
 *   "unlinked" — no sign-in on this phone any more, or it no longer reaches
 *                this household;
 *   "linked"   — it does, so the refusal was about the save itself;
 *   "unknown"  — the question got no clear answer (no signal, a token still
 *                being renewed).
 */
export type PhoneLinkState = "linked" | "unlinked" | "unknown";

export async function phoneLinkState(householdId: string | null): Promise<PhoneLinkState> {
  // Mock mode has no sign-in to lose.
  if (!supabase) return "linked";
  if (!householdId) return "unknown";
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return "unlinked";
    const { data, error } = await supabase.rpc("get_user_household_ids");
    if (error || !Array.isArray(data)) return "unknown";
    return (data as string[]).includes(householdId) ? "linked" : "unlinked";
  } catch {
    return "unknown";
  }
}
