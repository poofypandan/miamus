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

/**
 * Straight to one person's chat (Phase 172): `number` is 628…, digits only,
 * as household_access_requests.notify_whatsapp stores it. Anything else
 * falls back to the chat picker.
 */
export function whatsAppChatUrl(number: string | null | undefined, text: string): string {
  return number && /^628\d{7,11}$/.test(number)
    ? `https://wa.me/${number}?text=${encodeURIComponent(text)}`
    : whatsAppShareUrl(text);
}

/** Where a newly approved owner goes. */
export const APP_LINK = "https://miamus.app";

/**
 * "You're in" (Phase 172, D2; owner, 2026-11-11): what the operator sends
 * someone whose household request was approved, on WhatsApp or pasted
 * anywhere. Both languages in one message, theirs first (English when not
 * known), so it reads right whoever opens it. Plain text, the link on its
 * own, signed by Poofy Labs.
 */
export function approvedMessage(firstName: string | null | undefined, theirLocale: string | null | undefined): string {
  const name = firstName?.trim().split(/\s+/)[0];
  const id = `${name ? `Halo ${name}, ` : "Halo, "}permintaan Anda untuk Miamus sudah disetujui. Buka ${APP_LINK} untuk menyiapkan rumah Anda.`;
  const en = `${name ? `Hi ${name}, ` : "Hi, "}you're in: your Miamus request is approved. Open ${APP_LINK} to set up your household.`;
  const [first, second] = theirLocale === "id" ? [id, en] : [en, id];
  return `${first}\n\n${second}\n\nPoofy Labs`;
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
