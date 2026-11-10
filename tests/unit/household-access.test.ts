import { describe, expect, it } from "vitest";
import {
  canCreateHousehold,
  createHouseholdFailure,
  emailThemHref,
  parseHouseholdAccess,
} from "@/lib/household-access";

describe("parseHouseholdAccess", () => {
  it("knows the six answers, 'open' included (migrations/143)", () => {
    for (const value of ["admin", "approved", "open", "pending", "rejected", "none"]) {
      expect(parseHouseholdAccess(value)).toBe(value);
    }
  });

  it("reads anything else as none: ask, don't assume", () => {
    expect(parseHouseholdAccess("member")).toBe("none");
    expect(parseHouseholdAccess(null)).toBe("none");
  });
});

describe("canCreateHousehold", () => {
  it("lets admin, approved and open accounts name their household", () => {
    expect(canCreateHousehold("admin")).toBe(true);
    expect(canCreateHousehold("approved")).toBe(true);
    expect(canCreateHousehold("open")).toBe(true);
    expect(canCreateHousehold("pending")).toBe(false);
    expect(canCreateHousehold("rejected")).toBe(false);
    expect(canCreateHousehold("none")).toBe(false);
  });
});

describe("createHouseholdFailure", () => {
  it("reads the database's refusals", () => {
    expect(createHouseholdFailure({ message: "household_not_approved" })).toBe("not_approved");
    expect(createHouseholdFailure({ message: "already_has_household" })).toBe("has_household");
    expect(createHouseholdFailure({ message: "invalid_household_name" })).toBe("invalid_name");
    expect(createHouseholdFailure({ message: "boom" })).toBe("other");
  });
});

describe("emailThemHref", () => {
  it("writes a ready message in English", () => {
    const href = emailThemHref({ email: "sam@example.com", locale: "en", full_name: "Sam Lee" })!;
    expect(href.startsWith("mailto:sam%40example.com?")).toBe(true);
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("subject")).toBe("Miamus: you're in");
    expect(params.get("body")).toBe("Hi Sam,\n\nYou're in. Open miamus.app to set up your household.\n\nPoofy Labs");
  });

  it("and in Indonesian for an account that chose it", () => {
    const params = new URLSearchParams(emailThemHref({ email: "dewi@example.com", locale: "id", full_name: null })!.split("?")[1]);
    expect(params.get("subject")).toBe("Miamus: Anda sudah bisa masuk");
    expect(params.get("body")).toContain("Halo,\n\nAnda sudah bisa masuk. Buka miamus.app");
  });

  it("is null without an email", () => {
    expect(emailThemHref({ email: null, locale: "en", full_name: "Sam" })).toBeNull();
    expect(emailThemHref({ email: "  ", locale: "en", full_name: "Sam" })).toBeNull();
  });
});
