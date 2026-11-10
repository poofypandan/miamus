import type { OwnerLocale } from "@/lib/owner-locale";

/**
 * Short tutorials for new features (owner, 2026-11-09: "when new features
 * come to the app, please give a short tutorial for owners and staff, if it
 * impacts them"). One entry per feature, newest first. Each is shown once as
 * a card where the feature lives, then stays readable in Household → What's
 * new.
 *
 * Owner entries carry both languages (docs/indonesian-glossary.md); a staff
 * entry, when a feature changes staff screens, is Indonesian only.
 */
export interface WhatsNewEntry {
  id: string;
  /** When it reached the app, for the list. */
  date: string;
  audience: "owner";
  title: Record<OwnerLocale, string>;
  steps: Record<OwnerLocale, string[]>;
  /** The card's button that opens the feature. */
  tryLabel: Record<OwnerLocale, string>;
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    // Shown on Chores → Today and on Today; Show me opens the checklist (Phase 164, D9).
    id: "bills-2026-11",
    date: "2026-11-10",
    audience: "owner",
    title: { en: "New: bills and upkeep", id: "Baru: tagihan dan perawatan" },
    steps: {
      en: [
        "Never miss a bill: Chores → Bills and upkeep, tick what your home pays or services, then Add.",
        "We remind you at 7:00 AM on the day, or a few days before, and Today shows what's coming up.",
        "Any chore can now repeat every 3 months or every year, and remind you. Bills given to you show in My tasks.",
      ],
      id: [
        "Jangan sampai telat bayar: Tugas → Tagihan dan perawatan, centang yang rutin dibayar atau dirawat, lalu Tambah.",
        "Kami ingatkan pukul 07.00 saat jatuh tempo, atau beberapa hari sebelumnya, dan Hari ini menampilkan yang segera tiba.",
        "Setiap tugas kini bisa berulang tiap 3 bulan atau tiap tahun, dan mengingatkan Anda. Tagihan untuk Anda muncul di Tugas saya.",
      ],
    },
    tryLabel: { en: "Show me", id: "Lihat" },
  },
  {
    // Shown on Today only to an admin who has a chore of their own (Phase 163, D5).
    id: "my-tasks-2026-11",
    date: "2026-11-10",
    audience: "owner",
    title: { en: "New: finish your own chores on Today", id: "Baru: selesaikan tugas Anda di Hari ini" },
    steps: {
      en: [
        "Chores given to you show under My tasks. Tap the circle when it's done; photos are optional.",
        "Tapped by mistake? Tap Undo, or open the chore and tap Mark not done.",
        "No need to switch to the Staff view. Staff still take both photos, as before.",
      ],
      id: [
        "Tugas untuk Anda muncul di Tugas saya. Ketuk lingkarannya kalau sudah selesai; foto boleh tidak.",
        "Salah ketuk? Ketuk Batalkan, atau buka tugasnya lalu ketuk Tandai belum selesai.",
        "Tidak perlu pindah ke tampilan Staf. Staf tetap mengambil dua foto, seperti biasa.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
  },
  {
    id: "feedback-2026-11",
    date: "2026-11-10",
    audience: "owner",
    title: { en: "New: send us feedback", id: "Baru: kirim masukan" },
    steps: {
      en: [
        "Household → Send feedback (also in About Miamus): an idea, or something that went wrong. A few words are enough.",
        "Staff can send too, from Lapor → Kirim masukan. It goes to the Miamus team; staff can't read anyone else's.",
      ],
      id: [
        "Rumah → Kirim masukan (juga di Tentang Miamus): ide, atau sesuatu yang tidak beres. Beberapa kata sudah cukup.",
        "Staf juga bisa mengirim, lewat Lapor → Kirim masukan. Masukan sampai ke tim Miamus; staf tidak bisa membaca masukan orang lain.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
  },
  {
    id: "notifications-2026-11",
    date: "2026-11-10",
    audience: "owner",
    title: { en: "Turn on notifications on your phone", id: "Aktifkan notifikasi di HP Anda" },
    steps: {
      en: [
        "Tap Turn on in the card at the top of the app, then Allow: urgent repairs, sick pets and food reminders reach this phone.",
        "On iPhone, first tap Share → Add to Home Screen, and open Miamus from there.",
        "Each phone is turned on separately. Household → Notifications shows On, Off or Blocked, and sends a test.",
      ],
      id: [
        "Ketuk Aktifkan di kartu paling atas aplikasi, lalu Izinkan: perbaikan darurat, hewan sakit, dan pengingat makanan masuk ke HP ini.",
        "Di iPhone, ketuk dulu Bagikan → Tambahkan ke Layar Utama, lalu buka Miamus dari sana.",
        "Setiap HP diaktifkan sendiri-sendiri. Rumah → Notifikasi menunjukkan Aktif, Mati, atau Diblokir, dan bisa kirim tes.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
  },
  {
    id: "who-lives-here-2026-11",
    date: "2026-11-10",
    audience: "owner",
    title: { en: "New: hide Pets if you don't have any", id: "Baru: sembunyikan Hewan kalau tidak ada" },
    steps: {
      en: [
        "Household → Who lives here: switch Pets off, and the Pets tab and every pet line disappear, for staff too.",
        "Have pets? Nothing changes for you.",
        "New households answer this when they sign up. Kids and Elders come later.",
      ],
      id: [
        "Rumah → Siapa yang tinggal di sini: matikan Hewan, tab Hewan dan semua baris hewan hilang, juga di HP staf.",
        "Punya hewan? Tidak ada yang berubah.",
        "Rumah baru menjawab ini saat mendaftar. Anak dan Lansia menyusul.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
  },
  {
    id: "weak-signal-saves-2026-11",
    date: "2026-11-09",
    audience: "owner",
    title: { en: "Saves that survive bad Wi-Fi", id: "Simpanan yang aman saat Wi-Fi lemah" },
    steps: {
      en: [
        "On a weak signal, a log, a finished chore or new food is kept on the phone instead of being lost.",
        "A \"waiting to send\" note shows until it goes. It sends by itself when the signal is back, and is never saved twice.",
        "Nothing to do: no need to enter it again.",
      ],
      id: [
        "Saat sinyal lemah, catatan, tugas yang selesai, atau makanan baru disimpan di HP, tidak hilang.",
        "Ada keterangan \"menunggu dikirim\" sampai terkirim. Terkirim otomatis saat sinyal bagus, dan tidak pernah tersimpan dua kali.",
        "Tidak perlu apa-apa: tidak perlu dicatat ulang.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
  },
  {
    id: "repair-costs-2026-11",
    date: "2026-11-09",
    audience: "owner",
    title: { en: "New: repair costs, receipts and notes", id: "Baru: biaya, nota, dan catatan perbaikan" },
    steps: {
      en: [
        "Open a repair to note what it cost and add a photo of the receipt. Only owners see these, never staff.",
        "Notes: you and staff can leave short updates on a repair, like \"needs a part, back Thursday\".",
        "Edit a repair to add its warranty date; the repair person's name is suggested from earlier repairs.",
      ],
      id: [
        "Buka perbaikan untuk mencatat biayanya dan menambahkan foto nota. Hanya pemilik yang bisa melihatnya, staf tidak.",
        "Catatan: Anda dan staf bisa menulis kabar singkat di perbaikan, misalnya \"perlu beli suku cadang, datang lagi Kamis\".",
        "Ubah perbaikan untuk menambahkan tanggal garansi; nama tukang disarankan dari perbaikan sebelumnya.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
  },
  {
    id: "repairs-2026-11",
    date: "2026-11-09",
    audience: "owner",
    title: { en: "New: Repairs", id: "Baru: Perbaikan" },
    steps: {
      en: [
        "Something broken? Chores → Repairs → Report a problem: pick the room, add a photo.",
        "Staff can report too: you accept or dismiss in To review.",
        "Schedule a visit and staff take before and after photos while the repair person works. Each room keeps its repair history.",
      ],
      id: [
        "Ada yang rusak? Tugas → Perbaikan → Lapor kerusakan: pilih ruangan, tambahkan foto.",
        "Staf juga bisa melapor: terima atau tolak di Perlu dicek.",
        "Jadwalkan perbaikan, staf mengambil foto sebelum dan sesudah selama tukang bekerja. Riwayat perbaikan tersimpan per ruangan.",
      ],
    },
    tryLabel: { en: "Show me Repairs", id: "Lihat Perbaikan" },
  },
  {
    id: "room-picker-2026-11",
    date: "2026-11-09",
    audience: "owner",
    title: { en: "New: several rooms at once, and spots", id: "Baru: beberapa ruangan sekaligus, dan bagian" },
    steps: {
      en: [
        "When you add a chore, pick a room under its floor, or the floor's Whole floor.",
        "Tap More rooms to add it to several rooms at once: one chore is made for each room.",
        "Then pick a spot (like the sink) when the chore is for one thing in the room.",
      ],
      id: [
        "Saat menambah tugas, pilih ruangan di bawah lantainya, atau Seluruh lantai.",
        "Ketuk Pilih ruangan lain untuk menambahkannya ke beberapa ruangan sekaligus: satu tugas dibuat untuk setiap ruangan.",
        "Lalu pilih bagiannya (misalnya wastafel) kalau tugasnya untuk satu bagian ruangan saja.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
  },
  {
    id: "floors-2026-11",
    date: "2026-11-09",
    audience: "owner",
    title: { en: "New: floors and spots", id: "Baru: lantai dan bagian" },
    steps: {
      en: [
        "In Chores → Rooms, tap Sort rooms once: your rooms are grouped by floor, and Undo is there if you change your mind.",
        "Rooms that were really parts of one room (toilet, sink) become one room, with each part kept on its chores.",
        "Rename, move or add floors and rooms any time in Household → Rooms.",
      ],
      id: [
        "Di Tugas → Ruangan, ketuk Kelompokkan sekali: ruangan Anda dikelompokkan per lantai, dan ada Batalkan kalau berubah pikiran.",
        "Ruangan yang sebenarnya bagian dari satu ruangan (toilet, wastafel) jadi satu ruangan, dengan bagiannya tetap di tugasnya.",
        "Ubah nama, pindahkan, atau tambah lantai dan ruangan kapan saja di Rumah → Ruangan.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
  },
  {
    id: "rooms-2026-11",
    date: "2026-11-09",
    audience: "owner",
    title: { en: "New: Rooms", id: "Baru: Ruangan" },
    steps: {
      en: [
        "Chores now has Rooms: tap it to see every room and what's set up there.",
        "Tap Vacuum (or Mop, Dust…) to see which rooms have it and which don't.",
        "Tap Add next to a room to set it up there.",
      ],
      id: [
        "Tugas sekarang punya Ruangan: ketuk untuk melihat setiap ruangan dan tugasnya.",
        "Ketuk Vakum (atau Pel, Lap debu…) untuk melihat ruangan mana yang sudah dan belum.",
        "Ketuk Tambah di samping ruangan untuk menambahkannya.",
      ],
    },
    tryLabel: { en: "Show me Rooms", id: "Lihat Ruangan" },
  },
];

/**
 * Tutorials for staff phones, in Bahasa Indonesia only (staff screens are
 * Indonesian, whoever holds the phone). One line each: staff change how they
 * work, not what they set up.
 */
export interface StaffWhatsNewEntry {
  id: string;
  date: string;
  title: string;
  /** One line per step; most features need one. */
  lines: string[];
}

export const STAFF_WHATS_NEW: StaffWhatsNewEntry[] = [
  {
    id: "staff-feedback-2026-11",
    date: "2026-11-10",
    title: "Baru: Kirim masukan",
    lines: ["Ada ide atau masalah di aplikasi? Ketuk Lapor → Kirim masukan. Dibaca tim Miamus dan pemilik rumah."],
  },
  {
    id: "staff-weak-signal-2026-11",
    date: "2026-11-09",
    title: "Baru: aman saat sinyal lemah",
    lines: [
      "Kalau sinyal lemah, catatan dan foto disimpan di HP dulu. Tulisannya \"Menunggu dikirim\".",
      "Nanti terkirim sendiri saat sinyal bagus. Tidak perlu dicatat ulang.",
    ],
  },
  {
    id: "staff-floors-2026-11",
    date: "2026-11-09",
    title: "Baru: lantai dan bagian ruangan",
    lines: [
      "Nama ruangan sekarang ada lantai dan bagiannya, misalnya LT2 · GB2 Bathroom · Wastafel: kerjakan bagian itu saja.",
    ],
  },
  {
    id: "staff-repairs-2026-11",
    date: "2026-11-09",
    title: "Baru: Lapor kerusakan",
    lines: [
      "Lihat ada yang rusak? Ketuk Lapor → Lapor kerusakan, pilih ruangan, ambil foto.",
      "Kalau bocor, listrik atau gas, nyalakan Darurat: pemilik rumah langsung diberi tahu.",
      "Saat tukang datang, buka tugas perbaikannya: foto sebelum saat mulai, foto sesudah saat selesai.",
    ],
  },
  {
    id: "staff-repair-notes-2026-11",
    date: "2026-11-09",
    title: "Baru: catatan perbaikan",
    lines: ["Di tugas perbaikan, tulis catatan untuk pemilik rumah, misalnya \"tukang perlu beli suku cadang, datang lagi Kamis\"."],
  },
];

export function staffWhatsNewEntry(id: string): StaffWhatsNewEntry | undefined {
  return STAFF_WHATS_NEW.find((entry) => entry.id === id);
}

export function whatsNewEntry(id: string): WhatsNewEntry | undefined {
  return WHATS_NEW.find((entry) => entry.id === id);
}

/** This phone has closed the card (a convenience, so storage may fail). */
export function storageKey(id: string): string {
  return `miamus.whats-new.${id}`;
}
