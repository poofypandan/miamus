// Household → Features (Phase 171 PR A, migrations/145): defaults agree with
// the database, a row wins over the default, switched-off views fall back,
// bill chores hide with Bills off, the staff line only gets shorter, and
// Kakak drops add_food only for a household with Food at home off.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FEATURE_DEFAULTS,
  FEATURES,
  choresViewFor,
  featureFlagsFrom,
  featuresOnCount,
  kitchenViewFor,
  visibleChores,
} from "@/lib/features";
import { HOME_TYPES, SETUP_TEMPLATES_READY, isHomeType } from "@/lib/setup-templates";
import { lapor } from "@/components/staff/staff-actions-fab";
import { buildContext, type ContextRows } from "@/lib/kakak/context";
import { toolsFor } from "@/lib/kakak/engine";
import { renderHouseholdBlock } from "@/lib/kakak/household";

const migration = (name: string) => readFileSync(join(__dirname, "../../supabase/migrations", name), "utf8");

describe("feature defaults", () => {
  it("agree with household_feature_defaults() in migrations/145", () => {
    const sql = migration("145_household_features.sql");
    const body = /household_feature_defaults\(\)[\s\S]*?select '(\{[^']*\})'::jsonb/.exec(sql);
    expect(body).not.toBeNull();
    expect(JSON.parse(body![1])).toEqual(FEATURE_DEFAULTS);
  });

  it("list the same features as the table's check", () => {
    const sql = migration("145_household_features.sql");
    const check = /feature text not null check \(feature in \(([^)]*)\)\)/.exec(sql);
    expect(check![1].split(",").map((s) => s.trim().replace(/'/g, ""))).toEqual([...FEATURES]);
  });

  it("start everything in PR A on, so no household loses anything", () => {
    expect(featureFlagsFrom([])).toEqual({ repairs: true, bills: true, food: true });
    expect(featureFlagsFrom(null)).toEqual(FEATURE_DEFAULTS);
  });

  it("let a row win, and ignore unknown features", () => {
    expect(
      featureFlagsFrom([
        { feature: "repairs", enabled: false },
        { feature: "closet", enabled: true },
      ])
    ).toEqual({ repairs: false, bills: true, food: true });
  });
});

describe("what off hides", () => {
  const chores = [
    { id: "a", category: "cleaning" },
    { id: "b", category: "bill" },
    { id: "c", category: "maintenance" },
  ] as const;

  it("hides bill chores with Bills and upkeep off, keeps the rest", () => {
    expect(visibleChores([...chores], { ...FEATURE_DEFAULTS, bills: false }).map((c) => c.id)).toEqual(["a", "c"]);
    expect(visibleChores([...chores], FEATURE_DEFAULTS).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("sends ?chores=repairs back to Today while Repairs is off", () => {
    expect(choresViewFor("repairs", { ...FEATURE_DEFAULTS, repairs: false })).toBe("today");
    expect(choresViewFor("rooms", { ...FEATURE_DEFAULTS, repairs: false })).toBe("rooms");
    expect(choresViewFor("repairs", FEATURE_DEFAULTS)).toBe("repairs");
  });

  it("opens the Kitchen on Shopping while Food at home is off", () => {
    expect(kitchenViewFor("food", { ...FEATURE_DEFAULTS, food: false })).toBe("buy");
    expect(kitchenViewFor("buy", { ...FEATURE_DEFAULTS, food: false })).toBe("buy");
    expect(kitchenViewFor("food", FEATURE_DEFAULTS)).toBe("food");
  });

  it("counts the Features rows that are on, Pets included", () => {
    expect(featuresOnCount(FEATURE_DEFAULTS, true)).toBe(4);
    expect(featuresOnCount({ ...FEATURE_DEFAULTS, food: false }, false)).toBe(2);
  });
});

describe("the staff Lapor line", () => {
  it("reads as before with everything on", () => {
    expect(lapor({ food: true, repairs: true, pets: true })).toBe(
      "Catat makanan masuk, lapor kerusakan, laporkan stok, usulkan jadwal, atau catat kegiatan ekstra."
    );
    expect(lapor({ food: true, repairs: true, pets: false })).toBe(
      "Catat makanan masuk, lapor kerusakan, atau laporkan stok."
    );
  });

  it("only gets shorter when something is off", () => {
    const full = lapor({ food: true, repairs: true, pets: false });
    const noRepairs = lapor({ food: true, repairs: false, pets: false });
    const noFood = lapor({ food: false, repairs: true, pets: false });
    expect(noRepairs).toBe("Catat makanan masuk, atau laporkan stok.");
    expect(noFood).toBe("Lapor kerusakan, atau laporkan stok.");
    expect(lapor({ food: false, repairs: false, pets: false })).toBe("Laporkan stok.");
    for (const line of [noRepairs, noFood]) expect(line.length).toBeLessThan(full.length);
  });
});

describe("Kakak and Food at home switched off", () => {
  const rows: ContextRows = { staff: [], pets: [], schedules: [], rooms: [], items: [] };
  const opts = { today: "2026-11-11", now: "08:30", ownerLocale: "en" as const, callerUserId: "u" };

  it("keeps add_food and the same block unless Food is explicitly off", () => {
    for (const foodOn of [undefined, null, true]) {
      const { household } = buildContext({ ...rows, foodOn }, opts);
      expect(household.foodOff).toBeUndefined();
      expect(toolsFor(household).map((t) => t.name)).toContain("add_food");
    }
    expect(renderHouseholdBlock(buildContext({ ...rows, foodOn: true }, opts).household)).toBe(
      renderHouseholdBlock(buildContext(rows, opts).household)
    );
  });

  it("drops add_food and says so when Food at home is off", () => {
    const { household } = buildContext({ ...rows, foodOn: false }, opts);
    const names = toolsFor(household).map((t) => t.name);
    expect(names).not.toContain("add_food");
    expect(names).toContain("create_chore");
    expect(names).toContain("add_pet_routine");
    expect(renderHouseholdBlock(household)).toContain("Food at home: switched off");
  });

  it("drops both with pets and food off", () => {
    const { household } = buildContext({ ...rows, foodOn: false, hasPets: false }, opts);
    const names = toolsFor(household).map((t) => t.name);
    expect(names).not.toContain("add_food");
    expect(names).not.toContain("add_pet_routine");
  });
});

describe("the kinds of home", () => {
  it("match household_setup.home_type's check in migrations/142", () => {
    const sql = migration("142_household_setup_measurement.sql");
    const check = /home_type text check \(home_type in \(([^)]*)\)\)/.exec(sql);
    expect(check![1].split(",").map((s) => s.trim().replace(/'/g, ""))).toEqual([...HOME_TYPES]);
    expect(isHomeType("garden")).toBe(true);
    expect(isHomeType("castle")).toBe(false);
  });

  it("are asked now that the template they open exists (Phase 172 PR A2)", () => {
    expect(SETUP_TEMPLATES_READY).toBe(true);
  });
});
