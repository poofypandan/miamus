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
  end: { line: string; url: string };
}

export const COPY: Record<Locale, Copy> = {
  en: {
    child: "Mama, look!",
    bubbles: [
      { text: "Dogs fed?" },
      { text: "Terrace mopped?" },
      { text: "Sudah, Bu.", reply: true },
      { text: "Who's getting Maya at 1?" },
      { text: "Eggs?" },
      { text: "Is the gardener here?" },
      { text: "Lights off?" },
      { text: "Siap, Bu.", reply: true },
      { text: "Laundry in?" },
      { text: "What's for dinner?" },
      { text: "Did anyone play with Coco?" },
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
      L3: "Hi. I'm Kakak, the AI helper inside Miamus.",
      L4: "Tell me once.",
      L4b: "I'll take it from there.",
      L5: "And everyone at home knows what to do.",
      L6: "In their own language. On their own phone.",
      L7a: "They run the home.",
      L7b: "I just keep track.",
      L8: "And you? You'll only hear from me…",
      L9: "…when something isn't done.",
      L10: "That one's yours.",
      L11: "Miamus. More time for your family.",
      S1: "I'm Kakak, Miamus's AI helper. Tell me once,",
      S2: "and everyone at home knows what to do.",
      S3: "Miamus. More time for your family.",
    },
    big: { rows: ["What if you only had", "to say it"], word: "once?" },
    aiTag: "Miamus's AI helper",
    gloss: "kakak: big sister, in Indonesian",
    you: "You",
    staffGloss: "Today's tasks",
    push: { title: "Play · Coco & Bruno", body: "Not done yet (5:00 PM)", time: "5:30 PM" },
    stamps: { tell: "7:45 AM", staff: "9:00 AM", track: "4:30 PM", alert: "5:30 PM" },
    dayFrom: 9,
    end: { line: "More time for your family.", url: "miamus.app" },
  },
  id: {
    child: "Mama, lihat!",
    bubbles: [
      { text: "Anjing sudah makan?" },
      { text: "Teras sudah dipel?" },
      { text: "Sudah, Bu.", reply: true },
      { text: "Siapa jemput Maya jam 1?" },
      { text: "Telur masih ada?" },
      { text: "Tukang kebun sudah datang?" },
      { text: "Lampu sudah mati?" },
      { text: "Siap, Bu.", reply: true },
      { text: "Cucian sudah diangkat?" },
      { text: "Masak apa malam ini?" },
      { text: "Coco sudah diajak main?" },
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
      L3: "Halo. Ini Kakak, asisten AI di Miamus.",
      L4: "Bilang sekali ke Kakak.",
      L4b: "Sisanya, Kakak yang atur.",
      L5: "Dan semua orang di rumah tahu harus apa.",
      L6: "Dalam bahasa mereka. Di HP masing-masing.",
      L7a: "Merekalah yang mengurus rumah.",
      L7b: "Kakak hanya membantu mencatat.",
      L8: "Dan Anda? Anda hanya dikabari…",
      L9: "…kalau ada yang belum dikerjakan.",
      L10: "Yang ini bagian Anda.",
      L11: "Miamus. Lebih banyak waktu untuk keluarga.",
      S1: "Ini Kakak, asisten AI di Miamus. Bilang sekali,",
      S2: "dan semua orang di rumah tahu harus apa.",
      S3: "Miamus. Lebih banyak waktu untuk keluarga.",
    },
    big: { rows: ["Bagaimana kalau", "cukup bilang"], word: "sekali?" },
    aiTag: "asisten AI Miamus",
    gloss: null,
    you: "Anda",
    staffGloss: null,
    push: { title: "Ajak main · Coco & Bruno", body: "Belum dikerjakan (17.00)", time: "17.30" },
    stamps: { tell: "07.45", staff: "09.00", track: "16.30", alert: "17.30" },
    dayFrom: 9,
    end: { line: "Lebih banyak waktu untuk keluarga.", url: "miamus.app" },
  },
};
