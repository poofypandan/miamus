"use client";

// Saves what the owner confirmed on Kakak's card, through the same
// HouseholdProvider actions as adding it by hand (plan, section 2: Kakak
// never writes to the database). RLS, the staff-removal rules, optimistic
// updates and the silent refresh therefore work exactly as for a manual
// entry. Returns an Undo that removes only what this card added, or puts a
// shopping item back as it was; a room created on the way stays (K12).

import { useCallback } from "react";
import { useHousehold } from "@/context/household-context";
import { useHouseholdLocations } from "@/hooks/use-household-locations";
import { dataProvider } from "@/lib/data";
import { stockStatus } from "@/lib/inventory";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { petRoutineRows } from "./pet-routine-rows";
import { isSaveableSuggestion, type KakakSuggestion } from "./suggestions";
import type { StockStatus } from "@/types/database";

export interface SaveResult {
  /** Resolves true when everything came back; false when a reversal failed (the rest still ran). */
  undo: () => Promise<boolean>;
  /** How many suggestions were saved (all of them, or an error was thrown). */
  saved: number;
}

export function useKakakSave() {
  const household = useHousehold();
  const { reload: reloadRooms } = useHouseholdLocations();

  return useCallback(
    async (items: KakakSuggestion[]): Promise<SaveResult> => {
      for (const item of items) {
        if (!isSaveableSuggestion(item)) throw new Error("Kakak's suggestion did not pass the phone's check");
      }
      const undos: (() => Promise<unknown>)[] = [];
      const undoAll = async (): Promise<boolean> => {
        // Newest first, and keep going if one fails: the rest still come back.
        let allBack = true;
        for (const undo of [...undos].reverse()) {
          await undo().catch((err) => {
            allBack = false;
            console.error("Kakak undo", err);
          });
        }
        return allBack;
      };
      try {
        for (const item of items) {
          switch (item.kind) {
            case "chore": {
              let locationId = item.locationId;
              if (item.newRoomName) {
                const room = await dataProvider.createHouseholdLocation(
                  item.newRoomName,
                  item.newRoomFloorId ? { parentId: item.newRoomFloorId } : undefined,
                );
                locationId = room.id;
                reloadRooms?.();
              }
              let assignedTo = item.assignedTo;
              if (item.assignToSelf) {
                const me = await dataProvider.ensureMyMemberProfile(household.activeHouseholdId);
                assignedTo = me?.id ?? null;
              }
              const task = await household.createHouseholdTask({
                title: item.title,
                category: item.category,
                assigned_to: assignedTo,
                due_date: item.dueDate,
                due_time: item.dueTime,
                recurrence: item.recurrence,
                recurrence_until: item.recurrenceUntil,
                requires_supervision: item.requiresSupervision,
                location_id: locationId,
                notes: item.notes,
                // Left out when off, as the chore form does (migrations/137).
                ...(item.remindDaysBefore != null ? { remind_days_before: item.remindDaysBefore } : {}),
              });
              undos.push(() => household.deleteHouseholdTask(task.id));
              break;
            }
            case "shopping": {
              for (const entry of item.entries) {
                if (entry.type === "item") {
                  const current = household.inventoryItems.find((i) => i.id === entry.itemId);
                  const before: StockStatus = current ? stockStatus(current) : "ok";
                  await household.setInventoryStatus(entry.itemId, entry.status);
                  undos.push(() => household.setInventoryStatus(entry.itemId, before));
                } else {
                  const alert = await household.flagLowStock({ pet_id: entry.petId, item_type: "other", note: entry.note });
                  undos.push(() => household.undoInventoryAlert(alert.id));
                }
              }
              break;
            }
            case "pet_routine": {
              // The Add routine sheet's own planner and action (Phase 173 PR B).
              const rows = petRoutineRows(item, {
                newGroupId: () => crypto.randomUUID(),
                today: formatDateLocal(new Date()),
                nowIso: new Date().toISOString(),
              });
              if (rows.length === 0) break;
              const created = await household.createSchedulesBatch(rows);
              for (const schedule of created) undos.push(() => household.deleteSchedule(schedule.id));
              break;
            }
            case "food": {
              const food = await household.addFood(
                {
                  name: item.name,
                  kept_in: item.keptIn,
                  expires_on: item.expiresOn,
                  expiry_unknown: item.expiryUnknown,
                  source: item.source,
                  from_whom: item.fromWhom,
                  return_container: item.returnContainer,
                  notes: item.notes,
                },
                null,
              );
              undos.push(() => household.removeFood(food.id));
              break;
            }
            case "ingredient": {
              // Phase 176: the two context actions, each sending only its own
              // column. Undo puts back the place and the date as they were.
              const before = household.inventoryItems.find((i) => i.id === item.itemId);
              if (!before) throw new Error("Kakak's ingredient is not in this household's list");
              const placeBefore = before.kept_in ?? null;
              const dateBefore = before.expires_on ?? null;
              if (item.keptIn) {
                await household.setIngredientPlace(item.itemId, item.keptIn);
                undos.push(() =>
                  placeBefore
                    ? household.setIngredientPlace(item.itemId, placeBefore)
                    : household.updateInventoryItem(item.itemId, { kept_in: null }),
                );
              }
              if (item.expiry !== "keep") {
                await household.setIngredientExpiry(item.itemId, item.expiry === "set" ? item.expiresOn : null);
                undos.push(() => household.setIngredientExpiry(item.itemId, dateBefore));
              }
              break;
            }
          }
        }
      } catch (error) {
        // All or nothing: take back what this card already saved.
        await undoAll();
        throw error;
      }
      return { undo: undoAll, saved: items.length };
    },
    [household, reloadRooms],
  );
}
