import { describe, expect, it } from "vitest";
import {
  addDaysTo,
  containerLabel,
  containerToReturn,
  countEatSoon,
  daysLeft,
  eatSoonLabel,
  expiryLabel,
  foodGroup,
  groupFood,
} from "@/lib/food";
import type { FoodItem } from "@/types/database";

const TODAY = "2026-11-07";

function food(name: string, expires_on: string | null, extra: Partial<FoodItem> = {}): FoodItem {
  return {
    id: name,
    household_id: "h",
    name,
    photo_url: null,
    kept_in: "fridge",
    expires_on,
    from_whom: null,
    return_container: false,
    container_returned_at: null,
    notes: null,
    added_by: null,
    created_by: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    outcome: null,
    finished_at: null,
    finished_by: null,
    ...extra,
  };
}

describe("dates", () => {
  it("adds days across months and years", () => {
    expect(addDaysTo("2026-11-07", 1)).toBe("2026-11-08");
    expect(addDaysTo("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDaysTo("2026-12-31", 7)).toBe("2027-01-07");
  });

  it("counts days left, negative once past, null with no date", () => {
    expect(daysLeft(food("a", "2026-11-07"), TODAY)).toBe(0);
    expect(daysLeft(food("a", "2026-11-10"), TODAY)).toBe(3);
    expect(daysLeft(food("a", "2026-11-05"), TODAY)).toBe(-2);
    expect(daysLeft(food("a", null), TODAY)).toBeNull();
  });
});

describe("groups", () => {
  it("puts past and today on top, tomorrow to 7 days this week, the rest later", () => {
    expect(foodGroup(food("a", "2026-11-01"), TODAY)).toBe("today");
    expect(foodGroup(food("a", "2026-11-07"), TODAY)).toBe("today");
    expect(foodGroup(food("a", "2026-11-08"), TODAY)).toBe("week");
    expect(foodGroup(food("a", "2026-11-14"), TODAY)).toBe("week");
    expect(foodGroup(food("a", "2026-11-15"), TODAY)).toBe("later");
    expect(foodGroup(food("a", null), TODAY)).toBe("later");
  });

  it("sorts soonest first, no date last, and leaves finished food out", () => {
    const groups = groupFood(
      [
        food("Nastar", null),
        food("Dimsum", "2026-12-01"),
        food("Rendang", "2026-11-05"),
        food("Nasi kotak", "2026-11-07"),
        food("Eaten", "2026-11-07", { outcome: "eaten" }),
      ],
      TODAY
    );
    expect(groups.today.map((f) => f.name)).toEqual(["Rendang", "Nasi kotak"]);
    expect(groups.week).toEqual([]);
    expect(groups.later.map((f) => f.name)).toEqual(["Dimsum", "Nastar"]);
  });
});

describe("the Today line", () => {
  it("counts listed food past its date, today or tomorrow", () => {
    const items = [
      food("past", "2026-11-01"),
      food("today", "2026-11-07"),
      food("tomorrow", "2026-11-08"),
      food("later", "2026-11-09"),
      food("no date", null),
      food("eaten", "2026-11-07", { outcome: "eaten" }),
    ];
    expect(countEatSoon(items, TODAY)).toBe(3);
  });

  it("says it in both languages", () => {
    expect(eatSoonLabel(1, "en")).toBe("1 food to eat soon");
    expect(eatSoonLabel(3, "en")).toBe("3 foods to eat soon");
    expect(eatSoonLabel(3, "id")).toBe("3 makanan perlu segera dimakan");
  });
});

describe("containers", () => {
  it("asks for a container back only after the food is finished, until it is ticked", () => {
    expect(containerToReturn(food("a", null, { return_container: true }))).toBe(false);
    expect(containerToReturn(food("a", null, { return_container: true, outcome: "eaten" }))).toBe(true);
    expect(
      containerToReturn(
        food("a", null, { return_container: true, outcome: "eaten", container_returned_at: "2026-11-07T01:00:00Z" })
      )
    ).toBe(false);
    expect(containerToReturn(food("a", null, { outcome: "eaten" }))).toBe(false);
  });

  it("names who it goes back to", () => {
    expect(containerLabel("Tante Rina", "en")).toBe("Return container to Tante Rina");
    expect(containerLabel("Tante Rina", "id")).toBe("Kembalikan wadah ke Tante Rina");
    expect(containerLabel(null, "id")).toBe("Kembalikan wadahnya");
  });
});

describe("expiry words", () => {
  it("is calm before the date and red-worthy after it", () => {
    expect(expiryLabel(null, "en")).toBe("No date");
    expect(expiryLabel(0, "id")).toBe("Hari ini");
    expect(expiryLabel(1, "en")).toBe("Tomorrow");
    expect(expiryLabel(4, "id")).toBe("4 hari");
    expect(expiryLabel(-1, "en")).toBe("1 day past date — check first");
    expect(expiryLabel(-2, "id")).toBe("Lewat 2 hari — cek dulu");
  });
});
