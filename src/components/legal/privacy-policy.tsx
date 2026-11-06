import Link from "next/link";
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
 * window in task_photo_retention_cutoff() (migrations/102). If either changes,
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
            ],
          },
          { h: "Everyone in a household" },
          {
            ul: [
              "Tasks, chores, routines, schedules and notes.",
              "Photos taken in the app: task proof photos, before and after photos, stock-check photos, pet photos and scans of pet documents.",
              "Details about your pets, including their vet and health records.",
              "Supplies and stock counts.",
            ],
          },
          { h: "Technical" },
          {
            ul: [
              "A random ID for each staff phone, and when it was last used.",
              "Your browser's push-notification details, if you turn notifications on.",
              "Basic records our hosting providers keep when you use the app, such as IP address, browser type and time of access.",
            ],
          },
          { h: "Kept only on your phone" },
          {
            ul: [
              "Your sign-in session, which staff name is selected on a shared phone, photos waiting to upload while you're offline, and app-lock settings.",
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
              `Supabase — database, sign-in and photo storage, on servers in ${LEGAL.dataRegion.en}.`,
              "Vercel — hosts the app. Photos pass through its servers when they're shown, but aren't stored there.",
              "Google — sign-in for admins.",
              "Apple, Google or Mozilla push services — deliver notifications to your device.",
              "Authorities — only when Indonesian law requires it.",
            ],
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
            p: `Miamus data is stored in ${LEGAL.dataRegion.en}, and our providers may process it in other countries, such as Singapore or the United States. We follow Article 56 of UU PDP: we use providers in countries with an equal or higher level of data protection, or that are bound by agreement to protect your data, and where neither applies, we rely on your consent.`,
          },
        ],
      },
      {
        title: "7. How long we keep it",
        body: [
          {
            ul: [
              "Chore and routine proof photos (including before and after photos) are deleted automatically after 30 days.",
              "Everything else is kept while your household uses Miamus.",
              "A request to set up a household that isn't approved is deleted 30 days after the decision, together with the Google sign-in it came from, unless that account has since joined a household. Approved requests are kept while the account is used.",
              "If an admin asks us to delete their household, or anyone asks us to delete their data, we delete it within 30 days unless the law requires us to keep it. Copies in our providers' backups are cleared on their normal schedule.",
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
            p: `Email ${email}. We may need to confirm who you are first, and we'll respond within the time limits UU PDP sets. You can also complain to Indonesia's personal data protection authority.`,
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
              "PINs are stored hashed, and admins can turn on a Face ID or fingerprint lock.",
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
            ],
          },
          { h: "Semua orang di rumah tangga" },
          {
            ul: [
              "Tugas, pekerjaan rumah, rutinitas, jadwal, dan catatan.",
              "Foto yang diambil di aplikasi: foto bukti tugas, foto sebelum dan sesudah, foto cek stok, foto hewan peliharaan, dan scan dokumen hewan.",
              "Data hewan peliharaan Anda, termasuk catatan dokter hewan dan kesehatannya.",
              "Persediaan dan jumlah stok.",
            ],
          },
          { h: "Teknis" },
          {
            ul: [
              "ID acak untuk setiap HP staf, dan kapan terakhir dipakai.",
              "Data notifikasi browser Anda, jika Anda menyalakan notifikasi.",
              "Catatan dasar yang disimpan penyedia hosting saat Anda memakai aplikasi, seperti alamat IP, jenis browser, dan waktu akses.",
            ],
          },
          { h: "Hanya disimpan di HP Anda" },
          {
            ul: [
              "Sesi login, nama staf yang dipilih di HP bersama, foto yang menunggu diunggah saat offline, dan pengaturan kunci aplikasi.",
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
              `Supabase — database, login, dan penyimpanan foto, di server yang berada di ${LEGAL.dataRegion.id}.`,
              "Vercel — hosting aplikasi. Foto melewati servernya saat ditampilkan, tetapi tidak disimpan di sana.",
              "Google — login untuk admin.",
              "Layanan notifikasi Apple, Google, atau Mozilla — mengirim notifikasi ke perangkat Anda.",
              "Instansi berwenang — hanya jika diwajibkan oleh hukum Indonesia.",
            ],
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
            p: `Data Miamus disimpan di ${LEGAL.dataRegion.id}, dan penyedia kami dapat memprosesnya di negara lain, seperti Singapura atau Amerika Serikat. Kami mengikuti Pasal 56 UU PDP: kami memakai penyedia di negara dengan tingkat pelindungan data yang setara atau lebih tinggi, atau yang terikat perjanjian untuk melindungi data Anda, dan jika keduanya tidak berlaku, kami mengandalkan persetujuan Anda.`,
          },
        ],
      },
      {
        title: "7. Berapa lama data disimpan",
        body: [
          {
            ul: [
              "Foto bukti tugas dan rutinitas (termasuk foto sebelum dan sesudah) dihapus otomatis setelah 30 hari.",
              "Data lainnya disimpan selama rumah tangga Anda memakai Miamus.",
              "Permintaan membuat rumah tangga yang tidak disetujui dihapus 30 hari setelah keputusan, bersama akun login Google yang dipakai untuk memintanya, kecuali akun itu sudah bergabung ke sebuah rumah tangga. Permintaan yang disetujui disimpan selama akun tersebut dipakai.",
              "Jika admin meminta rumah tangganya dihapus, atau siapa pun meminta datanya dihapus, kami menghapusnya dalam 30 hari, kecuali hukum mewajibkan kami menyimpannya. Salinan di cadangan (backup) penyedia kami terhapus sesuai jadwal normal mereka.",
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
            p: `Kirim email ke ${email}. Kami mungkin perlu memastikan identitas Anda terlebih dahulu, dan kami akan menanggapi dalam batas waktu yang ditetapkan UU PDP. Anda juga dapat mengajukan pengaduan ke lembaga pelindungan data pribadi di Indonesia.`,
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
              "PIN disimpan dalam bentuk hash, dan admin dapat menyalakan kunci Face ID atau sidik jari.",
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
        <Link href="/" className="text-muted-foreground underline-offset-4 hover:underline">
          ← {copy.back}
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
