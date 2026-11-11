/**
 * The calls behind the starter templates (Phase 172 PR A2): apply the
 * reviewed list in one all-or-nothing call (migrations/146), and record the
 * setup's own numbers (migrations/142). Counts only, never content.
 */
import type { ApplyPayload, ApplyResult } from "@/lib/setup-templates";

export type ApplyOutcome = { ok: true; result: ApplyResult } | { ok: false; reason: "failed" | "offline" };

export async function applyHouseholdSetup(householdId: string, payload: ApplyPayload): Promise<ApplyOutcome> {
  const { supabase } = await import("@/lib/supabase/client");
  if (!supabase) return { ok: false, reason: "failed" };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, reason: "offline" };
  const { data, error } = await supabase.rpc("apply_household_setup", {
    p_household: householdId,
    p_draft: payload as unknown as Record<string, unknown>,
  });
  if (error || !data) {
    console.error("Could not add the starter list", error);
    return { ok: false, reason: "failed" };
  }
  const raw = data as Record<string, unknown>;
  const n = (k: string) => (typeof raw[k] === "number" ? (raw[k] as number) : 0);
  return {
    ok: true,
    result: {
      rooms_added: n("rooms_added"),
      chores_added: n("chores_added"),
      bills_added: n("bills_added"),
      staff_added: n("staff_added"),
      skipped: n("skipped"),
    },
  };
}

/** What a setup screen sends (record_household_setup's keys; numbers are added up). */
export type SetupFields = Partial<{
  home_type: string;
  path: "template" | "kakak" | "manual" | "mixed";
  started_at: string;
  finished_at: string;
  active_seconds: number;
  typed_fields: number;
  unticked: number;
  rooms_added: number;
  chores_added: number;
  bills_added: number;
  staff_added: number;
}>;

/** Best effort: a failed count never holds the owner up. */
export async function recordSetup(householdId: string, fields: SetupFields): Promise<void> {
  try {
    const { supabase } = await import("@/lib/supabase/client");
    if (!supabase) return;
    const clean = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined && !(typeof v === "number" && (v < 0 || !Number.isInteger(v))))
    );
    if (Object.keys(clean).length === 0) return;
    const { error } = await supabase.rpc("record_household_setup", { p_household: householdId, p_fields: clean });
    if (error) console.error("Could not record setup counts", error);
  } catch (err) {
    console.error("Could not record setup counts", err);
  }
}

/**
 * The one WhatsApp message (D10): one line of instruction and the house
 * link, the code in the fragment so it never reaches server logs. Staff
 * text, so Bahasa Indonesia whatever the owner reads.
 */
export function staffInOneGoMessage(code: string, origin: string, videoUrl?: string | null): string {
  const pretty = code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
  return (
    `Halo! Ini Miamus, aplikasi rumah kita. Buka link ini, pilih nama Anda, lalu buat PIN: ${origin}/join/code#c=${pretty}` +
    (videoUrl ? `\nVideo 15 detik: ${videoUrl}` : "")
  );
}

/** The code from /join/code#c=K7P-M2Q, or null. */
export function codeFromFragment(hash: string): string | null {
  const match = /(?:^#|&)c=([A-Za-z0-9-]{6,7})(?:&|$)/.exec(hash);
  if (!match) return null;
  const code = match[1].toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : null;
}
