import { LEGAL } from "@/config/legal";
import type { OwnerLocale } from "@/lib/owner-locale";
import { LANDING_COPY, type LandingFeature, type LandingStaffPoint } from "../landing-copy";

/**
 * The words of the "One day" landing page (docs/private/landing/
 * 01-concept.md, Direction 3, and prototypes/3-one-day.html, approved by the
 * owners and Fable on 20 Nov 2026). Written per language, not translated
 * line by line. Indonesian follows docs/indonesian-glossary.md, including
 * "Akses awal" and "Dengan undangan" (added for this page).
 *
 * What the app does is unchanged, so What it looks after, Made for the
 * people who do the work, and the questions are today's live words
 * (landing-copy.ts), with one change the concept made because Kakak is live
 * now: the cost answer.
 *
 * A headline with one word in Fraunces italic is written as [before, word,
 * after], so the page renders it without HTML in strings.
 */

/** A line with one word set in the serif italic. */
export type Accented = readonly [before: string, word: string, after: string];

export interface OneDayCopy {
  metaTitle: string;
  metaDescription: string;
  signIn: string;
  eyebrow: string;
  hero: { headline: Accented; subline: string };
  requestAccess: string;
  haveAccount: string;
  free: string;
  staffPrompt: string;
  sayOnce: {
    heading: Accented;
    body: string;
    kakakNote: string;
    sentence: string;
    tag: string;
  };
  reaches: { heading: Accented; body: string; tag: string };
  keeps: {
    heading: Accented;
    body: string;
    tag: string;
    quote: string;
    quoteBy: string;
  };
  /** The app pictures, until they are re-captured from the live app. */
  pictures: {
    label: string;
    note: string;
    card: string;
    staff: string;
    status: string;
  };
  kakakMarkLabel: string;
  features: { heading: string; items: { id: LandingFeature; title: string; body: string }[] };
  staff: { heading: string; points: { id: LandingStaffPoint; text: string }[] };
  dataPoint: string;
  dataLink: string;
  faq: { heading: string; items: { q: string; a: string }[] };
  film: { heading: Accented; soon: string; body: string };
  request: { heading: string; body: string };
  dialog: {
    title: string;
    body: string;
    google: string;
    consentBefore: string;
    privacy: string;
    consentAfter: string;
    noGoogle: string;
    joining: string;
    failed: string;
    close: string;
  };
  footer: { by: string; line: string; privacy: string };
  language: string;
  privacyHref: string;
}

const EN_LIVE = LANDING_COPY.en;
const ID_LIVE = LANDING_COPY.id;

/** The questions as live, with the cost answer the concept updated. */
function withCost(items: { q: string; a: string }[], costQuestion: string, costAnswer: string) {
  return items.map((item) => (item.q === costQuestion ? { q: item.q, a: costAnswer } : item));
}

export const ONE_DAY_COPY: Record<OwnerLocale, OneDayCopy> = {
  en: {
    metaTitle: "Miamus: one day at home",
    metaDescription:
      "Miamus carries what your home needs to the person who does it, and shows you when it's done. Early access, by invitation.",
    signIn: "Sign in",
    eyebrow: "Early access · By invitation",
    hero: {
      headline: ["A day at home, without the ", "asking", "."],
      subline:
        "Miamus carries what your home needs to the person who does it, and shows you when it's done. So you can stop asking.",
    },
    requestAccess: "Request access",
    haveAccount: "I already have an account",
    free: "Free during early access. We read every request ourselves.",
    staffPrompt: "Staff?",
    sayOnce: {
      heading: ["Say it ", "once", "."],
      body: "Tap the mic and talk, or type. Kakak turns your sentence into a card, and one tap saves it. Miamus repeats it from then on.",
      kakakNote: "Kakak is Miamus's AI helper, and she is optional. Everything can also be set up by hand.",
      sentence: "Have Sari mop the terrace every Monday at 9.",
      tag: "You",
    },
    reaches: {
      heading: ["Everyone at home knows what to ", "do", "."],
      body: "Sari finds it on her own phone, in Bahasa Indonesia. A photo before, a photo after, and it's done. No account and no email: her name and a 4-digit PIN.",
      tag: "Sari's phone",
    },
    keeps: {
      heading: ["They run the home. Miamus keeps ", "track", "."],
      body: "Who did it, when, and the photos are on your Today. On a good day, the first line is all you need to read.",
      tag: "Your Today",
      quote: "You'll only hear from me if it isn't done.",
      quoteBy: "Kakak, when you ask her to tell you if a routine is missed",
    },
    pictures: {
      label: "App picture",
      note: "Placeholder, re-captured from the live app",
      card: "Kakak's card: Pel teras (Mop the terrace), Sari, every Monday, 09:00, and Looks right.",
      staff: "The task on Sari's phone, in Bahasa Indonesia: Pel teras, 09.00, a photo before and after, and Selesai.",
      status: "The first line of Today: All on track.",
    },
    kakakMarkLabel: "Kakak",
    features: EN_LIVE.features,
    staff: EN_LIVE.staff,
    dataPoint: EN_LIVE.data.points[0].text,
    dataLink: EN_LIVE.data.policy,
    faq: {
      heading: EN_LIVE.faq.heading,
      items: withCost(
        EN_LIVE.faq.items,
        "What does it cost?",
        "Free during early access. Everything you do by hand will stay free. Kakak, the AI helper, is optional and will be the paid extra later."
      ),
    },
    film: {
      heading: ["More time for your ", "family", "."],
      soon: "Film coming",
      body: "A short film about Miamus goes here when it is finished.",
    },
    request: {
      heading: "A few households at a time.",
      body: "Miamus is in early access, by invitation. Tell us a little about your home, and a person will read it. You'll hear from us, usually within a day.",
    },
    dialog: {
      title: "Request access",
      body: "First, sign in with Google so we know who is asking. Then one short question, and a person reads your answer.",
      google: EN_LIVE.request.google,
      consentBefore: `Your request shares your Google name and email with ${LEGAL.operatorName}, who runs Miamus. See the `,
      privacy: "Privacy Policy",
      consentAfter: ".",
      noGoogle: EN_LIVE.request.noGoogle,
      joining: EN_LIVE.request.joining,
      failed: EN_LIVE.request.failed,
      close: "Close",
    },
    footer: { by: `Miamus, by ${LEGAL.operatorName}`, line: "A little less on your mind.", privacy: "Privacy Policy" },
    language: "Language · Bahasa",
    privacyHref: "/privacy",
  },
  id: {
    metaTitle: "Miamus: sehari di rumah",
    metaDescription:
      "Miamus menyampaikan kebutuhan rumah Anda ke orang yang mengerjakannya, lalu menunjukkan saat sudah selesai. Akses awal, dengan undangan.",
    signIn: "Masuk",
    eyebrow: "Akses awal · Dengan undangan",
    hero: {
      headline: ["Sehari di rumah, tanpa ", "bertanya-tanya", "."],
      subline:
        "Miamus menyampaikan kebutuhan rumah Anda ke orang yang mengerjakannya, lalu menunjukkan saat sudah selesai. Anda tidak perlu bertanya lagi.",
    },
    requestAccess: "Minta akses",
    haveAccount: "Saya sudah punya akun",
    free: "Gratis selama akses awal. Setiap permintaan kami baca sendiri.",
    staffPrompt: "Staf?",
    sayOnce: {
      heading: ["Cukup bilang ", "sekali", "."],
      body: "Ketuk mikrofon lalu bicara, atau ketik. Kakak mengubah kalimat Anda menjadi kartu, dan sekali ketuk langsung tersimpan. Setelah itu Miamus yang mengulangnya.",
      kakakNote: "Kakak adalah asisten AI Miamus, dan boleh tidak dipakai. Semuanya juga bisa diatur sendiri.",
      sentence: "Minta Sari pel teras setiap Senin jam 9.",
      tag: "Anda",
    },
    reaches: {
      heading: ["Semua orang di rumah tahu apa yang harus ", "dikerjakan", "."],
      body: "Sari melihatnya di HP-nya sendiri, dalam Bahasa Indonesia. Foto sebelum, foto sesudah, selesai. Tanpa akun dan tanpa email: cukup nama dan PIN 4 angka.",
      tag: "HP Sari",
    },
    keeps: {
      heading: ["Mereka yang mengurus rumah. Miamus yang ", "mencatat", "."],
      body: "Siapa yang mengerjakan, jam berapa, dan fotonya ada di Hari ini. Di hari yang lancar, cukup baca baris pertamanya.",
      tag: "Hari ini di HP Anda",
      quote: "Kakak hanya mengabari Anda jika belum dikerjakan.",
      quoteBy: "Kakak, saat Anda minta dikabari kalau ada rutinitas yang terlewat",
    },
    pictures: {
      label: "Gambar aplikasi",
      note: "Sementara, akan diambil ulang dari aplikasi",
      card: "Kartu Kakak: Pel teras, Sari, setiap Senin, 09.00, dan Sudah benar.",
      staff: "Tugas di HP Sari: Pel teras, 09.00, foto sebelum dan sesudah, dan Selesai.",
      status: "Baris pertama Hari ini: Semua lancar.",
    },
    kakakMarkLabel: "Kakak",
    features: ID_LIVE.features,
    staff: ID_LIVE.staff,
    dataPoint: ID_LIVE.data.points[0].text,
    dataLink: ID_LIVE.data.policy,
    faq: {
      heading: ID_LIVE.faq.heading,
      items: withCost(
        ID_LIVE.faq.items,
        "Berapa biayanya?",
        "Gratis selama akses awal. Semua yang dikerjakan secara manual akan tetap gratis. Kakak, asisten AI, boleh tidak dipakai dan nantinya menjadi tambahan berbayar."
      ),
    },
    film: {
      heading: ["Lebih banyak waktu untuk ", "keluarga", "."],
      soon: "Film segera hadir",
      body: "Film pendek tentang Miamus akan tampil di sini setelah selesai.",
    },
    request: {
      heading: "Beberapa rumah dulu.",
      body: "Miamus masih dalam akses awal, dengan undangan. Ceritakan sedikit tentang rumah Anda, dan permintaan Anda kami baca sendiri. Kami akan mengabari Anda, biasanya dalam sehari.",
    },
    dialog: {
      title: "Minta akses",
      body: "Pertama, masuk dengan Google supaya kami tahu siapa yang meminta. Setelah itu satu pertanyaan singkat, dan jawaban Anda kami baca sendiri.",
      google: ID_LIVE.request.google,
      consentBefore: `Permintaan ini membagikan nama dan email Google Anda kepada ${LEGAL.operatorName}, pengelola Miamus. Lihat `,
      privacy: "Kebijakan Privasi",
      consentAfter: ".",
      noGoogle: ID_LIVE.request.noGoogle,
      joining: ID_LIVE.request.joining,
      failed: ID_LIVE.request.failed,
      close: "Tutup",
    },
    footer: { by: `Miamus, oleh ${LEGAL.operatorName}`, line: "Biar pikiran sedikit lebih ringan.", privacy: "Kebijakan Privasi" },
    language: "Language · Bahasa",
    privacyHref: "/privasi",
  },
};

/** "/welcome" and "/selamat-datang" once switched on; the preview routes before. */
export const ONE_DAY_PREVIEW_HREF: Record<OwnerLocale, string> = {
  en: "/welcome/one-day",
  id: "/selamat-datang/sehari",
};
