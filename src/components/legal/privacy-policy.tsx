import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LEGAL, isLegalDraft } from "@/config/legal";

/**
 * Miamus's privacy policy, in both languages the app speaks (Phase 143).
 *
 * Owners read it in English at /privacy, staff in Bahasa Indonesia at
 * /privasi — the same split as the rest of the app (see CLAUDE.md). The two
 * texts live side by side here so a change to one is hard to make without
 * seeing the other. Section 13 says the Indonesian text prevails.
 *
 * Written against UU PDP (Law No. 27 of 2022) and against what this codebase
 * actually stores — see the tables in supabase/migrations and the retention
 * window in task_photo_retention_cutoff() (migrations/102), and food photos
 * and finished food (migrations/123), repairs (kept 2 years after closing,
 * migrations/130), feedback (kept 2 years, migrations/135), couldn't-do reasons (kept 90
 * days, photos 30, migrations/139), bill payments (kept 2 years,
 * migrations/138), and Kakak's request counts (kept 13
 * months; the text itself goes to Anthropic, not our database). Talking to
 * Kakak uses the browser's own speech recognition: no audio reaches Miamus. If either changes,
 * this has to change with it. Not legal advice: have it reviewed before a
 * public launch.
 */

type Lang = "en" | "id";
type Block = { p: string } | { ul: string[] } | { h: string };
type Section = { title: string; body: Block[] };

const operator = LEGAL.operatorName || "[operator name]";
const email = LEGAL.contactEmail || "[contact email]";

const COPY: Record<
  Lang,
  {
    title: string;
    updated: string;
    draft: string;
    other: { href: string; label: string };
    back: string;
    intro: string;
    sections: Section[];
  }
> = {
  en: {
    title: "Privacy Policy",
    updated: `Last updated: ${LEGAL.effectiveDate.en}`,
    draft: "Draft: the operator name and contact email haven't been filled in yet.",
    other: { href: "/privasi", label: "Baca dalam Bahasa Indonesia" },
    back: "Back to Miamus",
    intro:
      "Miamus helps households organise chores, pets, supplies and the people who look after them. This policy explains what information Miamus keeps, why, who can see it, and the choices you have. It is written to meet Indonesia's Personal Data Protection Law (Law No. 27 of 2022, “UU PDP”).",
    sections: [
      {
        title: "1. Who runs Miamus",
        body: [
          {
            p: `Miamus is operated by ${operator} (“we”). For anything about your data, contact us at ${email}.`,
          },
        ],
      },
      {
        title: "2. Who this policy covers",
        body: [
          {
            ul: [
              "Household admins — people who sign in with Google to set up and run a household.",
              "Household staff — people an admin adds, who use Miamus on a phone with a 4-digit PIN.",
              "Anyone whose information an admin or staff member enters, such as a name in a task or a note.",
              "People who ask to set up a new household.",
            ],
          },
        ],
      },
      {
        title: "3. What we collect",
        body: [
          { h: "Admins" },
          {
            ul: [
              "From Google sign-in: your name, email address and profile picture. We never see your Google password.",
              "Your household's name, its rooms or areas, and which admins belong to it.",
              "Your language choice (English or Bahasa Indonesia), so Miamus and its notifications to you appear in it. Your phone keeps a copy so the app opens in the right language.",
              "Your notification choices: whether you get the evening summary and at what time, and whether you're told about staff requests.",
            ],
          },
          { h: "Requests to set up a household" },
          {
            ul: [
              "If you sign in with Google to set up a new household, we keep your request: when you asked, and whether it was approved or rejected. While we review it, we see your name and email from Google sign-in.",
            ],
          },
          { h: "Staff" },
          {
            ul: [
              "Your name, as entered by the household admin.",
              "Your 4-digit PIN, stored only in scrambled (hashed) form. Nobody — including us — can read it back.",
              "Which tasks you completed and when, and your leave dates and their status.",
              "Each time someone signs in to your name with the house code or a PIN: when, from which phone session, and whether it worked. Kept 30 days, only to stop PIN guessing (5 wrong tries locks the PIN for 15 minutes and tells the admins).",
              "Which phones are linked to the household, when each was linked and when it last signed in. Admins can see this list and remove a phone.",
              "If an admin uses Kakak, the household's AI assistant, your first name is sent to Anthropic with the admin's requests so Kakak knows who is meant (see “Kakak” below).",
            ],
          },
          { h: "Everyone in a household" },
          {
            ul: [
              "Tasks, chores, routines, schedules and notes.",
              "Photos taken in the app: task proof photos, before and after photos, stock-check photos, pet photos and scans of pet documents.",
              "Details about your pets, including their vet and health records.",
              "The household's shopping list: which supplies are running low or out, and who said so.",
              "Food the household lists: what it is, an optional photo, where it came from (cooked at home, from someone, or bought), where it is kept, when it expires (or that nobody knows yet), who gave it (a name you type in), notes, who added it, and whether it was eaten, given away or thrown away. When staff add food, the household's admins get a notification saying so, and each morning a notification lists food that expires today or tomorrow.",
              "Repairs: what broke and where (room and part of the room), details, a photo of the problem, whether it is urgent, who reported it, the visits to fix it with their before and after photos, who fixed it (a name you type in, for example the repair person), when its warranty ends, and whether it was fixed or not needed (with the reason, which staff can see). Short notes on a repair, with an optional photo, written by admins or staff. For admins only, never shown to staff: what a repair cost, its receipt photo and a note. When staff report something urgent, the household's admins get a notification.",
              "Bills and upkeep: the household's bills (for example electricity, water or land tax) and upkeep, set up as chores with a date and an optional reminder; on the reminder day the admin it's for (or every admin, for staff chores) gets a morning notification listing what's due. For admins only, never shown to staff: when a bill is marked paid, what it cost and a photo of its receipt (or the bank app's proof), in storage only admins can open.",
              "Feedback you send from the app (Send feedback): your message, its type if you pick one (idea, problem or other), who sent it, the household, the screen it was sent from and the app version. Nothing else about your phone.",
              "When a task can't be done: the reason picked (for example out of stock, or the pet wouldn't eat), an optional note and photo, which shopping-list item ran out, who said so and when. The household's admins and staff can see it. If an admin turns notifications on, Miamus sends them an evening summary of what wasn't done that day (at the time they choose, or never), a notification when staff ask for leave or suggest a schedule change, and one when a pet wouldn't take its medicine. Staff notes aren't included in notifications.",
            ],
          },
          { h: "Kakak, the AI assistant (only if an admin turns it on)" },
          {
            ul: [
              "Kakak is off unless an admin of your household turns it on, and any admin can turn it off again.",
              "What you type to Kakak, her questions and your answers are sent to Anthropic to be understood (see section 5). Miamus doesn't store them: the conversation stays on your phone while Kakak is open, then is forgotten.",
              "If you talk to Kakak instead of typing, your browser's own speech recognition turns your voice into text. To do that, the browser may send the audio to the company that makes it (Apple for Safari, Google for Chrome), under that company's privacy terms with you. Miamus never receives or stores audio: only the text is sent to Kakak, exactly as if you had typed it. If you turn on reading replies aloud, your phone does the reading.",
              "To understand requests like “ask Mbak Sari to water the plants”, each request also carries the first names of your staff, your pets' names, your room names, the names of items on your shopping list, and today's date. Nothing else about your staff is sent.",
              "A count of Kakak requests and what each cost, without any of the text.",
              "Kakak's suggestions can be wrong. Nothing is saved until you check and confirm it; what is saved is the chore, food or shopping item you confirmed, just as if you had typed it yourself.",
            ],
          },
          { h: "Technical" },
          {
            ul: [
              "A random ID for each staff phone, and when it was last used. Once a phone is no longer linked to a household, its ID is deleted after 7 days without use.",
              "Your browser's push-notification details, if you turn notifications on.",
              "Basic records our hosting providers keep when you use the app, such as IP address, browser type and time of access.",
            ],
          },
          { h: "Kept only on your phone" },
          {
            ul: [
              "Your sign-in session, which staff name is selected on a shared phone, app-lock settings, and the language you picked (on the sign-in screen, and a copy of your account's language).",
              "To keep working on bad Wi-Fi: a copy of the household data this phone last loaded (replaced on every load, and not used after 24 hours), routines, finished chores and food saved with no signal or a signal too weak to send, and photos waiting to upload, until they are sent, and the photos of a chore still in progress until it is finished. Signing out deletes all of these from the phone, including anything not yet sent.",
              "Which medicine-course reminders you closed on this phone.",
              "Whether Kakak's replies are read aloud on this phone.",
              "Whether you turned notifications on in this browser (so Miamus can renew them if the browser drops them), and when you last said \"Not now\" to the notifications reminder.",
              "If you unlock Miamus with Face ID or a fingerprint, your phone does the check. Your face or fingerprint data never leaves your phone, and we never receive it.",
            ],
          },
          {
            p: "What we don't do: no GPS location tracking, no access to your contacts, no ads — and we never sell your data.",
          },
        ],
      },
      {
        title: "4. Why we use it",
        body: [
          { p: "Our purposes, and the legal basis for each under Article 20 of UU PDP:" },
          {
            ul: [
              "Running Miamus for your household — showing tasks, recording who did what, reminders, leave and stock. This is needed to provide the service you asked for.",
              "Keeping it secure — sign-in, keeping each household's data separate, reviewing requests to set up new households, and preventing misuse. This is our legitimate interest.",
              "Sending notifications you've turned on. This is based on your consent, which you can withdraw at any time in your phone or browser settings.",
              "Improving Miamus — reading the feedback you choose to send. This is our legitimate interest.",
              "Kakak, if an admin turns it on — understanding what admins type so it can suggest chores, food and shopping items. This is based on the consent the admin gives by turning Kakak on, which they can withdraw by turning it off.",
              "Meeting legal obligations, where any apply.",
            ],
          },
          {
            p: "We don't use your data to make automated decisions that have legal or similarly significant effects on you.",
          },
        ],
      },
      {
        title: "5. Who can see it",
        body: [
          {
            ul: [
              "Inside your household: admins can see everything in their household. Staff see the tasks, schedules and information they need for their work. Other households can never see your data.",
              `Requests to set up a household — only ${operator}, who runs Miamus.`,
              `Feedback you send — ${operator}, who runs Miamus, and your household's admins. Staff can't read anyone's feedback, not even their own once sent.`,
              `Supabase — database, sign-in and photo storage, on servers in ${LEGAL.dataRegion.en}.`,
              "Vercel — hosts the app, on servers in Singapore. Photos pass through its servers when they're shown, but aren't stored there.",
              "Google — sign-in for admins.",
              "Anthropic — understands what admins type to Kakak, if an admin turns it on, on servers in the United States. It keeps this up to 30 days (longer only if its safety systems flag a request, or the law requires it), and doesn't use it to train its AI.",
              "Apple, Google, Microsoft or Mozilla push services — deliver notifications to your device.",
              "Authorities — only when Indonesian law requires it.",
            ],
          },
          {
            p: "With each Kakak request, Anthropic also receives the first names of the people on your household's list (staff, and family members who are admins), your pets' names, room names and shopping item names, so Kakak can tell who and what you mean. Nothing else about your staff or family is sent.",
          },
          {
            p: "These providers handle data only to run Miamus for us. We don't share your data with advertisers or anyone else.",
          },
        ],
      },
      {
        title: "6. Storing data outside Indonesia",
        body: [
          {
            p: `Miamus data is stored in ${LEGAL.dataRegion.en}, and our providers may process it in other countries, such as Japan or the United States. We follow Article 56 of UU PDP: we use providers in countries with an equal or higher level of data protection, or that are bound by agreement to protect your data, and where neither applies, we rely on your consent.`,
          },
          {
            p: "If an admin turns on Kakak, what is typed to Kakak is processed by Anthropic in the United States (and its providers may process it in other countries). Anthropic is bound by agreement through its data processing addendum, part of its commercial terms; where that isn't enough, the admin gives consent by turning Kakak on.",
          },
        ],
      },
      {
        title: "7. How long we keep it",
        body: [
          {
            ul: [
              "Chore and routine proof photos (including before and after photos) are deleted automatically after 30 days, except the photos of a repair's visits (below).",
              "A repair, its photo, its notes and their photos, its cost and receipt, and the photos of its visits are kept while the repair is open, and for 2 years after it is closed (fixed or not needed), then deleted automatically. If a repair is deleted, its photo, notes, cost and receipt are deleted too, and its visits' photos follow the 30-day rule.",
              "Records of staff sign-in attempts are deleted automatically after 30 days.",
              "Feedback is kept 2 years from when it was sent, then deleted automatically.",
              "The reason and note for a task that couldn't be done are kept 90 days, then deleted automatically. Its photo follows the 30-day rule for proof photos.",
              "A bill's payment (its amount and receipt photo) is kept 2 years from when it was recorded, then deleted automatically. If the bill is deleted, or marked not paid, its payments and receipts are deleted too.",
              "A food photo is kept while the food is on the list, and deleted once it is marked eaten, given away or thrown away, or deleted. Finished food is kept 90 days without its photo, then deleted automatically.",
              "A staff phone's ID is deleted 7 days after it was last used, once the phone is no longer linked to a household.",
              "Counts of Kakak requests and their cost (without anything that was typed) are kept 13 months, then deleted.",
              "Everything else is kept while your household uses Miamus.",
              "A request to set up a household that isn't approved is deleted 30 days after the decision, together with the Google sign-in it came from, unless that account has since joined a household. Approved requests are kept while the account is used.",
              "The admin who created a household can delete it in the app (Household → Your data). It is deleted 7 days later, unless an admin cancels before then. Its photos are then deleted automatically at night, usually the same night; a household with very many photos can take a few nights. Database backups keep a copy for up to 7 more days, then it is gone.",
              "If anyone asks us by email to delete their data or their household, we delete it within 30 days unless the law requires us to keep it. Copies in our providers' backups are cleared on their normal schedule.",
              "When staff are removed from a household, their profile is archived and their name stays on past work, so the household's records stay accurate. The admin or the staff member can ask us to remove it.",
            ],
          },
        ],
      },
      {
        title: "8. Your rights",
        body: [
          { p: "Under UU PDP, you can ask us to:" },
          {
            ul: [
              "tell you what data we hold about you and how we use it;",
              "give you a copy of it;",
              "correct it;",
              "delete it, or stop or limit how we use it;",
              "withdraw consent you've given;",
              "send it to you in a common, machine-readable format.",
            ],
          },
          {
            p: "Household admins can download a copy of their household's data, in a machine-readable file (JSON), and delete the household themselves, in Household → Your data. Photos aren't in that file; ask us for a copy.",
          },
          {
            p: `For anything else, email ${email}. We may need to confirm who you are first, and we'll respond within the time limits UU PDP sets. You can also complain to Indonesia's personal data protection authority.`,
          },
        ],
      },
      {
        title: "9. For household admins: your staff",
        body: [
          {
            p: "You decide what Miamus records about the people who work in your home, and we process their information on your behalf and on your instructions. Tell your staff that Miamus records their tasks, photos and leave, and why. Only record what you need to run your household.",
          },
        ],
      },
      {
        title: "10. Children",
        body: [
          {
            p: "Miamus isn't designed for children. Admin accounts are for adults (18 or older). If a staff member is under 18, the admin must get a parent's or guardian's consent before adding them.",
          },
        ],
      },
      {
        title: "11. Security",
        body: [
          {
            ul: [
              "Everything travels over encrypted connections (HTTPS).",
              "Each household's data is walled off in the database, and photos are kept in private storage.",
              "PINs are stored hashed and lock after 5 wrong tries, and admins can turn on a Face ID or fingerprint lock.",
            ],
          },
          {
            p: "No system is perfectly secure. If a breach affects your personal data, we'll notify you and the authority within 3 × 24 hours, as Article 46 of UU PDP requires.",
          },
        ],
      },
      {
        title: "12. Changes to this policy",
        body: [
          {
            p: "We'll update this page when Miamus changes how it uses data, and show a notice in the app for important changes. The date at the top shows when it last changed.",
          },
        ],
      },
      {
        title: "13. Language",
        body: [
          {
            p: "This policy is available in Bahasa Indonesia and English. If the two differ, the Bahasa Indonesia version prevails.",
          },
        ],
      },
    ],
  },

  id: {
    title: "Kebijakan Privasi",
    updated: `Terakhir diperbarui: ${LEGAL.effectiveDate.id}`,
    draft: "Draf: nama pengelola dan email kontak belum diisi.",
    other: { href: "/privacy", label: "Read in English" },
    back: "Kembali ke Miamus",
    intro:
      "Miamus membantu rumah tangga mengatur pekerjaan rumah, hewan peliharaan, persediaan, dan orang-orang yang membantu di rumah. Kebijakan ini menjelaskan data apa yang disimpan Miamus, untuk apa, siapa yang dapat melihatnya, dan pilihan yang Anda miliki. Kebijakan ini disusun untuk memenuhi Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (“UU PDP”).",
    sections: [
      {
        title: "1. Pengelola Miamus",
        body: [
          {
            p: `Miamus dikelola oleh ${operator} (“kami”). Untuk semua hal terkait data Anda, hubungi kami di ${email}.`,
          },
        ],
      },
      {
        title: "2. Siapa yang dicakup kebijakan ini",
        body: [
          {
            ul: [
              "Admin rumah — orang yang masuk dengan Google untuk membuat dan mengelola rumah tangga.",
              "Staf rumah — orang yang ditambahkan oleh admin dan memakai Miamus di HP dengan PIN 4 angka.",
              "Siapa pun yang datanya dimasukkan oleh admin atau staf, misalnya nama dalam tugas atau catatan.",
              "Orang yang meminta untuk membuat rumah tangga baru.",
            ],
          },
        ],
      },
      {
        title: "3. Data yang kami kumpulkan",
        body: [
          { h: "Admin" },
          {
            ul: [
              "Dari login Google: nama, alamat email, dan foto profil Anda. Kami tidak pernah melihat kata sandi Google Anda.",
              "Nama rumah tangga, ruangan atau area di rumah, dan daftar admin.",
              "Pilihan bahasa Anda (English atau Bahasa Indonesia), agar Miamus dan notifikasinya untuk Anda tampil dalam bahasa itu. HP Anda menyimpan salinannya agar aplikasi langsung terbuka dalam bahasa yang benar.",
              "Pilihan notifikasi Anda: apakah Anda menerima ringkasan malam dan pukul berapa, dan apakah Anda diberi tahu tentang permintaan staf.",
            ],
          },
          { h: "Permintaan membuat rumah tangga" },
          {
            ul: [
              "Jika Anda masuk dengan Google untuk membuat rumah tangga baru, kami menyimpan permintaan Anda: kapan Anda memintanya, dan apakah disetujui atau ditolak. Selama kami meninjaunya, kami melihat nama dan email Anda dari login Google.",
            ],
          },
          { h: "Staf" },
          {
            ul: [
              "Nama Anda, seperti yang dimasukkan oleh admin rumah.",
              "PIN 4 angka Anda, yang hanya disimpan dalam bentuk acak (hash). Tidak ada yang bisa membacanya kembali — termasuk kami.",
              "Tugas yang Anda selesaikan dan waktunya, serta tanggal cuti dan statusnya.",
              "Setiap kali ada yang masuk dengan nama Anda memakai kode rumah atau PIN: kapan, dari sesi HP yang mana, dan berhasil atau tidak. Disimpan 30 hari, hanya untuk mencegah tebak-tebakan PIN (5 kali salah mengunci PIN selama 15 menit dan memberi tahu admin).",
              "HP mana saja yang terhubung ke rumah tangga, kapan masing-masing terhubung, dan kapan terakhir masuk. Admin dapat melihat daftar ini dan menghapus HP.",
              "Jika admin memakai Kakak, asisten AI di Miamus, nama depan Anda ikut dikirim ke Anthropic bersama permintaan admin, supaya Kakak tahu siapa yang dimaksud (lihat “Kakak” di bawah).",
            ],
          },
          { h: "Semua orang di rumah tangga" },
          {
            ul: [
              "Tugas, pekerjaan rumah, rutinitas, jadwal, dan catatan.",
              "Foto yang diambil di aplikasi: foto bukti tugas, foto sebelum dan sesudah, foto cek stok, foto hewan peliharaan, dan scan dokumen hewan.",
              "Data hewan peliharaan Anda, termasuk catatan dokter hewan dan kesehatannya.",
              "Daftar belanja rumah: barang yang hampir habis atau habis, dan siapa yang memberi tahu.",
              "Makanan yang dicatat rumah tangga: makanan apa, foto (boleh tidak ada), dari mana (dimasak di rumah, dari orang, atau dibeli), disimpan di mana, kapan kedaluwarsa (atau belum ada yang tahu), dari siapa (nama yang Anda ketik), catatan, siapa yang menambahkan, dan apakah sudah dimakan, diberikan, atau dibuang. Kalau staf menambahkan makanan, admin rumah tangga mendapat notifikasi, dan setiap pagi ada notifikasi berisi makanan yang kedaluwarsa hari ini atau besok.",
              "Perbaikan: apa yang rusak dan di mana (ruangan dan bagiannya), keterangan, foto kerusakannya, apakah darurat, siapa yang melapor, kunjungan untuk memperbaikinya beserta foto sebelum dan sesudah, siapa yang memperbaiki (nama yang Anda ketik, misalnya tukangnya), kapan garansinya berakhir, dan apakah sudah diperbaiki atau tidak perlu (dengan alasannya, yang bisa dibaca staf). Catatan singkat tentang perbaikan, dengan foto (boleh tidak ada), yang ditulis admin atau staf. Hanya untuk admin, tidak pernah ditampilkan ke staf: biaya perbaikan, foto notanya, dan catatannya. Kalau staf melaporkan kerusakan darurat, admin rumah tangga mendapat notifikasi.",
              "Tagihan dan perawatan rumah: tagihan rumah tangga (misalnya listrik, air, atau PBB) dan perawatan rumah, dicatat sebagai tugas dengan tanggal dan pengingat (boleh tidak ada); pada hari pengingat, admin yang ditugaskan (atau semua admin, untuk tugas staf) mendapat notifikasi pagi berisi yang jatuh tempo. Hanya untuk admin, tidak pernah ditampilkan ke staf: saat tagihan ditandai sudah dibayar, jumlahnya dan foto bukti bayarnya (atau bukti dari aplikasi bank), di penyimpanan yang hanya bisa dibuka admin.",
              "Masukan yang Anda kirim dari aplikasi (Kirim masukan): pesan Anda, jenisnya jika dipilih (ide, masalah, atau lainnya), siapa yang mengirim, rumah tangganya, halaman tempat pesan dikirim, dan versi aplikasi. Tidak ada data lain dari HP Anda.",
              "Kalau tugas tidak bisa dikerjakan: alasan yang dipilih (misalnya barang habis, atau hewan tidak mau makan), catatan dan foto (boleh tidak ada), barang di daftar belanja yang habis, siapa yang memberi tahu, dan kapan. Admin dan staf rumah tangga bisa melihatnya. Kalau admin menyalakan notifikasi, Miamus mengirim ringkasan malam berisi yang belum selesai hari itu (pada jam yang dipilih, atau tidak sama sekali), notifikasi saat staf minta cuti atau mengusulkan perubahan jadwal, dan notifikasi saat hewan tidak mau minum obat. Catatan staf tidak dimasukkan ke notifikasi.",
            ],
          },
          { h: "Kakak, asisten AI (hanya jika admin menyalakannya)" },
          {
            ul: [
              "Kakak tidak aktif kecuali admin rumah tangga Anda menyalakannya, dan setiap admin bisa mematikannya lagi.",
              "Yang Anda ketik ke Kakak, pertanyaan Kakak, dan jawaban Anda dikirim ke Anthropic untuk dipahami (lihat bagian 5). Miamus tidak menyimpannya: percakapan hanya ada di HP Anda selama Kakak terbuka, lalu dilupakan.",
              "Jika Anda bicara ke Kakak alih-alih mengetik, fitur pengenal suara bawaan browser Anda yang mengubah suara Anda menjadi teks. Untuk itu, browser bisa mengirim rekaman suaranya ke perusahaan pembuatnya (Apple untuk Safari, Google untuk Chrome), sesuai ketentuan privasi perusahaan itu dengan Anda. Miamus tidak pernah menerima atau menyimpan rekaman suara: hanya teksnya yang dikirim ke Kakak, sama seperti jika Anda mengetiknya. Jika Anda menyalakan fitur membacakan jawaban, HP Anda sendiri yang membacakannya.",
              "Supaya Kakak paham permintaan seperti “minta Mbak Sari menyiram tanaman”, setiap permintaan juga membawa nama depan staf, nama hewan peliharaan, nama ruangan, nama barang di daftar belanja, dan tanggal hari ini. Tidak ada data staf lain yang dikirim.",
              "Jumlah permintaan ke Kakak dan biaya masing-masing, tanpa isi teksnya.",
              "Saran Kakak bisa salah. Tidak ada yang disimpan sebelum Anda memeriksa dan mengonfirmasinya; yang disimpan adalah tugas, makanan, atau barang belanja yang Anda konfirmasi, sama seperti jika Anda mengetiknya sendiri.",
            ],
          },
          { h: "Teknis" },
          {
            ul: [
              "ID acak untuk setiap HP staf, dan kapan terakhir dipakai. Jika HP tidak lagi terhubung ke rumah tangga, ID-nya dihapus setelah 7 hari tidak dipakai.",
              "Data notifikasi browser Anda, jika Anda menyalakan notifikasi.",
              "Catatan dasar yang disimpan penyedia hosting saat Anda memakai aplikasi, seperti alamat IP, jenis browser, dan waktu akses.",
            ],
          },
          { h: "Hanya disimpan di HP Anda" },
          {
            ul: [
              "Sesi login, nama staf yang dipilih di HP bersama, pengaturan kunci aplikasi, dan bahasa yang Anda pilih (di halaman masuk, dan salinan bahasa akun Anda).",
              "Supaya tetap bisa dipakai saat sinyal jelek: salinan data rumah yang terakhir dimuat di HP ini (diganti setiap kali dimuat, dan tidak dipakai setelah 24 jam), catatan rutinitas, tugas yang diselesaikan, dan makanan yang disimpan saat tidak ada sinyal atau sinyal terlalu lemah untuk mengirim, serta foto yang menunggu diunggah, sampai terkirim, serta foto tugas yang sedang dikerjakan sampai tugasnya selesai. Jika Anda keluar, semuanya dihapus dari HP ini, termasuk yang belum terkirim.",
              "Pengingat pengobatan mana yang sudah Anda tutup di HP ini.",
              "Apakah jawaban Kakak dibacakan di HP ini.",
              "Apakah Anda menyalakan notifikasi di browser ini (agar Miamus bisa memperbaruinya kalau browser menghapusnya), dan kapan terakhir Anda memilih \"Nanti saja\" pada pengingat notifikasi.",
              "Jika Anda membuka Miamus dengan Face ID atau sidik jari, HP Anda yang memeriksanya. Data wajah atau sidik jari Anda tidak pernah keluar dari HP, dan tidak pernah kami terima.",
            ],
          },
          {
            p: "Yang tidak kami lakukan: tidak melacak lokasi GPS, tidak mengakses kontak Anda, tidak ada iklan — dan kami tidak pernah menjual data Anda.",
          },
        ],
      },
      {
        title: "4. Untuk apa data dipakai",
        body: [
          { p: "Tujuan kami, dan dasar hukumnya menurut Pasal 20 UU PDP:" },
          {
            ul: [
              "Menjalankan Miamus untuk rumah tangga Anda — menampilkan tugas, mencatat siapa mengerjakan apa, pengingat, cuti, dan stok. Ini diperlukan untuk memberikan layanan yang Anda minta.",
              "Menjaga keamanan — login, memisahkan data setiap rumah tangga, meninjau permintaan membuat rumah tangga baru, dan mencegah penyalahgunaan. Ini adalah kepentingan sah kami.",
              "Mengirim notifikasi yang Anda nyalakan. Ini berdasarkan persetujuan Anda, yang dapat Anda tarik kapan saja lewat pengaturan HP atau browser.",
              "Memperbaiki Miamus — membaca masukan yang Anda pilih untuk dikirim. Ini adalah kepentingan sah kami.",
              "Kakak, jika admin menyalakannya — memahami yang diketik admin agar Kakak bisa menyarankan tugas, makanan, dan barang belanja. Ini berdasarkan persetujuan yang diberikan admin saat menyalakan Kakak, yang dapat ditarik dengan mematikannya.",
              "Memenuhi kewajiban hukum, jika ada.",
            ],
          },
          {
            p: "Kami tidak memakai data Anda untuk keputusan otomatis yang berdampak hukum atau berdampak signifikan serupa bagi Anda.",
          },
        ],
      },
      {
        title: "5. Siapa yang dapat melihatnya",
        body: [
          {
            ul: [
              "Di dalam rumah tangga Anda: admin dapat melihat semua data rumah tangganya. Staf melihat tugas, jadwal, dan informasi yang diperlukan untuk pekerjaannya. Rumah tangga lain tidak pernah bisa melihat data Anda.",
              `Permintaan membuat rumah tangga — hanya ${operator}, pengelola Miamus.`,
              `Masukan yang Anda kirim — ${operator}, pengelola Miamus, dan admin rumah tangga Anda. Staf tidak dapat membaca masukan siapa pun, termasuk miliknya sendiri setelah terkirim.`,
              `Supabase — database, login, dan penyimpanan foto, di server yang berada di ${LEGAL.dataRegion.id}.`,
              "Vercel — hosting aplikasi, di server yang berada di Singapura. Foto melewati servernya saat ditampilkan, tetapi tidak disimpan di sana.",
              "Google — login untuk admin.",
              "Anthropic — memahami yang diketik admin ke Kakak, jika admin menyalakannya, di server yang berada di Amerika Serikat. Anthropic menyimpannya paling lama 30 hari (lebih lama hanya jika sistem keamanannya menandai sebuah permintaan, atau jika diwajibkan hukum), dan tidak memakainya untuk melatih AI-nya.",
              "Layanan notifikasi Apple, Google, Microsoft, atau Mozilla — mengirim notifikasi ke perangkat Anda.",
              "Instansi berwenang — hanya jika diwajibkan oleh hukum Indonesia.",
            ],
          },
          {
            p: "Bersama setiap permintaan ke Kakak, Anthropic juga menerima nama depan orang-orang di daftar rumah Anda (staf, dan anggota keluarga yang menjadi admin), nama hewan peliharaan, nama ruangan, dan nama barang belanja, supaya Kakak tahu siapa dan apa yang Anda maksud. Tidak ada data lain tentang staf atau keluarga Anda yang dikirim.",
          },
          {
            p: "Penyedia ini hanya mengolah data untuk menjalankan Miamus bagi kami. Kami tidak membagikan data Anda kepada pengiklan atau pihak lain.",
          },
        ],
      },
      {
        title: "6. Penyimpanan data di luar Indonesia",
        body: [
          {
            p: `Data Miamus disimpan di ${LEGAL.dataRegion.id}, dan penyedia kami dapat memprosesnya di negara lain, seperti Jepang atau Amerika Serikat. Kami mengikuti Pasal 56 UU PDP: kami memakai penyedia di negara dengan tingkat pelindungan data yang setara atau lebih tinggi, atau yang terikat perjanjian untuk melindungi data Anda, dan jika keduanya tidak berlaku, kami mengandalkan persetujuan Anda.`,
          },
          {
            p: "Jika admin menyalakan Kakak, yang diketik ke Kakak diproses oleh Anthropic di Amerika Serikat (dan penyedianya dapat memprosesnya di negara lain). Anthropic terikat perjanjian melalui perjanjian pemrosesan datanya (data processing addendum), yang menjadi bagian dari ketentuan komersialnya; jika itu tidak cukup, admin memberikan persetujuannya dengan menyalakan Kakak.",
          },
        ],
      },
      {
        title: "7. Berapa lama data disimpan",
        body: [
          {
            ul: [
              "Foto bukti tugas dan rutinitas (termasuk foto sebelum dan sesudah) dihapus otomatis setelah 30 hari, kecuali foto kunjungan perbaikan (di bawah).",
              "Perbaikan, fotonya, catatan beserta fotonya, biaya dan notanya, serta foto kunjungannya disimpan selama perbaikan masih berjalan, dan 2 tahun setelah ditutup (sudah diperbaiki atau tidak perlu), lalu dihapus otomatis. Jika perbaikan dihapus, foto, catatan, biaya, dan notanya ikut dihapus, dan foto kunjungannya mengikuti aturan 30 hari.",
              "Catatan percobaan masuk staf dihapus otomatis setelah 30 hari.",
              "Masukan disimpan 2 tahun sejak dikirim, lalu dihapus otomatis.",
              "Alasan dan catatan untuk tugas yang tidak bisa dikerjakan disimpan 90 hari, lalu dihapus otomatis. Fotonya mengikuti aturan 30 hari untuk foto bukti.",
              "Pembayaran tagihan (jumlah dan foto bukti bayarnya) disimpan 2 tahun sejak dicatat, lalu dihapus otomatis. Jika tagihannya dihapus, atau ditandai belum dibayar, pembayaran dan bukti bayarnya ikut dihapus.",
              "Foto makanan disimpan selama makanannya masih ada di daftar, dan dihapus setelah ditandai dimakan, diberikan, atau dibuang, atau setelah dihapus. Makanan yang sudah habis disimpan 90 hari tanpa fotonya, lalu dihapus otomatis.",
              "ID HP staf dihapus 7 hari setelah terakhir dipakai, jika HP itu tidak lagi terhubung ke rumah tangga.",
              "Jumlah permintaan ke Kakak dan biayanya (tanpa isi yang diketik) disimpan 13 bulan, lalu dihapus.",
              "Data lainnya disimpan selama rumah tangga Anda memakai Miamus.",
              "Permintaan membuat rumah tangga yang tidak disetujui dihapus 30 hari setelah keputusan, bersama akun login Google yang dipakai untuk memintanya, kecuali akun itu sudah bergabung ke sebuah rumah tangga. Permintaan yang disetujui disimpan selama akun tersebut dipakai.",
              "Admin yang membuat rumah tangga dapat menghapusnya di aplikasi (Rumah → Data Anda). Rumah tangga dihapus 7 hari kemudian, kecuali ada admin yang membatalkannya sebelum itu. Fotonya lalu dihapus otomatis pada malam hari, biasanya malam itu juga; rumah tangga dengan sangat banyak foto bisa memakan beberapa malam. Cadangan (backup) database menyimpan salinannya paling lama 7 hari lagi, lalu terhapus.",
              "Jika siapa pun meminta lewat email agar datanya atau rumah tangganya dihapus, kami menghapusnya dalam 30 hari, kecuali hukum mewajibkan kami menyimpannya. Salinan di cadangan (backup) penyedia kami terhapus sesuai jadwal normal mereka.",
              "Staf yang dikeluarkan dari rumah tangga diarsipkan, dan namanya tetap tercatat pada pekerjaan sebelumnya agar catatan rumah tetap akurat. Admin atau staf yang bersangkutan dapat meminta kami menghapusnya.",
            ],
          },
        ],
      },
      {
        title: "8. Hak Anda",
        body: [
          { p: "Menurut UU PDP, Anda dapat meminta kami untuk:" },
          {
            ul: [
              "memberi tahu data apa yang kami simpan tentang Anda dan bagaimana kami memakainya;",
              "memberikan salinannya;",
              "memperbaikinya;",
              "menghapusnya, atau menghentikan atau membatasi pemakaiannya;",
              "menarik persetujuan yang pernah Anda berikan;",
              "mengirimkannya kepada Anda dalam format umum yang dapat dibaca mesin.",
            ],
          },
          {
            p: "Admin rumah dapat mengunduh salinan data rumah tangganya dalam file yang dapat dibaca mesin (JSON), dan menghapus rumah tangganya sendiri, di Rumah → Data Anda. Foto tidak termasuk dalam file itu; minta salinannya kepada kami.",
          },
          {
            p: `Untuk hal lainnya, kirim email ke ${email}. Kami mungkin perlu memastikan identitas Anda terlebih dahulu, dan kami akan menanggapi dalam batas waktu yang ditetapkan UU PDP. Anda juga dapat mengajukan pengaduan ke lembaga pelindungan data pribadi di Indonesia.`,
          },
        ],
      },
      {
        title: "9. Untuk admin rumah: data staf Anda",
        body: [
          {
            p: "Anda yang menentukan apa yang dicatat Miamus tentang orang yang bekerja di rumah Anda, dan kami memproses data mereka atas nama dan sesuai arahan Anda. Beri tahu staf Anda bahwa Miamus mencatat tugas, foto, dan cuti mereka, beserta alasannya. Catat hanya yang diperlukan untuk mengurus rumah tangga Anda.",
          },
        ],
      },
      {
        title: "10. Anak-anak",
        body: [
          {
            p: "Miamus tidak dirancang untuk anak-anak. Akun admin hanya untuk orang dewasa (18 tahun ke atas). Jika ada staf yang berusia di bawah 18 tahun, admin wajib mendapatkan persetujuan orang tua atau walinya sebelum menambahkannya.",
          },
        ],
      },
      {
        title: "11. Keamanan",
        body: [
          {
            ul: [
              "Semua data dikirim melalui koneksi terenkripsi (HTTPS).",
              "Data setiap rumah tangga dipisahkan di database, dan foto disimpan di penyimpanan privat.",
              "PIN disimpan dalam bentuk hash dan terkunci setelah 5 kali salah, dan admin dapat menyalakan kunci Face ID atau sidik jari.",
            ],
          },
          {
            p: "Tidak ada sistem yang sepenuhnya aman. Jika terjadi kegagalan pelindungan yang memengaruhi data pribadi Anda, kami akan memberi tahu Anda dan lembaga berwenang paling lambat 3 × 24 jam, sesuai Pasal 46 UU PDP.",
          },
        ],
      },
      {
        title: "12. Perubahan kebijakan",
        body: [
          {
            p: "Kami akan memperbarui halaman ini jika cara Miamus memakai data berubah, dan menampilkan pemberitahuan di aplikasi untuk perubahan penting. Tanggal di bagian atas menunjukkan kapan terakhir diubah.",
          },
        ],
      },
      {
        title: "13. Bahasa",
        body: [
          {
            p: "Kebijakan ini tersedia dalam Bahasa Indonesia dan Bahasa Inggris. Jika keduanya berbeda, versi Bahasa Indonesia yang berlaku.",
          },
        ],
      },
    ],
  },
};

export function PrivacyPolicy({ lang }: { lang: Lang }) {
  const copy = COPY[lang];

  return (
    <main
      lang={lang}
      className="mx-auto w-full max-w-md px-6 pt-10 pb-[calc(3rem+env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center justify-between gap-4 text-sm">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4 shrink-0" />
          {copy.back}
        </Link>
        <Link
          href={copy.other.href}
          className="font-medium text-gray-900 underline underline-offset-4"
        >
          {copy.other.label}
        </Link>
      </div>

      <h1 className="mt-8 text-2xl font-semibold tracking-tight text-gray-900">{copy.title}</h1>
      <p className="mt-1 text-xs text-muted-foreground">{copy.updated}</p>

      {isLegalDraft && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
          {copy.draft}
        </p>
      )}

      <p className="mt-6 text-sm leading-relaxed text-gray-700">{copy.intro}</p>

      {copy.sections.map((section) => (
        <section key={section.title} className="mt-8">
          <h2 className="text-base font-semibold text-gray-900">{section.title}</h2>
          {section.body.map((block, i) =>
            "h" in block ? (
              <h3 key={i} className="mt-4 text-sm font-semibold text-gray-900">
                {block.h}
              </h3>
            ) : "ul" in block ? (
              <ul
                key={i}
                className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-gray-700"
              >
                {block.ul.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p key={i} className="mt-2 text-sm leading-relaxed text-gray-700">
                {block.p}
              </p>
            )
          )}
        </section>
      ))}
    </main>
  );
}
