"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { KakakAvatar } from "@/components/kakak/kakak-avatar";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { setKakakEnabled, type KakakStatus } from "@/hooks/use-kakak-status";
import { useStaffProfiles } from "@/hooks/use-staff-profiles";
import { DATE_LOCALE } from "@/lib/owner-locale";
import { cn } from "@/lib/utils";

/**
 * The Settings tab's Kakak page (plan screen 9): what she does, what is
 * sent and to whom, and one switch. Off by default; any admin can turn it on
 * or off, and the page says who changed it last and when. Shown only for a
 * household on the family list (the row is hidden otherwise).
 */
export function KakakSettings({ status, reload }: { status: KakakStatus; reload: () => Promise<void> }) {
  const t = useT();
  const locale = useOwnerLocale();
  const { activeHouseholdId } = useHousehold();
  const { allProfiles } = useStaffProfiles();
  const [busy, setBusy] = useState(false);

  const who = status.enabledBy
    ? ((allProfiles ?? []).find((p) => p.user_id === status.enabledBy)?.name ?? t("an admin", "seorang admin"))
    : null;
  const when = status.enabledAt
    ? new Date(status.enabledAt).toLocaleDateString(DATE_LOCALE[locale], { day: "numeric", month: "long", year: "numeric" })
    : null;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !status.enabled;
    try {
      await setKakakEnabled(activeHouseholdId, next);
      await reload();
      toast.success(next ? t("Kakak is on", "Kakak dinyalakan") : t("Kakak is off", "Kakak dimatikan"));
    } catch (error) {
      console.error("Kakak switch", error);
      toast.error(t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-900">Kakak</h2>
      <Card className="py-4">
        <CardContent className="flex flex-col gap-4 px-4">
          <div className="flex items-start gap-3">
            <KakakAvatar className="size-10" />
            <p className="text-sm text-gray-900">
              {t(
                "Kakak sets up chores, shopping, pet routines, food, ingredients and what staff see from what you type or say, and answers questions about how Miamus works. She shows you a card first; nothing is saved until you confirm.",
                "Kakak mengatur tugas, belanja, rutinitas hewan, makanan, bahan masakan, dan yang dilihat staf dari yang Anda ketik atau ucapkan, dan menjawab pertanyaan tentang cara pakai Miamus. Kakak menunjukkan kartunya dulu; tidak ada yang disimpan sebelum Anda konfirmasi."
              )}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "What you type, and the first names of the people on your household's list, and your pets, rooms and shopping items, are sent to Anthropic in the United States so Kakak can understand them. Anthropic keeps them up to 30 days and doesn't use them for training.",
              "Yang Anda ketik, serta nama depan orang di daftar rumah Anda, nama hewan, ruangan, dan barang belanja Anda, dikirim ke Anthropic di Amerika Serikat supaya Kakak bisa memahaminya. Anthropic menyimpannya paling lama 30 hari dan tidak memakainya untuk melatih AI."
            )}{" "}
            {t(
              "If you talk to Kakak, your browser turns your voice into text and may send the audio to Apple or Google to do it. Miamus only gets the text, never the audio.",
              "Jika Anda bicara ke Kakak, browser Anda mengubah suara menjadi teks dan bisa mengirim rekaman suaranya ke Apple atau Google untuk itu. Miamus hanya menerima teksnya, tidak pernah rekaman suaranya."
            )}{" "}
            <Link href={locale === "id" ? "/privasi" : "/privacy"} className="font-medium underline underline-offset-2">
              {t("Privacy policy", "Kebijakan privasi")}
            </Link>
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={status.enabled}
            onClick={() => void toggle()}
            disabled={busy}
            className="flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 text-left text-sm font-medium text-gray-900 active:bg-muted"
          >
            {t("Let Kakak help", "Izinkan Kakak membantu")}
            {busy ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <span
                aria-hidden="true"
                className={cn(
                  "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                  status.enabled ? "bg-primary" : "bg-slate-300"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform",
                    status.enabled ? "translate-x-[22px]" : "translate-x-0.5"
                  )}
                />
              </span>
            )}
          </button>
          {who && when && (
            <p className="text-xs text-muted-foreground">
              {status.enabled
                ? t(`Turned on by ${who} on ${when}.`, `Dinyalakan oleh ${who} pada ${when}.`)
                : t(`Turned off by ${who} on ${when}.`, `Dimatikan oleh ${who} pada ${when}.`)}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
