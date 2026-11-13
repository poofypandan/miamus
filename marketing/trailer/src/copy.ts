/**
 * Every word on screen, Indonesian first (storyboard tables). One line per
 * caption (design lead, v2); `sub` only where it adds something, such as the
 * English translation of the Indonesian staff notification.
 */
export type Locale = "id" | "en";

/**
 * The end-card lines, in one place (owner and design lead, 13–14 Nov 2026).
 * Change them here; nothing else needs touching.
 */
export const END_LINES: Record<Locale, { sixty: string; fifteen: string }> = {
  en: { sixty: "More time for your family.", fifteen: "Less asking. More calm." },
  id: { sixty: "Lebih banyak waktu untuk keluarga.", fifteen: "Lebih sedikit bertanya. Lebih banyak tenang." },
};

export interface Line {
  /** The on-screen caption. */
  text: string;
  /** A quieter second line, only where it adds something. */
  sub?: string;
}

type Copy = {
  hook: [string, string, string];
  s1: Line;
  s2: Line;
  s3: Line;
  s4: Line;
  s5: Line;
  s6: Line;
  s7: Line;
  s8: Line;
  s9: Line;
  /** The AI tag beside Kakak's name in the sheet, the first time she appears. */
  aiTag: string;
  endLine60: string;
  endLine15: string;
  short: { s2: string; s5: string; s7: string };
  /** The two notifications, worded as the app sends them (migrations/150). */
  staffPush: { title: string; body: string; time: string };
  ownerPush: { title: string; body: string; time: string };
};

export const COPY: Record<Locale, Copy> = {
  id: {
    hook: ["Sudah dipel?", "Lampu sudah mati?", "Anjing sudah makan?"],
    s1: { text: "Berapa kali Anda menanyakannya hari ini?" },
    s2: { text: "Bilang sekali ke Kakak." },
    s3: { text: "Dia yang mengatur semuanya." },
    s4: { text: "Dua hal sekaligus." },
    s5: { text: "Staf tahu harus apa. Dengan foto." },
    s6: { text: "Diingatkan tepat waktu." },
    s7: { text: "Anda cukup melirik." },
    s8: { text: "Anda hanya dikabari kalau ada yang belum." },
    s9: { text: "Dapur. Hewan. Perbaikan. Satu tempat." },
    aiTag: "asisten AI Miamus",
    endLine60: END_LINES.id.sixty,
    endLine15: END_LINES.id.fifteen,
    short: { s2: "Bilang sekali ke Kakak.", s5: "Staf mengerjakan, dengan foto.", s7: "Semua lancar." },
    // 17.00: Sari is reminded of the walk, and ticks it.
    staffPush: { title: "Pengingat", body: "17.00 · Jalan-jalan · Coco & Bruno", time: "17.00" },
    // 21.30 lights not done: the owner hears 30 minutes later (migrations/150); sentence 2 pays off.
    ownerPush: { title: "Matikan lampu · Coco & Bruno", body: "Belum dikerjakan (21.30)", time: "22.00" },
  },
  en: {
    hook: ["Mopped yet?", "Lights off?", "Dogs fed?"],
    s1: { text: "How many times did you ask today?" },
    s2: { text: "Tell Kakak once." },
    s3: { text: "She sets it all up." },
    s4: { text: "Two things at once." },
    // The staff screen stays Indonesian in the English cut; the caption says why (design lead).
    s5: { text: "Staff see their own tasks, in their own language." },
    // The notification on Sari's phone is Indonesian: the second line translates it.
    s6: { text: "Reminded on time.", sub: "Reminder · 5:00 pm · Walk · Coco & Bruno" },
    s7: { text: "One glance is enough." },
    s8: { text: "You only hear when something isn't done." },
    s9: { text: "Kitchen. Pets. Repairs. One place." },
    aiTag: "Miamus's AI helper",
    endLine60: END_LINES.en.sixty,
    endLine15: END_LINES.en.fifteen,
    short: { s2: "Tell Kakak once.", s5: "Staff do it, in their own language.", s7: "All on track." },
    // The staff phone is always in Indonesian; the owner's follows their language.
    staffPush: { title: "Pengingat", body: "17.00 · Jalan-jalan · Coco & Bruno", time: "17.00" },
    ownerPush: { title: "Lights off · Coco & Bruno", body: "Not done yet (9:30 PM)", time: "10:00 PM" },
  },
};
