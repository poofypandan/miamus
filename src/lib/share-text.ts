import type { OwnerLocale } from "@/lib/owner-locale";

/**
 * What the app pre-fills when an owner sends access on WhatsApp (owner,
 * 2026-11-10: warm, not robotic). One place, so the words are read and
 * tested together.
 *
 * Text for staff is Bahasa Indonesia whatever the owner reads: it is sent to
 * staff. Addressed as "Anda", never "kamu" (docs/indonesian-glossary.md).
 */

/** WhatsApp's own share link: opens a chat picker with the text filled in. */
export function whatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** The house code, for a staff phone that has to sign in again (Phase 151). */
export function houseCodeMessage(code: string, origin: string): string {
  return (
    `Ini kode rumah Miamus kita: ${code}\n` +
    `Simpan ya. Kalau perlu masuk lagi, buka ${origin}/join/code, ketik kode ini, ` +
    `pilih nama Anda, lalu masukkan PIN. Terima kasih!`
  );
}

/**
 * An invite link (Phase 89). A staff phone's is in Indonesian; family read
 * the owner's language — the owner is writing to them.
 */
export function inviteMessage(kind: "owner" | "staff", link: string, days: number, locale: OwnerLocale): string {
  if (kind === "staff") {
    return `Halo! Ini link untuk menghubungkan HP Anda ke Miamus rumah kita: ${link} (berlaku ${days} hari).`;
  }
  return locale === "id"
    ? `Yuk gabung ke rumah kita di Miamus: ${link} (berlaku ${days} hari).`
    : `Join our household on Miamus: ${link} (works for ${days} days).`;
}
