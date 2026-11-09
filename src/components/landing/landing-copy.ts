import { LEGAL } from "@/config/legal";
import type { OwnerLocale } from "@/lib/owner-locale";

/**
 * The public landing page's words (docs/landing-page-proposal.md, approved
 * 2026-11-09). One object per language, written rather than translated line
 * by line, as About Miamus is. Every claim here is checked against the app;
 * the proposal lists the file behind each one.
 *
 * Indonesian follows docs/indonesian-glossary.md. No emoji anywhere: icons
 * are drawn by the page (AGENTS.md, Design).
 *
 * The weak-signal question waits for PR #41 (saves queued on a bad
 * connection); until it is live, the page has seven questions.
 */

export type LandingFeature = "pets" | "chores" | "kitchen" | "repairs";
export type LandingStaffPoint = "language" | "pin" | "leave" | "location";
export type LandingDataPoint = "ads" | "download";
export type LandingShot = "owner-today" | "owner-chore" | "staff-today" | "owner-done";

export interface LandingCopy {
  /** <title> and the link preview. */
  metaTitle: string;
  metaDescription: string;
  /** The top bar's link to the sign-in screen. */
  signIn: string;
  hero: {
    headline: string;
    subline: string;
    brandLine: string;
    requestAccess: string;
    haveAccount: string;
    staffPrompt: string;
    betaNote: string;
    shotAlt: string;
  };
  how: {
    heading: string;
    steps: { title: string; body: string; shot: LandingShot; shotAlt: string }[];
  };
  features: { heading: string; items: { id: LandingFeature; title: string; body: string }[] };
  staff: { heading: string; points: { id: LandingStaffPoint; text: string }[] };
  data: { heading: string; points: { id: LandingDataPoint; text: string }[]; policy: string };
  faq: { heading: string; items: { q: string; a: string }[] };
  request: {
    heading: string;
    body: string;
    google: string;
    consent: string;
    privacy: string;
    noGoogle: string;
    joining: string;
    failed: string;
  };
  footer: { madeBy: string; privacy: string };
  privacyHref: string;
  /** The same page in the other language. */
  otherHref: string;
}

export const LANDING_HREF: Record<OwnerLocale, string> = {
  en: "/welcome",
  id: "/selamat-datang",
};

export const LANDING_COPY: Record<OwnerLocale, LandingCopy> = {
  en: {
    metaTitle: "Miamus: know what's done at home",
    metaDescription:
      "Your family and staff share the daily care of your pets, home and kitchen, in one calm place.",
    signIn: "Sign in",
    hero: {
      headline: "Know what's done at home, without asking again.",
      subline:
        "Your family and staff share the daily care of your pets, home and kitchen, in one calm place.",
      brandLine: "A little less on your mind.",
      requestAccess: "Request access",
      haveAccount: "I already have an account",
      staffPrompt: "Staff?",
      betaNote: "Free while Miamus is in beta. We review every new household.",
      shotAlt: "An owner's Today in Miamus: the terrace mopped by Sari and Mochi's breakfast, both done.",
    },
    how: {
      heading: "How it works",
      steps: [
        {
          title: "Set it once.",
          body: "Add “Mop the terrace, every day” for Sari, or Mochi's meal times. Miamus repeats it, day after day.",
          shot: "owner-chore",
          shotAlt: "The chore form: Mop the terrace, for Sari, every day.",
        },
        {
          title: "They see it on their phone.",
          body: "Sari opens Miamus, and today's list is in Bahasa Indonesia. She taps her chore, takes a photo before and after, and it's done. No account, no email.",
          shot: "staff-today",
          shotAlt: "The staff's list for today, in Bahasa Indonesia.",
        },
        {
          title: "You see it's done.",
          body: "Who did it, when, and the photos, on your Today. Turn on notifications, and your phone tells you straight away when a pet is unwell or something urgent breaks.",
          shot: "owner-done",
          shotAlt: "Today on the owner's phone, with the finished chore and who did it.",
        },
      ],
    },
    features: {
      heading: "What it looks after",
      items: [
        {
          id: "pets",
          title: "Pets",
          body: "Meals, potty breaks and medicine, with photos. Vet visits and a health record for each pet.",
        },
        {
          id: "chores",
          title: "Chores, room by room",
          body: "Who does what, on which floor, with before and after photos.",
        },
        {
          id: "kitchen",
          title: "Kitchen",
          body: "Food at home and when it expires, who gave it, the container to return, and the shopping list.",
        },
        {
          id: "repairs",
          title: "Repairs",
          body: "Staff report what's broken with a photo. You schedule the visit and keep the costs to yourself.",
        },
      ],
    },
    staff: {
      heading: "Made for the people who do the work.",
      points: [
        {
          id: "language",
          text: "Staff screens are in plain Bahasa Indonesia, with big buttons and photos instead of typing.",
        },
        { id: "pin", text: "No account or email: each person signs in with their name and a 4-digit PIN." },
        {
          id: "leave",
          text: "Leave (cuti) is built in. Their tasks pause or open up to others while they're away.",
        },
        { id: "location", text: "Miamus never tracks where anyone is." },
      ],
    },
    data: {
      heading: "Your household's data stays yours.",
      points: [
        { id: "ads", text: "No ads, and we never sell your data." },
        {
          id: "download",
          text: "Download a copy any time. Asked to delete your household? It's deleted 7 days later, so a mistake can still be undone.",
        },
      ],
      policy: "Read the privacy policy",
    },
    faq: {
      heading: "Questions",
      items: [
        {
          q: "Who is Miamus for?",
          a: "Households where family and staff share the daily work: pets, chores, the kitchen, repairs. It works with one helper or several.",
        },
        {
          q: "Do my staff need an account or email?",
          a: "No. You send a link (on WhatsApp, for example). It connects their phone to your home, and they sign in with their name and a PIN. If they're ever signed out, they use the house code.",
        },
        {
          q: "What language do staff see?",
          a: "Bahasa Indonesia, always. You choose English or Bahasa Indonesia for yourself.",
        },
        {
          q: "Is there an app to download?",
          a: "No app store needed. Open miamus.app on Android or iPhone and add it to the home screen. It opens full screen, like an app.",
        },
        {
          q: "Does Miamus send WhatsApp messages?",
          a: "No automatic messages. You share the invite link yourself, and after a sick-pet report staff can tap once to tell you on WhatsApp. If you turn on notifications, urgent things also reach your phone straight away.",
        },
        {
          q: "Can my family help manage?",
          a: "Yes. Invite your partner or family; they sign in with Google and manage the household day to day, just like you. Only the person who created the household can delete it.",
        },
        {
          q: "What does it cost?",
          a: "Free while Miamus is in beta. Everything you do by hand will stay free; later, an optional AI helper will be the paid extra.",
        },
      ],
    },
    request: {
      heading: "Start with your household",
      body: "Miamus is invite-only while it's in beta. Sign in with Google and tap Request access. We'll review it, and you'll name your household once it's approved.",
      google: "Continue with Google",
      consent: `Your request shares your Google name and email with ${LEGAL.operatorName}, who runs Miamus. See the `,
      privacy: "Privacy Policy",
      noGoogle: `No Google account? Email ${LEGAL.contactEmail}.`,
      joining: "Joining someone's household? Open the invite link they sent you.",
      failed: "Couldn't reach Google sign-in. Try again.",
    },
    footer: { madeBy: `Made with care by ${LEGAL.operatorName}`, privacy: "Privacy Policy" },
    privacyHref: "/privacy",
    otherHref: LANDING_HREF.id,
  },
  id: {
    metaTitle: "Miamus: tahu apa yang sudah beres di rumah",
    metaDescription:
      "Keluarga dan staf berbagi tugas harian untuk hewan, rumah, dan dapur, di satu tempat yang tenang.",
    signIn: "Masuk",
    hero: {
      headline: "Tahu apa yang sudah beres di rumah, tanpa perlu tanya lagi.",
      subline:
        "Keluarga dan staf berbagi tugas harian untuk hewan, rumah, dan dapur, di satu tempat yang tenang.",
      brandLine: "Biar pikiran sedikit lebih ringan.",
      requestAccess: "Minta akses",
      haveAccount: "Saya sudah punya akun",
      staffPrompt: "Staf?",
      betaNote: "Gratis selama Miamus masih beta. Setiap rumah baru kami tinjau.",
      shotAlt: "Hari ini di Miamus: teras sudah dipel oleh Sari dan sarapan Mochi sudah selesai.",
    },
    how: {
      heading: "Cara kerjanya",
      steps: [
        {
          title: "Atur sekali.",
          body: "Tambahkan “Pel teras, setiap hari” untuk Sari, atau jam makan Mochi. Miamus mengulangnya setiap hari.",
          shot: "owner-chore",
          shotAlt: "Formulir tugas: Pel teras, untuk Sari, setiap hari.",
        },
        {
          title: "Staf melihatnya di HP.",
          body: "Sari membuka Miamus, dan daftar hari ini dalam Bahasa Indonesia. Dia ketuk tugasnya, foto sebelum dan sesudah, selesai. Tanpa akun, tanpa email.",
          shot: "staff-today",
          shotAlt: "Daftar tugas staf hari ini, dalam Bahasa Indonesia.",
        },
        {
          title: "Anda lihat sudah selesai.",
          body: "Siapa yang mengerjakan, jam berapa, dan fotonya, di Hari ini. Nyalakan notifikasi, dan HP Anda langsung diberi tahu kalau hewan sakit atau ada kerusakan darurat.",
          shot: "owner-done",
          shotAlt: "Hari ini di HP pemilik, dengan tugas yang selesai dan siapa yang mengerjakannya.",
        },
      ],
    },
    features: {
      heading: "Yang diurus Miamus",
      items: [
        {
          id: "pets",
          title: "Hewan",
          body: "Makan, Pipis & Pup, dan obat, lengkap dengan foto. Kunjungan dokter hewan dan catatan kesehatan tiap hewan.",
        },
        {
          id: "chores",
          title: "Tugas rumah, per ruangan",
          body: "Siapa mengerjakan apa, di lantai mana, dengan foto sebelum dan sesudah.",
        },
        {
          id: "kitchen",
          title: "Dapur",
          body: "Makanan di rumah dan kapan kedaluwarsa, dari siapa, wadah yang perlu dikembalikan, dan daftar belanja.",
        },
        {
          id: "repairs",
          title: "Perbaikan",
          body: "Staf melaporkan kerusakan dengan foto. Anda menjadwalkan perbaikan, dan biayanya hanya untuk pemilik.",
        },
      ],
    },
    staff: {
      heading: "Dibuat untuk yang mengerjakannya.",
      points: [
        {
          id: "language",
          text: "Layar staf memakai Bahasa Indonesia yang sederhana, dengan tombol besar dan foto, bukan ketikan.",
        },
        { id: "pin", text: "Tanpa akun atau email: setiap orang masuk dengan nama dan PIN 4 angka." },
        { id: "leave", text: "Cuti sudah tersedia. Selama cuti, tugasnya dijeda atau terbuka untuk yang lain." },
        { id: "location", text: "Miamus tidak pernah melacak lokasi siapa pun." },
      ],
    },
    data: {
      heading: "Data rumah Anda tetap milik Anda.",
      points: [
        { id: "ads", text: "Tanpa iklan, dan kami tidak pernah menjual data Anda." },
        {
          id: "download",
          text: "Unduh salinannya kapan saja. Minta rumah Anda dihapus? Rumah dihapus 7 hari kemudian, jadi masih bisa dibatalkan.",
        },
      ],
      policy: "Baca Kebijakan Privasi",
    },
    faq: {
      heading: "Pertanyaan",
      items: [
        {
          q: "Miamus untuk siapa?",
          a: "Rumah tangga yang tugas hariannya dibagi antara keluarga dan staf: hewan, tugas rumah, dapur, perbaikan. Bisa untuk satu staf atau beberapa.",
        },
        {
          q: "Apakah staf perlu akun atau email?",
          a: "Tidak. Anda kirim link (misalnya lewat WhatsApp). Link itu menghubungkan HP mereka ke rumah Anda, lalu mereka masuk dengan nama dan PIN. Kalau suatu saat keluar, mereka masuk lagi dengan kode rumah.",
        },
        {
          q: "Staf melihat bahasa apa?",
          a: "Selalu Bahasa Indonesia. Anda sendiri bisa memilih Bahasa Inggris atau Bahasa Indonesia.",
        },
        {
          q: "Apakah perlu unduh aplikasi?",
          a: "Tidak perlu lewat app store. Buka miamus.app di Android atau iPhone, lalu tambahkan ke layar utama. Tampilannya layar penuh, seperti aplikasi.",
        },
        {
          q: "Apakah Miamus mengirim pesan WhatsApp?",
          a: "Tidak ada pesan otomatis. Anda sendiri yang membagikan link undangan, dan setelah laporan hewan sakit staf bisa sekali ketuk untuk memberi tahu Anda lewat WhatsApp. Kalau notifikasi dinyalakan, hal yang darurat juga langsung masuk ke HP Anda.",
        },
        {
          q: "Apakah keluarga bisa ikut mengelola?",
          a: "Bisa. Undang pasangan atau keluarga; mereka masuk dengan Google dan bisa mengelola rumah sehari-hari, sama seperti Anda. Hanya pembuat rumah yang bisa menghapusnya.",
        },
        {
          q: "Berapa biayanya?",
          a: "Gratis selama Miamus masih beta. Semua yang dikerjakan secara manual akan tetap gratis; nanti, asisten AI opsional menjadi tambahan berbayar.",
        },
      ],
    },
    request: {
      heading: "Mulai dengan rumah Anda",
      body: "Miamus masih beta dan hanya dengan undangan. Masuk dengan Google, lalu ketuk Minta akses. Kami akan meninjaunya, dan Anda bisa memberi nama rumah setelah disetujui.",
      google: "Lanjutkan dengan Google",
      consent: `Permintaan ini membagikan nama dan email Google Anda kepada ${LEGAL.operatorName}, pengelola Miamus. Lihat `,
      privacy: "Kebijakan Privasi",
      noGoogle: `Tidak punya akun Google? Kirim email ke ${LEGAL.contactEmail}.`,
      joining: "Ingin bergabung ke rumah orang lain? Buka link undangan yang mereka kirim.",
      failed: "Tidak bisa membuka login Google. Coba lagi.",
    },
    footer: { madeBy: `Dibuat dengan sepenuh hati oleh ${LEGAL.operatorName}`, privacy: "Kebijakan Privasi" },
    privacyHref: "/privasi",
    otherHref: LANDING_HREF.en,
  },
};
