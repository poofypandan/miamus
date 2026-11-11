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
  /**
   * Only for households with Kakak (on the family list): shown as the card in
   * the Kakak sheet, and left out of Household → What's new for everyone else.
   */
  kakakOnly?: boolean;
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    // Phase 170 PR C: shown on Kitchen → Menu's week while the Kitchen switch
    // is on, under the calm-start rules (one card a week, never to new
    // households), so it waits its turn behind this week's card.
    id: "menu-2026-11",
    date: "2026-11-13",
    audience: "owner",
    title: { en: "New: the week's menu", id: "Baru: menu seminggu" },
    steps: {
      en: [
        "Plan the week in Kitchen → Menu: tap + on a day, pick a recipe or type a dish. Copy last week fills the empty days.",
        "Add missing to Shopping adds up what the week needs against what's at home, and shows you the list first.",
        "Staff see Menu hari ini on their Today. When they tap Sudah dimasak, the ingredients come off what's at home.",
      ],
      id: [
        "Rencanakan menu seminggu di Dapur → Menu: ketuk + di satu hari, pilih resep atau ketik masakan. Salin minggu lalu mengisi hari yang masih kosong.",
        "Tambahkan yang kurang ke Belanja menjumlahkan kebutuhan seminggu dengan stok di rumah, dan menunjukkan daftarnya dulu.",
        "Staf melihat Menu hari ini di Tugas Hari Ini. Saat mereka menekan Sudah dimasak, bahannya dikurangi dari stok di rumah.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
  },
  {
    // Phase 170 PR B: shown on Kitchen → Menu while the Kitchen switch is
    // on, under the calm-start rules (one card a week, never to new
    // households): Kitchen amounts' card had this week, so it waits.
    id: "recipes-2026-11",
    date: "2026-11-12",
    audience: "owner",
    title: { en: "New: recipes in Kitchen", id: "Baru: resep di Dapur" },
    steps: {
      en: [
        "Kitchen → Menu → New recipe: a name, the servings and the ingredients from your list. Steps are optional.",
        "Written in English? Add the Indonesian version for staff: their phones show Bahasa Indonesia only.",
        "Whoever cooks opens it in Dapur → Menu, and can change the servings: the amounts follow.",
      ],
      id: [
        "Dapur → Menu → Resep baru: nama, porsi, dan bahan dari daftar Anda. Cara membuat opsional.",
        "Ditulis dalam bahasa Inggris? Tambahkan versi Bahasa Indonesia untuk staf: HP staf hanya menampilkan Bahasa Indonesia.",
        "Yang memasak membukanya di Dapur → Menu, dan bisa mengubah porsinya: jumlah bahannya ikut berubah.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
  },
  {
    // Phase 174 PR B (D4, D10). Listed in Household → What's new only, never
    // a card: this week's card already went to walk-ins (walkins-2026-11; one
    // card a week). The two switches explain themselves in Household →
    // Notifications. Staff need no tutorial: nothing changes on their phones.
    id: "repair-pushes-2026-11",
    date: "2026-11-11",
    audience: "owner",
    title: { en: "New: told when a repair person comes and goes", id: "Baru: kabar saat tukang datang dan selesai" },
    steps: {
      en: [
        "When staff log a repair person at the gate, you get a notification: who came and what for. When they tap Selesai, another one, with the before and after photos on the repair. Never between 9:00 PM and 6:00 AM.",
        "Don't want one of them? Household → Notifications: When a repair person arrives, When a repair is finished.",
        "The evening summary now says when a task was missed because someone was supervising a repair.",
      ],
      id: [
        "Saat staf mencatat tukang di gerbang, Anda mendapat notifikasi: siapa yang datang dan untuk apa. Saat staf mengetuk Selesai, satu lagi, dengan foto sebelum dan sesudah di perbaikannya. Tidak pernah pukul 21.00–06.00.",
        "Tidak mau salah satunya? Rumah → Notifikasi: Saat tukang datang, Saat perbaikan selesai.",
        "Ringkasan malam kini menyebutkan tugas yang terlewat karena staf sedang mengawasi perbaikan.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
  },
  {
    // Phase 173 PR C (D7, D15). Listed in Household → What's new only, never
    // a card: this week's card already went out (one card a week). The two
    // switches explain themselves in the Add routine sheet. Staff need no
    // tutorial: a reminder is a notification that opens Today.
    id: "routine-reminders-2026-11",
    date: "2026-11-11",
    audience: "owner",
    title: { en: "New: reminders on routines", id: "Baru: pengingat pada rutinitas" },
    steps: {
      en: [
        "Open a routine (Add routine, or one under Other routines). Under Notifications, turn on Remind staff at this time: staff get a notification at its time, only if it isn't done yet, until 10:00 PM.",
        "Turn on Tell us if it's not done: if it still isn't done 30 minutes after its time, every owner gets one notification. Both are off unless you turn them on.",
      ],
      id: [
        "Buka rutinitas (Tambah rutinitas, atau salah satu di Rutinitas lain). Di Notifikasi, nyalakan Ingatkan staf di jam ini: staf mendapat notifikasi pada jamnya, hanya jika belum dikerjakan, sampai pukul 22.00.",
        "Nyalakan Kabari kami jika belum dikerjakan: kalau 30 menit setelah jamnya masih belum dikerjakan, semua pemilik mendapat satu notifikasi. Keduanya mati kecuali Anda nyalakan.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
  },
  {
    // Shown in Kitchen while Kitchen amounts is on (Phase 170 PR A), under
    // the calm-start rules (one card a week, never to new households).
    id: "kitchen-amounts-2026-11",
    date: "2026-11-11",
    audience: "owner",
    title: { en: "New: exact amounts in Kitchen", id: "Baru: jumlah pasti di Dapur" },
    steps: {
      en: [
        "Want exact amounts? Tap an item and switch on Track amount. Only for the items you care about.",
        "It updates when you buy. Nobody has to count.",
        "Ingredients now sit under Food, next to what's ready to eat.",
      ],
      id: [
        "Ingin jumlah yang pasti? Ketuk barang lalu nyalakan Catat jumlah. Cukup untuk barang yang penting.",
        "Jumlahnya berubah saat belanja. Tidak ada yang perlu menghitung.",
        "Bahan masakan sekarang ada di Makanan, di samping yang siap dimakan.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
  },
  {
    // Shown on Chores → Today (Phase 172 PR A2), existing households only
    // (the calm-start rules keep it from new ones, who get the list at
    // sign-up). Show me opens the Starter list. One card a week: if the
    // Features card (Phase 171) still holds this week, this one waits.
    id: "starter-list-2026-11",
    date: "2026-11-11",
    audience: "owner",
    title: { en: "New: a starter list of the usual rooms and chores", id: "Baru: daftar awal ruangan dan tugas yang biasa" },
    steps: {
      en: ["Chores → Starter list: tick what's missing. What you already have is marked Added."],
      id: ["Tugas → Daftar awal: centang yang belum ada. Yang sudah ada ditandai Sudah ditambahkan."],
    },
    tryLabel: { en: "Show me", id: "Lihat" },
  },
  {
    // Phase 174 PR A: the one owner card for walk-ins, in Chores → Repairs
    // (the calm-start rules hold it until the week is free). Staff get no
    // card: the Perbaikan pill's button says what to do (stop rule).
    id: "walkins-2026-11",
    date: "2026-11-11",
    audience: "owner",
    title: { en: "New: staff log repair people as they arrive", id: "Baru: staf mencatat tukang yang datang" },
    steps: {
      en: [
        "Staff tap Ada tukang datang on their new Perbaikan pill: what's being fixed, who, and a photo before the work starts. Selesai adds the after photo.",
        "You see who is here on Today, and each visit's before and after on the repair.",
        "Tasks missed while someone supervised a repair say so on their own: nothing to ask, nothing for staff to type.",
      ],
      id: [
        "Staf mengetuk Ada tukang datang di tab Perbaikan yang baru: apa yang diperbaiki, siapa, dan foto sebelum mulai. Selesai menambahkan foto sesudahnya.",
        "Anda melihat siapa yang sedang bekerja di Hari ini, serta foto sebelum dan sesudah tiap kunjungan di perbaikannya.",
        "Tugas yang terlewat karena staf sedang mengawasi perbaikan langsung diberi keterangan: tidak perlu bertanya, staf tidak perlu mengetik.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
  },
  {
    // Shown in Household, where the switches live (Phase 171 PR A, D8): this
    // week's one card, for existing households only (the calm-start rules
    // keep it from new ones). Staff get none.
    id: "features-2026-11",
    date: "2026-11-11",
    audience: "owner",
    title: { en: "New: choose what Miamus shows", id: "Baru: pilih yang ditampilkan Miamus" },
    steps: {
      en: ["Household → Features: switch off what you don't use. Nothing is deleted."],
      id: ["Rumah → Fitur: matikan yang tidak Anda pakai. Tidak ada yang dihapus."],
    },
    tryLabel: { en: "Show me", id: "Lihat" },
  },
  {
    // Listed in Household → What's new only, never a card: Phase 165's
    // couldn't-do card already went to the same admins this week, and the
    // adopted rule is at most one card a week (docs/app-evaluation-2026-11-10.md).
    // Staff get their own card on Today, which is the tutorial (D10).
    id: "staff-notifications-2026-11",
    date: "2026-11-10",
    audience: "owner",
    title: { en: "Staff get notifications", id: "Staf dapat notifikasi" },
    steps: {
      en: [
        "Staff can now turn on notifications on their phone. They hear about new tasks for them today and your answers to their requests, never at night.",
        "See who has them on under Staff. Turn them off for the whole household in Household → Notifications.",
      ],
      id: [
        "Staf sekarang bisa mengaktifkan notifikasi di HP mereka. Mereka diberi tahu tentang tugas baru untuk mereka hari ini dan jawaban Anda atas permintaan mereka, tidak pernah malam hari.",
        "Lihat siapa yang sudah mengaktifkannya di Staf. Matikan untuk seluruh rumah di Rumah → Notifikasi.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
  },
  {
    // Shown on Today to admins of households with staff (Phase 165, D10).
    id: "couldnt-do-2026-11",
    date: "2026-11-10",
    audience: "owner",
    title: { en: "New: when staff can't do a task", id: "Baru: kalau staf tidak bisa mengerjakan tugas" },
    steps: {
      en: [
        "Staff can now tell you why a task couldn't be done, like out of stock or the pet wouldn't eat. It shows in amber on Today; tap it to see their note and photo.",
        "Each evening at 7:00 PM, one notification lists what's still open, only if something is. Nothing open, no notification.",
        "You're also told when staff ask for leave or suggest a schedule change. Change the time or turn either off in Household → Notifications.",
      ],
      id: [
        "Staf sekarang bisa memberi tahu kenapa tugas tidak bisa dikerjakan, misalnya barang habis atau hewan tidak mau makan. Tugasnya ditandai kuning di Hari ini; ketuk untuk melihat catatan dan fotonya.",
        "Setiap malam pukul 19.00, satu notifikasi berisi yang belum selesai, hanya kalau ada. Kalau semua selesai, tidak ada notifikasi.",
        "Anda juga diberi tahu saat staf minta cuti atau mengusulkan perubahan jadwal. Ubah jamnya atau matikan di Rumah → Notifikasi.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
  },
  {
    // Shown in Chores → Rooms (Phase 168 PR A, docs/phase-168-suites-plan.md).
    id: "rooms-inside-2026-11",
    date: "2026-11-10",
    audience: "owner",
    title: { en: "New: a bathroom inside its bedroom", id: "Baru: kamar mandi di dalam kamarnya" },
    steps: {
      en: [
        "A room can now have rooms inside it. Put each bathroom inside its bedroom in Household → Rooms.",
        "They show under their room everywhere, like GB1 · Bathroom.",
        "A spot is still a thing in a room, like the sink.",
      ],
      id: [
        "Ruangan sekarang bisa punya ruangan di dalamnya. Masukkan kamar mandi ke kamarnya di Rumah → Ruangan.",
        "Ruangan itu tampil di bawah kamarnya, misalnya Kamar Tamu 1 · Kamar Mandi.",
        "Bagian tetap untuk benda di ruangan, seperti wastafel.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
  },
  {
    // Shown on Today to an admin with a bill in My tasks (Phase 164 PR B).
    id: "bill-payments-2026-11",
    date: "2026-11-10",
    audience: "owner",
    title: { en: "New: mark a bill paid", id: "Baru: tandai tagihan sudah dibayar" },
    steps: {
      en: [
        "Tap a bill in My tasks: add what it cost and a photo of the receipt, then Mark paid. Both are optional.",
        "Next time it shows what you paid last. Open the bill to see its last 12 payments.",
        "Only owners see amounts and receipts. They're kept 2 years.",
      ],
      id: [
        "Ketuk tagihan di Tugas saya: isi jumlahnya dan foto bukti bayar, lalu Tandai sudah dibayar. Keduanya opsional.",
        "Berikutnya tampil jumlah yang terakhir dibayar. Buka tagihannya untuk melihat 12 pembayaran terakhir.",
        "Hanya pemilik yang bisa melihat jumlah dan bukti bayar. Disimpan 2 tahun.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
  },
  {
    // Shown once inside the Kakak sheet, above the mic (voice beta).
    id: "kakak-voice-2026-11",
    date: "2026-11-10",
    audience: "owner",
    kakakOnly: true,
    title: { en: "New: talk to Kakak", id: "Baru: bicara dengan Kakak" },
    steps: {
      en: [
        "Tap the mic and say what you need. Your words appear as you speak.",
        "Tap Stop when you're done. Kakak shows her card; nothing is saved until you confirm.",
        "Want to hear her answers? Turn on Read replies aloud. This phone remembers it.",
      ],
      id: [
        "Ketuk mikrofon lalu sebutkan yang Anda perlukan. Kata-kata Anda muncul saat Anda bicara.",
        "Ketuk Berhenti kalau sudah. Kakak menunjukkan kartunya; tidak ada yang disimpan sebelum Anda konfirmasi.",
        "Mau mendengar jawaban Kakak? Nyalakan Bacakan jawaban Kakak. HP ini akan mengingatnya.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
  },
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
    // Listed in What's new only: the checklist on Today is its own tutorial (audit B1).
    id: "first-run-2026-11",
    date: "2026-11-10",
    audience: "owner",
    title: { en: "New: a setup checklist for new homes", id: "Baru: daftar persiapan rumah baru" },
    steps: {
      en: [
        "New homes see Set up your home on Today: add your staff, link their phone, give them a first task. It ticks itself off and goes away after the first finished task; Not now hides it.",
      ],
      id: [
        "Rumah baru melihat Siapkan rumah Anda di Hari ini: tambah staf, hubungkan HP-nya, beri tugas pertama. Tercentang sendiri dan hilang setelah tugas pertama selesai; Nanti saja menyembunyikannya.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
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
        "Household → Features: switch Pets off, and the Pets tab and every pet line disappear, for staff too.",
        "Have pets? Nothing changes for you.",
        "New households answer this when they sign up. Kids and Elders come later.",
      ],
      id: [
        "Rumah → Fitur: matikan Hewan, tab Hewan dan semua baris hewan hilang, juga di HP staf.",
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
    // Phase 170 PR C: once Today has a menu, while the Kitchen switch is on.
    id: "staff-menu-2026-11",
    date: "2026-11-13",
    title: "Baru: Menu hari ini",
    lines: [
      "Menu hari ini ada di atas Tugas Hari Ini. Ketuk masakannya untuk melihat resepnya.",
      "Setelah masak, tekan Sudah dimasak. Bahannya dikurangi sendiri. Salah tekan? Tekan Batalkan.",
    ],
  },
  {
    // Phase 170 PR B: once the household has a recipe, while the Kitchen switch is on.
    id: "staff-recipes-2026-11",
    date: "2026-11-12",
    title: "Baru: resep di Dapur",
    lines: [
      "Resep dari pemilik rumah ada di Dapur → Menu. Ketuk resepnya untuk melihat bahan dan cara membuat.",
      "Masak lebih banyak? Tekan plus: jumlah bahannya ikut berubah.",
    ],
  },
  {
    // Phase 170 PR A: while Kitchen amounts is on for the household.
    id: "staff-kitchen-amounts-2026-11",
    date: "2026-11-11",
    title: "Baru: bahan masakan di Makanan",
    lines: [
      "Bahan masakan (beras, telur, minyak) sekarang ada di Dapur → Makanan. Cara menandainya sama: ketuk, lalu pilih Hampir habis atau Habis.",
      "Kalau ada angkanya, tekan minus atau plus saja.",
    ],
  },
  {
    id: "staff-couldnt-do-2026-11",
    date: "2026-11-10",
    title: "Baru: Tidak bisa dikerjakan",
    lines: [
      "Tidak bisa mengerjakan tugas? Buka tugasnya, ketuk Tidak bisa dikerjakan, lalu pilih alasannya. Admin bisa melihatnya.",
      "Salah pilih? Ketuk Batalkan dalam 5 menit.",
    ],
  },
  {
    id: "staff-feedback-2026-11",
    date: "2026-11-10",
    title: "Baru: Kirim masukan",
    lines: ["Ada ide atau masalah di aplikasi? Ketuk Lapor → Kirim masukan. Dibaca tim Miamus dan pemilik rumah."],
  },
  {
    // Phase 168: once a chore on this phone is in a room inside a room.
    id: "staff-rooms-inside-2026-11",
    date: "2026-11-10",
    title: "Baru: kamar mandi bersama kamarnya",
    lines: ["Kamar mandi sekarang ditulis bersama kamarnya, misalnya LT2 · Kamar Tamu 2 · Kamar Mandi · Wastafel."],
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

/** A staff tip that could show, and whether its feature is on this phone's screens. */
export interface StaffTipCandidate {
  id: string;
  show: boolean;
}

/**
 * The one staff tip to show (audit B1, item 5): staff Today used to stack up
 * to five "Baru" cards above the first task. Now at most one: the newest
 * that applies and hasn't been closed on this phone. Ties keep
 * STAFF_WHATS_NEW's order, which is newest first.
 */
export function pickStaffTip(candidates: StaffTipCandidate[], seen: (id: string) => boolean): string | null {
  const order = new Map(STAFF_WHATS_NEW.map((entry, index) => [entry.id, index]));
  const ranked = candidates
    .map((candidate) => ({ candidate, entry: staffWhatsNewEntry(candidate.id) }))
    .filter((item): item is { candidate: StaffTipCandidate; entry: StaffWhatsNewEntry } => !!item.entry)
    .sort(
      (a, b) =>
        b.entry.date.localeCompare(a.entry.date) || (order.get(a.entry.id) ?? 0) - (order.get(b.entry.id) ?? 0)
    );
  return ranked.find(({ candidate }) => candidate.show && !seen(candidate.id))?.candidate.id ?? null;
}

/**
 * Where a staff phone remembers the day it last closed a tip: after one is
 * closed, the next waits until tomorrow, so a morning starts with the work.
 */
export const STAFF_TIP_CLOSED_ON_KEY = "miamus.staff-tip.closed-on";

/**
 * Whether the staff tip rests: a tip was closed on `today` (both local
 * YYYY-MM-DD). Checked against the live day, so the next tip comes back
 * after midnight on a phone that never reloaded.
 */
export function staffTipResting(closedOn: string | null, today: string): boolean {
  return closedOn === today;
}

export function whatsNewEntry(id: string): WhatsNewEntry | undefined {
  return WHATS_NEW.find((entry) => entry.id === id);
}

/** This phone has closed the card (a convenience, so storage may fail). */
export function storageKey(id: string): string {
  return `miamus.whats-new.${id}`;
}
