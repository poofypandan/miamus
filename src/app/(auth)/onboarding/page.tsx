"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase/client";

/**
 * Naming your residence, the one step between signing in and having an app
 * (Phase 86C). Owner-facing, so English.
 *
 * Reached only through the middleware, which sends a signed-in account here
 * when it has no household yet.
 */
export default function OnboardingPage() {
  const router = useRouter();
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

      // owner_auth_id is what the households insert policy checks, so it is
      // stamped here rather than left to a default (migrations/088).
      const { data: household, error: householdError } = await supabase
        .from("households")
        .insert({ name: residence, owner_auth_id: user.id })
        .select()
        .single();
      if (householdError) throw householdError;

      // Second write, and the one that actually grants access: the middleware
      // looks for a membership, not for owner_auth_id. If this fails the
      // household exists but nobody can reach it, so the error is surfaced
      // rather than swallowed — retrying re-uses nothing, but a stray empty
      // household is cheaper than a silent dead end.
      const { error: memberError } = await supabase
        .from("household_members")
        .insert({ household_id: household.id, user_id: user.id, role: "owner" });
      if (memberError) throw memberError;

      // replace, not push: Back must not return to a form that has already
      // been submitted.
      router.replace("/dashboard");
    } catch (err) {
      console.error(err);
      setFailed("Couldn't create your household. Try again.");
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 pb-[calc(3rem+env(safe-area-inset-bottom))]">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
        Name your residence
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This is what you and your staff will see at the top of every screen.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
        <Label htmlFor="residence" className="text-xs">
          Residence name
        </Label>
        <Input
          id="residence"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Banyuwangi 11"
          autoFocus
          className="min-h-[48px]"
        />
        <Button type="submit" disabled={saving || !name.trim()} className="min-h-[52px]">
          {saving && <Loader2 className="animate-spin" />} Create household
        </Button>
        {failed && <p className="text-sm text-destructive">{failed}</p>}
      </form>
    </main>
  );
}
