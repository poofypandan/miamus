/**
 * Every word in the film, English and Bahasa Indonesia.
 *
 * Kakak speaks as she does in the app (docs/indonesian-glossary.md): she
 * calls herself Kakak, addresses the owner as Anda, says "staf" and "HP".
 * Staff screens stay Indonesian in both cuts, as they are in the app.
 */
export type Locale = "en" | "id";

/** A question in the hook's pile. `reply` is a staff answer (small, grey); the rest are the owner's. */
export interface Bubble {
  text: string;
  reply?: boolean;
}

export interface Copy {
  /** The child's call, in her own hand. */
  child: string;
  /** v8: the sentence typed to Kakak, as the app wraps it, its placeholder, and where the 15-second cut starts typing. */
  typed: { lines: [string, string]; placeholder: string; start15: number };
  /** v10: the sentence Mama says to Kakak, word by word (seconds after she starts), and how many words fit line one. */
  spoken: { words: [string, number][]; split: number };
  /** v11: who each card is for. */
  tags: { you: string; sari: string };
  /** v6: the same call on two lines, one word group per bell note. */
  call: [string, string];
  bubbles: Bubble[];
  /** The last one, the one that lands on everything. */
  slam: string;
  /** Kakak's lines, by id: what she says, and what the caption shows. */
  lines: Record<string, string>;
  /** The big line at dawn: two rows, the last word set apart. */
  big: { rows: [string, string]; word: string };
  aiTag: string;
  /** A gloss under Kakak's name (English cut only). */
  gloss: string | null;
  you: string;
  /** What the Indonesian staff screen says, for the English cut. */
  staffGloss: string | null;
  /** The owner's one notification, exactly as the app words it (supabase/migrations/150). */
  push: { title: string; body: string; time: string };
  /** Small time stamps as the day passes. */
  stamps: { tell: string; staff: string; track: string; alert: string };
  dayFrom: number;
  end: { line: string; em?: string; call?: string; url: string };
}

export const COPY: Record<Locale, Copy> = {
  en: {
    child: "Mama, look!",
    bubbles: [
      { text: "Dogs fed?" },
      { text: "Did anyone play with Coco?" },
      { text: "Sudah, Bu.", reply: true },
      { text: "Who's getting Maya at 1?" },
      { text: "Eggs?" },
      { text: "Is the gardener here?" },
      { text: "Lights off?" },
      { text: "Siap, Bu.", reply: true },
      { text: "Laundry in?" },
      { text: "What's for dinner?" },
      { text: "Terrace mopped?" },
      { text: "Gate locked?" },
      { text: "Done yet?" },
      { text: "The tap is dripping again" },
      { text: "Sudah, Bu.", reply: true },
      { text: "Did the AC man come?" },
      { text: "Car washed?" },
      { text: "Done yet?" },
      { text: "Plants watered?" },
      { text: "Hello?" },
      { text: "Done yet?" },
    ],
    slam: "Done yet?",
    lines: {
      L1: "Running a home takes a lot of asking.",
      L2: "What if you only had to say it once?",
      L3: "Hi, I'm Kakak. Just tell me what you need.",
      L4: "Tell me once.",
      L4b: "I'll take it from there.",
      L5: "And everyone at home knows what to do.",
      L6: "In their own language.",
      L7a: "They run the home.",
      L7b: "I just keep track.",
      L8: "And you? You'll only hear from me…",
      L9: "…when something isn't done.",
      L10: "That one's yours.",
      L11: "Miamus. More time for your family.",
      // v14: one line, the name and the AI tag on screen instead of in words.
      S1: "Hi, I'm Kakak. Tell me once,",
      S2: "and everyone at home knows what to do.",
      S3: "Miamus. More time for your family.",
      // v15: the name is on screen from her "Miamus"; the caption carries only the words after it.
      L11t: "More time for your family.",
      S3t: "More time for your family.",
      // v6: the girl (G, in her handwriting) and Mama (M, on her own light plate).
      G1: "Mama, look!",
      G2: "Mama, look!",
      G3: "Mama…?",
      M1: "In a minute, sweetie…",
      M2: "I'm here, sweetie.",
    },
    big: { rows: ["What if you only had", "to say it"], word: "once?" },
    aiTag: "Miamus's AI helper",
    gloss: "kakak: big sister, in Indonesian",
    you: "You",
    staffGloss: "Today's tasks",
    push: { title: "Play · Coco & Bruno", body: "Not done yet (5:00 PM)", time: "5:30 PM" },
    stamps: { tell: "7:45 AM", staff: "9:00 AM", track: "4:30 PM", alert: "5:30 PM" },
    dayFrom: 9,
    // The end card (v9, the owner): one line, the why; "em" (optional) is set in the soft italic. One place to change.
    end: { line: "For the little moments", em: "little", url: "miamus.app" },
    call: ["Mama,", "look!"],
    typed: { lines: ["Have Sari mop the terrace every", "Monday at 9."], placeholder: "What should I set up?", start15: 22 },
    // Word onsets measured on Mama's take with Whisper (audio/out/vo/mama-aita-v10/T1-words.json).
    // v11: "Kak," first, so it is clear she is talking to Kakak (word onsets: audio/out/vo/mama-aita-v11/T1-words.json).
    // v14: timed to Mama's new take (the glottal "Ka'," said, "Kak," typed).
    spoken: { words: [["Kak,", 0], ["have", 0.68], ["Sari", 0.94], ["mop", 1.27], ["the", 1.45], ["terrace", 1.65], ["every", 2.01], ["Monday", 2.41], ["at", 2.77], ["9.", 3.05]], split: 6 },
    tags: { you: "You", sari: "Sari" },
  },
  id: {
    child: "Mama, lihat!",
    bubbles: [
      { text: "Anjing sudah makan?" },
      { text: "Coco sudah diajak main?" },
      { text: "Sudah, Bu.", reply: true },
      { text: "Siapa jemput Maya jam 1?" },
      { text: "Telur masih ada?" },
      { text: "Tukang kebun sudah datang?" },
      { text: "Lampu sudah mati?" },
      { text: "Siap, Bu.", reply: true },
      { text: "Cucian sudah diangkat?" },
      { text: "Masak apa malam ini?" },
      { text: "Teras sudah dipel?" },
      { text: "Gerbang sudah dikunci?" },
      { text: "Sudah?" },
      { text: "Keran bocor lagi" },
      { text: "Sudah, Bu.", reply: true },
      { text: "Tukang AC sudah datang?" },
      { text: "Mobil sudah dicuci?" },
      { text: "Sudah?" },
      { text: "Tanaman sudah disiram?" },
      { text: "Halo?" },
      { text: "Sudah?" },
    ],
    slam: "Sudah?",
    lines: {
      L1: "Mengurus rumah itu banyak bertanya.",
      L2: "Bagaimana kalau cukup bilang sekali?",
      L3: "Halo, ini Kakak. Bilang saja apa yang Anda perlukan.",
      L4: "Bilang sekali ke Kakak.",
      L4b: "Sisanya, Kakak yang atur.",
      L5: "Dan semua orang di rumah tahu harus apa.",
      L6: "Dalam bahasa mereka.",
      L7a: "Merekalah yang mengurus rumah.",
      L7b: "Kakak hanya membantu mencatat.",
      L8: "Dan Anda? Anda hanya dikabari…",
      L9: "…kalau ada yang belum dikerjakan.",
      L10: "Yang ini untuk Anda.",
      L11: "Miamus. Lebih banyak waktu untuk keluarga.",
      S1: "Halo, ini Kakak. Bilang sekali,",
      S2: "dan semua orang di rumah tahu harus apa.",
      S3: "Miamus. Lebih banyak waktu untuk keluarga.",
      L11t: "Lebih banyak waktu untuk keluarga.",
      S3t: "Lebih banyak waktu untuk keluarga.",
      G1: "Mama, lihat!",
      G2: "Mama, lihat!",
      G3: "Mama…?",
      M1: "Sebentar ya, sayang…",
      M2: "Mama di sini, sayang.",
    },
    big: { rows: ["Bagaimana kalau", "cukup bilang"], word: "sekali?" },
    aiTag: "asisten AI Miamus",
    gloss: null,
    you: "Anda",
    staffGloss: null,
    push: { title: "Ajak main · Coco & Bruno", body: "Belum dikerjakan (17.00)", time: "17.30" },
    stamps: { tell: "07.45", staff: "09.00", track: "16.30", alert: "17.30" },
    dayFrom: 9,
    end: { line: "Untuk momen-momen kecil", em: "kecil", url: "miamus.app" },
    call: ["Mama,", "lihat!"],
    typed: { lines: ["Minta Sari pel teras setiap Senin jam", "9."], placeholder: "Mau Kakak atur apa?", start15: 18 },
    spoken: { words: [["Kak,", 0], ["minta", 0.58], ["Sari", 0.82], ["pel", 1.06], ["teras", 1.36], ["setiap", 1.78], ["Senin", 2.48], ["jam", 2.76], ["9.", 3.1]], split: 7 },
    tags: { you: "Anda", sari: "Sari" },
  },
};
