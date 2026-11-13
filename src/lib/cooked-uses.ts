import { applyAmountRules, clean, convertAmount } from "./kitchen-units";
import type { CookedUse, InventoryItem, InventoryUnit, MenuDish } from "../types/database";

/**
 * What cooking took off stock, and changing it the same day (Phase 177,
 * docs/phase-177-cooking-corrections-plan.md section 6; migrations/156).
 *
 * The twins of cook_menu_dish, uncook_menu_dish and change_cooked_uses, for
 * the demo data (mock-provider) and the browser tests' stub
 * (tests/e2e/stub-backend.ts), so there is one copy to keep in step with
 * the SQL. The server's answer always wins on a real database.
 *
 * Imports are relative on purpose: the browser tests' stub loads this file
 * outside the Next.js build.
 */

/** A refusal by name, as the server raises it (the phone matches on the name). */
export type CookingRefusal =
  | "already_cooked"
  | "not_cooked"
  | "too_late"
  | "changed_elsewhere"
  | "bad_uses"
  | "bad_amount"
  | "unit_mismatch"
  | "item_not_tracked";

export class CookingRuleError extends Error {
  constructor(readonly code: CookingRefusal) {
    super(code);
    this.name = "CookingRuleError";
  }
}

const REFUSALS: readonly CookingRefusal[] = [
  "already_cooked",
  "not_cooked",
  "too_late",
  "changed_elsewhere",
  "bad_uses",
  "bad_amount",
  "unit_mismatch",
  "item_not_tracked",
];

/** The refusal a server error names, if any (PostgREST passes the exception's text as the message). */
export function cookingRefusal(message: string | null | undefined): CookingRefusal | null {
  if (!message) return null;
  return REFUSALS.find((code) => new RegExp(`\\b${code}\\b`).test(message)) ?? null;
}

/** The server refuses a change this long after cooked_at (the screen offers it only that day). */
export const CHANGE_WINDOW_HOURS = 30;
const MAX_LINES = 200;
const MAX_AMOUNT = 100_000;

/** What the person said was used (an entry from before 156 has only `amount`). */
export function saidOf(use: Pick<CookedUse, "amount" | "said">): number {
  return use.said ?? use.amount;
}

/** An entry unticked in a change (said 0) reads as "not used" everywhere. */
export function wasUsed(use: Pick<CookedUse, "amount" | "said">): boolean {
  return saidOf(use) > 0;
}

interface Line {
  amount: number;
  unit: InventoryUnit | null;
  planned: number | null;
}

/** p_uses checked and summed per item, as the SQL does (bad_uses, bad_amount, unit_mismatch). */
function groupUses(uses: unknown): Map<string, Line> {
  if (!Array.isArray(uses) || uses.length > MAX_LINES) throw new CookingRuleError("bad_uses");
  const lines = new Map<string, Line & { units: Set<string>; allPlanned: boolean }>();
  for (const raw of uses as Partial<CookedUse>[]) {
    const amount = raw?.amount;
    const planned = raw?.planned ?? null;
    if (!raw?.item_id || typeof amount !== "number" || !(amount > 0) || amount > MAX_AMOUNT) {
      throw new CookingRuleError("bad_amount");
    }
    if (planned !== null && (!(planned > 0) || planned > MAX_AMOUNT)) throw new CookingRuleError("bad_amount");
    const existing = lines.get(raw.item_id);
    if (existing) {
      existing.amount = clean(existing.amount + amount);
      existing.units.add(raw.unit ?? "");
      existing.allPlanned = existing.allPlanned && planned !== null;
      existing.planned = existing.allPlanned ? clean((existing.planned ?? 0) + (planned ?? 0)) : null;
    } else {
      lines.set(raw.item_id, {
        amount,
        unit: raw.unit ?? null,
        planned,
        units: new Set([raw.unit ?? ""]),
        allPlanned: planned !== null,
      });
    }
  }
  const out = new Map<string, Line>();
  for (const [id, line] of lines) {
    if (line.amount > MAX_AMOUNT || (line.planned !== null && line.planned > MAX_AMOUNT)) throw new CookingRuleError("bad_amount");
    if (line.units.size > 1) throw new CookingRuleError("unit_mismatch");
    out.set(id, { amount: line.amount, unit: line.unit, planned: line.planned });
  }
  return out;
}

/** An amount in the item's unit now; null when the units don't convert. */
function inUnit(value: number, from: InventoryUnit | null | undefined, item: InventoryItem): number | null {
  return from ? convertAmount(value, from, item.unit) : value;
}

function entryOf(
  item: InventoryItem,
  amount: number,
  said: number,
  short: number,
  planned: number | null,
  clearedDate: string | null
): CookedUse {
  const entry: CookedUse = { item_id: item.id, amount: clean(amount), unit: item.unit, said: clean(said) };
  if (short > 0) entry.short = clean(short);
  if (planned !== null) entry.planned = clean(planned);
  if (clearedDate) entry.cleared_date = clearedDate;
  return entry;
}

function sortedIds(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort();
}

/**
 * cook_menu_dish: every line comes off a tracked item (floored at 0), with
 * an entry for every line (also when nothing was there), `said`, `short`,
 * `planned`, and `cleared_date` when it emptied a dated item. `items` holds
 * every item a line named, as the server returns them.
 */
export function applyCook(
  dish: MenuDish,
  uses: unknown,
  items: readonly InventoryItem[],
  staffId: string | null,
  now: Date = new Date()
): { dish: MenuDish; items: InventoryItem[] } {
  if (dish.cooked_at) throw new CookingRuleError("already_cooked");
  const lines = groupUses(uses);
  const took: CookedUse[] = [];
  const changed: InventoryItem[] = [];
  for (const id of sortedIds(lines.keys())) {
    const line = lines.get(id)!;
    const before = items.find((i) => i.id === id);
    if (!before || before.track_amount !== true) throw new CookingRuleError("item_not_tracked");
    const amount = inUnit(line.amount, line.unit, before);
    if (amount === null) throw new CookingRuleError("unit_mismatch");
    const planned = line.planned === null ? null : inUnit(line.planned, line.unit, before);
    const taken = Math.max(Math.min(before.quantity, amount), 0);
    let after = before;
    if (taken > 0) {
      after = applyAmountRules(before, { ...before, quantity: clean(Math.max(before.quantity - amount, 0)), amount_set_by: staffId }, now);
    }
    const cleared = before.expires_on && !after.expires_on ? before.expires_on : null;
    took.push(entryOf(after, taken, amount, clean(amount - taken), planned, cleared));
    changed.push(after);
  }
  const at = now.toISOString();
  return { dish: { ...dish, cooked_at: at, cooked_by: staffId, cooked_uses: took, updated_at: at }, items: changed };
}

/**
 * uncook_menu_dish: puts back what each entry says came off (amount 0 has
 * nothing), converted to the item's unit now; an item whose unit no longer
 * converts is skipped and listed. A cleared date goes back if the item has
 * no date by then. A dish that isn't cooked is returned as it is.
 */
export function applyUncook(
  dish: MenuDish,
  items: readonly InventoryItem[],
  now: Date = new Date()
): { dish: MenuDish; items: InventoryItem[]; skipped: CookedUse[] } {
  if (!dish.cooked_at) return { dish, items: [], skipped: [] };
  const groups = new Map<string, { item_id: string; unit: InventoryUnit | null; amount: number; cleared: string | null }>();
  for (const use of dish.cooked_uses ?? []) {
    const key = `${use.item_id}|${use.unit ?? ""}`;
    const group = groups.get(key) ?? { item_id: use.item_id, unit: use.unit ?? null, amount: 0, cleared: null };
    group.amount = clean(group.amount + use.amount);
    if (use.cleared_date && (!group.cleared || use.cleared_date < group.cleared)) group.cleared = use.cleared_date;
    groups.set(key, group);
  }
  const changed: InventoryItem[] = [];
  const skipped: CookedUse[] = [];
  const working = [...items];
  for (const key of sortedIds(groups.keys())) {
    const group = groups.get(key)!;
    if (!(group.amount > 0)) continue;
    const at = working.findIndex((i) => i.id === group.item_id);
    const before = working[at];
    if (!before || before.track_amount !== true) continue;
    const back = inUnit(group.amount, group.unit, before);
    if (back === null) {
      skipped.push({ item_id: group.item_id, amount: group.amount, unit: group.unit });
      continue;
    }
    const after = applyAmountRules(
      before,
      { ...before, quantity: clean(before.quantity + back), expires_on: before.expires_on ?? group.cleared, amount_set_by: dish.cooked_by },
      now
    );
    working[at] = after;
    changed.push(after);
  }
  const stamp = now.toISOString();
  return { dish: { ...dish, cooked_at: null, cooked_by: null, cooked_uses: null, updated_at: stamp }, items: changed, skipped };
}

/** jsonb equality for a cooked_uses list: same entries, same order, keys in any order. */
function sameList(a: readonly CookedUse[], b: readonly CookedUse[]): boolean {
  const canon = (list: readonly CookedUse[]) =>
    JSON.stringify(
      list.map((entry) =>
        Object.fromEntries(
          Object.entries(entry)
            .filter(([, v]) => v !== undefined)
            .sort(([x], [y]) => x.localeCompare(y))
        )
      )
    );
  return canon(a) === canon(b);
}

/**
 * change_cooked_uses: `uses` is the whole new list (an unticked ingredient
 * is not in it); only the difference reaches the stock. Per item, in the
 * item's unit now:
 *
 *   took = the old amount, saidBefore = the old said (else amount),
 *   short = the old short (else 0), want = the new amount (0 when absent).
 *   want = saidBefore: not written, the entry stays exactly as it is.
 *   Otherwise target = max(want - short, 0) is what should be off stock:
 *     less than took: the rest goes back, with a cleared date if the item
 *       has none (the key is dropped);
 *     more: what's there comes off, never below 0; an item emptied that
 *       way that had a date gets cleared_date.
 *   The entry keeps said = want (0 when unticked: kept, so short is never
 *   lost), short (a new entry: want - amount), planned (the old, else sent).
 *
 * An item that is gone, untracked, or whose unit no longer converts: refused
 * if `uses` names it, else its entry is kept as it is. `was` is the list as
 * the phone read it (changed_elsewhere when it differs); null or undefined
 * skips the check. `items` holds the items written.
 */
export function applyUsesChange(
  dish: MenuDish,
  uses: unknown,
  items: readonly InventoryItem[],
  staffId: string | null,
  now: Date = new Date(),
  was?: readonly CookedUse[] | null
): { dish: MenuDish; items: InventoryItem[] } {
  if (!dish.cooked_at) throw new CookingRuleError("not_cooked");
  if (now.getTime() - new Date(dish.cooked_at).getTime() > CHANGE_WINDOW_HOURS * 3_600_000) {
    throw new CookingRuleError("too_late");
  }
  const old = dish.cooked_uses ?? [];
  if (was !== undefined && was !== null && !sameList(was, old)) throw new CookingRuleError("changed_elsewhere");
  const lines = groupUses(uses);
  const result: CookedUse[] = [];
  const changed: InventoryItem[] = [];
  for (const id of sortedIds([...old.map((u) => u.item_id), ...lines.keys()])) {
    const line = lines.get(id) ?? null;
    const entries = old.filter((u) => u.item_id === id);
    const before = items.find((i) => i.id === id);
    if (!before || before.track_amount !== true) {
      if (line) throw new CookingRuleError("item_not_tracked");
      result.push(...entries);
      continue;
    }
    const conv = (value: number, unit: InventoryUnit | null | undefined) => inUnit(value, unit ?? before.unit, before);
    if (entries.some((u) => conv(1, u.unit) === null)) {
      if (line) throw new CookingRuleError("unit_mismatch");
      result.push(...entries);
      continue;
    }
    let want = 0;
    if (line) {
      const converted = inUnit(line.amount, line.unit, before);
      if (converted === null) throw new CookingRuleError("unit_mismatch");
      want = converted;
    }
    const sum = (f: (u: CookedUse) => number) => clean(entries.reduce((acc, u) => acc + (conv(f(u), u.unit) ?? 0), 0));
    let took = sum((u) => u.amount);
    const saidBefore = sum((u) => saidOf(u));
    let short = sum((u) => u.short ?? 0);
    const oldPlanned = entries.length > 0 && entries.every((u) => u.planned != null) ? sum((u) => u.planned ?? 0) : null;

    if (entries.length > 0 && want === saidBefore) {
      result.push(...entries);
      continue;
    }

    let cleared = entries.reduce<string | null>((max, u) => (u.cleared_date && (!max || u.cleared_date > max) ? u.cleared_date : max), null);
    const target = Math.max(clean(want - short), 0);
    let after = before;
    if (target < took) {
      after = applyAmountRules(
        before,
        { ...before, quantity: clean(before.quantity + took - target), expires_on: before.expires_on ?? cleared, amount_set_by: staffId },
        now
      );
      took = target;
      cleared = null;
      changed.push(after);
    } else if (target > took) {
      const moved = Math.min(Math.max(before.quantity, 0), clean(target - took));
      if (moved > 0) {
        after = applyAmountRules(before, { ...before, quantity: clean(Math.max(before.quantity - moved, 0)), amount_set_by: staffId }, now);
        took = clean(took + moved);
        if (before.expires_on && !after.expires_on) cleared = before.expires_on;
        changed.push(after);
      }
    }
    if (entries.length === 0) short = Math.max(clean(want - took), 0);
    const sentPlanned = line?.planned == null ? null : inUnit(line.planned, line.unit, before);
    result.push(entryOf(after, took, want, short, oldPlanned ?? sentPlanned, cleared));
  }
  return { dish: { ...dish, cooked_uses: result, updated_at: now.toISOString() }, items: changed };
}
