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
 *                being renewed, or no answer within LINK_CHECK_MS).
 */
export type PhoneLinkState = "linked" | "unlinked" | "unknown";

/**
 * The longest the check may take. RPCs are outside the write timeout
 * (lib/supabase/write-timeout.ts), and the queue waits on this answer before
 * the next save, so a stalled request must not hold up the drain (Codex,
 * PR #92). Past it: "unknown", tried again on the next pass.
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
      resolve("unknown");
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
    if (signal.aborted) return "unknown";
    if (!session) return "unlinked";
    const { data, error } = await supabase.rpc("get_user_household_ids").abortSignal(signal);
    if (error || !Array.isArray(data)) return "unknown";
    return (data as string[]).includes(householdId) ? "linked" : "unlinked";
  } catch {
    return "unknown";
  }
}
