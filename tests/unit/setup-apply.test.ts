// Staff in one go (Phase 172 PR A2, D10): the one WhatsApp message and the
// code it carries in the link's fragment.

import { describe, expect, it } from "vitest";
import { codeFromFragment, staffInOneGoMessage } from "@/lib/setup-apply";

describe("the one WhatsApp message", () => {
  it("is one line of Indonesian with the house link, the code in the fragment", () => {
    const text = staffInOneGoMessage("K7PM2Q", "https://miamus.app");
    expect(text).toBe(
      "Halo! Ini Miamus, aplikasi rumah kita. Buka link ini, pilih nama Anda, lalu buat PIN: https://miamus.app/join/code#c=K7P-M2Q"
    );
    expect(text).not.toMatch(/\?/);
    // Plain text: no emoji or symbol characters (AGENTS.md).
    expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}☀-➿]/u);
  });

  it("adds the 15-second video only when it exists", () => {
    expect(staffInOneGoMessage("K7PM2Q", "https://miamus.app", "https://miamus.app/tips/staff-house-code")).toContain(
      "\nVideo 15 detik: https://miamus.app/tips/staff-house-code"
    );
  });
});

describe("the code from the link", () => {
  it("reads #c=, with or without the dash, any case", () => {
    expect(codeFromFragment("#c=K7P-M2Q")).toBe("K7P-M2Q");
    expect(codeFromFragment("#c=k7pm2q")).toBe("K7P-M2Q");
    expect(codeFromFragment("#x=1&c=K7PM2Q")).toBe("K7P-M2Q");
  });

  it("ignores anything else", () => {
    expect(codeFromFragment("")).toBeNull();
    expect(codeFromFragment("#c=K7P")).toBeNull();
    expect(codeFromFragment("#code=K7PM2Q")).toBeNull();
  });
});
