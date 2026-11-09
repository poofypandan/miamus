"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ChevronRight, Layers, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHousehold } from "@/context/household-context";
import { useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useHouseholdLocations } from "@/hooks/use-household-locations";
import { dataProvider } from "@/lib/data";
import type { HouseholdLocation } from "@/types/database";

const NO_FLOOR = "";

const order = (a: HouseholdLocation, b: HouseholdLocation) =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/**
 * Household → Rooms (Phase 158 PR B, plan screen 5): the household's floors
 * and rooms, by hand. Add a floor or a room, rename, move a room to another
 * floor, reorder floors, delete. Deleting a room leaves its chores without a
 * room; deleting a floor moves its rooms to "No floor yet" (the database
 * renames one whose name is already taken there, migrations/129).
 *
 * Owner-only: this is in the Household tab, and the database refuses room
 * writes from anyone but an owner (migrations/105).
 */
export function RoomsManager() {
  const t = useT();
  const { refresh } = useHousehold();
  const { locations, failed, reload } = useHouseholdLocations();
  const [editing, setEditing] = useState<HouseholdLocation | null>(null);
  const [adding, setAdding] = useState<"room" | "floor" | null>(null);
  const [busy, setBusy] = useState(false);

  const floors = useMemo(() => (locations ?? []).filter((l) => l.kind === "floor").sort(order), [locations]);
  const roomsOn = (floorId: string | null) =>
    (locations ?? []).filter((l) => l.kind !== "floor" && (l.parent_id ?? null) === floorId).sort(order);
  const loose = useMemo(
    () =>
      (locations ?? [])
        .filter((l) => l.kind !== "floor" && (!l.parent_id || !floors.some((f) => f.id === l.parent_id)))
        .sort(order),
    [locations, floors]
  );

  async function after() {
    await Promise.all([reload?.(), refresh({ silent: true })]);
  }

  function clashMessage(name: string, floorName: string | null) {
    return floorName
      ? t(`There's already a room called ${name} on ${floorName}.`, `Sudah ada ruangan bernama ${name} di ${floorName}.`)
      : t(`There's already a room or floor called ${name}.`, `Sudah ada ruangan atau lantai bernama ${name}.`);
  }

  async function moveFloor(floor: HouseholdLocation, step: -1 | 1) {
    const index = floors.findIndex((f) => f.id === floor.id);
    const other = floors[index + step];
    if (!other || busy) return;
    setBusy(true);
    try {
      // Rewrite every floor's order so equal or missing numbers never tie.
      const next = [...floors];
      [next[index], next[index + step]] = [next[index + step], next[index]];
      await Promise.all(next.map((f, i) => dataProvider.updateHouseholdLocation(f.id, { sort_order: i + 1 })));
      await after();
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't reorder. Try again.", "Gagal mengubah urutan. Coba lagi."));
    } finally {
      setBusy(false);
    }
  }

  if (!locations) {
    return failed ? (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">{t("Couldn't load your rooms.", "Ruangan tidak bisa dimuat.")}</p>
        <Button variant="outline" className="min-h-[44px]" onClick={() => void reload?.()}>
          {t("Try again", "Coba lagi")}
        </Button>
      </div>
    ) : (
      <p className="text-sm text-muted-foreground" role="status">
        {t("Loading rooms…", "Memuat ruangan…")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-gray-900">{t("Rooms", "Ruangan")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Floors and the rooms on them. Chores show their room as \"LT2 · Lounge\".",
            "Lantai dan ruangan di dalamnya. Tugas menampilkan ruangannya seperti \"LT2 · Lounge\"."
          )}
        </p>
      </div>

      {floors.map((floor, index) => (
        <section key={floor.id} className="flex flex-col gap-1.5" aria-label={floor.name}>
          <div className="flex items-center gap-1 px-1">
            <button
              type="button"
              onClick={() => setEditing(floor)}
              className="flex min-h-[40px] min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-semibold text-gray-900"
            >
              <Layers className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{floor.name}</span>
            </button>
            <button
              type="button"
              aria-label={t(`Move ${floor.name} up`, `Naikkan ${floor.name}`)}
              disabled={index === 0 || busy}
              onClick={() => void moveFloor(floor, -1)}
              className="flex size-10 items-center justify-center rounded-lg text-muted-foreground active:bg-muted disabled:opacity-30"
            >
              <ArrowUp className="size-4" />
            </button>
            <button
              type="button"
              aria-label={t(`Move ${floor.name} down`, `Turunkan ${floor.name}`)}
              disabled={index === floors.length - 1 || busy}
              onClick={() => void moveFloor(floor, 1)}
              className="flex size-10 items-center justify-center rounded-lg text-muted-foreground active:bg-muted disabled:opacity-30"
            >
              <ArrowDown className="size-4" />
            </button>
          </div>
          <RoomList rooms={roomsOn(floor.id)} onOpen={setEditing} empty={t("No rooms on this floor yet.", "Belum ada ruangan di lantai ini.")} />
        </section>
      ))}

      {(loose.length > 0 || floors.length === 0) && (
        <section className="flex flex-col gap-1.5" aria-label={floors.length ? t("No floor yet", "Belum ada lantai") : t("Rooms", "Ruangan")}>
          {floors.length > 0 && <h3 className="px-1 text-sm font-semibold text-gray-900">{t("No floor yet", "Belum ada lantai")}</h3>}
          <RoomList rooms={loose} onOpen={setEditing} empty={t("No rooms yet.", "Belum ada ruangan.")} />
        </section>
      )}

      <div className="flex flex-col gap-2">
        <Button variant="outline" className="min-h-[48px]" onClick={() => setAdding("room")}>
          <Plus /> {t("Add a room", "Tambah ruangan")}
        </Button>
        <Button variant="outline" className="min-h-[48px]" onClick={() => setAdding("floor")}>
          <Plus /> {t("Add a floor", "Tambah lantai")}
        </Button>
      </div>

      <PlaceSheet
        key={editing?.id ?? adding ?? "closed"}
        open={editing !== null || adding !== null}
        place={editing}
        adding={adding}
        floors={floors}
        onClose={() => {
          setEditing(null);
          setAdding(null);
        }}
        after={after}
        clashMessage={clashMessage}
        nextFloorOrder={floors.length ? Math.max(...floors.map((f) => f.sort_order ?? 0)) + 1 : 1}
      />
    </div>
  );
}

function RoomList({ rooms, onOpen, empty }: { rooms: HouseholdLocation[]; onOpen: (room: HouseholdLocation) => void; empty: string }) {
  if (rooms.length === 0) return <p className="px-1 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {rooms.map((room) => (
        <button
          key={room.id}
          type="button"
          onClick={() => onOpen(room)}
          className="flex min-h-[48px] w-full items-center gap-2 border-t px-3 text-left text-sm first:border-t-0 active:bg-muted"
        >
          <span className="min-w-0 flex-1 truncate">{room.name}</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}

function PlaceSheet({
  open,
  place,
  adding,
  floors,
  onClose,
  after,
  clashMessage,
  nextFloorOrder,
}: {
  open: boolean;
  place: HouseholdLocation | null;
  adding: "room" | "floor" | null;
  floors: HouseholdLocation[];
  onClose: () => void;
  after: () => Promise<void>;
  clashMessage: (name: string, floorName: string | null) => string;
  nextFloorOrder: number;
}) {
  const t = useT();
  const isFloor = place ? place.kind === "floor" : adding === "floor";
  const [name, setName] = useState(place?.name ?? "");
  const [floorId, setFloorId] = useState<string>(place?.parent_id ?? NO_FLOOR);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useBackToClose(open, onClose);

  const trimmed = name.trim();
  const floorName = (id: string) => floors.find((f) => f.id === id)?.name ?? null;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!trimmed || trimmed.length > 60 || saving) return;
    setSaving(true);
    const parent = isFloor ? null : floorId || null;
    try {
      if (place) {
        await dataProvider.updateHouseholdLocation(place.id, isFloor ? { name: trimmed } : { name: trimmed, parent_id: parent });
      } else if (isFloor) {
        const floor = await dataProvider.createHouseholdLocation(trimmed, { kind: "floor" });
        await dataProvider.updateHouseholdLocation(floor.id, { sort_order: nextFloorOrder });
      } else {
        await dataProvider.createHouseholdLocation(trimmed, { parentId: parent });
      }
      await after();
      onClose();
    } catch (err) {
      console.error(err);
      const code = (err as { code?: string }).code;
      toast.error(
        code === "23505"
          ? clashMessage(trimmed, parent ? floorName(parent) : null)
          : t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi.")
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!place || saving) return;
    setSaving(true);
    try {
      await dataProvider.deleteHouseholdLocation(place.id);
      await after();
      toast.success(t(`Deleted ${place.name}`, `${place.name} dihapus`));
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't delete. Try again.", "Gagal menghapus. Coba lagi."));
    } finally {
      setSaving(false);
    }
  }

  const title = place
    ? isFloor
      ? t("Edit floor", "Ubah lantai")
      : t("Edit room", "Ubah ruangan")
    : isFloor
      ? t("Add a floor", "Tambah lantai")
      : t("Add a room", "Tambah ruangan");

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {isFloor
              ? t("A floor holds rooms, and can have chores of its own (\"Whole floor\").", "Lantai berisi ruangan, dan bisa punya tugas sendiri (\"Seluruh lantai\").")
              : t("Chores can be set for this room, or a part of it.", "Tugas bisa dibuat untuk ruangan ini, atau bagiannya.")}
          </SheetDescription>
        </SheetHeader>
        <form id="place-form" onSubmit={save} className="flex flex-col gap-4 px-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="place-name" className="text-xs">
              {isFloor ? t("Floor name", "Nama lantai") : t("Room name", "Nama ruangan")}
            </Label>
            <Input
              id="place-name"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder={isFloor ? t("e.g. LT2", "mis. LT2") : t("e.g. Lounge", "mis. Ruang tamu")}
              className="min-h-[48px]"
              autoFocus
            />
          </div>
          {!isFloor && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="place-floor" className="text-xs">
                {t("Floor", "Lantai")}
              </Label>
              <select
                id="place-floor"
                value={floorId}
                onChange={(e) => setFloorId(e.target.value)}
                className="min-h-[48px] rounded-lg border bg-background px-3 text-sm"
              >
                <option value={NO_FLOOR}>{t("No floor", "Tanpa lantai")}</option>
                {floors.map((floor) => (
                  <option key={floor.id} value={floor.id}>
                    {floor.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </form>
        <SheetFooter className="flex flex-col gap-2">
          <Button type="submit" form="place-form" className="min-h-[48px] w-full" disabled={!trimmed || saving}>
            {saving && <Loader2 className="animate-spin" />}
            {place ? t("Save", "Simpan") : t("Add", "Tambah")}
          </Button>
          {place &&
            (confirmDelete ? (
              <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-900">
                  {isFloor
                    ? t(
                        `Delete ${place.name}? Its rooms move to "No floor yet"; nothing else is deleted.`,
                        `Hapus ${place.name}? Ruangannya pindah ke "Belum ada lantai"; tidak ada yang lain terhapus.`
                      )
                    : t(
                        `Delete ${place.name}? Its chores stay, without a room.`,
                        `Hapus ${place.name}? Tugasnya tetap ada, tanpa ruangan.`
                      )}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="min-h-[44px] flex-1" onClick={() => setConfirmDelete(false)} disabled={saving}>
                    {t("Cancel", "Batal")}
                  </Button>
                  <Button variant="destructive" className="min-h-[44px] flex-1" onClick={() => void remove()} disabled={saving}>
                    <Trash2 /> {t("Delete", "Hapus")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" className="min-h-[44px] w-full text-muted-foreground" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> {isFloor ? t("Delete floor", "Hapus lantai") : t("Delete room", "Hapus ruangan")}
              </Button>
            ))}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
