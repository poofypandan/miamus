"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, PawPrint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/context/household-context";
import { useT } from "@/context/owner-locale-context";
import { useHouseholdProfile } from "@/hooks/use-household-profile";
import { petsQuestionAllowed } from "@/lib/calm-start";
import { isPet } from "@/lib/pets";

/**
 * "Any pets at home?" (Phase 162, owner decision D3), once, on Today.
 *
 * Only for a household that never answered and has never had a pet row:
 * migration 133 marked every household with pets as answered, so this is the
 * household that started before the sign-up question (or on an old app
 * build) and may be looking at a Pets tab it doesn't need. Either answer
 * makes it go away, on every owner's phone.
 */
export function PetsQuestionCard() {
  const t = useT();
  const { entities, loading } = useHousehold();
  const { hasPets, createdOn, ready, setHasPets } = useHouseholdProfile();
  const [saving, setSaving] = useState<boolean | null>(null);

  // Never for a household made since the sign-up question (Phase 172, D11
  // rule 6): it answered there, even on an old build that sent no answer.
  if (!ready || loading || hasPets !== null || entities.some(isPet) || !petsQuestionAllowed(createdOn)) return null;

  async function answer(on: boolean) {
    setSaving(on);
    const result = await setHasPets(on);
    setSaving(null);
    if (!result.ok) {
      toast.error(t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
    } else if (!on) {
      toast.success(t("Pets tab hidden", "Tab Hewan disembunyikan"));
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-900">
          <PawPrint className="size-4" aria-hidden />
        </span>
        <p className="text-sm text-amber-900">
          <span className="block font-medium">{t("Any pets at home?", "Ada hewan di rumah?")}</span>
          {t(
            "Miamus can hide the Pets tab if not. Change it any time under Household.",
            "Kalau tidak, Miamus bisa menyembunyikan tab Hewan. Bisa diubah kapan saja di tab Rumah."
          )}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="min-h-11 rounded-xl bg-white"
          disabled={saving !== null}
          onClick={() => void answer(true)}
        >
          {saving === true && <Loader2 className="animate-spin" />} {t("We have pets", "Ada hewan")}
        </Button>
        <Button className="min-h-11 rounded-xl" disabled={saving !== null} onClick={() => void answer(false)}>
          {saving === false && <Loader2 className="animate-spin" />} {t("No pets", "Tidak ada")}
        </Button>
      </div>
    </div>
  );
}
