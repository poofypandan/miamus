import type { Feature } from "@/lib/features";
import type { OwnerLocale } from "@/lib/owner-locale";

/**
 * The guide to Miamus (Phase 180, docs/phase-180-kakak-answers-plan.md,
 * section 4): what Miamus is for and how each part of it works, in a few
 * short sentences per entry, in English and Bahasa Indonesia.
 *
 * One source, two readers. Kakak's request carries it (guideForKakak), so
 * she can answer "what is Miamus for?" or "how do I link a staff phone?"
 * from it and only from it; the How Miamus works screen (the plan's H2) will
 * list the same entries, so the two can never disagree.
 *
 * Rules for every entry (tests/unit/guide.test.ts holds them):
 *   - what Miamus does today, as the screens say it. No prices, plans,
 *     dates or promises, and nothing that is true only for some homes;
 *   - both languages, by docs/indonesian-glossary.md; no emoji;
 *   - a body is at most 280 characters;
 *   - a feature that changes how something works changes its entry in the
 *     same PR: every owner What's new card is named in some entry's
 *     `covers`, or in NOT_IN_GUIDE with the reason.
 */

export type GuideGroup = "start" | "home" | "pets" | "kitchen" | "settings";

export const GUIDE_GROUPS: readonly GuideGroup[] = ["start", "home", "pets", "kitchen", "settings"];

export const GUIDE_GROUP_TITLES: Record<GuideGroup, Record<OwnerLocale, string>> = {
  start: { en: "Getting started", id: "Memulai" },
  home: { en: "Home", id: "Rumah" },
  pets: { en: "Pets", id: "Hewan" },
  kitchen: { en: "Kitchen", id: "Dapur" },
  settings: { en: "Settings", id: "Pengaturan" },
};

/**
 * The screens an entry can point at, by their path in words, as the tabs and
 * pages name themselves (bottom-tab-bar.tsx, chores-tab.tsx, staff-tab.tsx).
 * The screen's link joins each of these with the How Miamus works screen.
 */
export const GUIDE_PLACES = {
  today: { en: "Today", id: "Hari ini" },
  home_chores: { en: "Home → Chores", id: "Rumah → Tugas" },
  home_rooms: { en: "Home → Rooms", id: "Rumah → Ruangan" },
  home_repairs: { en: "Home → Repairs", id: "Rumah → Perbaikan" },
  home_bills: { en: "Home → Bills and upkeep", id: "Rumah → Tagihan dan perawatan" },
  pets: { en: "Pets", id: "Hewan" },
  kitchen_food: { en: "Kitchen → Food", id: "Dapur → Makanan" },
  kitchen_menu: { en: "Kitchen → Menu", id: "Dapur → Menu" },
  kitchen_shopping: { en: "Kitchen → Shopping", id: "Dapur → Belanja" },
  settings_family: { en: "Settings → Family", id: "Pengaturan → Keluarga" },
  settings_staff: { en: "Settings → Staff", id: "Pengaturan → Staf" },
  settings_features: { en: "Settings → Features", id: "Pengaturan → Fitur" },
  settings_invite: { en: "Settings → Invite someone", id: "Pengaturan → Undang" },
  settings_notifications: { en: "Settings → Notifications", id: "Pengaturan → Notifikasi" },
  settings_language: { en: "Settings → Language", id: "Pengaturan → Bahasa" },
  settings_lock: { en: "Settings → App lock", id: "Pengaturan → Kunci aplikasi" },
  settings_kakak: { en: "Settings → Kakak", id: "Pengaturan → Kakak" },
  settings_data: { en: "Settings → Your data", id: "Pengaturan → Data Anda" },
  settings_about: { en: "Settings → About Miamus", id: "Pengaturan → Tentang Miamus" },
} as const satisfies Record<string, Record<OwnerLocale, string>>;

export type GuidePlace = keyof typeof GUIDE_PLACES;

export interface GuideEntry {
  /** Stable, kebab-case: "chores-vs-routines". */
  id: string;
  group: GuideGroup;
  title: Record<OwnerLocale, string>;
  /** Two or three short sentences, at most GUIDE_BODY_MAX characters. */
  body: Record<OwnerLocale, string>;
  /** The screen it is about, or null for an entry about Miamus as a whole. */
  where: GuidePlace | null;
  /** Its feature, when the home can switch that off in Settings → Features. */
  needs?: Feature | "pets";
  /** The What's new cards (lib/whats-new.ts) this entry now speaks for. */
  covers?: string[];
}

export const GUIDE_BODY_MAX = 280;
/** The guide as Kakak reads it, per language: about 3,500 tokens at most. */
export const GUIDE_FOR_KAKAK_MAX = 14_000;

export const GUIDE: readonly GuideEntry[] = [
  // ---------------------------------------------------------------- start
  {
    id: "what-miamus-is-for",
    group: "start",
    title: { en: "What Miamus is for", id: "Untuk apa Miamus" },
    body: {
      en: "Miamus keeps the running of your home in one place: chores, pets, the kitchen and the people who help. You say what should happen once; staff see it on their own phone and tick it off, often with a photo. You only hear about what didn't happen.",
      id: "Miamus menyatukan urusan rumah di satu tempat: tugas, hewan, dapur, dan orang-orang yang membantu. Anda cukup bilang sekali; staf melihatnya di HP masing-masing dan menandainya selesai, sering dengan foto. Anda hanya dikabari soal yang belum dikerjakan.",
    },
    where: null,
  },
  {
    id: "the-five-tabs",
    group: "start",
    title: { en: "The five tabs", id: "Lima tab" },
    body: {
      en: "Today shows the day at a glance and what is waiting for you. Home has chores, rooms and repairs. Pets has each pet's routines and health. Kitchen has food, the menu and shopping. Settings has people, features and notifications.",
      id: "Hari ini menampilkan ringkasan hari dan yang menunggu Anda. Rumah berisi tugas, ruangan, dan perbaikan. Hewan berisi rutinitas dan kesehatan tiap hewan. Dapur berisi makanan, menu, dan belanja. Pengaturan berisi orang, fitur, dan notifikasi.",
    },
    where: null,
  },
  {
    id: "today",
    group: "start",
    title: { en: "Today", id: "Hari ini" },
    body: {
      en: "The line at the top says whether everything is on track or something is late. Waiting for you lists what needs your decision, like a leave request. Below it, each person's tasks for the day, your own under My tasks, and Coming up.",
      id: "Baris paling atas menunjukkan apakah semuanya lancar atau ada yang terlambat. Menunggu Anda berisi yang perlu keputusan Anda, misalnya permintaan cuti. Di bawahnya ada tugas tiap orang hari itu, tugas Anda di Tugas saya, dan Segera.",
    },
    where: "today",
    covers: ["my-tasks-2026-11", "first-run-2026-11"],
  },
  {
    id: "link-a-staff-phone",
    group: "start",
    title: { en: "Linking a staff phone", id: "Menghubungkan HP staf" },
    body: {
      en: "Add each person in Settings → Staff, then send the one WhatsApp message from there. On their phone they open the link, pick their name and choose a 4-digit PIN. If a phone gets signed out, the house code under Settings → Staff sign-in lets them back in.",
      id: "Tambahkan tiap orang di Pengaturan → Staf, lalu kirim satu pesan WhatsApp dari sana. Di HP-nya, staf membuka link, memilih namanya, dan membuat PIN 4 angka. Kalau HP-nya keluar dari Miamus, kode rumah di Pengaturan → Masuk staf dipakai untuk masuk lagi.",
    },
    where: "settings_staff",
  },
  {
    id: "what-staff-see",
    group: "start",
    title: { en: "What staff see", id: "Yang dilihat staf" },
    body: {
      en: "Staff phones are in Bahasa Indonesia and show their own tasks for the day, plus what you leave on for them. In Settings → Staff, tap the eye beside a person to choose what they see: chores for anyone, pet routines, Kitchen, Repairs. Staff never see prices.",
      id: "HP staf berbahasa Indonesia dan menampilkan tugas mereka hari itu, ditambah yang Anda izinkan. Di Pengaturan → Staf, ketuk ikon mata di samping nama untuk memilih yang dilihatnya: tugas untuk siapa saja, rutinitas hewan, Dapur, Perbaikan. Staf tidak pernah melihat harga.",
    },
    where: "settings_staff",
  },
  {
    id: "invite-family",
    group: "start",
    title: { en: "Inviting family", id: "Mengundang keluarga" },
    body: {
      en: "Settings → Invite someone → Invite family makes a link to send to a family member. They sign in with it and share this home with you. Settings → Family lists who is in it.",
      id: "Pengaturan → Undang → Undang keluarga membuat link untuk dikirim ke anggota keluarga. Mereka masuk lewat link itu dan ikut mengurus rumah ini bersama Anda. Pengaturan → Keluarga menampilkan siapa saja anggotanya.",
    },
    where: "settings_invite",
  },
  {
    id: "photos-as-proof",
    group: "start",
    title: { en: "Photos as proof", id: "Foto sebagai bukti" },
    body: {
      en: "Staff finish a chore with a photo before and a photo after. A pet routine asks for one photo, three for a walk with one pet (start, there, back), or just a tick if you choose that on the routine. You see the photos on Today.",
      id: "Staf menyelesaikan tugas dengan foto sebelum dan foto sesudah. Rutinitas hewan minta satu foto, tiga foto untuk jalan-jalan dengan satu hewan (mulai, sampai, pulang), atau cukup centang kalau Anda memilihnya di rutinitasnya. Fotonya tampil di Hari ini.",
    },
    where: "today",
  },
  // ----------------------------------------------------------------- home
  {
    id: "chores-vs-routines",
    group: "home",
    title: { en: "Chores and routines", id: "Tugas dan rutinitas" },
    body: {
      en: "A chore is a job in the house, like mopping the terrace: once or repeating, for one person or for anyone. A routine is care for a pet at set times, like a walk at 07:00. Chores are in Home → Chores; routines are on each pet in Pets.",
      id: "Tugas adalah pekerjaan rumah, seperti mengepel teras: sekali atau berulang, untuk satu orang atau siapa saja. Rutinitas adalah perawatan hewan pada jam tertentu, seperti jalan-jalan jam 07.00. Tugas ada di Rumah → Tugas; rutinitas ada di tiap hewan di tab Hewan.",
    },
    where: "home_chores",
    covers: ["starter-list-2026-11"],
  },
  {
    id: "add-a-chore",
    group: "home",
    title: { en: "Adding a chore by hand", id: "Menambah tugas sendiri" },
    body: {
      en: "Home → Chores → Add Chore: what to do, who does it or anyone, the day, and whether it repeats. A room, a time and a note are optional. With Kakak on, one sentence to her does the same.",
      id: "Rumah → Tugas → Tambah Tugas: apa yang dikerjakan, siapa yang mengerjakan atau siapa saja, harinya, dan apakah berulang. Ruangan, jam, dan catatan boleh dikosongkan. Kalau Kakak aktif, cukup satu kalimat ke Kakak.",
    },
    where: "home_chores",
  },
  {
    id: "repeating-chores",
    group: "home",
    title: { en: "Repeating chores and reminders", id: "Tugas berulang dan pengingat" },
    body: {
      en: "A chore can repeat every day, week or month, or less often, up to every year. Remind me sends you a notification at 07:00 on the day, or 1, 3 or 7 days before. Chores given to you show under My tasks on Today.",
      id: "Tugas bisa berulang setiap hari, minggu, atau bulan, atau lebih jarang, sampai setiap tahun. Ingatkan saya mengirim notifikasi pukul 07.00 pada harinya, atau 1, 3, atau 7 hari sebelumnya. Tugas untuk Anda muncul di Tugas saya di Hari ini.",
    },
    where: "home_chores",
  },
  {
    id: "rooms",
    group: "home",
    title: { en: "Rooms, floors and spots", id: "Ruangan, lantai, dan bagian" },
    body: {
      en: "Home → Rooms lists every room by floor and what is set up there. A room can hold rooms inside it, like a bathroom in its bedroom; a spot is one thing in a room, like the sink. Change them in Home → Rooms → Edit rooms.",
      id: "Rumah → Ruangan menampilkan semua ruangan per lantai beserta tugasnya. Ruangan bisa punya ruangan di dalamnya, seperti kamar mandi di dalam kamar; bagian adalah satu benda di ruangan, seperti wastafel. Ubah di Rumah → Ruangan → Ubah ruangan.",
    },
    where: "home_rooms",
    covers: ["rooms-2026-11", "floors-2026-11", "room-picker-2026-11", "rooms-inside-2026-11"],
  },
  {
    id: "repairs",
    group: "home",
    title: { en: "Repairs", id: "Perbaikan" },
    body: {
      en: "Something broken? Home → Repairs → Report a problem, with the room and a photo. Staff can report too; you accept or dismiss it under To review. When a repair person comes, staff log the visit with a photo before and after. Costs and receipts are for owners only.",
      id: "Ada yang rusak? Rumah → Perbaikan → Lapor kerusakan, dengan ruangan dan fotonya. Staf juga bisa melapor; Anda terima atau tolak di Perlu dicek. Saat tukang datang, staf mencatat kunjungannya dengan foto sebelum dan sesudah. Biaya dan nota hanya untuk pemilik.",
    },
    where: "home_repairs",
    needs: "repairs",
    covers: ["repairs-2026-11", "repair-costs-2026-11", "walkins-2026-11", "repair-pushes-2026-11", "developer-list-2026-11"],
  },
  {
    id: "bills-and-upkeep",
    group: "home",
    title: { en: "Bills and upkeep", id: "Tagihan dan perawatan" },
    body: {
      en: "Home → Bills and upkeep: tick what your home pays or services, like electricity, water or the AC. Miamus reminds you at 07:00 on the day, or a few days before. Mark paid can keep the amount and a photo of the receipt; only owners see those.",
      id: "Rumah → Tagihan dan perawatan: centang yang rutin dibayar atau dirawat, seperti listrik, air, atau AC. Miamus mengingatkan pukul 07.00 saat jatuh tempo, atau beberapa hari sebelumnya. Tandai sudah dibayar bisa menyimpan jumlah dan foto bukti bayar; hanya pemilik yang melihatnya.",
    },
    where: "home_bills",
    needs: "bills",
    covers: ["bills-2026-11", "bill-payments-2026-11"],
  },
  {
    id: "when-a-task-is-not-done",
    group: "home",
    title: { en: "When a task isn't done", id: "Kalau tugas tidak dikerjakan" },
    body: {
      en: "Staff can say why a task couldn't be done, like out of stock; it shows in amber on Today with their note and photo. At 19:00 one notification lists what is still open, only if something is. Change the time or turn it off in Settings → Notifications.",
      id: "Staf bisa memberi tahu kenapa tugas tidak bisa dikerjakan, misalnya barang habis; tugasnya ditandai kuning di Hari ini dengan catatan dan fotonya. Pukul 19.00, satu notifikasi berisi yang belum selesai, hanya kalau ada. Ubah jamnya atau matikan di Pengaturan → Notifikasi.",
    },
    where: "today",
    covers: ["couldnt-do-2026-11"],
  },
  {
    id: "leave",
    group: "home",
    title: { en: "Staff leave", id: "Cuti staf" },
    body: {
      en: "Staff ask for leave from their own phone. You are told, and it waits under Waiting for you on Today until you decide. While there is leave to see, Settings shows a Leave row with every request.",
      id: "Staf mengajukan cuti dari HP mereka sendiri. Anda diberi tahu, dan permintaannya menunggu di Menunggu Anda di Hari ini sampai Anda memutuskan. Selama ada cuti, Pengaturan menampilkan baris Cuti berisi semua permintaannya.",
    },
    where: "today",
  },
  // ----------------------------------------------------------------- pets
  {
    id: "add-a-pet",
    group: "pets",
    title: { en: "Adding a pet", id: "Menambah hewan" },
    body: {
      en: "On the Pets tab, tap Add Pet. Miamus then offers the usual routines, already ticked: a morning walk, an evening walk and fresh water for a dog; fresh water and the litter box for a cat. Untick what you don't want, then Add.",
      id: "Di tab Hewan, ketuk Tambah Hewan. Miamus lalu menawarkan rutinitas yang biasa, sudah dicentang: jalan pagi, jalan sore, dan ganti air minum untuk anjing; ganti air minum dan pasir kucing untuk kucing. Hapus centang yang tidak perlu, lalu Tambah.",
    },
    where: "pets",
    needs: "pets",
    covers: ["pet-starters-2026-11"],
  },
  {
    id: "pet-routines",
    group: "pets",
    title: { en: "Pet routines", id: "Rutinitas hewan" },
    body: {
      en: "Each pet has meals, potty breaks and other routines: walks, lights off, play, fresh water, brushing teeth, or your own. Add one in Pets → the pet → Add routine, for one pet or several, every day or on the days you choose.",
      id: "Tiap hewan punya jam makan, pipis dan pup, serta rutinitas lain: jalan-jalan, matikan lampu, ajak main, ganti air minum, sikat gigi, atau buatan Anda sendiri. Tambahkan di Hewan → hewannya → Tambah rutinitas, untuk satu atau beberapa hewan, setiap hari atau di hari pilihan Anda.",
    },
    where: "pets",
    needs: "pets",
    covers: ["who-lives-here-2026-11"],
  },
  {
    id: "routine-reminders",
    group: "pets",
    title: { en: "Remind staff, and tell us if it's not done", id: "Ingatkan staf, dan kabari kami jika belum dikerjakan" },
    body: {
      en: "On a routine, Remind staff at this time sends staff a notification at its time if it isn't done yet. Tell us if it's not done sends every owner one notification 30 minutes later if it still isn't. Both are off until you turn them on.",
      id: "Di rutinitas, Ingatkan staf di jam ini mengirim notifikasi ke staf pada jamnya kalau belum dikerjakan. Kabari kami jika belum dikerjakan mengirim satu notifikasi ke semua pemilik 30 menit kemudian kalau masih belum. Keduanya mati sampai Anda nyalakan.",
    },
    where: "pets",
    needs: "pets",
    covers: ["routine-reminders-2026-11"],
  },
  {
    id: "pet-health",
    group: "pets",
    title: { en: "Medicine, grooming and the vet", id: "Obat, grooming, dan dokter hewan" },
    body: {
      en: "Each pet's page in Pets keeps its medicine schedule, grooming and vet visits, with photos. A job for a person, like taking a dog to the groomer tomorrow, is a chore.",
      id: "Halaman tiap hewan di tab Hewan menyimpan jadwal obat, grooming, dan kunjungan dokter hewan, lengkap dengan fotonya. Pekerjaan untuk seseorang, seperti mengantar anjing ke groomer besok, adalah tugas.",
    },
    where: "pets",
    needs: "pets",
  },
  // -------------------------------------------------------------- kitchen
  {
    id: "food-at-home",
    group: "kitchen",
    title: { en: "Food that is ready to eat", id: "Makanan siap dimakan" },
    body: {
      en: "Kitchen → Food lists leftovers, gifts and bought dishes: where each is kept and until when. Miamus never fills in a date by itself; anything close to its date is shown first, so it gets eaten in time.",
      id: "Dapur → Makanan berisi sisa masakan, kiriman, dan makanan yang dibeli: di mana disimpan dan sampai kapan. Miamus tidak pernah mengisi tanggalnya sendiri; yang hampir lewat tanggalnya tampil paling atas, supaya sempat dimakan.",
    },
    where: "kitchen_food",
    needs: "food",
  },
  {
    id: "ingredients",
    group: "kitchen",
    title: { en: "Ingredients: places and Use soon", id: "Bahan masakan: tempat dan Segera dipakai" },
    body: {
      en: "Ingredients sit under Kitchen → Food, grouped by where they are kept: Fridge, Freezer, Counter, Cupboard. Use soon, on top, shows what expires within a week. Tap an ingredient to move it or set its date. Add ingredient adds a new one.",
      id: "Bahan masakan ada di Dapur → Makanan, dikelompokkan menurut tempatnya: Kulkas, Freezer, Meja, Lemari. Segera dipakai, di paling atas, menunjukkan yang kedaluwarsa dalam seminggu. Ketuk bahan untuk memindahkan atau mengatur tanggalnya. Tambah bahan masakan menambah yang baru.",
    },
    where: "kitchen_food",
    needs: "kitchen",
    covers: ["kitchen-places-2026-11"],
  },
  {
    id: "amounts",
    group: "kitchen",
    title: { en: "Amounts", id: "Jumlah" },
    body: {
      en: "Most items are simply Enough, Running low or Out. For the ones you care about, tap the item and switch on Track amount: it then shows what is left, like 1.2 kg, and goes up when someone buys. Nobody has to count.",
      id: "Kebanyakan barang cukup ditandai Masih ada, Hampir habis, atau Habis. Untuk yang penting, ketuk barangnya lalu nyalakan Catat jumlah: sisanya tampil, misalnya 1,2 kg, dan bertambah saat ada yang belanja. Tidak ada yang perlu menghitung.",
    },
    where: "kitchen_food",
    needs: "kitchen",
    covers: ["kitchen-amounts-2026-11"],
  },
  {
    id: "shopping",
    group: "kitchen",
    title: { en: "The shopping list", id: "Daftar belanja" },
    body: {
      en: "Anything marked Running low or Out goes on the list in Kitchen → Shopping, and staff can add to it from their phone. Whoever shops taps Bought; a tracked item asks how much was bought.",
      id: "Barang yang ditandai Hampir habis atau Habis masuk ke daftar di Dapur → Belanja, dan staf bisa menambahkannya dari HP mereka. Yang berbelanja mengetuk Sudah dibeli; barang yang dicatat jumlahnya menanyakan beli berapa.",
    },
    where: "kitchen_shopping",
  },
  {
    id: "recipes",
    group: "kitchen",
    title: { en: "Recipes", id: "Resep" },
    body: {
      en: "Kitchen → Menu → New recipe: a name, the servings and the ingredients from your list; steps are optional. Written in English? Add the Indonesian version for staff. Whoever cooks can change the servings, and the amounts follow.",
      id: "Dapur → Menu → Resep baru: nama, porsi, dan bahan dari daftar Anda; cara membuat opsional. Ditulis dalam bahasa Inggris? Tambahkan versi Bahasa Indonesia untuk staf. Yang memasak bisa mengubah porsinya, dan jumlah bahannya ikut berubah.",
    },
    where: "kitchen_menu",
    needs: "kitchen",
    covers: ["recipes-2026-11"],
  },
  {
    id: "menu",
    group: "kitchen",
    title: { en: "The week's menu", id: "Menu seminggu" },
    body: {
      en: "Plan the week in Kitchen → Menu: tap + on a day and pick a recipe or type a dish. Add missing to Shopping works out what the week needs. Staff see the day's menu on their phone; when they tap Sudah dimasak, the ingredients come off what is at home.",
      id: "Rencanakan menu seminggu di Dapur → Menu: ketuk + di satu hari, lalu pilih resep atau ketik masakan. Tambahkan yang kurang ke Belanja menghitung kebutuhan seminggu. Staf melihat menu hari itu di HP mereka; saat mereka menekan Sudah dimasak, bahannya dikurangi dari stok di rumah.",
    },
    where: "kitchen_menu",
    needs: "kitchen",
    covers: ["menu-2026-11", "cooking-changes-2026-11"],
  },
  // ------------------------------------------------------------- settings
  {
    id: "features",
    group: "settings",
    title: { en: "Features on and off", id: "Fitur aktif dan mati" },
    body: {
      en: "Settings → Features: switch off what you don't use, such as Repairs, Bills and upkeep, Food at home, Kitchen amounts and recipes, or Pets. It hides for staff too. Nothing is deleted, and it all comes back with the switch.",
      id: "Pengaturan → Fitur: matikan yang tidak Anda pakai, seperti Perbaikan, Tagihan dan perawatan, Makanan di rumah, Jumlah bahan dan resep, atau Hewan. Di HP staf juga ikut hilang. Tidak ada yang dihapus, dan semuanya kembali saat dinyalakan lagi.",
    },
    where: "settings_features",
    covers: ["features-2026-11"],
  },
  {
    id: "notifications",
    group: "settings",
    title: { en: "Notifications", id: "Notifikasi" },
    body: {
      en: "Each phone turns notifications on for itself: Settings → Notifications shows On, Off or Blocked and sends a test. On an iPhone, first add Miamus to the Home Screen and open it from there. Staff can turn them on too, and never hear from Miamus at night.",
      id: "Setiap HP mengaktifkan notifikasinya sendiri: Pengaturan → Notifikasi menunjukkan Aktif, Mati, atau Diblokir, dan bisa mengirim tes. Di iPhone, tambahkan dulu Miamus ke Layar Utama, lalu buka dari sana. Staf juga bisa mengaktifkannya, dan tidak pernah dikabari malam hari.",
    },
    where: "settings_notifications",
    covers: ["notifications-2026-11", "staff-notifications-2026-11"],
  },
  {
    id: "language",
    group: "settings",
    title: { en: "Language", id: "Bahasa" },
    body: {
      en: "Each owner reads Miamus in English or Bahasa Indonesia: change it in Settings → Language. It follows your account, not the phone. Staff screens are always in Bahasa Indonesia.",
      id: "Setiap pemilik membaca Miamus dalam bahasa Inggris atau Bahasa Indonesia: ubah di Pengaturan → Bahasa. Pilihannya mengikuti akun Anda, bukan HP-nya. Layar staf selalu berbahasa Indonesia.",
    },
    where: "settings_language",
  },
  {
    id: "staff-pin",
    group: "settings",
    title: { en: "A staff member's PIN", id: "PIN staf" },
    body: {
      en: "Each staff member has their own 4-digit PIN, so Miamus knows who did what. They choose it the first time they sign in. Forgotten? In Settings → Staff, open the person and tap Change PIN, or let them choose a new one.",
      id: "Setiap staf punya PIN 4 angka sendiri, supaya Miamus tahu siapa mengerjakan apa. PIN dibuat saat pertama kali masuk. Lupa? Di Pengaturan → Staf, buka orangnya lalu ketuk Ubah PIN, atau biarkan mereka memilih yang baru.",
    },
    where: "settings_staff",
  },
  {
    id: "app-lock",
    group: "settings",
    title: { en: "App lock", id: "Kunci aplikasi" },
    body: {
      en: "Settings → App lock makes Miamus ask for this phone's Face ID or fingerprint before it opens. It is set on each phone separately.",
      id: "Pengaturan → Kunci aplikasi membuat Miamus meminta Face ID atau sidik jari HP ini sebelum terbuka. Diatur sendiri-sendiri di tiap HP.",
    },
    where: "settings_lock",
  },
  {
    id: "your-data",
    group: "settings",
    title: { en: "Your data", id: "Data Anda" },
    body: {
      en: "Settings → Your data: Download a copy gives you everything recorded in your home in one file. Delete this home removes it for everyone 7 days after you confirm; only the person who created the home can, and any admin can cancel before then.",
      id: "Pengaturan → Data Anda: Unduh salinan memberi Anda semua yang dicatat di rumah ini dalam satu file. Hapus rumah tangga ini menghapusnya untuk semua orang 7 hari setelah Anda konfirmasi; hanya pembuat rumah yang bisa, dan admin mana pun bisa membatalkannya sebelum itu.",
    },
    where: "settings_data",
  },
  {
    id: "kakak",
    group: "settings",
    title: { en: "Kakak", id: "Kakak" },
    body: {
      en: "Kakak is Miamus's AI helper. Tell her what you need by typing or talking, and she prepares a card: chores, shopping, pet routines, food and ingredients. Nothing is saved until you confirm. Switch her on or off in Settings → Kakak.",
      id: "Kakak adalah asisten AI di Miamus. Ketik atau ucapkan yang Anda perlukan, lalu Kakak menyiapkan kartunya: tugas, belanja, rutinitas hewan, makanan, dan bahan masakan. Tidak ada yang disimpan sebelum Anda konfirmasi. Nyalakan atau matikan Kakak di Pengaturan → Kakak.",
    },
    where: "settings_kakak",
    covers: ["kakak-routines-2026-11", "kakak-voice-2026-11", "kakak-answers-2026-11"],
  },
  {
    id: "weak-signal",
    group: "settings",
    title: { en: "A weak signal", id: "Sinyal lemah" },
    body: {
      en: "On a weak signal, a finished task, a log or new food is kept on the phone with a waiting to send note, and goes by itself when the signal is back. It is never saved twice, and there is nothing to enter again.",
      id: "Saat sinyal lemah, tugas yang selesai, catatan, atau makanan baru disimpan di HP dengan keterangan menunggu dikirim, lalu terkirim sendiri saat sinyal kembali. Tidak pernah tersimpan dua kali, dan tidak perlu dicatat ulang.",
    },
    where: null,
    covers: ["weak-signal-saves-2026-11"],
  },
  {
    id: "feedback",
    group: "settings",
    title: { en: "Telling the people who make Miamus", id: "Menghubungi pembuat Miamus" },
    body: {
      en: "An idea, or something that went wrong? Settings → Send feedback, also on Settings → About Miamus. A few words are enough, and it goes straight to the Miamus team. About Miamus also tells where Miamus came from.",
      id: "Ada ide, atau sesuatu yang tidak beres? Pengaturan → Kirim masukan, juga ada di Pengaturan → Tentang Miamus. Beberapa kata sudah cukup, dan langsung sampai ke tim Miamus. Tentang Miamus juga menceritakan asal-usul Miamus.",
    },
    where: "settings_about",
    covers: ["feedback-2026-11"],
  },
];

/**
 * Owner What's new cards no entry speaks for, each with the reason. Empty
 * today: add an id here only when its feature really has no place in the
 * guide (tests/unit/guide.test.ts fails on a card that is in neither).
 */
export const NOT_IN_GUIDE: Record<string, string> = {};

export function guideEntry(id: string): GuideEntry | undefined {
  return GUIDE.find((entry) => entry.id === id);
}

/**
 * The guide as Kakak reads it, in the owner's language: the same text for
 * every household in that language, so it is cached with her instructions.
 * Never a household's own data, a person's name or a price.
 *
 *   # Guide to Miamus
 *   ## Home
 *   - Chores and routines (Home → Chores): A chore is a job in the house …
 */
export function guideForKakak(locale: OwnerLocale): string {
  const lines: string[] = [
    "<guide>",
    "# Guide to Miamus",
    `Everything Miamus does today, as its screens name it in ${locale === "id" ? "Bahasa Indonesia" : "English"}. Screen names are written exactly as the owner sees them.`,
  ];
  for (const group of GUIDE_GROUPS) {
    lines.push("", `## ${GUIDE_GROUP_TITLES[group][locale]}`);
    for (const entry of GUIDE.filter((e) => e.group === group)) {
      const where = entry.where ? ` (${GUIDE_PLACES[entry.where][locale]})` : "";
      lines.push(`- ${entry.title[locale]}${where}: ${entry.body[locale]}`);
    }
  }
  lines.push("</guide>");
  return lines.join("\n");
}
