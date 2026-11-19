// Whether a task's name already says its room, so a card can leave the room
// out (19 Nov, product changes #1 and #2): "Pel teras" in "Teras" reads the
// same twice. Pure, so it is unit-tested.

import { isTopLevelRoom, placeMap } from "@/lib/places";
import type { HouseholdLocation } from "@/types/database";

/** Lower case, no accents, words only: "Teras Depan" → ["teras", "depan"]. */
function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Every word of the room's name is a word of one of the titles (the task's
 * name, or its English gloss): "Mop the terrace" says "Terrace"; "Pel teras"
 * doesn't say "Teras depan".
 */
export function nameSaysRoom(titles: readonly (string | null | undefined)[], roomName: string): boolean {
  const roomWords = words(roomName);
  if (roomWords.length === 0) return false;
  return titles.some((title) => {
    if (!title) return false;
    const titleWords = new Set(words(title));
    return roomWords.every((word) => titleWords.has(word));
  });
}

/**
 * The same for a chore's saved place: only a room on a floor or on no floor,
 * with no spot. A room inside a room or a spot always shows, since it tells
 * one bathroom or one sink from another; so does a floor, or a place that
 * isn't known (yet).
 */
export function nameSaysPlace(
  titles: readonly (string | null | undefined)[],
  locationId: string | null | undefined,
  spot: string | null | undefined,
  locations: readonly HouseholdLocation[] | null | undefined
): boolean {
  if (!locationId || spot?.trim() || !locations) return false;
  const byId = placeMap(locations);
  const place = byId.get(locationId);
  if (!place || !isTopLevelRoom(place, byId)) return false;
  return nameSaysRoom(titles, place.name);
}
