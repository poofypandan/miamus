"use client";

import { MapPin } from "lucide-react";
import { useHouseholdLocations } from "@/hooks/use-household-locations";
import { outerRoomOf, placeMap } from "@/lib/places";
import { placeGroups } from "@/lib/room-picker";
import type { OwnerLocale } from "@/lib/owner-locale";

/**
 * Which room a repair is in (Phase 159): the phone's own picker, with the
 * rooms grouped under their floor and each floor's "Whole floor" first.
 * Native on purpose: a staff member reporting a leak wants the system list
 * they know, and it needs no room to open inside a sheet. Picking only —
 * new rooms are made by owners in the chore form or Household → Rooms.
 */
export function RoomSelect({
  value,
  onChange,
  locale,
  id,
}: {
  value: string | null;
  onChange: (locationId: string | null) => void;
  locale: OwnerLocale;
  id?: string;
}) {
  const { locations } = useHouseholdLocations();
  const ind = locale === "id";
  const groups = placeGroups(locations ?? []);
  const byId = placeMap(locations ?? []);
  // A room inside reads with its room ("GB1 · Bathroom", Phase 168): a native
  // list can't indent, and three bedrooms may each have a "Bathroom".
  const roomName = (place: (typeof groups)[number]["places"][number]) => {
    const outer = outerRoomOf(place, byId);
    return outer ? `${outer.name} · ${place.name}` : place.name;
  };
  const hasFloors = groups.some((g) => g.floor);

  return (
    <div className="relative">
      <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="min-h-[48px] w-full appearance-none rounded-lg border bg-background pr-3 pl-9 text-sm"
      >
        <option value="">{ind ? "Pilih ruangan" : "Choose a room"}</option>
        {groups.map((group) =>
          group.floor ? (
            <optgroup key={group.floor.id} label={group.floor.name}>
              {group.places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.kind === "floor"
                    ? `${place.name} · ${ind ? "Seluruh lantai" : "Whole floor"}`
                    : `${group.floor!.name} · ${roomName(place)}`}
                </option>
              ))}
            </optgroup>
          ) : hasFloors ? (
            <optgroup key="no-floor" label={ind ? "Belum ada lantai" : "No floor yet"}>
              {group.places.map((place) => (
                <option key={place.id} value={place.id}>
                  {roomName(place)}
                </option>
              ))}
            </optgroup>
          ) : (
            group.places.map((place) => (
              <option key={place.id} value={place.id}>
                {roomName(place)}
              </option>
            ))
          )
        )}
      </select>
    </div>
  );
}
