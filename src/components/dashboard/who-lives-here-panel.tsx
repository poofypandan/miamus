"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, PawPrint } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useHousehold } from "@/context/household-context";
import { useT } from "@/context/owner-locale-context";
import { useHouseholdProfile } from "@/hooks/use-household-profile";
import { cn } from "@/lib/utils";

/**
 * Household → Who lives here (Phase 162). Pets now; Kids and Elders join this
 * page when the Care tab exists. Turning pets off while a pet isn't archived
 * is refused (owner decision D4), here and in the database (migrations/133).
 *
 * Owner-facing: English or Bahasa Indonesia.
 */
export function WhoLivesHerePanel() {
  const t = useT();
  const { pets } = useHousehold();
  const { petsOn, setHasPets } = useHouseholdProfile();
  const [busy, setBusy] = useState(false);
  // Live pets only: `pets` already leaves archived ones out.
  const livePets = pets.length;
  const blocked = petsOn && livePets > 0;

  async function toggle() {
    if (busy || blocked) return;
    const next = !petsOn;
    setBusy(true);
    const result = await setHasPets(next);
    setBusy(false);
    if (result.ok) {
      toast.success(
        next ? t("Pets tab is back", "Tab Hewan muncul lagi") : t("Pets tab hidden", "Tab Hewan disembunyikan")
      );
    } else if (result.reason === "has_live_pets") {
      toast.error(t("Archive your pets in Pets first.", "Arsipkan dulu hewan di tab Hewan."));
    } else {
      toast.error(t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-900">{t("Who lives here", "Siapa yang tinggal di sini")}</h2>
      <p className="text-sm text-muted-foreground">
        {t(
          "Miamus shows only what fits your home. Everyone in the house sees the same, staff phones included.",
          "Miamus hanya menampilkan yang sesuai dengan rumah Anda. Semua orang di rumah melihat hal yang sama, termasuk HP staf."
        )}
      </p>
      <Card className="py-4">
        <CardContent className="flex flex-col gap-3 px-4">
          <button
            type="button"
            role="switch"
            aria-checked={petsOn}
            aria-disabled={blocked || undefined}
            onClick={() => void toggle()}
            disabled={busy}
            className="flex min-h-14 items-center gap-3 rounded-xl border px-3 text-left active:bg-muted"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-white text-gray-900">
              <PawPrint className="size-5" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium text-gray-900">{t("Pets", "Hewan")}</span>
              <span className="text-xs text-muted-foreground">
                {t(
                  "Routines, meals, medicine, vet visits and photos.",
                  "Rutinitas, makan, obat, dokter hewan dan foto."
                )}
              </span>
            </span>
            {busy ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <span
                aria-hidden="true"
                className={cn(
                  "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                  petsOn ? "bg-primary" : "bg-slate-300",
                  blocked && "opacity-60"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform",
                    petsOn ? "translate-x-[22px]" : "translate-x-0.5"
                  )}
                />
              </span>
            )}
          </button>
          {blocked && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t(
                `You have ${livePets} ${livePets === 1 ? "pet" : "pets"} in Miamus. Archive them in Pets first; their history stays.`,
                `Ada ${livePets} hewan di Miamus. Arsipkan dulu di tab Hewan; riwayatnya tetap tersimpan.`
              )}
            </p>
          )}
          {/* Kids and Elders: shown so owners see where this is going, not
              buttons (D1). Asking about them waits for the Care tab and its
              privacy-policy update. */}
          {[t("Kids", "Anak"), t("Elders", "Lansia")].map((label) => (
            <div
              key={label}
              aria-disabled="true"
              className="flex min-h-12 items-center justify-between rounded-xl border border-dashed px-3 text-sm text-gray-400"
            >
              {label}
              <span className="text-xs">{t("Soon", "Segera")}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
