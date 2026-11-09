# Phase 162 — "Who lives here?" at sign-up

Status: **approved by the owner, 2026-11-09: recommended options for D1–D7.**
Nothing built yet; the build starts after PR #41 merges (see "One PR, after #41").
D7 keeps today's landing line; if the landing page proposal (PR #43) is
adopted, its wording replaces it.
Roadmap item 12 (`docs/roadmap-2026-11-09.md`, P2). Mockup:
`docs/mockups/phase-162-who-lives-here.html` (open in a browser, phone width).

## The problem

Miamus opens pet-first. A new household sees a **Pets** tab, a Today screen
that says "Let's start by adding a pet or a chore" with **Add Pet** first,
All · Pets · Chores pills, and an onboarding line that promises "your pets,
chores and the people who share the house". A household with no pets is told
over and over about something it doesn't have, and staff phones offer pet
notes ("Catat Ekstra": Pipis Ekstra, Muntah / Sakit) with an empty pet list.

The roadmap's tab table already plans for this: Pets grows into **Care: Pets ·
Kids · Elders, shown only for who lives there**. This phase does the first
part: ask whether there are pets, and hide what doesn't apply.

## What's there today (read 2026-11-09)

- **Sign-up** (`src/app/(auth)/onboarding/page.tsx`): language → request
  access → wait for approval → one form, **Name your household**, which calls
  `create_household(p_name)` (migrations/113, `security definer`, revoked from
  `public, anon`, granted to `authenticated, service_role`). The household row
  is `households (id, name, owner_auth_id, created_at, legacy_binding_until)`.
- **Owners can't update `households` directly**: there's a select policy only
  (`households_select_own`, which includes staff phones through
  `get_user_household_ids()`), and 113 revoked insert. So a new setting needs
  its own function.
- **The tab bar is already ready for this.** `src/lib/dashboard-modules.ts`
  has `OPTIONAL_MODULES = ["pets"]` and a hard-coded
  `DEFAULT_MODULE_FLAGS = { pets: true }`, "until there is a household setting
  to read them from". `enabledModules()` drives the bar, and
  `moduleFromParam()` already sends a switched-off `?module=pets` back to
  Today.
- **Pets on Today** (`agenda-tab.tsx`): the brand-new greeting with **Add
  Pet**; the All · Pets · Chores pills; the empty-day lines ("add a pet to
  plan their daily routines"); the medicine-course alerts (render nothing
  without pets); the week view's routine matrix (empty without pets).
- **Staff** (`src/app/staff/page.tsx`, `components/staff/*`): pet routines in
  the day's list (none without pets); "Usulkan jadwal"
  (`staff-routine-picker.tsx`) already hides when there are no pets; **Catat
  Ekstra** (`adhoc-sheet.tsx`) is pet-only but always shown; the shopping
  request **"Ada barang lain yang perlu dibeli"** (`low-stock-flag.tsx`) has
  an optional **Hewan (opsional)** field.
- **Kitchen → Shopping → supplies**: a "Pet" shelf (Dog Food, Dog Supplies,
  Medicine) and an empty state that suggests "dog food, pee pads".
- **Kakak** (`src/lib/kakak/*`): the household block lists pets, and the tool
  list always includes `add_pet_routine`.

## The idea in one line

One question on the sign-up form, **"Who lives here?"** with a **Pets** chip
(more chips later), saved on the household; with pets off, the Pets tab and
every pet line disappear for owners, staff and Kakak, and it can be switched
back on any time in **Household → Who lives here**.

## What changes for people

| Where | Pets on (as today) | Pets off |
| --- | --- | --- |
| Sign-up form | — | under the household name: **Who lives here?** · chip **Pets** (D1, D2) |
| Tab bar | Today · Pets · Chores · Kitchen · Household | **Today · Chores · Kitchen · Household** (four tabs) |
| Today, brand-new household | "Let's start by adding a pet or a chore" · Add Pet · Add Chore | "Let's start by adding a chore" · Add Chore |
| Today, day view | All · Pets · Chores pills | no pills (there's only one kind) |
| Today, empty day | "…or add a pet to plan their daily routines" + Add Pet | "No chores on this day." + Add Chore |
| Kitchen → supplies | Pet shelf, "dog food, pee pads" example | no Pet shelf in the picker; example "rice, gallon water, cleaning supplies" |
| Household tab | new row **Who lives here** · "Pets" | same row · "Just people" |
| Staff phone | as today | no **Catat Ekstra**, no **Hewan (opsional)** field when asking for something to buy (D5) |
| Kakak | as today | no pet routines offered; asked for one, says pets are off and where to switch them on (D6) |

Still five tabs for a household with pets; four without. Manual-first: nothing
here needs AI.

## The screens (mockup)

1. **Sign-up, one step still.** The household-name form gains one row under
   the name: **Who lives here?** / **Siapa yang tinggal di sini?**, a small
   line "Miamus shows only what fits your home. Change it any time under
   Household.", and chips. Now: **🐾 Pets** (on/off). Later, greyed with
   "Soon": **Kids**, **Elders** (D1: shown greyed, or not shown at all).
   Nothing is pre-selected (D2): an untouched chip means no pets. The
   "then you can add your pets, chores…" line becomes "then you can add your
   chores, staff and family".
2. **Today without pets.** Four tabs; the greeting's only button is **Add
   Chore**; no pills.
3. **Household → Who lives here.** A sheet with a switch per kind ("Pets:
   routines, meals, medicine, vet visits, photos"). Turning pets **on** shows
   the tab at once. Turning **off** while there are pets: D4.
4. **Existing household without any pet** (D3): a small card on Today, once:
   "Any pets at home? Miamus can hide the Pets tab if not." · **We have pets**
   · **No pets**.

## Where the answer is stored — migration 132

Next free number is **132** (checked `supabase/migrations` and the open PRs:
#41 has no migration; #11 and #13 are docs only).

Additive. `households` gains:

| Column | |
| --- | --- |
| `has_pets` | `boolean`, **nullable**. `true` / `false` = answered; `null` = not answered yet, which the app treats as **on** (today's behaviour) |
| `has_pets_set_at` | `timestamptz`, nullable, when it was last answered |
| `has_pets_set_by` | `uuid` → `auth.users(id) on delete set null`, nullable |

Why columns on `households`, not a new table: one row per household already
exists, staff phones can already read it (they need the answer to hide
Catat Ekstra without a new policy), and Kids and Elders later are one more
pair of columns each. A `text[]` of "who lives here" was considered: fewer
columns, but every check and every reader has to parse an array for what is
really two or three yes/no answers.

- **Backfill, in the migration:** `has_pets = true` for every household with
  at least one pet row in `task_entities` (archived ones included: they had
  pets, and their history is under the Pets tab). Every other household stays
  `null` and gets the one-time card on Today (D3). No household loses its
  Pets tab on deploy.
- **`create_household(p_name text, p_has_pets boolean default null)`**:
  dropped and re-created with the extra argument (a `create or replace` with a
  new argument would leave two overloads). Still `security definer`,
  `search_path = ''`; `revoke all … from public, anon;` then
  `grant execute … to authenticated, service_role;` in the same migration
  (AGENTS.md). Old app builds call it with `p_name` only and get `null`, so
  the migration can go first. When given, `has_pets_set_at = now()` and
  `has_pets_set_by = auth.uid()`.
- **`set_household_has_pets(p_household uuid, p_on boolean)`**:
  `security definer`, `search_path = ''`, owners only through a
  `household_members` check for `auth.uid()` and that household (never
  `get_user_household_ids()`, which staff phones pass). `p_on` must not be
  null. With D4 A, `p_on = false` is refused with `has_live_pets` while the
  household has a pet that isn't archived. Writes the three columns. Revoked
  from `public, anon`, granted to `authenticated`.
- **No direct update grant** on `households`; the function is the only
  door, as with Kakak's switch.
- Tests: `supabase/tests/132_has_pets.sql` (rolled back): backfill (pets →
  true, none → null); `create_household` with and without the flag; the old
  one-argument call still works; the setter refuses staff phones, other
  households' owners and logged-out callers; turning off with a live pet is
  refused, with only archived pets allowed; grants checked (`anon` can
  execute neither).
- Applied: local first, then staging, then production with the owner's OK,
  before the PR merges (`main` deploys to production).

## How the app reads it

- A small hook, **`useHouseholdProfile()`**, built like `useHouseholdName()`:
  one read of the household row per page session, cached on the device so
  the tab bar doesn't flash five tabs then four on a cold start, updated in
  place after the switch (a soft sync, no reload). It lives outside
  `household-context.tsx`, which PR #41 changes.
- `petsOn = has_pets !== false` (null counts as on).
- `enabledModules({ pets: petsOn })` and `moduleFromParam(…, { pets: petsOn })`
  replace the hard-coded `DEFAULT_MODULE_FLAGS` in the bar, the dashboard page
  and the top nav.
- Owner screens read `petsOn`. Staff screens read **"are there live pets"**
  (`pets.length > 0`, already loaded) instead of the flag: with pets off there
  are no live pets (D4 A), and a household that has pets but never answered
  keeps everything. That's how `staff-routine-picker.tsx` already works.
- Kakak's context (`src/lib/kakak/context.ts`) gets `petsOn`; when false,
  `add_pet_routine` is left out of the tool list and the household block says
  "Pets: off (Household → Who lives here)". The prompt gains one line:
  if asked for a pet routine with pets off, say so and where to switch it on.

## What hides when pets are off

Owner side:

- The **Pets** tab (and `?module=pets` lands on Today, already built).
- Today: **Add Pet** in the greeting and the empty-day line; the **All · Pets ·
  Chores** pills; the week view's routine matrix heading.
- Kitchen → supplies: the **Pet** shelf in the category picker (existing
  items on it stay visible, unlikely without pets); the empty-state example.
- Activity: nothing to hide (pet rows only appear if there were pets).

Staff side (no pets in the household):

- **Catat Ekstra** button (pet notes only).
- The **Hewan (opsional)** field in "Ada barang lain yang perlu dibeli".
- The Lapor sheet's top line drops the pet actions: "Catat makanan masuk,
  lapor kerusakan, atau laporkan stok." (today it also says "usulkan jadwal,
  atau catat kegiatan ekstra").
- Already hidden today: **Usulkan jadwal**, pet routines, "sedang dirawat di
  klinik".

Not changed: the public landing page ("Your pets, the chores, the kitchen…")
is read before anyone signs up; it stays (D7).

## Changing it later (Household tab)

A new row in the Household settings list, after **Rooms**: **Who lives here**
/ **Siapa yang tinggal di sini**, detail "Pets" / "Hewan" or "Just people" /
"Hanya orang". It opens a sheet:

- **Pets** switch, with the line "Routines, meals, medicine, vet visits and
  photos." / "Rutinitas, makan, obat, dokter hewan dan foto."
- Turning **on**: saved, the tab appears, toast "Pets tab is back" / "Tab
  Hewan muncul lagi".
- Turning **off** with live pets (D4 A): the switch stays on and says "You
  have 2 pets in Miamus. Archive them in Pets first; their history stays." /
  "Ada 2 hewan di Miamus. Arsipkan dulu di tab Hewan; riwayatnya tetap
  tersimpan."
- Later: **Kids** and **Elders** switches join this sheet when Care exists.

## Owner text (EN / ID)

| Where | English | Bahasa Indonesia |
| --- | --- | --- |
| Sign-up, heading | Who lives here? | Siapa yang tinggal di sini? |
| Sign-up, line | Miamus shows only what fits your home. Change it any time under Household. | Miamus hanya menampilkan yang sesuai dengan rumah Anda. Bisa diubah kapan saja di tab Rumah. |
| Chip | Pets | Hewan |
| Chips later (D1) | Kids · Elders · Soon | Anak · Lansia · Segera |
| Sign-up intro (changed) | Let's set up your household. It takes one step — then you can add your chores, staff and family. | Mari siapkan rumah Anda. Cukup satu langkah — lalu Anda bisa menambahkan tugas, staf dan keluarga. |
| Today greeting, pets off | Let's start by adding a chore. Everything you add shows up here, day by day, for everyone in the house. | Mari mulai dengan menambahkan tugas. Semua yang Anda tambahkan muncul di sini, hari demi hari, untuk semua orang di rumah. |
| Today card (D3) | Any pets at home? Miamus can hide the Pets tab if not. | Ada hewan di rumah? Kalau tidak, Miamus bisa menyembunyikan tab Hewan. |
| Today card buttons | We have pets · No pets | Ada hewan · Tidak ada |
| Household row | Who lives here | Siapa yang tinggal di sini |
| Row detail | Pets · Just people | Hewan · Hanya orang |
| Switch line | Routines, meals, medicine, vet visits and photos. | Rutinitas, makan, obat, dokter hewan dan foto. |
| Can't turn off | You have {n} pets in Miamus. Archive them in Pets first; their history stays. | Ada {n} hewan di Miamus. Arsipkan dulu di tab Hewan; riwayatnya tetap tersimpan. |
| Toasts | Pets tab is back · Pets tab hidden · Couldn't save. Try again. | Tab Hewan muncul lagi · Tab Hewan disembunyikan · Gagal menyimpan. Coba lagi. |
| Supplies example, pets off | Add the things your home keeps — rice, gallon water, cleaning supplies — and your staff can say when they run low. | Tambahkan barang yang selalu ada di rumah — beras, galon, sabun — supaya staf bisa memberi tahu kalau hampir habis. |

Wording follows `docs/indonesian-glossary.md`: **Hewan** for pets (never
"anjing" in general), **Rumah** for the Household tab, **Anda**, **tugas**.

## Glossary rows to add (before any Indonesian text)

| English | Bahasa Indonesia |
| --- | --- |
| Who lives here? | **Siapa yang tinggal di sini?** |
| Just people (no pets) | **Hanya orang** |
| Kids · Elders (later, Care tab) | **Anak · Lansia** ("Lansia" is the everyday word; "orang tua" also means parents) |
| Soon (a greyed choice) | **Segera** |

## Staff text (Bahasa Indonesia only)

Nothing new appears on staff phones; things only disappear when there are no
pets. So **no staff tutorial card** (D5). One existing sentence gets a
shorter version for households with no pets, the Lapor sheet's description:

| Pets | Text |
| --- | --- |
| yes (unchanged) | Catat makanan masuk, lapor kerusakan, laporkan stok, usulkan jadwal, atau catat kegiatan ekstra. |
| none | Catat makanan masuk, lapor kerusakan, atau laporkan stok. |

## Tutorial (What's new)

- **Owners, existing households:** one What's new entry, "New: hide Pets if
  you don't have any" / "Baru: sembunyikan Hewan kalau tidak ada", steps:
  "Household → Who lives here: switch Pets off and the Pets tab and pet lines
  disappear." / "Rumah → Siapa yang tinggal di sini: matikan Hewan, tab Hewan
  dan semua baris hewan hilang." Households with pets lose nothing, so the
  card is short. (`src/lib/whats-new.ts` is in PR #41; the entry is added
  after #41 merges.)
- **New households** answer at sign-up; the line under the chips is the
  tutorial.
- **Staff:** none (above).

## Privacy policy

**No change, for pets only.** Whether a household has pets is a setting about
the household, not personal data about a person, and it's already implied by
the pet records Miamus stores; no new service, no change in where data lives
or how long (it's deleted with the household, as now). Reviewers please
confirm against AGENTS.md.

**Kids and elders will change it.** Recording that children or elderly people
live in a home is personal data about vulnerable people (UU PDP), so asking
about them waits for the Care phase and goes in with its privacy policy
update (D1).

## One PR, after #41

PR #41 changes `household-context.tsx`, `staff/page.tsx`,
`adhoc-sheet.tsx`, `staff-reports-panel.tsx`, `whats-new.ts` and the privacy
policy. This phase touches three of those (Catat Ekstra, the reports panel,
What's new), so **it's built after #41 merges**, on a fresh branch from
`main`. Size: small–medium.

1. Migration 132 + SQL tests; types (`Household` gains the three fields).
2. `useHouseholdProfile()`; flags into `dashboard-modules.ts` callers.
3. Onboarding chips; `create_household` with `p_has_pets`.
4. Today, Kitchen, staff hides; Household row and sheet; the Today card (D3).
5. Kakak tool list and prompt line.
6. Glossary rows; What's new entry.
7. Unit tests (`enabledModules`, `petsOn`, the Kakak tool list); a Playwright
   test on the stub: sign up with no pets → four tabs → switch Pets on in
   Household → five tabs, no reload.
8. `tsc`, `next build`, CI; Codex until clean; local → staging → production
   migration with the owner's OK; merge with the owner's OK.

## Decisions for the owner

- **D1 — What sign-up asks now.** **A (recommended):** Pets only, with Kids
  and Elders shown greyed as "Soon", so people see where it's going; nothing
  is stored for them. B: Pets only, no greyed chips. C: ask Kids and Elders
  now and store the answers for later (needs a privacy policy update now, for
  data nothing uses yet).
- **D2 — Where and how.** **A (recommended):** on the same form as the
  household name, a chip nothing pre-selects (untouched = no pets); sign-up
  stays one step. B: a second screen after the name, with a clear Yes / No.
- **D3 — Existing households.** **A (recommended):** households with any
  pet are set to "pets" in the migration and see no change; any household
  without a pet sees a one-time card on Today ("Any pets at home?"). B: no
  card: they keep the Pets tab until someone finds the Household switch.
- **D4 — Turning Pets off while pets are still in Miamus.** **A
  (recommended):** not allowed; archive them first (history kept). B:
  allowed: the tab and pet lines hide, routines stop showing to staff, the
  pets stay in the database and come back with the switch.
- **D5 — Staff phones.** **A (recommended):** hide pet-only things when the
  household has no pets (Catat Ekstra, the pet field when asking for something to buy); no
  staff tutorial, since nothing new appears. B: leave staff screens as they
  are.
- **D6 — Kakak.** **A (recommended):** with pets off, Kakak isn't offered
  pet routines and says pets are off if asked. B: no change.
- **D7 — The public landing line** ("Your pets, the chores, the kitchen…").
  **A (recommended):** leave it; pets are a strength for the households that
  have them, and the sign-up question now makes pets optional. B: reword to
  "The chores, the kitchen, your pets and everyone who helps".

## Not in this phase

- Kids and Elders (roadmap item 18, the Care tab), and their privacy policy
  update.
- Renaming the Pets tab to Care.
- Hiding other modules (Kitchen, Repairs): they apply to every home.
- Per-person choices (one owner hiding Pets for themself only).
