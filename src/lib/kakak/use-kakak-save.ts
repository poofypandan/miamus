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
import { reloadStaffProfiles } from "@/hooks/use-staff-profiles";
import { dataProvider } from "@/lib/data";
import { stockStatus } from "@/lib/inventory";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { hiddenAreasOf, withAreas, type StaffArea } from "@/lib/staff-areas";
import { petRoutineRows } from "./pet-routine-rows";
import { isSaveableSuggestion, type KakakSuggestion } from "./suggestions";
import type { StockStatus } from "@/types/database";

export interface SaveResult {
  /** Resolves true when everything came back; false when a reversal failed (the rest still ran). */
  undo: () => Promise<boolean>;
  /** How many suggestions were saved (all of them, or an error was thrown). */
  saved: number;
}

/**
 * What a staff member has switched off right now, read fresh from the
 * roster rather than from what Kakak read: another owner may have changed it
 * since. Someone removed, or an owner's row (never limited), is refused.
 */
async function currentHiddenAreas(staffId: string): Promise<StaffArea[]> {
  const person = (await dataProvider.listStaffProfiles()).find((p) => p.id === staffId && !p.archived_at);
  if (!person) throw new Error("Kakak's staff member is not on this household's roster");
  if (person.user_id) throw new Error("Owners always see everything");
  return hiddenAreasOf(person);
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
              // The amount first (2026-11-14): buying takes an Out item back
              // in stock, so a date given with it is kept (migrations/154).
              // Each mode is the action its screen uses by hand.
              const amount = item.amount ?? null;
              if (amount) {
                const tracked = before.track_amount === true;
                if (amount.mode === "start") {
                  // Its amount wasn't kept: start, as Track amount does.
                  if (tracked) throw new Error("Kakak's ingredient is tracked now: its amount changed meanwhile");
                  const statusBefore = stockStatus(before);
                  await household.setTrackAmount(item.itemId, { track: true, unit: amount.unit, quantity: amount.value, lowAt: 0 });
                  // Undo, in one write: not counted again, with everything
                  // the count had touched as it was. An item counted once
                  // before keeps its unit, amount, low level and usual
                  // purchase for the next Track amount (Codex, PR #144), and
                  // counting at an amount had made it Enough.
                  //
                  // One thing can't come back: the database stamps "counted
                  // at" when counting starts and takes no value for it from a
                  // phone (migrations/148). So an item that had never been
                  // counted goes back with no amount, not with a count from
                  // before amounts existed: with the stamp set, the next
                  // Track amount would start from that old number as if
                  // someone had chosen it (kitchen-units startingAmount, D14).
                  undos.push(() =>
                    household.updateInventoryItem(item.itemId, {
                      track_amount: false,
                      unit: before.unit,
                      quantity: before.amount_set_at ? before.quantity : 0,
                      min_threshold: before.min_threshold,
                      last_bought_amount: before.last_bought_amount ?? null,
                      to_buy_amount: before.to_buy_amount ?? null,
                      stock_status: statusBefore,
                    }),
                  );
                } else {
                  // The card's numbers were worked out in the item's unit as it was read.
                  if (!tracked || before.unit !== amount.unit) {
                    throw new Error("Kakak's ingredient is counted differently now: its amount changed meanwhile");
                  }
                  if (amount.mode === "add") {
                    await household.recordPurchase(item.itemId, amount.value);
                    undos.push(() => household.undoPurchase(before, amount.value));
                  } else {
                    // What is there now. A new amount settles the status
                    // again (migrations/148), so Undo also puts back a
                    // Running low someone had tapped (Codex, PR #144).
                    const statusBefore = stockStatus(before);
                    await household.setInventoryAmount(item.itemId, amount.value);
                    undos.push(async () => {
                      const back = await household.setInventoryAmount(item.itemId, before.quantity);
                      if (stockStatus(back) !== statusBefore) await household.setInventoryStatus(item.itemId, statusBefore);
                    });
                  }
                }
              }
              if (item.keptIn) {
                await household.setIngredientPlace(item.itemId, item.keptIn);
                undos.push(() =>
                  placeBefore
                    ? household.setIngredientPlace(item.itemId, placeBefore)
                    : household.updateInventoryItem(item.itemId, { kept_in: null }),
                );
              }
              if (item.expiry !== "keep") {
                const saved = await household.setIngredientExpiry(item.itemId, item.expiry === "set" ? item.expiresOn : null);
                undos.push(() => household.setIngredientExpiry(item.itemId, dateBefore));
                // An item marked Out keeps no date: the database clears it
                // (migrations/154). Never report a date as saved that wasn't.
                if ((saved.expires_on ?? null) !== item.expiresOn) {
                  throw new Error("The ingredient's date was not kept (it is marked Out)");
                }
              }
              break;
            }
            case "staff_areas": {
              // Phase 178: the owner's switches' own path, on top of the
              // person's list as it is now, so an area the card doesn't name
              // stays as it is. Undo reverses only what this card changed,
              // again on top of the latest list, as the switches' Undo does.
              const current = await currentHiddenAreas(item.staffId);
              const shown = item.show.filter((area) => current.includes(area));
              const hidden = item.hide.filter((area) => !current.includes(area));
              if (shown.length + hidden.length === 0) break; // already so
              await dataProvider.setStaffHiddenAreas(item.staffId, withAreas(current, item.show, item.hide));
              undos.push(async () => {
                const latest = await currentHiddenAreas(item.staffId);
                await dataProvider.setStaffHiddenAreas(item.staffId, withAreas(latest, hidden, shown));
                void reloadStaffProfiles();
              });
              void reloadStaffProfiles();
              break;
            }
            case "new_ingredient": {
              // As Add ingredient saves it (inventory-item-form.tsx): the item
              // with neutral counts, then, with an amount, tracked at it.
              const added = await household.addInventoryItem({
                scope: "home",
                name: item.name,
                category: item.category,
                photo_url: null,
                quantity: 0,
                unit: "pcs",
                min_threshold: 0,
                audit_frequency_days: 30,
                kept_in: item.keptIn,
                expires_on: item.expiresOn,
              });
              undos.push(() => household.removeInventoryItem(added.id));
              if (item.amount) {
                await household.setTrackAmount(added.id, { track: true, unit: item.amount.unit, quantity: item.amount.value, lowAt: 0 });
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
