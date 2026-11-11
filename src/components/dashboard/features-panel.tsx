"use client";

import { useState, type ComponentType } from "react";
import { toast } from "sonner";
import { CookingPot, Loader2, PawPrint, ReceiptText, Scale, Wrench } from "lucide-react";
import { useHousehold } from "@/context/household-context";
import { useT, type Translate } from "@/context/owner-locale-context";
import { useHouseholdProfile } from "@/hooks/use-household-profile";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { useRepairs } from "@/hooks/use-repairs";
import type { Feature } from "@/lib/features";
import { cn } from "@/lib/utils";

/**
 * Household → Features (Phase 171 PR A, D3–D6; it replaced "Who lives
 * here"). One plain line per row, grouped Home · Kitchen · Pets. Only
 * modules that exist have a row (D4); the PR A rows start on, later ones
 * (Kitchen amounts, Phase 170) join off.
 *
 * Off hides, never deletes (D6): at once, no reload, with a toast and
 * Undo. Pets keeps Phase 162's rule (archive pets first), here and in the
 * database (migrations/133).
 *
 * Owner-facing: English or Bahasa Indonesia.
 */
type Row = {
  key: Feature | "pets";
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: (t: Translate) => string;
  line: (t: Translate) => string;
};

const GROUPS: { title: (t: Translate) => string; rows: Row[] }[] = [
  {
    title: (t) => t("Home", "Rumah"),
    rows: [
      {
        key: "repairs",
        icon: Wrench,
        label: (t) => t("Repairs", "Perbaikan"),
        line: (t) =>
          t(
            "Staff report what's broken with a photo; you plan the fix.",
            "Staf melaporkan yang rusak dengan foto; Anda atur perbaikannya."
          ),
      },
      {
        key: "bills",
        icon: ReceiptText,
        label: (t) => t("Bills and upkeep", "Tagihan dan perawatan"),
        line: (t) =>
          t(
            "Reminders for electricity, water, PBB, AC service and the like.",
            "Pengingat listrik, air, PBB, servis AC dan lainnya."
          ),
      },
    ],
  },
  {
    title: (t) => t("Kitchen", "Dapur"),
    rows: [
      {
        key: "food",
        icon: CookingPot,
        label: (t) => t("Food at home", "Makanan di rumah"),
        line: (t) =>
          t(
            "Leftovers and food from others, where it's kept and until when.",
            "Sisa masakan dan makanan dari orang, di mana disimpan dan sampai kapan."
          ),
      },
      {
        // Phase 170 PR A: the first feature that joins off (171 D4); on for
        // the households that existed when migrations/148 ran. Recipes
        // (PR B, migrations/151) belong to it too: the Menu pill.
        key: "kitchen",
        icon: Scale,
        label: (t) => t("Kitchen amounts and recipes", "Jumlah bahan dan resep"),
        line: (t) =>
          t(
            "Exact amounts for the items you choose, such as 1.2 kg of rice left, and recipes your staff can read in Bahasa Indonesia.",
            "Jumlah pasti untuk barang yang Anda pilih, misalnya sisa beras 1,2 kg, dan resep yang bisa dibaca staf dalam Bahasa Indonesia."
          ),
      },
    ],
  },
  {
    title: (t) => t("Pets", "Hewan"),
    rows: [
      {
        key: "pets",
        icon: PawPrint,
        label: (t) => t("Pets", "Hewan"),
        line: (t) =>
          t("Routines, meals, medicine, vet visits and photos.", "Rutinitas, makan, obat, dokter hewan dan foto."),
      },
    ],
  },
];

export function FeaturesPanel() {
  const t = useT();
  const { pets } = useHousehold();
  const { petsOn, setHasPets } = useHouseholdProfile();
  const features = useHouseholdFeatures();
  const { repairs } = useRepairs();
  const [busy, setBusy] = useState<Row["key"] | null>(null);
  // Live pets only: `pets` already leaves archived ones out.
  const livePets = pets.length;
  const petsBlocked = petsOn && livePets > 0;
  const openRepairs = repairs.filter((r) => r.status === "reported" || r.status === "open").length;

  const isOn = (key: Row["key"]) => (key === "pets" ? petsOn : features[key]);

  async function save(key: Row["key"], on: boolean): Promise<boolean> {
    if (key === "pets") {
      const result = await setHasPets(on);
      if (!result.ok && result.reason === "has_live_pets") {
        toast.error(t("Archive your pets in Pets first.", "Arsipkan dulu hewan di tab Hewan."));
        return false;
      }
      if (!result.ok) toast.error(t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
      return result.ok;
    }
    const result = await features.setFeature(key, on);
    if (!result.ok) toast.error(t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
    return result.ok;
  }

  async function toggle(row: Row) {
    if (busy || (row.key === "pets" && petsBlocked)) return;
    const next = !isOn(row.key);
    setBusy(row.key);
    const saved = await save(row.key, next);
    setBusy(null);
    if (!saved) return;
    const name = row.label(t);
    toast.success(next ? t(`${name} is on`, `${name} aktif`) : t(`${name} is off`, `${name} dimatikan`), {
      action: {
        label: t("Undo", "Batalkan"),
        onClick: () => {
          void save(row.key, !next);
        },
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-gray-900">{t("Features", "Fitur")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Turn on what your home needs. Turning something off hides it; nothing is deleted.",
            "Nyalakan yang dibutuhkan rumah Anda. Kalau dimatikan, fitur hanya disembunyikan; tidak ada yang dihapus."
          )}
        </p>
      </div>

      {GROUPS.map((group) => (
        <section key={group.title(t)} className="flex flex-col gap-2">
          <h3 className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {group.title(t)}
          </h3>
          <div className="overflow-hidden rounded-xl border bg-card">
            {group.rows.map((row, index) => {
              const on = isOn(row.key);
              const blocked = row.key === "pets" && petsBlocked;
              const Icon = row.icon;
              return (
                <div key={row.key} className={cn(index > 0 && "border-t")}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-disabled={blocked || undefined}
                    aria-label={row.label(t)}
                    onClick={() => void toggle(row)}
                    disabled={busy !== null}
                    className="flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left active:bg-muted"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-white text-gray-900">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium text-gray-900">{row.label(t)}</span>
                      <span className="text-xs text-muted-foreground">{row.line(t)}</span>
                    </span>
                    {busy === row.key ? (
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    ) : (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                          on ? "bg-primary" : "bg-slate-300",
                          blocked && "opacity-60"
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform",
                            on ? "translate-x-[22px]" : "translate-x-0.5"
                          )}
                        />
                      </span>
                    )}
                  </button>
                  {/* What stays when it's off with open work (D6). */}
                  {row.key === "repairs" && !on && openRepairs > 0 && (
                    <p className="mx-3 mb-3 rounded-lg bg-muted px-3 py-2 text-xs text-gray-700">
                      {t(
                        `${openRepairs} open ${openRepairs === 1 ? "repair stays" : "repairs stay"} saved. Staff can't report new ones while this is off.`,
                        `${openRepairs} perbaikan yang belum selesai tetap tersimpan. Staf tidak bisa melapor yang baru selama fitur ini mati.`
                      )}
                    </p>
                  )}
                  {blocked && (
                    <p className="mx-3 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {t(
                        `You have ${livePets} ${livePets === 1 ? "pet" : "pets"} in Miamus. Archive them in Pets first; their history stays.`,
                        `Ada ${livePets} hewan di Miamus. Arsipkan dulu di tab Hewan; riwayatnya tetap tersimpan.`
                      )}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p className="px-1 text-xs text-muted-foreground">
        {t(
          "More features appear here, switched off, as Miamus adds them.",
          "Fitur baru muncul di sini dalam keadaan mati saat Miamus menambahkannya."
        )}
      </p>
    </div>
  );
}
