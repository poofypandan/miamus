// What signing out removes from a phone (Codex P1, PR #101): every Miamus
// key, the kitchen caches included (recipes, the menu and kitchen notes),
// except this phone's own display preferences. And a guard: every storage key
// in the source starts with a prefix the rule knows, so a new cache can't
// slip past sign-out.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KEPT_ON_SIGN_OUT, MIAMUS_KEY_PREFIXES, clearHouseholdKeys, removedOnSignOut } from "@/lib/local-data";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  keys() {
    return [...this.map.keys()];
  }
}

const H = "00000000-0000-0000-0000-0000000000h1";

/** Household data on a phone: every one must be gone after sign-out. */
const HOUSEHOLD_KEYS = [
  `miamus_menu_v1:${H}`, // the week's menu and kitchen notes (PR C)
  `miamus_recipes_v1:${H}`, // recipes (#98)
  `miamus_snapshot_v3:${H}`,
  `miamus_chore_draft:${H}:x`,
  `miamus_household_name:${H}`,
  `miamus_household_has_pets:${H}`,
  `miamus_household_created_on:${H}`,
  `miamus.features.${H}`,
  `miamus_member_profile:${H}`,
  `miamus.setup-stage.${H}`,
  "miamus.staff-push-card.s1",
  "miamus-walkin-last-room",
  "miamus_dismissed_course_alerts",
  "miamus.push.wanted",
  "miamus.developer-list.lang",
  "miamus.sort-rooms-dismissed",
  "miamus_tenant_id",
  "miamus_app_lock_enabled",
  "miamus_app_lock_credential",
  "miamus.owner-locale",
  "banyuwangi11:staffId",
  "banyuwangi11:staffName",
  "banyuwangi11:isOwner",
  "dismissed_proposals",
  "maimus_mock_db_v1",
];

/** This phone's display preferences: kept. */
const KEPT_KEYS = [
  "miamus.public-locale",
  "miamus.whats-new.menu-2026-11",
  "miamus.whats-new.week",
  "miamus.staff-tip.closed-on",
  "miamus.push-prompt.snoozed-until",
  "miamus.kakak-hint-seen",
  "miamus.first-run.owner-1",
  "miamus_update_reload_at",
  "b11_onboarding_dismissed",
];

describe("sign-out removes the household from the phone", () => {
  it("every household key goes, the kitchen caches included; display preferences stay", () => {
    const storage = new MemoryStorage();
    for (const key of [...HOUSEHOLD_KEYS, ...KEPT_KEYS, "sb-project-auth-token", "someone-elses-key"]) storage.setItem(key, "x");
    const removed = clearHouseholdKeys(storage);
    expect(removed.sort()).toEqual([...HOUSEHOLD_KEYS].sort());
    const left = storage.keys();
    expect(left.filter((k) => k.startsWith("miamus_menu") || k.startsWith("miamus_recipes"))).toEqual([]);
    expect(left.sort()).toEqual([...KEPT_KEYS, "sb-project-auth-token", "someone-elses-key"].sort());
  });

  it("the kept list is display preferences only: no cache, name or id", () => {
    for (const kept of KEPT_ON_SIGN_OUT) {
      expect(kept).not.toMatch(/snapshot|recipes|menu|household|member|tenant|staff(Id|Name)|features|profile/);
    }
    expect(removedOnSignOut("miamus_menu_v2:anything")).toBe(true); // a future version too
    expect(removedOnSignOut("miamus_new_cache:anything")).toBe(true); // and a future cache
  });
});

describe("every storage key in the source starts with a known prefix", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  }

  it("so a new cache is removed on sign-out without anyone listing it", () => {
    const strays: string[] = [];
    for (const file of files(join(process.cwd(), "src"))) {
      const text = readFileSync(file, "utf8");
      if (!/(local|session)Storage/.test(text)) continue;
      // Key constants (…KEY / …PREFIX / DISMISSED / MARK = "…"), literal keys
      // passed to storage, and template keys.
      const found = [
        ...text.matchAll(/(?:KEY|PREFIX|DISMISSED|MARK)\w*\s*=\s*["'`]([^"'`$]+)/g),
        ...text.matchAll(/Storage\.(?:getItem|setItem|removeItem)\(\s*["'`]([^"'`$]+)/g),
        ...text.matchAll(/=>\s*`([a-z0-9_.:-]+)\$\{/gi),
      ].map((m) => m[1]);
      for (const key of found) {
        if (key.startsWith("sb-")) continue; // the auth library's own
        if (!MIAMUS_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) strays.push(`${file}: ${key}`);
      }
    }
    expect(strays).toEqual([]);
  });
});
