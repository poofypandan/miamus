"use client";

import { useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Layers, Loader2, MapPin, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useHouseholdLocations } from "@/hooks/use-household-locations";
import { dataProvider } from "@/lib/data";
import { MAX_ROOMS_AT_ONCE, filterGroups, placeGroups } from "@/lib/room-picker";
import { cn } from "@/lib/utils";
import type { HouseholdLocation } from "@/types/database";
import { useT } from "@/context/owner-locale-context";

/**
 * The chore editor's room picker (Phase 135; grouped by floor in Phase 158).
 *
 * Type to filter, or scroll the list: each floor is a heading with "Whole
 * floor" first (a chore for the whole floor) and then its rooms; rooms with
 * no floor come last. A name the household does not have yet can be made on
 * the spot ("Create '…'"), as a room with no floor.
 *
 * `multiple` (adding only): after the first room, "+ More rooms" picks
 * another, up to 12. The form then makes one chore per room, so staff tick
 * each room off with its own photo and the Rooms view stays exact.
 *
 * The options open under the input, in the form's own flow, rather than in a
 * floating popover: this lives in a scrolling dialog on a phone, where a
 * popover has to fight the dialog's focus trap and the on-screen keyboard for
 * room. Here the dialog simply scrolls.
 *
 * Owner-only by construction — it is only ever in the owner's editor, and
 * migrations/105 refuses a room from anyone else.
 */
export function LocationCombobox({
  values,
  onChange,
  multiple = false,
}: {
  values: HouseholdLocation[];
  onChange: (places: HouseholdLocation[]) => void;
  multiple?: boolean;
}) {
  const { locations, reload } = useHouseholdLocations();
  const t = useT();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [creating, setCreating] = useState(false);
  // "+ More rooms" was tapped: the input shows again under the chosen chips.
  const [addingMore, setAddingMore] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const typed = query.trim();
  const all = useMemo(() => locations ?? [], [locations]);
  const byId = useMemo(() => new Map(all.map((place) => [place.id, place])), [all]);
  // "LT2 · Lounge" for a room on a floor (migrations/129), so two rooms with
  // one name on two floors can be told apart; "LT2 · Whole floor" for a floor.
  const label = useMemo(() => {
    return (place: HouseholdLocation) => {
      if (place.kind === "floor") return `${place.name} · ${t("Whole floor", "Seluruh lantai")}`;
      const floor = place.parent_id ? byId.get(place.parent_id) : undefined;
      return floor ? `${floor.name} · ${place.name}` : place.name;
    };
  }, [byId, t]);
  const chosenIds = useMemo(() => new Set(values.map((place) => place.id)), [values]);
  const groups = useMemo(
    () => filterGroups(placeGroups(all), typed, label, chosenIds),
    [all, typed, label, chosenIds]
  );
  const hasFloors = all.some((place) => place.kind === "floor");
  const matchCount = groups.reduce((sum, group) => sum + group.places.length, 0);

  // "Create" makes a room with no floor, so only those can be an exact match.
  const exact = all.find(
    (place) =>
      place.kind !== "floor" && !place.parent_id && place.name.trim().toLowerCase() === typed.toLowerCase()
  );
  const full = values.length >= (multiple ? MAX_ROOMS_AT_ONCE : 1);
  const canCreate = typed.length > 0 && typed.length <= 60 && !exact && !full;
  const showInput = !full && (values.length === 0 || addingMore);
  const open = showInput && focused && (matchCount > 0 || canCreate);

  function choose(place: HouseholdLocation) {
    if (chosenIds.has(place.id)) return;
    onChange(multiple ? [...values, place] : [place]);
    setQuery("");
    setAddingMore(false);
    inputRef.current?.blur();
  }

  function remove(place: HouseholdLocation) {
    onChange(values.filter((chosen) => chosen.id !== place.id));
    // The last one gone: straight back to typing, since clearing is nearly
    // always to pick another.
    if (values.length === 1) requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function create() {
    if (!canCreate || creating) return;
    setCreating(true);
    try {
      const room = await dataProvider.createHouseholdLocation(typed);
      choose(room);
      // Into the shared cache, so every card can name it once the chore saves.
      void reload();
    } catch (err) {
      console.error(err);
      toast.error(t("Failed to add the room", "Ruangan gagal ditambahkan"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {values.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label={t("Chosen rooms", "Ruangan dipilih")}>
          {values.map((place) => (
            <li
              key={place.id}
              className="flex min-h-[48px] items-center gap-2 rounded-lg border bg-amber-50/60 px-3"
            >
              {place.kind === "floor" ? (
                <Layers className="size-4 shrink-0 text-amber-700" />
              ) : (
                <MapPin className="size-4 shrink-0 text-amber-700" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{label(place)}</span>
              <button
                type="button"
                onClick={() => remove(place)}
                aria-label={t(`Remove ${label(place)}`, `Hapus ${label(place)}`)}
                className="-mr-2 flex size-11 items-center justify-center rounded-lg text-muted-foreground active:bg-muted"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {multiple && values.length > 0 && !full && !addingMore && (
        <button
          type="button"
          onClick={() => {
            setAddingMore(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          className="flex min-h-[44px] items-center gap-1.5 self-start rounded-lg px-1 text-sm font-medium text-primary active:bg-muted"
        >
          <Plus className="size-4" /> {t("More rooms", "Pilih ruangan lain")}
        </button>
      )}
      {multiple && values.length > 1 && (
        <p className="text-[11px] text-muted-foreground">
          {t(
            `${values.length} chores will be added, one for each room.`,
            `${values.length} tugas akan ditambahkan, satu untuk setiap ruangan.`
          )}
        </p>
      )}

      {showInput && (
        <div className="relative">
          <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label={t("Room", "Ruangan")}
            value={query}
            maxLength={60}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              // Nothing typed and nothing picked: "+ More rooms" folds away again.
              if (!query.trim()) setAddingMore(false);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              // Enter takes the room typed exactly, else makes it — never submits
              // the dialog from under a half-typed name.
              e.preventDefault();
              if (exact && !chosenIds.has(exact.id)) choose(exact);
              else void create();
            }}
            placeholder={
              all.length > 0
                ? t("Choose or add a room", "Pilih atau tambah ruangan")
                : t("e.g. Kitchen", "mis. Dapur")
            }
            className="min-h-[48px] pl-9"
          />
        </div>
      )}

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={t("Rooms", "Ruangan")}
          className="flex max-h-72 flex-col overflow-y-auto overscroll-contain rounded-lg border bg-popover p-1 shadow-sm"
        >
          {groups.map((group) => (
            <div key={group.floor?.id ?? "no-floor"} role="group" aria-label={group.floor?.name}>
              {hasFloors && (
                <p className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {group.floor ? group.floor.name : t("No floor yet", "Belum ada lantai")}
                </p>
              )}
              {group.places.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  // mousedown, not click: the input's blur would close the list
                  // before a click could land.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(place)}
                  className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-2.5 text-left text-sm active:bg-muted"
                >
                  {place.kind === "floor" ? (
                    <>
                      <Layers className="size-3.5 shrink-0 text-amber-700" />
                      <span className="truncate font-medium">{t("Whole floor", "Seluruh lantai")}</span>
                    </>
                  ) : (
                    <>
                      <MapPin className="size-3.5 shrink-0 text-amber-700" />
                      <span className="truncate">{place.name}</span>
                    </>
                  )}
                </button>
              ))}
            </div>
          ))}
          {canCreate && (
            <button
              type="button"
              role="option"
              aria-selected={false}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void create()}
              disabled={creating}
              className={cn(
                "flex min-h-[44px] w-full items-center gap-2 rounded-md px-2.5 text-left text-sm font-medium text-primary active:bg-muted",
                matchCount > 0 && "border-t"
              )}
            >
              {creating ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin" />
              ) : (
                <Plus className="size-3.5 shrink-0" />
              )}
              <span className="truncate">{t(`Create “${typed}”`, `Buat “${typed}”`)}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
