# Phase 153 review — calmer, homier, cleaner before sharing

Status: **for the owner to decide.** Written 2026-11-07 after walking through
every owner and staff screen in both languages (mock data, phone size).
Nothing here is built yet except section 1.

The goal the owner set: minimalist, uncluttered, straight to the point, feels
premium and like home, in English and Bahasa Indonesia, and easy for someone
who is not comfortable with apps.

## 1. Done on this branch (not committed yet)

- **Access → Staff:** lists staff only. Admins (Google) are no longer listed
  a second time; they have their own section above. Section renamed from
  "People & PINs" to "Staff".
- **Chores → progress cards:** an admin appears only on a day they have
  chores (or overdue ones). Staff always appear.
- **Workload:** people who were removed no longer appear, and admins appear
  only when they finished something in that period.

## 2. Clean-up on production (needs the owner's OK)

What a read-only look found (counts only; no personal details read):

| What | Count | Proposal |
| --- | --- | --- |
| Households made by mistake ("Syam" ×4, "Ari" ×1), no pets, chores, staff or phones | 5 | Delete |
| Google sign-ins outside Banyuwangi 11 (the two that made those households) | 2 | Delete; staff sign in with a PIN, not Google |
| Phone sign-ins linked to no household | 4 | Delete |
| Phones linked to Banyuwangi 11, for 2 staff | 11 | See below |

The 11 phones: until today the app never updated a phone's "last seen", so the
dates cannot say which two are really in use. Two options:

- **A (recommended): unlink all 11 now.** Each staff member signs back in once
  with the house code ("Saya staf" → code → name → PIN, about a minute). This
  also tests the new house code on the real household. Owners are not
  affected (they sign in with Google).
- **B: wait a week.** Add "last seen" tracking (one small migration), then
  remove the phones nobody used.

## 3. The big ideas

1. **One thing, one place.** The low-stock banner sits on top of every tab,
   and the same item then appears twice more on the Inventory tab. Things
   that need the owner should appear once, where they belong, with a quiet
   count on the tab.
2. **Calm colour.** One screen today uses amber, red, green, purple and
   orange together (screenshot 1, the staff home). Proposal: neutral by
   default; **red only for a sick pet or something late**, amber only for
   "waiting for you"; primary buttons black (not green). Apple's guidance is
   the same idea: the interface defers to the content and colour supports
   hierarchy rather than competing with it.
3. **Fewer words on screen.** Instruction boxes ("1. Add each person, 2.
   Invite their phone, 3. …") help once and then become clutter. Show them
   only until the household is set up; move the explanations into the Guide.
4. **Settings that look like Settings.** Access is one long page with ten
   sections. Proposal: a short grouped list, Apple Settings style —
   **People** (admins, staff, leave), **Invite someone**, **Staff sign-in**
   (house code, linked phones), **Notifications**, **Language**, **App lock**,
   **Activity** — each opening its own page.
5. **Words that sound like home**, in both languages (section 5).

## 4. Inventory → a simple "Shopping" list

### What is wrong today (screenshots 2 and 3)

- **Two systems for one question.** Staff "report low stock" as free text
  ("Mochi's Food — tinggal sedikit"), and separately there is a counted
  inventory ("Royal Canin Mini Adult 1.5 kg, min 2 kg"). The same dog food
  shows up as a banner, an alert and an amber item card.
- **Counting is a chore.** Staff are asked to weigh and count each item
  ("Jumlah di rak (kg)"), photograph the shelf and save, on a schedule. Apps
  like this are mostly abandoned because keeping counts current is work; the
  lasting pattern is a shopping list where buying closes the loop.
- **Two toggles stacked** (Active alerts | Restocked, then Pets | Home), and an
  English owner sees the staff's Indonesian note mixed into English text.

### Proposal

- **One list, three states per item:** *Enough* · *Running low* · *Out*
  (*Ada* · *Hampir habis* · *Habis*). No numbers or thresholds by default.
- **Staff:** one tap on an item → *Hampir habis*. Something not on the list?
  "+ Lainnya" with an optional photo. The scheduled count-and-photo goes away.
- **Owner:** the tab opens on **To buy** (everything running low or out),
  with a tick per item. Ticking = bought, the item goes back to *Enough*.
  "Send to WhatsApp" / "Copy list" for whoever does the shopping.
- **Tab name:** "Shopping" / "Belanja". The count of things to buy shows on
  the tab instead of a banner on every screen; Today gets one quiet line
  ("3 things to buy").
- **Kept:** existing items and categories (Pets / Home). Quantities stay in
  the database but are hidden; an item can opt back into a number later if
  ever needed.
- Needs a migration (item state instead of free-text alerts) and a privacy
  policy check (no new personal data expected).

## 5. Words

The header link and staff labels first, then the rest.

| Today (EN / ID) | Proposed EN | Proposed ID |
| --- | --- | --- |
| Action Mode → / Mode Kerja → | Two-part switch in the header: **Overview \| Staff view** | **Ringkasan \| Tampilan staf** |
| ← Manage / ← Kelola (on the staff screen) | (same switch) | (same switch) |
| Approval Queue / Menunggu Persetujuan | Waiting for you | Menunggu Anda |
| Today's Agenda / Agenda Hari Ini | Today | Hari ini |
| Overdue · Still not done from an earlier day | From earlier | Belum selesai dari kemarin |
| Workload / Beban Kerja | Who did what | Siapa mengerjakan apa |
| Unclaimed / Belum diambil | Not taken yet | Belum ada yang ambil |
| Ketuk untuk ambil (staff) | — | Saya kerjakan |
| Audit Log / Log Aktivitas | Activity | Aktivitas |
| Invite Admin / Undang Admin | Invite family | Undang keluarga |
| Invite Device / Undang Perangkat | Link a staff phone | Hubungkan HP staf |
| Push notifications | Notifications | Notifikasi |
| Require authentication to open app | Lock with Face ID | Kunci dengan Face ID |
| Mark Resolved / Restocked | Bought | Sudah dibeli |
| Health Passport (EN) | Health record | (already Catatan kesehatan) |
| Founder (EN) | Owner | (already Pemilik) |
| Hospitalized / Dirawat inap | At the vet | Dirawat inap (keep) |
| Bring Home from Clinic / Jemput dari Klinik | Picked up from the vet | Sudah dijemput dari klinik |
| Proposed routine / Usulan rutinitas | Suggested routine | Usulan rutinitas (keep) |
| Admin must be present / Tunggu Admin | Wait for an owner | Tunggu pemilik rumah |
| Tabs: Agenda · Pets · Chores · Inventory · Access | Today · Pets · Chores · Shopping · Household | Hari ini · Hewan · Tugas · Belanja · Rumah |

Glossary changes (owner decides, then `docs/indonesian-glossary.md` first):
"Admin" stays the role word; "pemilik rumah" is used where staff wait for
someone. Never "majikan" or "pembantu".

## 6. Smaller things seen

- "Anytime" shows in a typewriter (monospace) font on the Agenda.
- The banner's English-plus-Indonesian sentence ("Low Stock: Mochi's Food —
  Tinggal sedikit").
- React's development mode warns about hook order on Access (`src/lib/resource.ts`);
  development only, but worth fixing in the same pass.
- Staff home: the purple "rawat inap" card, red late section and red pills
  compete; with the colour rule above it becomes one red section.

## 7. Before family and friends

1. Production clean-up (section 2).
2. Words, the header switch, calm colour, the banner gone (sections 3, 5, 6).
3. Shopping list (section 4).
4. Access as a Settings list (section 3.4).
5. **Then** the guide (`docs/phase-153-plan.md`), so it uses the final words
   and screens.
6. Backups on, and ten minutes watching one non-technical person use it.

## Decisions for the owner

| # | Question | Recommended |
| --- | --- | --- |
| R1 | Production clean-up, and the 11 phones: A or B | Delete the extras; A |
| R2 | Calm colour rule (neutral; red = sick or late; amber = waiting for you) | Yes |
| R3 | Inventory becomes a Shopping list (section 4) | Yes |
| R4 | Header switch "Overview \| Staff view" / "Ringkasan \| Tampilan staf" | Yes |
| R5 | The words in section 5 | Yes, all |
| R6 | Access as a Settings-style list | Yes |
| R7 | Order of work as in section 7 | Yes |
