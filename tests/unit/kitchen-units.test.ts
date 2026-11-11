// Kitchen amounts (Phase 170 PR A, migrations/148): units agree with the
// database's check, conversions are exact or refused, steps, parsing,
// formatting, the status rule, the grey "about … ago" line, the old-count
// hint (D14), the rules mirror, and the Plus list.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STOCK_UNITS,
  agoLabel,
  amountLine,
  amountStep,
  applyAmountRules,
  convertAmount,
  deriveStatus,
  formatAmount,
  isIngredient,
  isStaleAmount,
  lastBoughtInUnit,
  oldCountHint,
  parseAmount,
  startingAmount,
  undoPurchasePatch,
} from "@/lib/kitchen-units";
import { amountsOn, ingredientsUnderFood } from "@/lib/features";
import { PLANS_ENFORCED, PLUS_FEATURES, planFor } from "@/lib/plans";
import type { InventoryItem } from "@/types/database";

const migration = readFileSync(join(__dirname, "../../supabase/migrations/148_kitchen_amounts.sql"), "utf8");
const NOW = new Date("2026-11-11T10:00:00+07:00");

function item(over: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "i1",
    household_id: "h1",
    scope: "home",
    name: "Beras",
    category: "pantry",
    quantity: 0,
    unit: "kg",
    min_threshold: 0,
    photo_url: null,
    created_at: "2026-10-01T00:00:00Z",
    variant: null,
    audit_frequency_days: 30,
    last_audited_at: null,
    notes: null,
    stock_status: "ok",
    track_amount: false,
    amount_set_at: null,
    amount_set_by: null,
    last_bought_amount: null,
    ...over,
  };
}

describe("units", () => {
  it("match inventory_items_unit_check in migrations/148, and leave sdm and sdt out", () => {
    const check = /inventory_items_unit_check check \(unit in \(([\s\S]*?)\)\)/.exec(migration);
    expect(check).not.toBeNull();
    const units = check![1].split(",").map((s) => s.trim().replace(/'/g, ""));
    expect([...units].sort()).toEqual([...STOCK_UNITS].sort());
    expect(STOCK_UNITS).not.toContain("sdm");
    expect(STOCK_UNITS).not.toContain("sdt");
  });

  it("convert exactly within a group, and never across", () => {
    expect(convertAmount(4.5, "kg", "g")).toBe(4500);
    expect(convertAmount(250, "ml", "L")).toBe(0.25);
    expect(convertAmount(8, "butir", "pcs")).toBe(8);
    expect(convertAmount(3, "ikat", "ikat")).toBe(3);
    expect(convertAmount(3, "ikat", "batang")).toBeNull();
    expect(convertAmount(6, "butir", "g")).toBeNull();
    expect(convertAmount(1, "kg", "L")).toBeNull();
    expect(convertAmount(0.1 + 0.2, "kg", "g")).toBe(300);
  });

  it("step by 100 for g and ml, 0.5 for kg and L, 1 otherwise", () => {
    expect(amountStep("g")).toBe(100);
    expect(amountStep("ml")).toBe(100);
    expect(amountStep("kg")).toBe(0.5);
    expect(amountStep("L")).toBe(0.5);
    expect(amountStep("butir")).toBe(1);
    expect(amountStep("bungkus")).toBe(1);
  });

  it("parse either decimal mark, and refuse what isn't an amount", () => {
    expect(parseAmount("1,5")).toBe(1.5);
    expect(parseAmount(" 2.25 ")).toBe(2.25);
    expect(parseAmount("0")).toBe(0);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("-1")).toBeNull();
    expect(parseAmount("1,2,3")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("100001")).toBeNull();
  });

  it("format with a comma in Indonesian", () => {
    expect(formatAmount(1.2, "kg", "id")).toBe("1,2 kg");
    expect(formatAmount(1.2, "kg", "en")).toBe("1.2 kg");
    expect(formatAmount(8, "butir", "en")).toBe("8 butir");
    expect(formatAmount(2, "pack", "id")).toBe("2 pak");
  });
});

describe("status from the amount", () => {
  it("is out at nothing, running low at or below the level, enough above", () => {
    expect(deriveStatus(0, 1)).toBe("out");
    expect(deriveStatus(1, 1)).toBe("low");
    expect(deriveStatus(1.5, 1)).toBe("ok");
    expect(deriveStatus(0.1, 0)).toBe("ok");
  });
});

describe("the amount line", () => {
  it("reads 'left' when fresh and 'about … ago' after 14 days, grey, never red", () => {
    const fresh = item({ track_amount: true, quantity: 1.2, amount_set_at: "2026-11-05T09:00:00+07:00" });
    expect(amountLine(fresh, "en", NOW)).toEqual({ text: "1.2 kg left", stale: false });
    expect(amountLine(fresh, "id", NOW)).toEqual({ text: "Sisa 1,2 kg", stale: false });
    const old = { ...fresh, amount_set_at: "2026-10-21T09:00:00+07:00" };
    expect(amountLine(old, "en", NOW)).toEqual({ text: "about 1.2 kg · 3 weeks ago", stale: true });
    expect(amountLine(old, "id", NOW)).toEqual({ text: "sekitar 1,2 kg · 3 minggu lalu", stale: true });
  });

  it("turns grey on the 14th day, and counts weeks then months", () => {
    expect(isStaleAmount("2026-10-29T08:00:00+07:00", NOW)).toBe(false);
    expect(isStaleAmount("2026-10-28T08:00:00+07:00", NOW)).toBe(true);
    expect(agoLabel("2026-09-01T08:00:00+07:00", "en", NOW)).toBe("2 months ago");
    expect(agoLabel("2026-11-10T08:00:00+07:00", "id", NOW)).toBe("1 hari lalu");
  });
});

describe("old counts (D14)", () => {
  it("show as a hint only, never as the starting amount", () => {
    const counted = item({ quantity: 2, last_audited_at: "2026-10-03T08:00:00Z" });
    expect(oldCountHint(counted, "en")).toBe("Old count: 2 kg on 3 Oct, not used");
    expect(oldCountHint(counted, "id")).toBe("Hitungan lama: 2 kg pada 3 Okt, tidak dipakai");
    expect(startingAmount(counted)).toBeNull();
  });

  it("aren't shown once an item was tracked; the tracked amount comes back instead", () => {
    const tracked = item({ quantity: 3, amount_set_at: "2026-11-01T00:00:00Z" });
    expect(oldCountHint(tracked, "en")).toBeNull();
    expect(startingAmount(tracked)).toBe(3);
    expect(oldCountHint(item({ quantity: 0 }), "en")).toBeNull();
  });
});

describe("the rules mirror (as migrations/148's trigger)", () => {
  const tracked = item({ track_amount: true, quantity: 3, min_threshold: 1, amount_set_at: "2026-10-01T00:00:00Z" });

  it("ignores a client's amount time and stamps it when the amount changes", () => {
    const same = applyAmountRules(tracked, { ...tracked, notes: "x", amount_set_at: "2020-01-01T00:00:00Z" }, NOW);
    expect(same.amount_set_at).toBe("2026-10-01T00:00:00Z");
    const moved = applyAmountRules(tracked, { ...tracked, quantity: 1, amount_set_by: "s1" }, NOW);
    expect(moved.amount_set_at).toBe(NOW.toISOString());
    expect(moved.stock_status).toBe("low");
    expect(moved.stock_status_by).toBe("s1");
  });

  it("keeps a Running low tap until the amount changes; Out empties", () => {
    const tapped = applyAmountRules(tracked, { ...tracked, stock_status: "low" }, NOW);
    expect(tapped.stock_status).toBe("low");
    expect(tapped.quantity).toBe(3);
    const out = applyAmountRules(tracked, { ...tracked, stock_status: "out" }, NOW);
    expect(out.quantity).toBe(0);
  });

  it("credits a low-level-only change to nobody, not the last person who moved the amount", () => {
    const bySari = { ...tracked, amount_set_by: "sari", stock_status_by: "sari" };
    const raised = applyAmountRules(bySari, { ...bySari, min_threshold: 5 }, NOW);
    expect(raised.stock_status).toBe("low");
    expect(raised.stock_status_by).toBeNull();
  });

  it("leaves untracked items alone", () => {
    const plain = item({ quantity: 2 });
    const next = applyAmountRules(plain, { ...plain, quantity: 0, stock_status: "out" }, NOW);
    expect(next.amount_set_at).toBeNull();
    expect(next.stock_status).toBe("out");
    expect(next.quantity).toBe(0);
  });
});

describe("undoing a purchase (Codex, PR #93)", () => {
  const out = { track_amount: true, stock_status: "out" as const, last_bought_amount: 2 };

  it("keeps another phone's purchase: no Out write while some is left", () => {
    // 0 → bought 5 → another phone bought 3 → undo the 5: 3 left, not emptied.
    const patch = undoPurchasePatch(out, { quantity: 3, stock_status: "ok", last_bought_amount: 3 }, 5);
    expect(patch).toBeNull();
  });

  it("puts Out and the pre-fill back when nothing else happened", () => {
    expect(undoPurchasePatch(out, { quantity: 0, stock_status: "out", last_bought_amount: 5 }, 5)).toEqual({
      last_bought_amount: 2,
    });
    // Skip amount on a tracked item that was out: still nothing there.
    expect(undoPurchasePatch(out, { quantity: 0, stock_status: "ok", last_bought_amount: 2 }, null)).toEqual({
      stock_status: "out",
    });
  });

  it("never writes over another phone's later tap", () => {
    const low = { track_amount: false, stock_status: "low" as const, last_bought_amount: null };
    expect(undoPurchasePatch(low, { quantity: 0, stock_status: "out", last_bought_amount: null }, null)).toBeNull();
  });

  it("puts a Running low tap back, and untracked items as before", () => {
    const low = { track_amount: true, stock_status: "low" as const, last_bought_amount: null };
    expect(undoPurchasePatch(low, { quantity: 3, stock_status: "ok", last_bought_amount: 5 }, 5)).toEqual({
      stock_status: "low",
      last_bought_amount: null,
    });
    const plain = { track_amount: false, stock_status: "out" as const, last_bought_amount: null };
    expect(undoPurchasePatch(plain, { quantity: 0, stock_status: "ok", last_bought_amount: null }, null)).toEqual({
      stock_status: "out",
    });
  });
});

describe("the pre-fill when the unit changes (Codex, PR #93)", () => {
  it("converts exactly, or drops what can't be read in the new unit", () => {
    expect(lastBoughtInUnit(5, "kg", "g")).toBe(5000);
    expect(lastBoughtInUnit(500, "ml", "L")).toBe(0.5);
    expect(lastBoughtInUnit(12, "butir", "pcs")).toBe(12);
    expect(lastBoughtInUnit(5, "kg", "butir")).toBeNull();
    expect(lastBoughtInUnit(200, "kg", "g")).toBeNull(); // 200,000 g: over a purchase's limit
    expect(lastBoughtInUnit(null, "kg", "g")).toBeNull();
  });
});

describe("where things show", () => {
  it("puts fresh food and pantry under Food only with Kitchen amounts and Food at home on", () => {
    expect(isIngredient(item({ category: "fresh_food" }))).toBe(true);
    expect(isIngredient(item({ category: "household_supplies" }))).toBe(false);
    expect(ingredientsUnderFood({ kitchen: true, food: true })).toBe(true);
    expect(ingredientsUnderFood({ kitchen: true, food: false })).toBe(false);
    expect(ingredientsUnderFood({ kitchen: false, food: true })).toBe(false);
    expect(amountsOn({ kitchen: false })).toBe(false);
  });

  it("tag Kitchen amounts as Plus, with nothing gated yet", () => {
    expect(PLUS_FEATURES).toContain("kitchen");
    expect(planFor("kitchen")).toBe("plus");
    expect(planFor("repairs")).toBe("free");
    expect(PLANS_ENFORCED).toBe(false);
  });
});
