"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/context/household-context";
import { useT } from "@/context/owner-locale-context";
import { useHouseholdLocations } from "@/hooks/use-household-locations";
import { dataProvider } from "@/lib/data";
import { buildSortPlan, withMoved } from "@/lib/organise-rooms";
import type { HouseholdLocation, HouseholdTask } from "@/types/database";

const DISMISSED = "miamus.sort-rooms-dismissed";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED) === "1";
  } catch {
    return false;
  }
}

/**
 * "Sort your rooms into floors" (Phase 158 PR B, plan screen 4): a one-time
 * card in the Rooms view, owners only, shown while rooms are named floor-first
 * and there are no floors yet. It previews exactly what will change, then
 * does it in one step (organise_rooms), with Undo.
 */
export function SortRoomsCard({ locations, chores, today }: { locations: HouseholdLocation[]; chores: HouseholdTask[]; today: string }) {
  const t = useT();
  const { activeHouseholdId, refresh } = useHousehold();
  const { reload } = useHouseholdLocations();
  const [mergeParts, setMergeParts] = useState(true);
  const [linkChores, setLinkChores] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(wasDismissed);

  const sorted = useMemo(
    () => buildSortPlan(activeHouseholdId, locations, chores, today, { mergeParts, linkChores }),
    [activeHouseholdId, locations, chores, today, mergeParts, linkChores]
  );
  // The checkbox labels count what each option would do, whether or not it's ticked.
  const withAll = useMemo(
    () => buildSortPlan(activeHouseholdId, locations, chores, today, { mergeParts: true, linkChores: true }),
    [activeHouseholdId, locations, chores, today]
  );

  if (hidden) return null;
  const { preview } = sorted;
  const shown = preview.moves.slice(0, 5);

  async function afterChange() {
    await Promise.all([reload?.(), refresh({ silent: true })]);
  }

  async function sort() {
    if (busy) return;
    setBusy(true);
    try {
      const moved = await dataProvider.organiseRooms(sorted.plan);
      const undo = withMoved(sorted.undo, moved);
      await afterChange();
      toast.success(t("Rooms sorted into floors", "Ruangan sudah dikelompokkan per lantai"), {
        action: {
          label: t("Undo", "Batalkan"),
          onClick: () => {
            void dataProvider
              .organiseRooms(undo)
              .then(afterChange)
              .catch((err) => {
                console.error(err);
                toast.error(t("Couldn't undo. Try again.", "Gagal membatalkan. Coba lagi."));
              });
          },
        },
      });
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't sort the rooms. Nothing was changed.", "Ruangan gagal dikelompokkan. Tidak ada yang berubah."));
    } finally {
      setBusy(false);
    }
  }

  function notNow() {
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // Storage off: hidden for this visit only.
    }
    setHidden(true);
  }

  return (
    <section
      aria-label={t("Sort your rooms into floors", "Kelompokkan ruangan per lantai")}
      className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3"
    >
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        <Layers className="size-4 shrink-0" aria-hidden />
        {t("Sort your rooms into floors", "Kelompokkan ruangan per lantai")}
      </h3>
      <p className="text-[13px] leading-snug text-gray-700">
        {t(
          "Your room names start with a floor. Miamus can group them; the names stay as you typed them, without the floor.",
          "Nama ruangan Anda diawali lantai. Miamus bisa mengelompokkannya; nama tetap seperti yang Anda ketik, tanpa lantainya."
        )}
      </p>
      <ul className="flex flex-col divide-y rounded-lg border bg-card text-[12.5px]">
        {shown.map((move) => (
          <li key={move.from} className="flex items-center gap-2 px-3 py-1.5">
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{move.from}</span>
            <ArrowRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-[1.3] truncate font-medium text-gray-900">
              {move.room === null
                ? t(`Floor ${move.floor}`, `Lantai ${move.floor}`)
                : `${move.floor} · ${move.room}`}
            </span>
          </li>
        ))}
        {preview.moves.length > shown.length && (
          <li className="px-3 py-1.5 text-muted-foreground">
            {t(`…and ${preview.moves.length - shown.length} more`, `…dan ${preview.moves.length - shown.length} lagi`)}
          </li>
        )}
        {preview.merges.map((merge) => (
          <li key={`${merge.floor}/${merge.room}`} className="flex flex-col px-3 py-1.5">
            <span className="font-medium text-gray-900">
              {merge.floor} · {merge.room}
            </span>
            <span className="text-muted-foreground">
              {t("one room, with parts: ", "satu ruangan, dengan bagian: ")}
              {merge.parts.map((p) => p.spot).join(", ")}
            </span>
          </li>
        ))}
      </ul>
      {withAll.preview.merges.length > 0 && (
        <label className="flex items-start gap-2 text-[13px] text-gray-800">
          <input
            id="sort-merge-parts"
            type="checkbox"
            className="mt-0.5 size-4 accent-zinc-900"
            checked={mergeParts}
            onChange={(e) => setMergeParts(e.target.checked)}
          />
          <span>
            {t(
              `Make ${withAll.preview.merges.length === 1 ? "the room" : "rooms"} with parts (toilet, sink…) one room`,
              `Jadikan ruangan yang terpisah per bagian (toilet, wastafel…) satu ruangan`
            )}
          </span>
        </label>
      )}
      {withAll.preview.linked > 0 && (
        <label className="flex items-start gap-2 text-[13px] text-gray-800">
          <input
            id="sort-link-chores"
            type="checkbox"
            className="mt-0.5 size-4 accent-zinc-900"
            checked={linkChores}
            onChange={(e) => setLinkChores(e.target.checked)}
          />
          <span>
            {t(
              `Also link ${withAll.preview.linked} older ${withAll.preview.linked === 1 ? "chore" : "chores"} whose title names a room (finished ones stay as they are)`,
              `Hubungkan juga ${withAll.preview.linked} tugas lama yang judulnya menyebut ruangan (yang sudah selesai tidak diubah)`
            )}
          </span>
        </label>
      )}
      <div className="flex gap-2">
        <Button className="min-h-[44px] flex-1" onClick={() => void sort()} disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {t("Sort rooms", "Kelompokkan")}
        </Button>
        <Button variant="outline" className="min-h-[44px]" onClick={notNow} disabled={busy}>
          {t("Not now", "Nanti saja")}
        </Button>
      </div>
    </section>
  );
}
