"use client";

import { supabase } from "@/lib/supabase/client";

/** How long a fresh invite link stays good for. */
export const INVITE_TTL_DAYS = 7;

export type InviteKind = "owner" | "staff";

/**
 * A link's secret. 32 bytes from the platform CSPRNG, base64url so it survives
 * being pasted into WhatsApp and back out again.
 *
 * Not crypto.randomUUID(): a uuid is 122 bits with a fixed layout, and this is
 * the only thing standing between a stranger and a household.
 */
function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Creates an invite and returns the link to send (Phase 89).
 *
 * The row is written by the owner's own session, so the RLS policies on both
 * invite tables do the authorisation: only a member of the household can
 * create one, and nobody else can read the tokens back.
 *
 * The two kinds are inserted separately rather than through one call with a
 * computed table name — the typed client resolves the row shape from the
 * literal, and a union of the two tables loses it.
 */
export async function createInviteLink(kind: InviteKind, householdId: string): Promise<string> {
  if (!supabase) throw new Error("Supabase is not configured");

  const token = newToken();
  const expires_at = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  if (kind === "owner") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("owner_invites")
      .insert({ household_id: householdId, token, expires_at, created_by: user?.id ?? null });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("staff_invites")
      .insert({ household_id: householdId, token, expires_at });
    if (error) throw error;
  }

  return `${window.location.origin}/join/${kind}?token=${token}`;
}
