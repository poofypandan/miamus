# Phase 156, step 0 — How Miamus works (the short owner guide)

Status: **proposal, for the owner to approve.** Nothing is built yet.
Mockups: `docs/mockups/phase-156-guide.html` (open in a browser; English and
Indonesian side by side).

Parent plan: `docs/phase-156-plan.md`, sections 0 and 7 (step 0: "Backups on,
short guide"). It scales down the guide first planned in
`docs/phase-153-plan.md`. No AI, no new tab, no arrow tours, no database
change.

## The idea in one paragraph

Seven short cards that answer the questions a new owner or co-owner actually
has, each two to four sentences and one button that takes them to the right
screen. They live in one place — a **"How Miamus works" / "Cara pakai
Miamus"** row in Household — and a new owner is pointed there **once**, by a
small card on Today. Nothing pops up, nothing walks them around the screen,
nothing blocks the app. People learn by doing the first real thing; the guide
is there when they wonder "how do I…?".

## What changes for people

| Where | Before | After |
| --- | --- | --- |
| Household tab | four groups of settings rows | plus a fifth group at the bottom: **How Miamus works** / **Cara pakai Miamus** (book icon) |
| The guide page | — | one short list of seven rows; tapping one opens its card in a bottom sheet; at the bottom "Still stuck? Email support@poofylabs.dev" |
| Today, a new owner (first 30 days) | nothing | once per phone, one quiet card: **New to Miamus?** → *How Miamus works* · *Not now* |
| Today, a household with nothing in it yet | "Welcome to your new household!" with Add Pet · Add Chore | the same, plus one quiet link under the buttons: **How Miamus works →** (and no separate welcome card, so there are never two welcomes) |

## Where it lives: one row in Household (recommended)

`?module=access&page=guide` — a page of the Household tab like Staff or
Notifications, so the back button and the tab bar behave as everywhere else.
The open card is in the URL too (`&card=chores`), per the State Persistence
rule: the phone's back gesture closes the card, and a link can open one
directly (the welcome card and the empty-state link open the list, not a
card).

Why Household: it already holds people, invites, staff sign-in and
notifications — four of the seven answers point there. Owners already go
there to "set things up". A help button in the header was considered and
rejected: the header is the same on every screen (Phase 153), and a "?" on
every screen is exactly the clutter section 0 rules out.

### The page

- Title **How Miamus works** / **Cara pakai Miamus**, one line under it:
  "Seven short answers. Tap one." / "Tujuh jawaban singkat. Ketuk salah
  satu."
- One rounded group of seven rows, the same `SettingsRow` the Household list
  uses (icon, title, chevron). No screenshots (see "What it replaces").
- At the bottom, quiet: **Still stuck? Email support@poofylabs.dev** /
  **Masih bingung? Kirim email ke support@poofylabs.dev** — the address read
  from `LEGAL.contactEmail` (`src/config/legal.ts`), a `mailto:` link.

### A card

A bottom sheet, the existing one: the title, two to four short lines (or
three numbered steps), then **one primary button** that goes to the screen
the card is about ("Go to Chores"). Under it a quiet **Next: Kitchen** link,
so someone who wants to read all seven can, without a slideshow. The last
card's quiet link is **Done**.

Paths inside the text ("Household → Invite someone") use the exact labels on
screen in that language, so the words match what the owner sees.

## When it shows, and how it is dismissed

**The welcome card on Today:**

- **Who:** owners (admins) only — never on a staff phone, never in the
  staff view.
- **When:** the owner joined this household **in the last 30 days** (read
  from the existing `household_members.created_at` — the "Joined" date the
  Family page already shows, through `list_household_members()`'s own row,
  `is_self`), and this phone hasn't dismissed it. That covers a new
  owner and a co-owner who just accepted an invite, and spares long-time
  owners who sign in on a new phone.
- **Not while the household is empty:** then the existing welcome empty state
  carries the link instead (one welcome at a time).
- **One hint at a time:** the "Add to Home Screen" tip (`StaffOnboardingBanner`,
  shown on the owner dashboard too) waits until the welcome card is gone. The
  first card of the guide repeats the Home Screen tip, so nothing is lost.
- **Where:** top of Today, above "Waiting for you"; neutral colours (it is
  not urgent, so not amber).
- **Dismissed:** for good on this phone by **How Miamus works** (opens the
  guide), **Not now**, or the ✕. Opening the guide from Household also counts.
  The flag is kept on the phone (`localStorage`, like the Home Screen tip's
  `b11_onboarding_dismissed`); if site data is blocked it simply shows again
  next time, nothing breaks.

**The guide page** is always there, for everyone with the owner dashboard.
Nothing to dismiss.

## The seven cards

Card order follows a new owner's first week. Each card: title, text, button.
English uses "you"; Indonesian addresses the owner as **Anda**, with the
glossary's words (HP, staf, Tugas, Dapur, Makanan · Belanja, Kode rumah,
Menunggu Anda, Saya kerjakan, Tunggu pemilik rumah, Makanan masuk, Cuti).
Screen labels in quotes are the real ones, checked against the code
(Household list, invite and house-code panels, chore editor, Kitchen tab,
staff Lapor sheet, notification settings).

### 1. Your first day · Hari pertama Anda

Button: **Go to Pets** · **Buka Hewan** → Pets tab.

> **EN**
> Today shows the whole house at a glance: pet routines, chores, and
> anything waiting for you.
>
> Start with your pets. Add each one in Pets and set its meal and medicine
> times — staff tick them off every day.
>
> Then add a few chores (next card). Everything can be changed later.
>
> Tip: add Miamus to your Home Screen so it opens like an app.

> **ID**
> Hari ini menampilkan seisi rumah sekilas: rutinitas hewan, tugas, dan apa
> pun yang menunggu Anda.
>
> Mulai dari hewan Anda. Tambahkan satu per satu di Hewan, lalu atur jam
> makan dan obatnya — staf menandainya setiap hari.
>
> Lalu tambahkan beberapa tugas (kartu berikutnya). Semuanya bisa diubah
> nanti.
>
> Tips: tambahkan Miamus ke Layar Utama supaya terbuka seperti aplikasi.

### 2. Chores · Tugas

Button: **Go to Chores** · **Buka Tugas** → Chores tab.

> **EN**
> In Chores, tap Add Chore: what to do, who does it, the day and time, and
> whether it repeats.
>
> Leave it Unassigned and anyone can take it — staff tap “Saya kerjakan”.
> Turn on “Wait for an owner” for chores that need you at home.
>
> Staff tick each chore off and can add a photo. You see who did what on
> Today and in Chores.

> **ID**
> Di Tugas, ketuk Tambah Tugas: apa yang dikerjakan, siapa yang
> mengerjakan, hari dan jamnya, dan apakah berulang.
>
> Biarkan “Belum ditugaskan” supaya siapa saja bisa mengambilnya — staf
> ketuk “Saya kerjakan”. Nyalakan “Tunggu pemilik rumah” untuk tugas yang
> perlu Anda ada di rumah.
>
> Staf menandai tugas selesai dan bisa menambahkan foto. Anda melihat siapa
> mengerjakan apa di Hari ini dan di Tugas.

### 3. Linking a staff phone · Menghubungkan HP staf

Button: **Go to Staff** · **Buka Staf** → Household → Staff.

> **EN**
> 1. Add the person: Household → Staff → their name.
> 2. Send their phone a link: Household → Invite someone → Link a staff
>    phone. A shared house phone works too.
> 3. On that phone they open the link, tap their name and choose a 4-digit
>    PIN. You never need to know it.
>
> Phone signed out later? They tap “Saya staf”, type the house code
> (Household → Staff sign-in), pick their name and enter their PIN.
> Someone has left? Remove them in Staff; their phones are signed out.

> **ID**
> 1. Tambahkan orangnya: Rumah → Staf → namanya.
> 2. Kirim link ke HP-nya: Rumah → Undang → Hubungkan HP staf. HP bersama
>    di rumah juga bisa.
> 3. Di HP itu, mereka buka link-nya, ketuk nama mereka, lalu pilih PIN 4
>    angka. Anda tidak perlu tahu PIN-nya.
>
> Nanti HP-nya keluar dari Miamus? Mereka ketuk “Saya staf”, ketik kode
> rumah (Rumah → Masuk staf), pilih nama, lalu masukkan PIN.
> Ada yang sudah tidak bekerja? Hapus di Staf; HP-nya otomatis keluar.

### 4. Kitchen: food and shopping · Dapur: makanan dan belanja

Button: **Go to Kitchen** · **Buka Dapur** → Kitchen tab (Food).

> **EN**
> Food shows what's in the house, what to eat first at the top. Add food
> when it arrives; when it's gone, tap Eaten, Given away or Thrown away.
>
> Staff log food at the door with “Lapor → Makanan masuk”, and you get a
> notification.
>
> Shopping is the shopping list, with the supplies at home underneath —
> soap, pee pads, pet food.

> **ID**
> Makanan menunjukkan makanan yang ada di rumah, yang perlu segera dimakan
> paling atas. Tambahkan makanan saat datang; kalau sudah habis, ketuk
> Dimakan, Diberikan, atau Dibuang.
>
> Staf mencatat makanan yang datang lewat “Lapor → Makanan masuk”, dan Anda
> mendapat notifikasi.
>
> Belanja berisi daftar belanja, dengan Stok di rumah di bawahnya — sabun,
> pee pad, makanan hewan.

### 5. What staff see · Yang dilihat staf

Button: **Open the staff view** · **Buka tampilan staf** → the Staff side of
the Overview | Staff switch.

> **EN**
> Staff screens are always in Bahasa Indonesia, and simple: today's tasks —
> theirs and the ones nobody has taken — and Dapur.
>
> With “Lapor” they report a sick pet, log food, suggest a routine or ask
> for leave. Suggestions wait for you on Today under “Waiting for you”;
> leave in Household → Leave.
>
> To see exactly what they see, tap Staff at the top of the screen.
> Overview brings you back.

> **ID**
> Layar staf selalu dalam Bahasa Indonesia, dan sederhana: tugas hari ini —
> milik mereka dan yang belum ada yang ambil — serta Dapur.
>
> Lewat “Lapor”, mereka melaporkan hewan sakit, mencatat makanan masuk,
> mengusulkan rutinitas, atau mengajukan cuti. Usulan menunggu Anda di Hari
> ini, di bagian “Menunggu Anda”; cuti di Rumah → Cuti.
>
> Untuk melihat persis yang mereka lihat, ketuk Staf di bagian atas layar.
> Ringkasan membawa Anda kembali.

### 6. Inviting family · Mengundang keluarga

Button: **Invite family** · **Undang keluarga** → Household → Invite someone.

> **EN**
> Your partner or family can run the house with you.
>
> Go to Household → Invite someone → Invite family, and send the link on
> WhatsApp. They sign in with Google and can do everything you can.
>
> The link works once, for 7 days — send it only to them.

> **ID**
> Pasangan atau keluarga bisa ikut mengurus rumah bersama Anda.
>
> Buka Rumah → Undang → Undang keluarga, lalu kirim link-nya lewat
> WhatsApp. Mereka masuk dengan Google dan bisa melakukan semua yang Anda
> bisa.
>
> Link-nya sekali pakai dan berlaku 7 hari — kirim hanya ke orang itu.

### 7. Getting notifications · Notifikasi

Button: **Turn on notifications** · **Aktifkan notifikasi** → Household →
Notifications.

> **EN**
> Miamus tells you when staff report a sick pet or log food that came in.
>
> Turn it on for each phone: Household → Notifications.
>
> On iPhone, first add Miamus to your Home Screen (Share → Add to Home
> Screen) and open it from there. Then tap Send test to check.

> **ID**
> Miamus memberi tahu Anda saat staf melaporkan hewan sakit atau mencatat
> makanan masuk.
>
> Aktifkan di setiap HP: Rumah → Notifikasi.
>
> Di iPhone, tambahkan Miamus ke Layar Utama dulu (Bagikan → Tambahkan ke
> Layar Utama) dan buka dari sana. Lalu ketuk Kirim tes untuk mencoba.

**Order note.** The task listed "inviting a co-owner" second. It moves to
sixth here because a new owner's first week is pets → chores → staff phones
→ Kitchen; most households have one owner at first, and the co-owner who is
invited reads the guide themselves. Decision G4.

### The welcome card and the empty-state link

> **EN** — **New to Miamus?** Seven short answers, about two minutes. You
> can find them any time in Household.
> [ How Miamus works ] · Not now

> **ID** — **Baru pakai Miamus?** Tujuh jawaban singkat, sekitar dua
> menit. Bisa dibuka kapan saja di Rumah.
> [ Cara pakai Miamus ] · Nanti saja

Empty-state link (household with nothing in it yet): **How Miamus works →**
/ **Cara pakai Miamus →**.

### Words for the glossary (same PR as the build)

| English | Bahasa Indonesia |
| --- | --- |
| How Miamus works (the guide) | **Cara pakai Miamus** |
| New to Miamus? | **Baru pakai Miamus?** |
| Not now | **Nanti saja** |
| Still stuck? Email … | **Masih bingung? Kirim email ke …** |
| Go to … / Open … (guide buttons) | **Buka …** |

## What it replaces, and why it earns its place

It replaces the four pieces of the Phase 153 plan with two smaller ones:

| Phase 153 plan | Now |
| --- | --- |
| A five-line "Getting started" checklist on Today that ticks itself | **Dropped.** The existing empty state already says "add a pet or a chore", and card 1 says the rest. A checklist is a second, permanent card on Today and logic to keep five ticks right. |
| A one-card welcome for co-owners | **Folded into** the welcome card, which serves new owners and co-owners alike. |
| A Guide page with a screenshot per answer | **Seven text cards with a "Go to …" button instead of screenshots.** The button shows the real screen, which is better than a picture of it; screenshots would need two languages and go stale with every phase (Kitchen, then Rooms…). |
| A picture guide for staff, sent on WhatsApp | **Not in this step** (decision G5). The house-code WhatsApp message already tells staff how to sign back in. |

It earns its place because today the app has **no help at all**: the only
answer to "how do I link Sari's phone?" is the owner explaining it on
WhatsApp. Phase 155 already removed the Staff page's three-step box once the
first person is added, on the promise that "the guide explains it" — this is
that guide. It adds one row to Household and, for 30 days, one dismissable
card; nothing on any other screen.

**The mother test.** Each card is one question she would ask, answered in
her words, with one button. She never has to find it: the card on Today
points to it once, and someone helping her can say "Rumah → Cara pakai
Miamus".

## Privacy

No new data is collected and nothing new is sent anywhere. The welcome
card's "dismissed" flag lives on the phone; one line goes into the privacy
policy's "Kept only on your phone" list, both languages ("which tips you've
closed on this phone"), and `policyVersion` moves with a dated comment in
`legal.ts`. The join date is already stored and shown on the Family page.

## Code (for reviewers, once approved)

- `src/components/guide/` — `guide-page.tsx` (the list), `guide-card-sheet.tsx`,
  `guide-cards.ts` (the seven cards' text in both languages and each button's
  destination — one file, so wording changes are one diff), and
  `welcome-card.tsx`.
- `staff-tab.tsx`: a `guide` page in `HOUSEHOLD_PAGES` and the fifth group.
- `agenda-tab.tsx`: the welcome card and the empty-state link.
- `staff-onboarding-banner.tsx`: wait while the welcome card is showing.
- Shared pieces only: `SettingsRow`/`SettingsGroup`, the existing bottom
  sheet, `Button`, `EmptyState`. Text through `useT()`.
- Tests: a unit test that every card has both languages and a valid
  destination; a browser test: new owner sees the welcome card, opens the
  guide, opens a card, its button lands on the right tab, and the card does
  not come back — in both languages.
- Checks before review: `npx tsc --noEmit`, `npm run lint`, `npm test`,
  `npm run build`, `npm run test:e2e`; screenshots at phone size in both
  languages; `@codex review` until clean.

## Backups (the owner's half of step 0)

Not part of this PR and nothing Claude can switch on; listed so step 0 is
complete.

- **Database:** check the production Supabase project's plan (Dashboard →
  Database → Backups). On the Pro plan daily backups are on and kept for 7
  days; on the Free plan there are none to restore — then upgrade, or add a
  nightly `supabase db dump` (for example a scheduled GitHub Action writing
  to private storage).
- **Photos are not in database backups** (Supabase Storage is backed up
  separately, or not at all). Chore photos go after 30 days anyway; pet
  photos and health records are the ones worth a periodic copy.
- **Try one restore** into the staging project once, so we know it works
  before it is needed.

## Decisions for the owner

| # | Question | Recommended |
| --- | --- | --- |
| G1 | Where the guide lives: a "How Miamus works" row in Household (not a header "?" button, not a tab) | Yes |
| G2 | A once-only welcome card on Today for owners who joined in the last 30 days, dismissed for good on this phone; none on an empty household (the empty state gets the link instead) | Yes |
| G3 | Seven text cards, each with one "Go to …" button; no screenshots, no slideshow, no arrow tour | Yes |
| G4 | Card order: first day · chores · staff phone · Kitchen · what staff see · inviting family · notifications | Yes |
| G5 | Drop the Phase 153 checklist; leave the WhatsApp staff picture guide for later | Yes (staff guide later, after the five-reader test) |
| G6 | The wording above, and "Cara pakai Miamus" / "Baru pakai Miamus?" / "Nanti saja" added to the glossary | Yes |
| G7 | The "Add to Home Screen" tip waits until the welcome card is closed (one hint at a time) | Yes |
| B1 | Backups: confirm the Pro plan's daily backups on production and try one restore to staging | Yes, before family and friends join |
