"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ChevronRight, CornerDownRight, DoorOpen, Info, Layers, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useHouseholdLocations } from "@/hooks/use-household-locations";
import { dataProvider } from "@/lib/data";
import {
  floorOf,
  insideChoices,
  nameOutside,
  outerRoomOf,
  placeMap,
  roomsInside,
  topLevelRooms,
  withRoomsInside,
} from "@/lib/places";
import { cn } from "@/lib/utils";
import type { HouseholdLocation } from "@/types/database";

const NO_FLOOR = "";
const NOT_INSIDE = "";

/** What "Add a room" opens with: a room, a floor, or a room inside a given room. */
type Adding = { kind: "room" | "floor"; insideId?: string } | null;

/**
 * Household → Rooms (Phase 158 PR B, plan screen 5): the household's floors
 * and rooms, by hand. Add a floor or a room, rename, move a room to another
 * floor, reorder floors, delete. Deleting a room leaves its chores without a
 * room; deleting a floor moves its rooms to "No floor yet" (the database
 * renames one whose name is already taken there, migrations/129).
 *
 * Rooms inside rooms (Phase 168): a room can sit inside a room on its floor,
 * one level deep ("Inside (optional)"), and is listed under it. Deleting a
 * room moves its rooms inside out to where it was, as "GB1 Bathroom" (the
 * database does that).
 *
 * Owner-only: this is in the Household tab, and the database refuses room
 * writes from anyone but an owner (migrations/105).
 */
export function RoomsManager() {
  const t = useT();
  const { refresh } = useHousehold();
  const { locations, failed, reload } = useHouseholdLocations();
  const [editing, setEditing] = useState<HouseholdLocation | null>(null);
  const [adding, setAdding] = useState<Adding>(null);
  const [busy, setBusy] = useState(false);

  const all = useMemo(() => locations ?? [], [locations]);
  const { floors, onFloor, loose } = useMemo(() => topLevelRooms(all), [all]);

  async function after() {
    await Promise.all([reload?.(), refresh({ silent: true })]);
  }

  function clashMessage(name: string, floorName: string | null, insideName: string | null = null) {
    if (insideName) {
      return t(`There's already a room called ${name} in ${insideName}.`, `Sudah ada ruangan bernama ${name} di ${insideName}.`);
    }
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
            "Floors and the rooms on them, and rooms inside rooms. Chores show their room as \"LT2 · GB1 · Bathroom\".",
            "Lantai dan ruangannya, juga ruangan di dalam ruangan. Tugas menampilkan ruangannya seperti \"LT2 · Kamar Tamu 1 · Kamar Mandi\"."
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
          <RoomList rooms={onFloor(floor.id)} all={all} onOpen={setEditing} empty={t("No rooms on this floor yet.", "Belum ada ruangan di lantai ini.")} />
        </section>
      ))}

      {(loose.length > 0 || floors.length === 0) && (
        <section className="flex flex-col gap-1.5" aria-label={floors.length ? t("No floor yet", "Belum ada lantai") : t("Rooms", "Ruangan")}>
          {floors.length > 0 && <h3 className="px-1 text-sm font-semibold text-gray-900">{t("No floor yet", "Belum ada lantai")}</h3>}
          <RoomList rooms={loose} all={all} onOpen={setEditing} empty={t("No rooms yet.", "Belum ada ruangan.")} />
        </section>
      )}

      <div className="flex flex-col gap-2">
        <Button variant="outline" className="min-h-[48px]" onClick={() => setAdding({ kind: "room" })}>
          <Plus /> {t("Add a room", "Tambah ruangan")}
        </Button>
        <Button variant="outline" className="min-h-[48px]" onClick={() => setAdding({ kind: "floor" })}>
          <Plus /> {t("Add a floor", "Tambah lantai")}
        </Button>
      </div>

      <PlaceSheet
        key={editing?.id ?? (adding ? `${adding.kind}-${adding.insideId ?? ""}` : "closed")}
        open={editing !== null || adding !== null}
        place={editing}
        adding={adding}
        floors={floors}
        locations={all}
        onClose={() => {
          setEditing(null);
          setAdding(null);
        }}
        onAddInside={(room) => {
          setEditing(null);
          setAdding({ kind: "room", insideId: room.id });
        }}
        after={after}
        clashMessage={clashMessage}
        nextFloorOrder={floors.length ? Math.max(...floors.map((f) => f.sort_order ?? 0)) + 1 : 1}
      />
    </div>
  );
}

function RoomList({
  rooms,
  all,
  onOpen,
  empty,
}: {
  rooms: HouseholdLocation[];
  all: HouseholdLocation[];
  onOpen: (room: HouseholdLocation) => void;
  empty: string;
}) {
  const t = useT();
  if (rooms.length === 0) return <p className="px-1 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {withRoomsInside(rooms, all).map(({ place: room, depth }) => {
        const inside = depth === 0 ? roomsInside(all, room.id).length : 0;
        return (
          <button
            key={room.id}
            type="button"
            onClick={() => onOpen(room)}
            className={cn(
              "flex min-h-[48px] w-full items-center gap-2 border-t px-3 text-left text-sm first:border-t-0 active:bg-muted",
              depth === 1 && "pl-6"
            )}
          >
            {depth === 1 && <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
            <span className={cn("min-w-0 flex-1 truncate", depth === 1 && "text-gray-700")}>{room.name}</span>
            {inside > 0 && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {t(`${inside} inside`, `${inside} di dalamnya`)}
              </span>
            )}
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        );
      })}
    </div>
  );
}

/** Names offered for a room inside, one tap each: the usual ones in a bedroom. */
const QUICK_INSIDE: { en: string; id: string }[] = [
  { en: "Bathroom", id: "Kamar mandi" },
  { en: "Walk-in closet", id: "Ruang ganti" },
  { en: "Balcony", id: "Balkon" },
];

function PlaceSheet({
  open,
  place,
  adding,
  floors,
  locations,
  onClose,
  onAddInside,
  after,
  clashMessage,
  nextFloorOrder,
}: {
  open: boolean;
  place: HouseholdLocation | null;
  adding: Adding;
  floors: HouseholdLocation[];
  locations: HouseholdLocation[];
  onClose: () => void;
  onAddInside: (room: HouseholdLocation) => void;
  after: () => Promise<void>;
  clashMessage: (name: string, floorName: string | null, insideName?: string | null) => string;
  nextFloorOrder: number;
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const byId = useMemo(() => placeMap(locations), [locations]);
  const isFloor = place ? place.kind === "floor" : adding?.kind === "floor";
  const presetInside = adding?.insideId ? (byId.get(adding.insideId) ?? null) : null;
  const startOuter = place ? outerRoomOf(place, byId) : presetInside;
  const startFloor = place
    ? isFloor
      ? null
      : floorOf(place, byId)
    : presetInside
      ? floorOf(presetInside, byId)
      : null;
  const [name, setName] = useState(place?.name ?? "");
  const [floorId, setFloorId] = useState<string>(startFloor?.id ?? NO_FLOOR);
  const [insideId, setInsideId] = useState<string>(startOuter?.id ?? NOT_INSIDE);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useBackToClose(open, onClose);

  const trimmed = name.trim();
  const floorName = (id: string) => floors.find((f) => f.id === id)?.name ?? null;
  // A room's own rooms inside (only a room on a floor or no floor has any).
  const inside = place && !isFloor ? roomsInside(locations, place.id) : [];
  const choices = isFloor ? [] : insideChoices(locations, place, floorId || null);
  const outer = insideId ? (byId.get(insideId) ?? null) : null;
  const shownAs = [floorId ? floorName(floorId) : null, outer?.name, trimmed || null].filter(Boolean).join(" · ");
  const quick = QUICK_INSIDE.map((q) => (locale === "id" ? q.id : q.en)).filter(
    (label) => !inside.some((room) => room.name.trim().toLowerCase() === label.toLowerCase())
  );

  function chooseFloor(next: string) {
    setFloorId(next);
    // The rooms to be inside are the new floor's: start again from none.
    if (insideId) chooseInside(NOT_INSIDE);
  }

  function chooseInside(next: string) {
    // Taking a room out of its room: offer the longer name it would get if
    // its room were deleted ("Bathroom" → "GB1 Bathroom"), so three bedrooms'
    // bathrooms don't all become "Bathroom" on one floor.
    if (place && startOuter && !next && insideId === startOuter.id && trimmed === place.name.trim()) {
      setName(nameOutside(startOuter, place));
    }
    if (place && startOuter && next === startOuter.id && name === nameOutside(startOuter, place)) {
      setName(place.name);
    }
    setInsideId(next);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!trimmed || trimmed.length > 60 || saving) return;
    setSaving(true);
    const parent = isFloor ? null : insideId || floorId || null;
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
          ? clashMessage(trimmed, floorId ? floorName(floorId) : null, outer?.name ?? null)
          : t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi.")
      );
    } finally {
      setSaving(false);
    }
  }

  async function addInside(label: string) {
    if (!place || saving) return;
    setSaving(true);
    try {
      await dataProvider.createHouseholdLocation(label, { parentId: place.id });
      await after();
      toast.success(t(`Added ${label} inside ${place.name}`, `${label} ditambahkan di dalam ${place.name}`));
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't add the room. Try again.", "Ruangan gagal ditambahkan. Coba lagi."));
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
      : presetInside
        ? t(`Add a room inside ${presetInside.name}`, `Tambah ruangan di dalam ${presetInside.name}`)
        : t("Add a room", "Tambah ruangan");

  // What deleting a room with rooms inside does: they move out, renamed.
  const where = place ? floorOf(place, byId)?.name ?? null : null;
  const movedNames = place ? inside.map((room) => nameOutside(place, room)) : [];
  const deleteLine = !place
    ? ""
    : isFloor
      ? t(
          `Delete ${place.name}? Its rooms move to "No floor yet"; nothing else is deleted.`,
          `Hapus ${place.name}? Ruangannya pindah ke "Belum ada lantai"; tidak ada yang lain terhapus.`
        )
      : inside.length === 1
        ? where
          ? t(
              `Delete ${place.name}? Its ${inside[0].name} moves onto ${where} as ${movedNames[0]}. Chores stay.`,
              `Hapus ${place.name}? ${inside[0].name} pindah ke ${where} dengan nama ${movedNames[0]}. Tugasnya tetap ada.`
            )
          : t(
              `Delete ${place.name}? Its ${inside[0].name} stays, as ${movedNames[0]}. Chores stay.`,
              `Hapus ${place.name}? ${inside[0].name} tetap ada, dengan nama ${movedNames[0]}. Tugasnya tetap ada.`
            )
        : inside.length > 1
          ? where
            ? t(
                `Delete ${place.name}? Its ${inside.length} rooms inside move onto ${where}: ${movedNames.join(", ")}. Chores stay.`,
                `Hapus ${place.name}? ${inside.length} ruangan di dalamnya pindah ke ${where}: ${movedNames.join(", ")}. Tugasnya tetap ada.`
              )
            : t(
                `Delete ${place.name}? Its ${inside.length} rooms inside stay, as ${movedNames.join(", ")}. Chores stay.`,
                `Hapus ${place.name}? ${inside.length} ruangan di dalamnya tetap ada: ${movedNames.join(", ")}. Tugasnya tetap ada.`
              )
          : t(
              `Delete ${place.name}? Its chores stay, without a room.`,
              `Hapus ${place.name}? Tugasnya tetap ada, tanpa ruangan.`
            );

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
              placeholder={
                isFloor
                  ? t("e.g. LT2", "mis. LT2")
                  : presetInside
                    ? t("e.g. Bathroom", "mis. Kamar mandi")
                    : t("e.g. Lounge", "mis. Ruang tamu")
              }
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
                onChange={(e) => chooseFloor(e.target.value)}
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
          {/* A room that holds rooms can't go inside one: one level only. */}
          {!isFloor && inside.length === 0 && (choices.length > 0 || insideId) && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="place-inside" className="text-xs">
                {t("Inside", "Di dalam")}{" "}
                <span className="font-normal text-muted-foreground">{t("(optional)", "(opsional)")}</span>
              </Label>
              <select
                id="place-inside"
                value={insideId}
                onChange={(e) => chooseInside(e.target.value)}
                className="min-h-[48px] rounded-lg border bg-background px-3 text-sm"
              >
                <option value={NOT_INSIDE}>{t("Not inside a room", "Tidak di dalam ruangan")}</option>
                {choices.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                {t(
                  "A room inside has its own door, like a bathroom. A sink or a shower is a spot.",
                  "Ruangan di dalam punya pintu sendiri, seperti kamar mandi. Wastafel atau shower adalah bagian."
                )}
              </p>
            </div>
          )}
          {!isFloor && trimmed && (outer || floorId) && (
            <p className="text-xs text-muted-foreground">
              {t("Shown as", "Tampil sebagai")} <span className="font-medium text-gray-700">{shownAs}</span>
            </p>
          )}
          {place && !isFloor && !outer && !startOuter && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium">{t("Rooms inside", "Ruangan di dalamnya")}</p>
              {inside.length > 0 && (
                <div className="overflow-hidden rounded-lg border">
                  {inside.map((room) => (
                    <div key={room.id} className="flex min-h-[44px] items-center gap-2 border-t px-3 text-sm first:border-t-0">
                      <DoorOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{room.name}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t("Add a room inside", "Tambah ruangan di dalamnya")}</p>
              <div className="flex flex-wrap gap-1.5">
                {quick.map((label) => (
                  <Button
                    key={label}
                    type="button"
                    variant="outline"
                    className="min-h-[40px] rounded-full px-3 text-sm"
                    disabled={saving}
                    onClick={() => void addInside(label)}
                  >
                    <Plus className="size-3.5" /> {label}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[40px] rounded-full border-dashed px-3 text-sm"
                  disabled={saving}
                  onClick={() => onAddInside(place)}
                >
                  <Plus className="size-3.5" /> {t("Other name", "Nama lain")}
                </Button>
              </div>
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
                <p className="text-sm text-red-900">{deleteLine}</p>
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
