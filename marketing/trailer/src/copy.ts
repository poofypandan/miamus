/**
 * Every word on screen, Indonesian first (storyboard tables). `say` is the
 * narrator's line, shown as a quieter subtitle under the caption, since the
 * film has no voice yet and most shorts are watched muted.
 */
export type Locale = "id" | "en";

/**
 * The end-card lines, in one place (owner and design lead, 13 Nov 2026).
 * Change them here; nothing else needs touching.
 */
export const END_LINES: Record<Locale, { sixty: string; fifteen: string }> = {
  en: { sixty: "More time for family.", fifteen: "Less asking. More calm." },
  id: { sixty: "Lebih banyak waktu untuk keluarga.", fifteen: "Lebih sedikit bertanya. Lebih banyak tenang." },
};

export interface Line {
  /** The on-screen caption. */
  text: string;
  /** The voiceover line, as a subtitle (60-second cut only). */
  say?: string;
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
  /** The AI disclosure under Kakak's name, the first time she appears. */
  aiLabel: string;
  endLine60: string;
  endLine15: string;
  endSmall: string;
  short: { s2: string; s5: string; s7: string };
  /** The two notifications, worded as the app sends them (migrations/150). */
  staffPush: { title: string; body: string; time: string };
  ownerPush: { title: string; body: string; time: string };
};

export const COPY: Record<Locale, Copy> = {
  id: {
    hook: ["Sudah dipel?", "Lampu sudah mati?", "Anjing sudah makan?"],
    s1: { text: "Berapa kali Anda menanyakannya hari ini?", say: "Mengurus rumah itu banyak bertanya." },
    s2: { text: "Bilang sekali ke Kakak.", say: "Sekarang cukup bilang sekali ke Kakak." },
    s3: { text: "Dia yang mengatur semuanya.", say: "Kakak yang menyiapkan: siapa, kapan, dan siapa yang dikabari." },
    s4: { text: "Dua hal sekaligus.", say: "Belanja dan makanan di kulkas, sekaligus." },
    s5: { text: "Staf tahu harus apa. Dengan foto.", say: "Staf melihat tugasnya sendiri, dan menyelesaikannya dengan foto." },
    s6: { text: "Diingatkan tepat waktu.", say: "Yang penting diingatkan tepat waktu." },
    s7: { text: "Anda cukup melirik.", say: "Anda cukup melirik: semua lancar." },
    s8: { text: "Anda hanya dikabari kalau ada yang belum.", say: "Dan Anda hanya dikabari kalau ada yang belum dikerjakan." },
    s9: { text: "Dapur. Hewan. Perbaikan. Satu tempat.", say: "Dapur, hewan, perbaikan. Semua di satu tempat." },
    aiLabel: "Kakak, asisten AI Miamus",
    endLine60: END_LINES.id.sixty,
    endLine15: END_LINES.id.fifteen,
    endSmall: "Kakak adalah asisten AI Miamus.",
    short: { s2: "Bilang sekali ke Kakak.", s5: "Staf mengerjakan, dengan foto.", s7: "Semua lancar." },
    staffPush: { title: "Pengingat", body: "21.30 · Matikan lampu · Coco & Bruno", time: "21.30" },
    ownerPush: { title: "Matikan lampu · Coco & Bruno", body: "Belum dikerjakan (21.30)", time: "22.00" },
  },
  en: {
    hook: ["Mopped yet?", "Lights off?", "Dogs fed?"],
    s1: { text: "How many times did you ask today?", say: "Running a home means a lot of asking." },
    s2: { text: "Tell Kakak once.", say: "Now you say it once, to Kakak." },
    s3: { text: "She sets it all up.", say: "Kakak sets it up: who, when, and who gets told." },
    s4: { text: "Two things at once.", say: "Shopping and what's in the fridge, in one go." },
    // The staff screen stays Indonesian in the English cut; the caption says why (design lead).
    s5: { text: "Staff see their own tasks, in their own language.", say: "And finish them with a photo." },
    s6: { text: "Reminded on time.", say: "What matters is reminded on time." },
    s7: { text: "One glance is enough.", say: "One glance tells you: all on track." },
    s8: { text: "You only hear when something isn't done.", say: "And you only hear when something isn't done." },
    s9: { text: "Kitchen. Pets. Repairs. One place.", say: "Kitchen, pets, repairs. All in one place." },
    aiLabel: "Kakak, Miamus's AI helper",
    endLine60: END_LINES.en.sixty,
    endLine15: END_LINES.en.fifteen,
    endSmall: "Kakak is Miamus's AI helper.",
    short: { s2: "Tell Kakak once.", s5: "Staff do it, in their own language.", s7: "All on track." },
    // The staff phone is always in Indonesian; the owner's follows their language.
    staffPush: { title: "Pengingat", body: "21.30 · Matikan lampu · Coco & Bruno", time: "21.30" },
    ownerPush: { title: "Lights off · Coco & Bruno", body: "Not done yet (9:30 PM)", time: "10:00 PM" },
  },
};
