"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHousehold } from "@/context/household-context";
import { moduleHref } from "@/lib/dashboard-modules";
import { supabase } from "@/lib/supabase/client";

/**
 * The zero state: a signed-in account with no household yet (Phase 86C,
 * rebuilt as a welcome screen in Phase 111). Owner-facing, so English.
 *
 * Reached only through the middleware, which sends a signed-in account here
 * when it has no household_members row — so nobody reaches the dashboard to
 * meet empty lists and failing queries before there is anything to query.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { reloadTenant } = useHousehold();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const residence = name.trim();
    if (!residence || !supabase) return;

    setSaving(true);
    setFailed(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      // owner_auth_id is what the households insert policy checks, and what
      // lets this insert read its own row back before any membership exists
      // (migrations/088, 098) — so it is stamped here, not left to a default.
      const { data: household, error: householdError } = await supabase
        .from("households")
        .insert({ name: residence, owner_auth_id: user.id })
        .select()
        .single();
      if (householdError) throw householdError;

      // Second write, and the one that actually grants access: the middleware
      // looks for a membership, not for owner_auth_id. If this fails the
      // household exists but nobody can reach it, so the error is surfaced
      // rather than swallowed.
      const { error: memberError } = await supabase
        .from("household_members")
        .insert({ household_id: household.id, user_id: user.id, role: "owner" });
      if (memberError) throw memberError;

      // Before navigating, not after: the household context resolved this
      // device as "no household" when this page loaded, and keeps that answer
      // across a client-side navigation. Without this the dashboard's owner
      // guard saw a non-member and the new household opened on a blank screen.
      await reloadTenant();

      // replace, not push: Back must not return to a form that has already
      // been submitted. The Agenda is the dashboard's default tab.
      router.replace(moduleHref("agenda"));
    } catch (err) {
      console.error(err);
      setFailed("Couldn't create your household. Try again.");
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 pb-[calc(3rem+env(safe-area-inset-bottom))]">
      <BrandMark size={56} rounded />

      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-gray-900">
        Welcome to Miamus
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Let&apos;s set up your household. You can add pets, chores, stock and your staff once
        it exists.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
        <p className="text-xs font-medium text-muted-foreground">Step 1 · Name your household</p>
        <Label htmlFor="residence" className="sr-only">
          Household name
        </Label>
        <Input
          id="residence"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. The Smith Residence"
          autoFocus
          autoComplete="off"
          className="min-h-[48px]"
        />
        <p className="text-xs text-muted-foreground">
          Shown at the top of every screen, for you and your staff.
        </p>
        <Button type="submit" disabled={saving || !name.trim()} className="min-h-[52px]">
          {saving && <Loader2 className="animate-spin" />} Create household
        </Button>
        {failed && <p className="text-sm text-destructive">{failed}</p>}
      </form>
    </main>
  );
}
