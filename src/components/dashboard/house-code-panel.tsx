"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, RefreshCw, Send, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useFormatTime } from "@/components/ui/ui-labels";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { dataProvider } from "@/lib/data";
import type { LinkedPhone } from "@/lib/data/types";
import { DATE_LOCALE } from "@/lib/owner-locale";

/**
 * The house code and the staff phones linked to this household, in Access
 * (Phase 151, migrations/115). A staff phone that gets signed out comes back
 * with the code, their name and their PIN — no new invite link needed. With
 * a code anyone in the house can be told, owners need to see every linked
 * phone and be able to remove one.
 *
 * Owner-facing, in the language the owner chose. The WhatsApp message is
 * Bahasa Indonesia: it goes to staff.
 */
export function HouseCodePanel() {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-900">{t("Staff sign-in", "Masuk staf")}</h2>
      <HouseCodeCard />
      <LinkedPhonesCard />
    </div>
  );
}

/** "K7M2QX" → "K7M-2QX", as people read it out. */
function formatCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

function HouseCodeCard() {
  const t = useT();
  const { activeHouseholdId } = useHousehold();
  const [code, setCode] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    dataProvider
      .getHouseCode()
      .then((value) => !cancelled && setCode(value))
      .catch((err) => {
        console.error(err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeHouseholdId]);

  async function rotate() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setRotating(true);
    try {
      setCode(await dataProvider.rotateHouseCode());
      toast.success(t("New house code made", "Kode rumah baru dibuat"));
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't change the code. Try again.", "Kode gagal diganti. Coba lagi."));
    } finally {
      setRotating(false);
      setConfirming(false);
    }
  }

  function shareOnWhatsApp() {
    if (!code) return;
    const message =
      `Kode rumah Miamus: ${formatCode(code)}\n` +
      `Kalau HP Anda keluar dari Miamus: buka ${window.location.origin}/join/code, ` +
      `ketik kode ini, pilih nama Anda, lalu masukkan PIN.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <KeyRound className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm font-medium">{t("House code", "Kode rumah")}</p>
            <p className="text-xs text-muted-foreground">
              {t(
                "If a staff phone gets signed out, they tap “Saya staf”, type this code, pick their name and enter their PIN.",
                "Kalau HP staf keluar dari Miamus, mereka ketuk “Saya staf”, ketik kode ini, pilih nama, lalu masukkan PIN."
              )}
            </p>
          </div>
        </div>

        <p
          className="rounded-lg bg-muted py-3 text-center font-mono text-2xl font-semibold tracking-[0.25em] text-gray-900 select-all"
          aria-live="polite"
        >
          {code ? formatCode(code) : failed ? "—" : <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />}
        </p>
        {failed && (
          <p className="text-xs text-destructive">
            {t("Couldn't load the house code.", "Kode rumah gagal dimuat.")}
          </p>
        )}

        <div className="flex gap-2">
          <Button onClick={shareOnWhatsApp} disabled={!code} className="min-h-[44px] flex-1">
            <Send />
            {t("Send on WhatsApp", "Kirim lewat WhatsApp")}
          </Button>
          <Button
            variant={confirming ? "destructive" : "outline"}
            onClick={rotate}
            disabled={!code || rotating}
            className="min-h-[44px]"
          >
            {rotating ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {confirming ? t("Tap to confirm", "Ketuk lagi") : t("Change", "Ganti")}
          </Button>
        </div>
        {confirming && (
          <p className="text-xs text-muted-foreground">
            {t(
              "The old code stops working for new sign-ins. Phones already linked stay linked.",
              "Kode lama tidak bisa dipakai lagi untuk masuk. HP yang sudah terhubung tetap terhubung."
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function LinkedPhonesCard() {
  const t = useT();
  const locale = useOwnerLocale();
  const formatTime = useFormatTime();
  const { activeHouseholdId } = useHousehold();
  const [phones, setPhones] = useState<LinkedPhone[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setPhones(await dataProvider.listLinkedPhones());
    } catch (err) {
      console.error(err);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, activeHouseholdId]);

  function when(iso: string): string {
    const date = new Date(iso);
    const day = date.toLocaleDateString(DATE_LOCALE[locale], { day: "numeric", month: "short" });
    return `${day} ${formatTime(date)}`;
  }

  async function remove(id: string) {
    if (confirmingId !== id) {
      setConfirmingId(id);
      return;
    }
    setRemovingId(id);
    try {
      await dataProvider.removeLinkedPhone(id);
      toast.success(t("Phone removed", "HP dihapus"));
      await load();
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't remove the phone. Try again.", "HP gagal dihapus. Coba lagi."));
    } finally {
      setRemovingId(null);
      setConfirmingId(null);
    }
  }

  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Smartphone className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm font-medium">{t("Linked staff phones", "HP staf yang terhubung")}</p>
            <p className="text-xs text-muted-foreground">
              {t(
                "Every phone that signed in with an invite link or the house code. Remove one you don't recognise.",
                "Semua HP yang masuk dengan link undangan atau kode rumah. Hapus HP yang tidak Anda kenal."
              )}
            </p>
          </div>
        </div>

        {phones === null && !failed && <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}
        {failed && (
          <p className="text-xs text-destructive">
            {t("Couldn't load the phones.", "Daftar HP gagal dimuat.")}
          </p>
        )}
        {phones?.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t("No staff phones linked yet.", "Belum ada HP staf yang terhubung.")}
          </p>
        )}

        {phones && phones.length > 0 && (
          <ul className="flex flex-col divide-y rounded-lg border">
            {phones.map((phone, index) => (
              <li key={phone.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">
                    {t("Phone", "HP")} {index + 1}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("Last sign-in", "Terakhir masuk")} {when(phone.last_seen_at)} ·{" "}
                    {t("linked", "terhubung")} {when(phone.linked_at)}
                  </span>
                </div>
                <Button
                  variant={confirmingId === phone.id ? "destructive" : "ghost"}
                  size="sm"
                  className="min-h-[40px] shrink-0"
                  onClick={() => remove(phone.id)}
                  disabled={removingId === phone.id}
                >
                  {removingId === phone.id ? <Loader2 className="animate-spin" /> : <X />}
                  {confirmingId === phone.id ? t("Remove?", "Hapus?") : t("Remove", "Hapus")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
