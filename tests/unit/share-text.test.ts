import { describe, expect, it } from "vitest";
import { houseCodeMessage, inviteMessage, whatsAppShareUrl } from "@/lib/share-text";

// What the owner's WhatsApp buttons fill in (owner, 2026-11-10): warm,
// staff text in Indonesian with "Anda", family text in the owner's language.

describe("share text", () => {
  it("sends the house code warmly, with the way back in", () => {
    expect(houseCodeMessage("ABC-123", "https://miamus.app")).toBe(
      "Ini kode rumah Miamus kita: ABC-123\n" +
        "Simpan ya. Kalau perlu masuk lagi, buka https://miamus.app/join/code, ketik kode ini, " +
        "pilih nama Anda, lalu masukkan PIN. Terima kasih!"
    );
  });

  it("writes to a staff phone in Indonesian, whatever the owner reads", () => {
    for (const locale of ["en", "id"] as const) {
      expect(inviteMessage("staff", "https://miamus.app/join/staff?token=t", 7, locale)).toBe(
        "Halo! Ini link untuk menghubungkan HP Anda ke Miamus rumah kita: https://miamus.app/join/staff?token=t (berlaku 7 hari)."
      );
    }
  });

  it("writes to family in the owner's language", () => {
    expect(inviteMessage("owner", "L", 7, "en")).toBe("Join our household on Miamus: L (works for 7 days).");
    expect(inviteMessage("owner", "L", 7, "id")).toBe("Yuk gabung ke rumah kita di Miamus: L (berlaku 7 hari).");
  });

  it("never says kamu, and uses no emoji", () => {
    const all = [
      houseCodeMessage("ABC-123", "https://miamus.app"),
      inviteMessage("staff", "L", 7, "id"),
      inviteMessage("owner", "L", 7, "id"),
      inviteMessage("owner", "L", 7, "en"),
    ].join("\n");
    expect(all).not.toMatch(/\bkamu\b|-mu\b/i);
    expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("puts the text in a WhatsApp share link, encoded", () => {
    expect(whatsAppShareUrl("Halo! a&b\nc")).toBe("https://wa.me/?text=Halo!%20a%26b%0Ac");
  });
});
