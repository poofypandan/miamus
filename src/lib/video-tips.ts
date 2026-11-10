/**
 * Video tips (Phase 172 PR A1, D12; docs/phase-172-first-ten-minutes-plan.md,
 * section 5): 10–15 second clips recorded from the mock app with Playwright
 * (tests/tips/, run by hand), captions only, no faces or voice. They sit
 * beside one-line instructions as an optional "Watch · 15 s" button and never
 * pop up by themselves.
 *
 * Hosted with the app in public/tips/ (served by Vercel; mock data only, so
 * the privacy policy doesn't change):
 *   /tips/<id>.<locale>.mp4   H.264, 720 × 1560
 *   /tips/<id>.<locale>.jpg   the poster frame
 *   /tips/<id>.<locale>.vtt   the captions, also burned into the video
 * Owner tips come in English and Indonesian; staff tips in Indonesian only.
 *
 * `ready` stays false until a clip is recorded and committed: a slot whose
 * clip isn't there renders nothing, so nothing points at a missing file.
 */

export type VideoTipLocale = "en" | "id";

export type VideoTipId =
  | "owner-home-screen"
  | "owner-staff-phones"
  | "owner-kakak-voice"
  | "staff-home-screen"
  | "staff-first-chore"
  | "staff-house-code";

export interface VideoTip {
  id: VideoTipId;
  audience: "owner" | "staff";
  /** Rounded, for the button ("Watch · 15 s"). */
  seconds: number;
  /** The sheet's heading. Staff tips carry Indonesian only. */
  title: Partial<Record<VideoTipLocale, string>> & { id: string };
  /** One short caption at a time, in order; each about 2–3 seconds. */
  captions: Partial<Record<VideoTipLocale, string[]>> & { id: string[] };
  /** True once the clip files are in public/tips/. */
  ready: boolean;
}

export const VIDEO_TIPS: readonly VideoTip[] = [
  {
    id: "owner-home-screen",
    audience: "owner",
    seconds: 15,
    title: { en: "Add Miamus to your Home Screen", id: "Tambahkan Miamus ke Layar Utama" },
    captions: {
      en: ["Open Miamus in Safari or Chrome", "Tap Share, or the menu", "Choose Add to Home Screen", "Open Miamus from your Home Screen", "Turn on notifications"],
      id: ["Buka Miamus di Safari atau Chrome", "Ketuk Bagikan, atau menu", "Pilih Tambahkan ke Layar Utama", "Buka Miamus dari Layar Utama", "Aktifkan notifikasi"],
    },
    ready: false,
  },
  {
    id: "owner-staff-phones",
    audience: "owner",
    seconds: 15,
    title: { en: "Linking staff phones", id: "Menghubungkan HP staf" },
    captions: {
      en: ["Add each person by name", "Make their link", "Send it on WhatsApp", "They tap their name and make a PIN"],
      id: ["Tambah setiap orang dengan namanya", "Buat link-nya", "Kirim lewat WhatsApp", "Mereka ketuk namanya dan buat PIN"],
    },
    ready: false,
  },
  {
    id: "owner-kakak-voice",
    audience: "owner",
    seconds: 15,
    title: { en: "Talking to Kakak", id: "Bicara dengan Kakak" },
    captions: {
      en: ["Open Kakak", "Tap the mic on your keyboard", "Say what you want added", "Check it, then tap Add"],
      id: ["Buka Kakak", "Ketuk mic di keyboard", "Ucapkan yang ingin ditambahkan", "Cek, lalu ketuk Tambah"],
    },
    ready: false,
  },
  {
    id: "staff-home-screen",
    audience: "staff",
    seconds: 15,
    title: { id: "Tambahkan Miamus ke Layar Utama" },
    captions: {
      id: ["Buka Miamus di Safari atau Chrome", "Ketuk Bagikan, atau menu", "Pilih Tambahkan ke Layar Utama", "Buka Miamus dari Layar Utama"],
    },
    ready: false,
  },
  {
    id: "staff-first-chore",
    audience: "staff",
    seconds: 15,
    title: { id: "Menyelesaikan tugas dengan foto" },
    captions: {
      id: ["Ketuk tugas Anda", "Ketuk Saya kerjakan", "Foto sebelum", "Foto sesudah", "Ketuk Selesai"],
    },
    ready: false,
  },
  {
    id: "staff-house-code",
    audience: "staff",
    seconds: 15,
    title: { id: "Masuk dengan kode rumah" },
    captions: {
      id: ["Buka link dari pemilik rumah", "Pilih nama Anda", "Buat PIN", "Tugas Anda muncul"],
    },
    ready: false,
  },
];

export function videoTip(id: string): VideoTip | undefined {
  return VIDEO_TIPS.find((tip) => tip.id === id);
}

/** Staff tips are Indonesian whatever the screen; owners get their language. */
export function tipLocale(tip: VideoTip, locale: VideoTipLocale): VideoTipLocale {
  return tip.audience === "staff" ? "id" : locale;
}

export interface VideoTipFiles {
  video: string;
  poster: string;
  captions: string;
}

export function videoTipFiles(tip: VideoTip, locale: VideoTipLocale): VideoTipFiles {
  const base = `/tips/${tip.id}.${tipLocale(tip, locale)}`;
  return { video: `${base}.mp4`, poster: `${base}.jpg`, captions: `${base}.vtt` };
}

/** "00:00:02.500" */
function vttTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(h)}:${two(m)}:${two(s)}.${String(rest).padStart(3, "0")}`;
}

/**
 * The WebVTT captions for a tip: its captions spread evenly over its length,
 * one at a time. The recording script writes these next to the clip.
 */
export function videoTipVtt(tip: VideoTip, locale: VideoTipLocale): string {
  const lines = tip.captions[tipLocale(tip, locale)] ?? tip.captions.id;
  const step = Math.floor((tip.seconds * 1000) / Math.max(lines.length, 1));
  const cues = lines.map(
    (line, i) => `${i + 1}\n${vttTime(i * step)} --> ${vttTime(i === lines.length - 1 ? tip.seconds * 1000 : (i + 1) * step)}\n${line}`
  );
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

/** The button's words. */
export function watchLabel(tip: VideoTip, locale: VideoTipLocale): string {
  return tipLocale(tip, locale) === "id" ? `Tonton · ${tip.seconds} detik` : `Watch · ${tip.seconds} s`;
}
