# Bahasa Indonesia in Miamus — glossary and rules

Owners choose English or Bahasa Indonesia (Phase 149); staff screens are
Bahasa Indonesia only. This file keeps the Indonesian consistent across
screens, sessions and reviews. Codex's Language rule in `AGENTS.md` points
here.

## Who reads it

- **Owners** — urban, mostly middle- to upper-class households on Java and in
  Bali, plus expatriates (who will mostly pick English). Comfortable with the
  English tech words Indonesians already use every day; put off by stiff,
  purist coinages. Addressed as **Anda**.
- **Staff** — household workers. Sakernas (Feb 2025, via LPEM FEB UI): average
  age about 40; the largest groups finished junior high (28%), did not finish
  primary school (26%) or finished primary (19%). Write short, plain sentences;
  avoid English except words they already use (HP, foto, link, PIN, WA).
  Addressed as **Anda**, or with no pronoun where the sentence reads
  naturally without one ("Pilih tanggal tidak bekerja"). Never **kamu** or
  **-mu**: the average worker is about 40, often older than the family they
  work for, and the app speaks for the employer (owner decision, 2026-11-07).

## Rule of thumb

Use the word an Indonesian household actually says. Keep an English loanword
when it is the everyday word (HP, link, admin, grooming, stok); use Indonesian
when the Indonesian word is just as everyday (masuk, simpan, hapus, foto,
tugas). Never use **pembantu** or **majikan**: UU PPRT (passed 21 April 2026)
replaced them with *pekerja rumah tangga* and *pemberi kerja*. In the app the
people are **staf** and **admin**.

## Terms

| English (owner UI) | Bahasa Indonesia | Why |
|---|---|---|
| Phone | **HP** | What everyone says; "ponsel" reads formal. The privacy policy uses HP too. |
| Admin | **Admin** | Everyday loanword. |
| Staff | **Staf** | Neutral and respectful; avoids "pembantu". |
| Link / invite link | **link** / **link undangan** | Everyday. |
| PIN, Face ID, Google, WhatsApp | unchanged | Names and everyday terms. |
| Sign in / Sign out (buttons) | **Masuk** / **Keluar** | Standard in Indonesian apps. "login" is fine inside a sentence. |
| Continue with Google | **Lanjutkan dengan Google** | Google's own Indonesian wording. |
| Leave | **Cuti** | The legal term in UU PPRT (Pasal 1). |
| Chores | **Tugas** (tab) / **tugas rumah** | |
| Inventory / stock | **Stok** | Everyday loanword (staff "Stok" tab matches). |
| Units | **pcs**, **pak**, **kotak**, **botol**, **rol**, **tube**, kg, g, L, ml | "pcs" is what every shop and receipt says. |
| Potty | **Pipis & Pup** | Matches the routine's stored title and the staff screen. |
| Grooming | **Grooming** | Pet salons in Indonesia say grooming. |
| Pee pad | **Pee pad** | Product name. |
| Vet | **Dokter hewan** | Everyday. |
| Health passport | **Catatan kesehatan** | "Paspor kesehatan" is not a phrase Indonesians use for pets. |
| Founder (of the household) | **Pemilik** | "Pendiri" sounds like an organisation. |
| Test notification | **Tes notifikasi** | "Tes" is everyday; "uji" reads technical. |
| Pet Alert (sick report push) | **Hewan Sakit** | Says what happened. |
| Action Mode | **Mode Kerja** | |
| Manage | **Kelola** | |
| Workload | **Beban Kerja** | Understood; keep unless owners say otherwise. |
| Upload / uploading | **Unggah** / **Mengunggah** | Standard in Indonesian apps. |
| Offline | **offline** | Everyday loanword. |

## Formatting

- Dates: `toLocaleDateString("id-ID")` (e.g. "6 Nov").
- Decimals: comma — 2,5 kg (`formatQuantity(value, "id")`).
- Times: in Bahasa Indonesia, 24-hour with a dot — **09.00**, **15.30** —
  on staff screens and for owners who chose Indonesian. Owners who chose
  English keep "9:00 AM". Written Indonesian uses the 24-hour clock; AM/PM
  belongs to English (owner decision, 2026-11-07). Components use
  `useFormatTime()` from `src/components/ui/ui-labels.tsx`.

## Open questions (owner to decide)

1. **Test with real readers.** Five people — two Indonesian-speaking owners,
   three household workers — reading the main screens catches what no review
   does.
