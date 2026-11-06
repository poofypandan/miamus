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
  Addressed as **kamu** (see open question below).

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
- Times: currently 12-hour ("9:00 AM") everywhere. Open question below.

## Open questions (owner to decide)

1. **Staff address: "kamu" or "Anda"?** The average household worker is about
   40, often older than the person employing them. "kamu" is friendly and what
   most consumer apps use, but can read as talking down to an older worker.
2. **24-hour time for Indonesian screens?** Indonesians usually write times as
   14.30 or "pukul 14.30"; AM/PM is less natural in Bahasa Indonesia.
3. **Test with real readers.** Five people — two Indonesian-speaking owners,
   three household workers — reading the main screens catches what no review
   does.
