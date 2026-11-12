// Phase 175: the owner tabs were renamed and reordered (Today · Home · Pets ·
// Kitchen · Settings), but no URL key changed. Old links, saved PWA state and
// the staff phones' back link must all still land on the same screen.
import { describe, expect, it } from "vitest";
import { DASHBOARD_MODULES, moduleFromParam, moduleHref } from "@/lib/dashboard-modules";

describe("dashboard tabs (Phase 175)", () => {
  it("orders the bar Today, Home, Pets, Kitchen, Settings", () => {
    expect(DASHBOARD_MODULES).toEqual(["agenda", "chores", "pets", "inventory", "access"]);
  });

  it("keeps every URL key working", () => {
    expect(moduleFromParam(null)).toBe("agenda");
    expect(moduleFromParam("agenda")).toBe("agenda");
    expect(moduleFromParam("chores")).toBe("chores");
    expect(moduleFromParam("pets")).toBe("pets");
    expect(moduleFromParam("inventory")).toBe("inventory");
    expect(moduleFromParam("access")).toBe("access");
  });

  it("keeps the two legacy keys: household opens Home, staff opens Settings", () => {
    expect(moduleFromParam("household")).toBe("chores");
    expect(moduleFromParam("staff")).toBe("access");
    expect(moduleFromParam("nonsense")).toBe("agenda");
  });

  it("gives Today the bare path and every other tab its key", () => {
    expect(moduleHref("agenda")).toBe("/dashboard");
    expect(moduleHref("chores")).toBe("/dashboard?module=chores");
    expect(moduleHref("access")).toBe("/dashboard?module=access");
  });
});
