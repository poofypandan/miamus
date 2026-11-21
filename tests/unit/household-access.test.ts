import { describe, expect, it } from "vitest";
import {
  canCreateHousehold,
  createHouseholdFailure,
  emailThemHref,
  formatWhatsApp,
  hasSuggestion,
  normalizeWhatsApp,
  parseHouseholdAccess,
  toggleSuggestion,
  WANTS_HELP_MAX,
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

describe("normalizeWhatsApp", () => {
  it("turns Indonesian mobile numbers as people type them into 628…", () => {
    expect(normalizeWhatsApp("+62 812 3456 7890")).toBe("6281234567890");
    expect(normalizeWhatsApp("0812-3456-7890")).toBe("6281234567890");
    expect(normalizeWhatsApp("(0812) 345.678")).toBe("62812345678");
    expect(normalizeWhatsApp("0812 345 678")).toBe("62812345678");
    expect(normalizeWhatsApp("81234567")).toBe("6281234567");
    expect(normalizeWhatsApp("6281234567890")).toBe("6281234567890");
  });

  it("refuses landlines, foreign numbers and nonsense", () => {
    expect(normalizeWhatsApp("021 555 1234")).toBeNull();
    expect(normalizeWhatsApp("+1 415 555 0100")).toBeNull();
    expect(normalizeWhatsApp("0812")).toBeNull();
    expect(normalizeWhatsApp("08123456789012345")).toBeNull();
    expect(normalizeWhatsApp("abc")).toBeNull();
    expect(normalizeWhatsApp("")).toBeNull();
  });
});

describe("formatWhatsApp", () => {
  it("writes it the local way", () => {
    expect(formatWhatsApp("6281234567890")).toBe("0812-3456-7890");
    expect(formatWhatsApp("62812345678")).toBe("0812-3456-78");
  });
});

describe("toggleSuggestion (Request access, migrations/175)", () => {
  it("fills an empty answer, then adds after a comma", () => {
    const one = toggleSuggestion("", "Pets");
    expect(one).toBe("Pets");
    expect(toggleSuggestion(one, "Kitchen and groceries")).toBe("Pets, Kitchen and groceries");
  });

  it("keeps what they typed and adds to the end", () => {
    expect(toggleSuggestion("We just moved in ", "Repairs in a new house")).toBe("We just moved in, Repairs in a new house");
  });

  it("takes a suggestion out again on a second tap, whatever its case", () => {
    expect(toggleSuggestion("Pets, Kitchen and groceries", "Pets")).toBe("Kitchen and groceries");
    expect(toggleSuggestion("we have dogs, pets", "Pets")).toBe("we have dogs");
  });

  it("leaves the rest of what they typed exactly as it was", () => {
    const typed = toggleSuggestion("Rumah 2,5 lantai", "Pets");
    expect(typed).toBe("Rumah 2,5 lantai, Pets");
    expect(toggleSuggestion(typed, "Pets")).toBe("Rumah 2,5 lantai");
    expect(toggleSuggestion("A, Pets, B", "Pets")).toBe("A, B");
  });

  it("knows which suggestions are in the answer", () => {
    expect(hasSuggestion("Pets, Kitchen and groceries", "pets")).toBe(true);
    expect(hasSuggestion("Our pets and the kitchen", "Pets")).toBe(false);
  });

  it("never passes the limit", () => {
    const full = "a".repeat(WANTS_HELP_MAX - 3);
    expect(toggleSuggestion(full, "Pets")).toBe(full);
    expect(toggleSuggestion("a".repeat(WANTS_HELP_MAX - 6), "Pets")).toHaveLength(WANTS_HELP_MAX);
  });
});
