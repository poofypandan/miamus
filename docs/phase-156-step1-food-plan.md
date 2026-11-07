# Phase 156, step 1 — Food at home, by hand

Status: **approved by the owner, 2026-11-07** (S1 A, R1, W1, T1). Built in PR for `claude/phase-156-food`.
Mockups: `docs/mockups/phase-156-food.html` (open in a browser; English and
Indonesian side by side, staff screens in Indonesian).

Parent plan: `docs/phase-156-plan.md`, sections 0, 3 and 7. No AI in this
step: Kakak (photo reading, expiry estimates) comes later, on top of this.

## What changes for people

| Where | Before | After |
| --- | --- | --- |
| Owner tab bar | Shopping / Belanja | **Kitchen / Dapur** (still five tabs) |
| Kitchen tab | the shopping list | pill switch **Food · To buy** (Indonesian: **Makanan · Belanja**); opens on Food; To buy is today's list, unchanged |
| Staff header | Tugas Hari Ini · Belanja | **Tugas Hari Ini · Dapur**, and Dapur has the same **Makanan · Belanja** pill (decision S1) |
| Today (owners) | "2 things to buy" line | plus one quiet line, only when there is any: **"3 foods to eat soon"** / **"3 makanan perlu segera dimakan"** |

Old links keep working: `?module=inventory` still opens the Kitchen tab, and
`/staff?view=stok` opens Dapur. Both open on Food / Makanan; the pill reads
its value from the URL (`?kitchen=buy` for To buy / Belanja, none for Food),
per the State Persistence rule. The Today shopping line goes straight to
`?kitchen=buy`.

## The screens (mockups 1–6)

1. **Food list.** One primary button, **Add food**. Then, only when there
   are any: *Containers to return* (tick = returned). Then the food in three
   groups, each shown only when it has something: **Eat today** (past its
   date, today), **This week** (tomorrow to 7 days), **Later** (8+ days, then
   no date). Each row: photo or a plain food icon, name, where it is, from
   whom, days left. Past its date: red, "2 days past date — check first".
   Nothing else is red.
2. **Add food** (bottom sheet). Required: the name. Where it's kept: four big
   choices — Fridge / Kulkas, Freezer, Cupboard / Lemari, Counter / Meja —
   Fridge preselected. Expires: one tap — Today, Tomorrow, 3 days, 1 week,
   Pick a date, No date. Photo: optional (camera or gallery). One tap away:
   **From whom**, and once that is filled in, **the container goes back to
   them**; notes.
3. **Tap a food.** Photo, the facts, who added it and when, then one
   question — *Is it finished?* — with three big answers: **Eaten · Given
   away · Thrown away** (**Dimakan · Diberikan · Dibuang**). Undo for a few
   seconds afterwards. **Edit** is a quiet link. **Delete — added by
   mistake** is owners only.
4. **Today line**, as above. Counts food past its date or expiring today or
   tomorrow. Tapping it opens Kitchen → Food.
5. **Empty list:** what the list is for, in one sentence.
6. **Staff phone:** the same list and sheets in Indonesian. Staff can add,
   edit and finish food; they cannot delete it.

Not in this step: the morning notification (F4) and photo reading (Kakak),
both later; adding food while offline (it says "couldn't save, try again",
like other forms that aren't queued).

## The database — migration 123

`supabase/migrations/123_food_at_home.sql`, additive only.

**Table `food_items`**

| Column | |
| --- | --- |
| `id`, `household_id` | household FK, cascade on household delete |
| `name` | 1–80 characters |
| `photo_url` | nullable; household-logs bucket, `<household>/food/…` |
| `kept_in` | `fridge`, `freezer`, `pantry`, `counter` |
| `expires_on` | `date`, nullable (no date) |
| `from_whom` | nullable, up to 60 characters |
| `return_container` | boolean; `container_returned_at` timestamptz, nullable |
| `notes` | nullable, up to 200 characters |
| `added_by` | `staff_profiles` FK, nullable, `on delete set null` (self-declared, like every `staff_id`) |
| `created_by` | `auth.uid()` of the session that added it |
| `outcome` | nullable: `eaten`, `given_away`, `thrown_away`; `finished_at` stamped by the server; `finished_by` staff FK, nullable |

**Who may do what (RLS)**

- Read, add, edit, finish, mark the container returned: any session of the
  household, owners and staff phones (`get_user_household_ids()`). Staff
  phones can't move an item to another household (guard trigger, like 099).
- Delete: admins only, through `caller_admin_household()` — never
  `get_user_household_ids()` alone (AGENTS.md).
- 119's rule: nothing new recorded in a removed staff member's name
  (`added_by`, `finished_by`).
- No new `SECURITY DEFINER` function callable by clients. Every function the
  migration creates or replaces revokes `EXECUTE` from `public, anon` and
  grants only what is needed, in the same file.

**Photos and how long things are kept**

- A food photo is kept **while the food is on the list**. Finishing it
  (eaten, given away, thrown away) or deleting it removes the photo straight
  away through the Storage API.
- Safety net: the nightly photo clean-up (migrations/101–102) is extended so
  it also removes any food photo whose food was finished more than a day ago,
  in case the phone lost signal mid-delete. Same Edge Function, same secret;
  only its two SQL functions change (`create or replace`, re-revoked and
  re-granted to `service_role` only).
- Finished food stays in the database **90 days** without its photo (so
  later we can show what was eaten, given away and wasted), then a nightly
  job deletes it (decision R1).

**Tests**: `supabase/tests/123_food_at_home.sql`, the 122 style (one
transaction, rolled back): owner and staff phone add, edit and finish; staff
phone cannot delete or move an item to another household; other households
see nothing; logged-out callers get nothing; removed staff refused; server
stamps `finished_at`; the photo clean-up picks finished food photos and leaves
listed ones; finished rows older than 90 days are removed and younger ones
kept; every new function's grants checked.

Applied: local first (standing OK); staging with the owner's OK; production
only with the owner's OK, before the merge (merging deploys to production).

## Privacy policy and `legal.ts` (same PR)

Both languages, `src/components/legal/privacy-policy.tsx`:

- New kind of data: food the household lists — name, optional photo, where
  it is kept, the expiry date, who gave it (a name typed by the household),
  notes, and what happened to it.
- Photos: kept while the food is listed, deleted when it is finished or
  deleted.
- Finished food: kept 90 days, then deleted.
- No new outside service in this step (Supabase only, same region).

`src/config/legal.ts`: `policyVersion` → `2026-11-xx.1` with a dated
comment; `effectiveDate` updated.

## Code (for reviewers)

- `src/components/kitchen/` — `kitchen-tab.tsx` (pill + the two views),
  `food-list.tsx`, `food-sheet.tsx` (add/edit), `food-detail-sheet.tsx`;
  `src/lib/food.ts` (grouping by Jakarta date, labels in both languages, pure
  and unit-tested).
- Shopping components move under Kitchen unchanged.
- `HouseholdProvider`: `foodItems` fetched with the rest, silent background
  refresh, add/update/finish actions with optimistic updates and undo.
- Photo upload through the existing compression (`lib/image.ts`) and
  `lib/photos.ts` paths.
- `bottom-tab-bar.tsx`: Kitchen / Dapur label and icon; `agenda-tab.tsx`:
  the food line; `staff/page.tsx`: Dapur.
- Shared pieces only: `SegmentedControl`, the existing bottom sheet, rows,
  rounded groups, `EmptyState`, the toast with Undo.

## Checks before asking for review

`npx tsc --noEmit`, `npm run lint`, `npm test` (new unit tests for
`lib/food.ts`), `npm run build`, `npm run test:e2e` (a new browser test:
add, finish, undo, in both languages), the SQL tests on local Supabase.
Then `@codex review` until clean, staging with the owner's OK, screenshots
at phone size in both languages.

## Decisions for the owner

| # | Question | Recommended |
| --- | --- | --- |
| S1 | Staff header: **A** "Tugas Hari Ini · Dapur" with Makanan · Belanja inside (same shape as owners), or **B** three pills "Tugas · Makanan · Belanja" | A |
| R1 | Keep finished food 90 days (no photo) for a later "what got wasted" view, then delete | Yes |
| W1 | Wording: Dapur, Makanan · Belanja, Dimakan · Diberikan · Dibuang, Kulkas / Freezer / Lemari / Meja, "Kedaluwarsa", "Kembalikan wadah ke …" — added to the glossary | Yes |
| T1 | Today line counts food past its date, today or tomorrow | Yes |

## Added after review (owner, 2026-11-07)

Staff receive most food at the door, and leftovers count too:

- **Makanan masuk** is first in the staff's **+ Lapor** sheet: the same
  add-food form, one tap from any screen.
- **A photo is enough:** the name may stay empty when there is a photo
  (shown as "Food" / "Makanan").
- **"Tidak tahu" / "Don't know"** for the expiry. The food sits on top with
  an amber **"Cek tanggalnya" / "Check the date"**, and owners get one amber
  line on Today ("1 food needs a date") until someone sets one.
- **Owners are told:** when a staff phone logs food, the admins get a push
  in their own language — "Sari: Lapis legit dari Tante Rina, di kulkas,
  kedaluwarsa besok." Composed in the database (like the sick-pet alert),
  never by the phone. Owners' own entries send nothing.
- **Who logged it:** "Dicatat Sari" / "Logged by Sari" on its own line in
  the owner's list.
- **Where it came from:** Cooked at home (leftovers) · From someone ·
  Bought. "From someone" opens who gave it and the container tick.
- **Shopping, not "To buy":** the second pill is the shopping list with the
  home's supplies under it ("Supplies at home" / "Stok di rumah": soap, pee
  pads, dog food — the old Inventory). Indonesian stays "Belanja".

Codex review (PR #10): the photo clean-up now also spares food-folder photos
that a pet, a medical record, inventory or an unfinished chore still uses;
a finished food's photo is removed only when its Undo toast closes.
