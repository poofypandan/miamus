# Public landing page: proposal

Status: **for the owner's review, 2026-11-09. Nothing built.**
Mockup: `docs/mockups/landing-page.html` (open in a browser at phone width;
English and Bahasa Indonesia side by side).

The decisions to make are listed at the end (L1–L7), each with a
recommendation. Once they're agreed, the build is one small PR with tests.

## The problem

Today `miamus.app` opens on a sign-in screen (`src/app/page.tsx`): the mark,
"A little less on your mind", one line listing pets, chores, the kitchen and
helpers, then **Continue with Google** and **Saya staf**. That suits
returning owners and staff. Someone who has only heard of Miamus learns
almost nothing from it: who it's for, how the work reaches staff, what the
owner sees afterwards, what it costs, or whether the staff need an account.

Codex's Paz research (9 Nov) makes the same point. Paz's site names the
household, names the frustration (repeating instructions) and shows the
mechanism: owner asks, staff get it, owner sees the answer. Miamus already
does most of that loop, but it never shows it to someone who hasn't signed
in.

## Routing first: what can't move

Checked in code before proposing any URL:

| Piece | What it does today | Consequence |
| --- | --- | --- |
| `src/app/manifest.ts` | `id: "/"`, `start_url: "/"`, `scope: "/"` | Every installed Miamus, on every owner and staff phone, opens `/`. |
| `src/app/page.tsx` | Client component. Shows a wordless splash, then routes: Google session → `/dashboard`; anonymous session or staff marker in `localStorage` → `/staff`; otherwise the sign-in screen. | The routing has to happen in the browser (it reads `localStorage`), so the server only ever renders the splash. Search engines and WhatsApp link previews see no words on `/`. |
| `src/middleware.ts` | Guards only `/dashboard/*` and `/onboarding`. No session → `/`; anonymous → `/staff`; no household → `/onboarding`. | Any new public page needs no middleware change. |
| `public/sw.js` | Push only, **no fetch handler**, served `no-cache`. | Nothing is cached, so a new page can't be served stale. |
| `/staff`, `/join/staff`, `/join/code`, `/join/owner`, `/join` (old links → `/join/staff`) | Public staff and co-owner doors. | Untouched. |
| `src/app/layout.tsx` | Every page sits in one phone-width column (`max-w-md`) inside `HouseholdProvider`. | A new page inherits the column. That's fine for a phone-first audience (most visitors arrive from a WhatsApp link). |
| `/privacy` + `/privasi` | One server-rendered page per language. | The precedent for a bilingual public page. |

### Why not change `/`

1. **Staff phones and installed apps open `/` on every launch.** Anything
   heavier on `/` slows every staff member, every day.
2. **`/` can only show words after the browser has decided.** A landing page
   there would still render as a blank splash for search engines and link
   previews, which defeats the point.
3. **A staff phone that lost its storage** (a cleaner app, a different
   browser) would land on a sales page instead of its own door.
4. **Signing out returns owners to `/`.** They should see sign-in, not
   marketing.

### Recommendation (L1)

Keep `/` exactly as it is. Add two server-rendered pages, following the
privacy policy's pattern:

- **`/welcome`**: English
- **`/selamat-datang`**: Bahasa Indonesia

Each page links to the other (`hreflang` alternates and the EN | ID switch)
and carries Open Graph title, description and image, so a link shared on
WhatsApp shows a real preview. The sign-in screen gets one quiet link under
the buttons: **"What is Miamus?" / "Apa itu Miamus?"**. Anything shared
publicly (Instagram bio, a WhatsApp message to a friend) points at
`miamus.app/welcome` or `/selamat-datang`.

No change to the manifest, the service worker, the middleware matcher or any
staff or join route.

Considered and not recommended:

- **Redirecting first-time visitors from `/` to `/welcome`.** The server
  can't tell a new visitor from a staff phone whose storage was wiped, which
  is reason 3 above.
- **A separate root layout for a full-width desktop page.** That means
  moving the whole app into a route group, and every jump between the two
  layouts becomes a full page reload. Not worth it for v1.

## Who it's for (the audience)

**The buyer:** an owner in an urban Indonesian household (Java, Bali, some
expatriates) with one or more household staff: ART, driver, gardener. They
often have pets, and they're tired of asking "has the dog eaten? did anyone
mop the terrace?" on WhatsApp. They read English or Bahasa Indonesia.

**Also on the page:** family members who'll help manage (invited later), and
staff who reach it by mistake. Staff get a visible **Saya staf** button, as
on the sign-in screen.

Not targeted: agencies, offices, estates with property managers.

## The promise

Keep the brand line. Add a concrete headline above it, saying the outcome
the owner gets.

Recommended (L2, option A):

| | English | Bahasa Indonesia |
| --- | --- | --- |
| Headline | **Know what's done at home, without asking again.** | **Tahu apa yang sudah beres di rumah, tanpa perlu tanya lagi.** |
| Sub-line | Your family and staff share the daily care of your pets, home and kitchen, in one calm place. | Keluarga dan staf berbagi tugas harian untuk hewan, rumah, dan dapur, di satu tempat yang tenang. |
| Brand line (small) | A little less on your mind. | Biar pikiran sedikit lebih ringan. |

Option B keeps the brand line as the headline and moves the outcome to the
sub-line. Option C: "Set it once. See it done." / "Atur sekali. Lihat
hasilnya." The mockup shows A.

## Page structure

Eight short sections, one idea each, no carousel, no stock photos of people.

1. **Top bar**: the mark and "Miamus", EN | ID switch, **Sign in**
   (→ `/`).
2. **Hero**: headline, sub-line, brand line. Primary button **Request
   access**; secondary **I already have an account** (→ `/`). Under them,
   small: **Staff? Saya staf →** (→ `/join/code`). One phone screenshot:
   the owner's Today.
3. **How it works**: the demonstration, in three steps (below).
4. **What it looks after**: four cards (Pets, Chores and rooms, Kitchen,
   Repairs), each one line and one screenshot.
5. **Made for the people who do the work**: staff screens in plain Bahasa
   Indonesia; no account or email, just their name and a PIN; leave
   (cuti) built in; nothing tracks where they are.
6. **Your household's data**: kept in Singapore, never sold, no ads;
   download it or delete the household any time. Link to the privacy policy.
7. **Questions**: eight FAQs, collapsed.
8. **Request access** (repeated) and the footer: Poofy Labs, privacy policy,
   support@poofylabs.dev.

## The demonstration: owner asks → staff do it → owner sees it

Three steps, each with a screenshot. Every claim below is checked against
code (file references are for review, not shown on the page).

| Step | English | Bahasa Indonesia | Grounded in |
| --- | --- | --- | --- |
| 1. You set it once | **Set it once.** Add "Mop the terrace, every day" for Sari, or Mochi's meal times. Miamus repeats it, day after day. | **Atur sekali.** Tambahkan "Pel teras, setiap hari" untuk Sari, atau jam makan Mochi. Miamus mengulangnya setiap hari. | Chore editor: title, room, assignee, repeat none/daily/weekly/monthly, notes (`chore-editor-dialog.tsx`, `chore-recurrence.ts`). Pet routines with fixed times (`schedule-editor.tsx`). |
| 2. Staff see it on their phone | **They see it on their phone.** Sari opens Miamus, and today's list is in Bahasa Indonesia. She taps her chore, takes a photo before and after, and it's done. No account, no email. | **Staf melihatnya di HP.** Sari membuka Miamus, dan daftar hari ini dalam Bahasa Indonesia. Dia ketuk tugasnya, foto sebelum dan sesudah, selesai. Tanpa akun, tanpa email. | Staff Today (`app/staff/page.tsx`), an assigned chore says "Ketuk untuk foto", an unassigned one "Saya kerjakan" (`tap-hint.tsx`, `chore-card.tsx`), before/after photos enforced by the database (migration 104), invite link / house code + PIN (`join/staff`, `join/code`). |
| 3. You see it's done | **You see it's done.** Who did it, when, and the photos, on your Today. If a pet is unwell or something urgent breaks, your phone tells you straight away. | **Anda lihat sudah selesai.** Siapa yang mengerjakan, jam berapa, dan fotonya, di Hari ini. Kalau hewan sakit atau ada kerusakan darurat, HP Anda langsung diberi tahu. | Owner Today and the staff strip (`agenda-tab.tsx`, `staff-completion-strip.tsx`); owner push for sick reports, urgent repairs, food from staff, food expiring (migrations 103/114, 130, 123, 124). |

What the page deliberately does **not** say: that Miamus messages staff on
WhatsApp (it doesn't; owners send the invite link themselves, and staff can
tap to tell the owner on WhatsApp after an urgent report); that staff are
notified of new tasks (staff phones don't get push today); that Kakak is
available (built, switched off).

## Screenshots

- **Real app screens**, captured from mock mode with made-up sample data
  (pets Mochi and Bruno, staff Sari and Budi, rooms Teras and Dapur), as in
  the local preview lab. Never a real household's data or photos.
- Five shots per language: owner Today (hero), chore claim with before/after
  photos (staff, always Indonesian), owner Today with the finished chore and
  its photos, Pets, Kitchen. The owner shots differ by language; the staff
  shots are the same Indonesian screen on both pages.
- Saved as WebP in `public/landing/` (about 40–80 KB each), shown in a simple
  phone outline, with `loading="lazy"` below the hero.
- Re-captured when a screen changes noticeably. The build PR adds a small
  script that takes them with Playwright against mock mode, so it's one
  command.

## Copy

### Hero

| | English | Bahasa Indonesia |
| --- | --- | --- |
| Headline | Know what's done at home, without asking again. | Tahu apa yang sudah beres di rumah, tanpa perlu tanya lagi. |
| Sub-line | Your family and staff share the daily care of your pets, home and kitchen, in one calm place. | Keluarga dan staf berbagi tugas harian untuk hewan, rumah, dan dapur, di satu tempat yang tenang. |
| Brand line | A little less on your mind. | Biar pikiran sedikit lebih ringan. |
| Primary | Request access | Minta akses |
| Secondary | I already have an account | Saya sudah punya akun |
| Staff link | Staff? **Saya staf** → | Staf? **Saya staf** → |
| Beta note | Free while Miamus is in beta. We review every new household. | Gratis selama Miamus masih beta. Setiap rumah baru kami tinjau. |

### What it looks after

| Card | English | Bahasa Indonesia |
| --- | --- | --- |
| Pets | **Pets.** Meals, potty breaks and medicine, with photos. Vet visits and a health record for each pet. | **Hewan.** Makan, Pipis & Pup, dan obat, lengkap dengan foto. Kunjungan dokter hewan dan catatan kesehatan tiap hewan. |
| Chores | **Chores, room by room.** Who does what, on which floor, with before and after photos. | **Tugas rumah, per ruangan.** Siapa mengerjakan apa, di lantai mana, dengan foto sebelum dan sesudah. |
| Kitchen | **Kitchen.** Food at home and when it expires, who gave it, the container to return, and the shopping list. | **Dapur.** Makanan di rumah dan kapan kedaluwarsa, dari siapa, wadah yang perlu dikembalikan, dan daftar belanja. |
| Repairs | **Repairs.** Staff report what's broken with a photo. You schedule the visit and keep the costs to yourself. | **Perbaikan.** Staf melaporkan kerusakan dengan foto. Anda menjadwalkan perbaikan, dan biayanya hanya untuk pemilik. |

Grounded in: pets (`pets-tab.tsx`, `health-record-card.tsx`,
`medication-course-alerts.tsx`), rooms (`rooms-view.tsx`, migration 129),
kitchen (`food-view.tsx`, `shopping-tab.tsx`, migration 123), repairs
(`repairs-view.tsx`, migrations 130–131).

### Made for the people who do the work

| English | Bahasa Indonesia |
| --- | --- |
| **Made for the people who do the work.** | **Dibuat untuk yang mengerjakannya.** |
| Staff screens are in plain Bahasa Indonesia, with big buttons and photos instead of typing. | Layar staf memakai Bahasa Indonesia yang sederhana, dengan tombol besar dan foto, bukan ketikan. |
| No account or email: each person signs in with their name and a 4-digit PIN. | Tanpa akun atau email: setiap orang masuk dengan nama dan PIN 4 angka. |
| Leave (cuti) is built in. Their tasks pause or open up to others while they're away. | Cuti sudah tersedia. Selama cuti, tugasnya dijeda atau terbuka untuk yang lain. |
| Miamus never tracks where anyone is. | Miamus tidak pernah melacak lokasi siapa pun. |

Grounded in: staff screens `lang="id"` throughout; `staff-login-gate.tsx`
(name → 4-digit PIN); `leave-request.tsx` ("Tugas Anda dijeda" / "terbuka
untuk siapa saja selama cuti"); no geolocation anywhere in `src/`.

### Your household's data

| English | Bahasa Indonesia |
| --- | --- |
| **Your household's data stays yours.** | **Data rumah Anda tetap milik Anda.** |
| Stored in Singapore. No ads, and we never sell your data. | Disimpan di Singapura. Tanpa iklan, dan kami tidak pernah menjual data Anda. |
| Download a copy, or delete your household, any time. | Unduh salinannya, atau hapus rumah Anda, kapan saja. |
| Read the privacy policy → | Baca Kebijakan Privasi → |

Grounded in: `LEGAL.dataRegion`; privacy policy section on ads and selling;
Household → Your data (`household-data-panel.tsx`, migration 127). The region
is read from `src/config/legal.ts`, never typed into the page.

### Questions (FAQ)

| # | English | Bahasa Indonesia |
| --- | --- | --- |
| 1 | **Who is Miamus for?** Households where family and staff share the daily work: pets, chores, the kitchen, repairs. It works with one helper or several. | **Miamus untuk siapa?** Rumah tangga yang tugas hariannya dibagi antara keluarga dan staf: hewan, tugas rumah, dapur, perbaikan. Bisa untuk satu staf atau beberapa. |
| 2 | **Do my staff need an account or email?** No. You send a link (on WhatsApp, for example). It connects their phone to your home, and they sign in with their name and a PIN. If they're ever signed out, they use the house code. | **Apakah staf perlu akun atau email?** Tidak. Anda kirim link (misalnya lewat WhatsApp). Link itu menghubungkan HP mereka ke rumah Anda, lalu mereka masuk dengan nama dan PIN. Kalau suatu saat keluar, mereka masuk lagi dengan kode rumah. |
| 3 | **What language do staff see?** Bahasa Indonesia, always. You choose English or Bahasa Indonesia for yourself. | **Staf melihat bahasa apa?** Selalu Bahasa Indonesia. Anda sendiri bisa memilih Bahasa Inggris atau Bahasa Indonesia. |
| 4 | **Is there an app to download?** No app store needed. Open miamus.app on Android or iPhone and add it to the home screen. It opens full screen, like an app. | **Apakah perlu unduh aplikasi?** Tidak perlu lewat app store. Buka miamus.app di Android atau iPhone, lalu tambahkan ke layar utama. Tampilannya layar penuh, seperti aplikasi. |
| 5 | **What if the signal is weak?** Staff can keep logging. Logs and photos wait on the phone and send themselves when the signal comes back. | **Bagaimana kalau sinyal lemah?** Staf tetap bisa mencatat. Catatan dan foto tersimpan di HP dan terkirim sendiri saat sinyal kembali. |
| 6 | **Does Miamus send WhatsApp messages?** No automatic messages. You share the invite link yourself, and after an urgent report staff can tap once to tell you on WhatsApp. Urgent things also reach your phone as a notification. | **Apakah Miamus mengirim pesan WhatsApp?** Tidak ada pesan otomatis. Anda sendiri yang membagikan link undangan, dan setelah laporan darurat staf bisa sekali ketuk untuk memberi tahu Anda lewat WhatsApp. Hal yang darurat juga masuk ke HP Anda sebagai notifikasi. |
| 7 | **Can my family help manage?** Yes. Invite your partner or family; they sign in with Google and can manage everything you can. | **Apakah keluarga bisa ikut mengelola?** Bisa. Undang pasangan atau keluarga; mereka masuk dengan Google dan bisa mengelola semuanya seperti Anda. |
| 8 | **What does it cost?** Free while Miamus is in beta. Everything you do by hand will stay free; later, an optional AI helper will be the paid extra. | **Berapa biayanya?** Gratis selama Miamus masih beta. Semua yang dikerjakan secara manual akan tetap gratis; nanti, asisten AI opsional menjadi tambahan berbayar. |

Notes for review:

- **FAQ 5** is true today for a phone that knows it's offline (the offline
  queue and photo queue). The "weak but not offline" case is PR #41. If the
  landing ships before #41 merges, soften it to "Logs and photos wait on the
  phone when there's no signal…".
- **FAQ 8** says the agreed direction (manual free, AI the paid extra) in
  public for the first time. See L5.
- Kakak isn't named anywhere on the page. See L6.

### Request access

| | English | Bahasa Indonesia |
| --- | --- | --- |
| Heading | Start with your household | Mulai dengan rumah Anda |
| Body | Miamus is invite-only while it's in beta. Sign in with Google and tap **Request access**. We'll review it, and you'll name your household once it's approved. | Miamus masih beta dan hanya dengan undangan. Masuk dengan Google, lalu ketuk **Minta akses**. Kami akan meninjaunya, dan Anda bisa memberi nama rumah setelah disetujui. |
| Button | Continue with Google | Lanjutkan dengan Google |
| Consent | Your request shares your Google name and email with Poofy Labs, who runs Miamus. See the Privacy Policy. | Permintaan ini membagikan nama dan email Google Anda kepada Poofy Labs, pengelola Miamus. Lihat Kebijakan Privasi. |
| No Google | No Google account? Email support@poofylabs.dev. | Tidak punya akun Google? Kirim email ke support@poofylabs.dev. |
| Joining | Joining someone's household? Open the invite link they sent you. | Ingin bergabung ke rumah orang lain? Buka link undangan yang mereka kirim. |

### Footer

"Made with care by Poofy Labs" / "Dibuat dengan sepenuh hati oleh Poofy
Labs" (same as About Miamus) · Privacy Policy / Kebijakan Privasi ·
support@poofylabs.dev. The operator's name and email come from `LEGAL`.

## The access-request flow (reuse, nothing new)

Miamus already has one (Phase 148, migration 113):
Google → choose a language → **Request access** → the platform admin gets a
push and approves at `/dashboard/approvals` → the owner opens Miamus again →
names the household.

The landing page's **Request access** starts that same Google sign-in
(`signInWithOAuth`, `redirectTo: /auth/callback`). The middleware already
sends a new account to `/onboarding`, which shows the language screen, then
the request. The visitor's choice of EN or ID on the landing is saved to the
public-locale key, so the language screen is pre-selected in the same
language (the onboarding screen still asks, as today).

- **No new personal data, no new service, no new table.** The Google name
  and email shared with Poofy Labs are already in the privacy policy (version
  2026-11-06). **No privacy-policy or `legal.ts` change**, which also keeps
  this PR clear of PR #41.
- **No email is sent on approval** (there is no email service). The waiting
  screen says "open Miamus again", and that's a gap. It's in the Part B audit;
  adding email would be a new service and a privacy-policy change.

Not recommended: a waitlist form (name, email or WhatsApp number). That's
new personal data, a new table and retention rule, a privacy-policy update in
both languages, spam protection, and a second queue next to the one that
already works.

## Design

- Miamus's own look: white page, Plus Jakarta Sans, neutral greys, near-black
  primary buttons (`rounded-xl`), the rounded-square mark, emerald only for
  "done". Same tokens as the app, so the page and the app feel like one
  product.
- Calm rhythm: one idea per section, generous space, at most two buttons on
  screen at once.
- Phone-width column (the root layout's frame). On a desktop it shows as the
  app does: a centred phone-width page.
- The FAQ uses native `<details>`: no JavaScript, works with the keyboard.
- Accessible: real headings, `lang` on `<html>` content, alt text on every
  screenshot, 44 px+ tap targets, contrast to WCAG AA.
- No analytics, no cookies, no third-party scripts or fonts beyond what the
  app already loads (`next/font` self-hosts Plus Jakarta Sans).

## Build plan (after approval)

One PR, on a new branch:

1. `src/app/welcome/page.tsx` and `src/app/selamat-datang/page.tsx`: server
   components with `metadata` (title, description, `alternates.languages`,
   Open Graph). Both render `src/components/landing/landing-page.tsx` with a
   `locale` prop.
2. `src/components/landing/landing-copy.ts`: the copy above, one object per
   language (written, not translated line by line, like About Miamus).
3. A small client island only for the two Google buttons (the same
   `signInWithOAuth` call as `/`). Everything else server-rendered.
4. `src/app/welcome/opengraph-image.tsx` (and the Indonesian one): a
   generated 1200×630 card with the mark and the headline, like
   `app/icon.tsx`.
5. One link on `/`: "What is Miamus?" / "Apa itu Miamus?", the only change
   to the front door.
6. `public/landing/*.webp` + `scripts/capture-landing-shots.ts` (Playwright
   against mock mode).
7. Tests:
   - e2e `tests/e2e/landing.spec.ts`: both pages render signed out with the
     right `lang` and headline; Sign in → `/`; **Saya staf** → `/join/code`;
     EN | ID switch swaps pages; FAQ opens; **Request access** starts the
     Google redirect (stubbed); `/` still shows sign-in plus the new link;
     a phone with a staff marker opening `/` still goes to `/staff`
     (regression).
   - unit `tests/unit/landing-copy.test.ts`: English and Indonesian have the
     same keys; no Indonesian string uses words the glossary rules out
     ("ponsel", "pembantu", "majikan", "kamu"); the contact email comes from
     `LEGAL`.
8. `tsc`, `npm run build`, Playwright with the stub env (`CI=1`), Codex review
   until clean, then the owner's OK before merging (merging deploys to
   production).

A short tutorial isn't needed: nothing changes for signed-in owners or
staff.

Size: small to medium, about a day of building plus screenshots.

## Out of scope

Pricing page, blog, app-store listings, analytics, a contact form, a waitlist,
WhatsApp automation, marketing for Kakak, a desktop-width layout.

## Decisions for the owner

| # | Decision | Recommended |
| --- | --- | --- |
| L1 | URL | **A:** keep `/`; add `/welcome` + `/selamat-datang`; a "What is Miamus?" link on sign-in. (B: make `/` the landing page, not recommended, see "Why not change `/`".) |
| L2 | Headline | **A:** "Know what's done at home, without asking again." / "Tahu apa yang sudah beres di rumah, tanpa perlu tanya lagi." (B: brand line as headline; C: "Set it once. See it done.") |
| L3 | Access request | **A:** reuse today's Google → Request access → approval. No new data. (B: waitlist form, needs a privacy update.) |
| L4 | Screenshots | **A:** real screens from mock mode with made-up data, captured by script. (B: drawn illustrations.) |
| L5 | Pricing line in FAQ 8 | **A:** "Free while in beta. Everything by hand stays free; an optional AI helper will be the paid extra." (B: only "Free while in beta.") |
| L6 | Kakak on the page | **A:** not mentioned until she's live. (B: one "coming soon" line.) |
| L7 | Staff example names | **A:** Sari and Budi, pets Mochi and Bruno (the preview lab's names). |
