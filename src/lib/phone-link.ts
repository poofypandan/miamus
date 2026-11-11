import { isConnectionError } from "@/lib/network-errors";
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
 *   "unknown"  — the server answered, but not clearly (a token still being
 *                renewed); repeated, the queue treats the phone as unlinked;
 *   "no_answer" — no answer at all (no signal, or none within LINK_CHECK_MS):
 *                only tried again later, never counted toward "unlinked".
 */
export type PhoneLinkState = "linked" | "unlinked" | "unknown" | "no_answer";

/**
 * The longest the check may take. RPCs are outside the write timeout
 * (lib/supabase/write-timeout.ts), and the queue waits on this answer before
 * the next save, so a stalled request must not hold up the drain (Codex,
 * PR #92). Past it: "no_answer", tried again on the next pass.
 */
export const LINK_CHECK_MS = 8_000;

export async function phoneLinkState(
  householdId: string | null,
  timeoutMs: number = LINK_CHECK_MS
): Promise<PhoneLinkState> {
  // Mock mode has no sign-in to lose.
  if (!supabase) return "linked";
  if (!householdId) return "unknown";
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<PhoneLinkState>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve("no_answer");
    }, timeoutMs);
  });
  try {
    return await Promise.race([ask(householdId, controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function ask(householdId: string, signal: AbortSignal): Promise<PhoneLinkState> {
  if (!supabase) return "linked";
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (signal.aborted) return "no_answer";
    if (!session) return "unlinked";
    const { data, error } = await supabase.rpc("get_user_household_ids").abortSignal(signal);
    if (signal.aborted || (error && isConnectionError(error))) return "no_answer";
    if (error || !Array.isArray(data)) return "unknown";
    return (data as string[]).includes(householdId) ? "linked" : "unlinked";
  } catch (err) {
    return isConnectionError(err) ? "no_answer" : "unknown";
  }
}
