# Phase 164 — Bills and upkeep reminders

Status: **decided: owner delegated to the recommendations, 2026-11-10
(D1–D9 all A).** Nothing is built yet: building starts after Phase 163
(My tasks, migration 136) has merged, with reminders first (PR A, migration
**137**, reserved) and payments second (PR B, migration **138**, held).
Roadmap item 11 (`docs/roadmap-2026-11-09.md`, P1): "Bills and upkeep
reminders: electricity, water, internet, iuran RT, PBB, AC service, toren,
gas, pest control. Common misses; mostly repeating chores, plus a quick-add
list. Small." Mockup: `docs/mockups/phase-164-bills-upkeep.html` (open in a
browser, phone width; English left, Bahasa Indonesia right).

Builds on **Phase 163, "My tasks" on Today** (`docs/phase-163-my-tasks-plan.md`,
PR #56, plan merged, decided D1–D5 A, migration 136): a bill given to an owner is one of
their own tasks, and 163 is what lets an owner tick it off on Today without
photos. 163 must be built first.

## The problem

Indonesian homes run on a handful of dates nobody writes down:

- **Postpaid electricity (PLN)** and **water (PDAM)** are paid by about the
  20th; after that comes a late fee, and after a few months a cut-off.
- **Prepaid electricity (token)** runs out at night, when the meter beeps
  and the shop is closed.
- **Internet** bills, **iuran RT/RW** (the neighbourhood dues, often
  collected at the door), **BPJS Kesehatan** by the 10th.
- **PBB**, the yearly land and building tax: the SPPT letter arrives early
  in the year and the deadline (often 31 August, but each region sets its
  own) is easy to forget for eleven months.
- **Vehicle tax (STNK)** once a year, on a date only the car's papers know.
- **Upkeep that only matters when it's late**: AC service every 3 months
  (or the AC starts dripping), cleaning the **toren** (water tank) every 6
  months, **pest control** for termites and cockroaches every 3 months.
- **Gas (LPG)** runs out mid-cooking, and **drinking-water gallons** run out
  on a Sunday.

Today these live in the owner's head, a phone calendar, or the bank app's
"scheduled payment". Miamus already knows how to repeat a chore; it just
doesn't offer these, can't repeat every 3 months or once a year, doesn't
remind anyone, and has nowhere to note what was paid.

## What exists (read 2026-11-10)

- **Repeating chores** (migrations 097, 128): a row with `recurrence`
  `daily`, `weekly` or `monthly` is a template; its own `due_date` is the
  first day and sets the pattern (weekday, or day of the month, clamped to
  the month's end), `recurrence_until` ends it. A day is **materialised**
  (written as its own row with `parent_task_id`) only when someone touches
  it: finishes, claims, skips. `occursOn` (`src/lib/chore-recurrence.ts`)
  and its SQL twin `chore_occurs_on` (migration 128) decide which days a
  repeat falls on; 128's guard lets a staff phone insert a day only if
  `chore_occurs_on` says so. **No "every 3 months", no "every year".**
  Deleting a template deletes its days (`on delete cascade`, 097).
- **Categories** (`src/lib/household-tasks.ts`): cleaning, maintenance
  (shown as **Perbaikan**), errand, groceries. The column has no CHECK; an
  unknown category falls back to the clipboard icon.
- **Who sees a chore:** every session of the household, staff phones
  included, can read every `household_tasks` row (090,
  `get_user_household_ids()`). So nothing private can go in a chore's title
  or notes.
- **Repairs** (130–131): costs and receipts are **owners only**, in their own
  table (`repair_costs`, RLS on `household_members`) and their own private
  bucket **`owner-receipts`**, whose Storage policies check
  `household_members` against the household in the object's path. Receipts
  are kept 2 years after the repair closes. **The nightly sweep
  `repair_receipts_due_for_pruning` deletes any `owner-receipts` file that no
  `repair_costs` row points at, a day after upload**, so a new kind of
  receipt in that bucket has to be added to it, or it disappears overnight.
- **Rooms and job chips** (Phase 158, `src/lib/chore-jobs.ts`): jobs are read
  from a chore's words (Vacuum, Mop, …). Bills have no room; upkeep may
  ("AC service · Master bedroom · AC").
- **Push to owners** (`queue_owner_push`, 114; 132): composed in the database
  in each owner's language. The **07:00 food reminder** (124) is the model
  for a daily reminder: a cron job, one push per owner per morning, the tag
  carries the date. `queue_push(…, user_id, …)` reaches one owner.
  **Caveat:** as of 2026-11-10 production has no push subscriptions at all
  (side-session note `push-notifications-root-cause-2026-11-10.md`); a fix is
  in its own session. So reminders must also show **on Today**, and work
  with push off.
- **My tasks** (163): owners' own chores in a card on Today, finished with
  one tap and, for owners, no photos needed (migration 136). Its mockup
  already shows "Pay the electricity bill" as an owner's task.
- **Kitchen → Shopping → Stok di rumah**: supplies staff mark **running
  low** or **out** with one tap (122); they land on the shopping list.

## The idea in one line

**Bills are owner chores with a date, a reminder and an optional amount;
upkeep is ordinary repeating chores.** One quick-add sheet, **Add bills and
upkeep**, creates them with the right cadence. No new tab, no new module.

## What changes for people

| Who | What's new |
| --- | --- |
| Owners | **Chores → Today → Bills and upkeep**: a short checklist of common ones (Electricity, Water, Internet, Iuran RT/RW, PBB, BPJS, Vehicle tax; AC service, Toren, Pest control). Tick, adjust the day, **Add**. |
| Owners | A new chore category **Bills** (**Tagihan**), with a receipt icon. |
| Owners | Repeats can be **every 2 weeks, every 3 months, every 6 months, every year**, for any chore. |
| Owners | **Remind me**: on the day, 1 day, 3 days or 1 week before. A 07:00 push, and a quiet line on Today ("Coming up: PBB · Mon 31 Aug"). |
| Owners | On a bill, **Mark paid** with an optional amount and a receipt photo, **owners only**. The bill shows "Last paid Rp 412.000 · 18 Oct" and a short history. |
| Owners | **Gas (LPG)** and **drinking water** go to **Stok di rumah**, where staff already say "running low" (D6). |
| Staff | Upkeep given to them (toren, AC with the technician, pest control) appears as normal chores, in Indonesian, with the usual photos. Bills never reach staff phones' lists, and amounts never reach staff phones at all. |

## The screens (mockup)

1. **Add bills and upkeep** (owner sheet, from Chores → Today, and from a
   one-time What's new card). Two groups, **Bills** and **Upkeep**. Each row:
   a line icon, the name, the cadence and day ("Every month · 20th"), a
   checkbox. Ones already added show **Added** and no checkbox. Tap a row's
   text to adjust it in a small inline panel: the day (or date, for yearly),
   **Who** (me by default for bills; anyone in the house for upkeep),
   **Remind me** (preset per item). The button says **Add 4**. At the bottom:
   **Other bill**, which opens the usual chore form with Bills preset.
2. **Today, a bill due** (owner). Above the day: the quiet line **Coming up:
   PBB · Mon 31 Aug** (only inside the reminder window). In **My tasks**
   (163): "Electricity (PLN)", with the receipt icon and "Due today ·
   last Rp 412.000". The 07:00 push reads **Reminder · Due today:
   Electricity (PLN) and Iuran RT/RW. Tomorrow: AC service.**
3. **Mark paid** (owner). Tap the bill's row: the sheet (163's owner sheet,
   worded for bills) shows the bill, the due date and repeat, **Amount
   (optional)** with "Last time Rp 412.000" as the hint, **Receipt
   (optional)** (camera or photo), **Mark paid**, and **Edit bill**. Tapping
   the circle instead marks it paid with no amount, as for any task.
   After: the row turns green, "Paid · Rp 418.500", and a toast **Paid:
   Electricity (PLN) · Undo**.

## How it fits the five tabs

No new tab and no new `<SegmentedControl />`:

- **Chores → Today** gets a second quiet button beside **Add chore**:
  **Bills and upkeep** (D2). Bills and upkeep are chores, so they are made
  and edited where chores are.
- **Today**: bills show where an owner's own tasks show (163's My tasks
  card), plus the **Coming up** quiet line among the existing quiet lines
  (repairs, food, shopping). Upkeep shows in the day's list like any chore.
- **Chores → Rooms**: upkeep with a room appears under that room, as now.
  Bills have no room and appear under **Tanpa ruangan / No room**, which
  already exists; the job chips don't change (bills match no job).
- **Kitchen → Stok di rumah**: gas and gallons, if D6 A.
- **Household**: unchanged.

## Cadence: every 3 months, every year (D1)

Repeats today are daily, weekly or monthly. Bills and upkeep need **every
2 weeks** (gardener, gallon delivery), **every 3 months** (AC, pest
control), **every 6 months** (toren) and **every year** (PBB, vehicle tax).

Recommended: one new column, **`recurrence_interval`** (1–12, default 1),
read with `weekly` and `monthly`: every N weeks, every N months; a year is
12 months. The chore form's **Repeat** list gains Every 2 weeks, Every 3
months, Every 6 months, Every year; nothing else in the form changes.

- The anchor is still the template's `due_date`: a 3-monthly chore filed on
  20 Nov falls on 20 Feb, 20 May, 20 Aug. A yearly one filed on 29 Feb falls
  on 28 Feb in other years (the existing end-of-month clamp).
- `occursOn`, `previousOccurrence`, `nextOccurrence` and
  `startAfterSkippingFirst` learn the interval, with unit tests (month ends,
  leap years, every 2 weeks across a year end).
- `chore_occurs_on` (128) is re-created with the same rule, so staff phones
  can still finish a 3-monthly chore on its day and only then.
- **Old app builds** ignore the column and show such a chore monthly until
  the PWA updates (on next open). A staff phone on an old build that tries to
  finish an in-between month gets 128's refusal. Wrong for a few hours,
  harmless; noted in the release.

## Reminders (D3, D4)

- **Per chore**: a **Remind me** row in the chore form: Off · On the day ·
  1 day before · 3 days before · 1 week before. Any chore can have it; the
  quick-add sheet turns it on for bills (3 days before; PBB and vehicle tax
  1 week before) and for upkeep that needs someone home (AC service, pest
  control: 1 day before).
- **When**: 07:00 Jakarta, the same moment as the food reminder, in a
  separate cron job (`notify_chores_due`). On the reminder day, and again on
  the due day if it isn't done yet. Not after the due day: a missed bill
  then sits in **From earlier** on Today, as missed chores already do.
- **Who** (D4 A): a chore given to an owner reminds **that owner**; a chore
  given to staff or to anyone reminds **every owner** (staff phones get no
  pushes). One push per owner per morning, listing everything due:
  "Due today: Electricity (PLN) and Iuran RT/RW. Tomorrow: AC service." The
  tag carries the date, so a rerun replaces it.
- **Without push**: the **Coming up** quiet line on Today shows the same
  thing for the owner it's for, from the reminder day to the due day:
  "Coming up: PBB · Mon 31 Aug" or, for several, "3 bills coming up". Tapping
  it opens that day on Today. Due today, it's in My tasks instead.
- Composed in the database in each owner's language, like every push.

## Marking paid: amount and receipt (D5)

**Owners only.** Because staff phones can read every chore row, the amount
can't live in `household_tasks` (not in a column, not in the notes). It
follows the repairs pattern: its own owner-only table, receipts in the
existing owner-only bucket.

- **Mark paid** is 163's **Mark done** with two optional fields. It finishes
  the day (materialising it, as finishing always does) and, if an amount or
  a receipt was given, writes one **payment** for that day.
- **Amount** in rupiah, typed with thousands dots as you go (412.000).
  **Receipt**: a photo or a screenshot of the bank app's proof, resized on
  the phone (PR #39's path), stored in **`owner-receipts`** under
  `<household>/bills/<payment>/…`. The bucket's policies already restrict it
  to owners of the household in the path; no policy change.
- **Later**: tap a paid bill to add or change the amount or the receipt.
  **Undo** (toast) and **Mark not done** remove the payment and its receipt.
- **History**: the bill's sheet and the chore editor show **Last paid** and
  up to 12 past payments (date, amount, receipt thumbnail). No totals,
  charts or budgets in this phase.
- **Kept 2 years** after the payment, like repair receipts, then the
  payment and its receipt are deleted by the nightly clean-up.
- **Deleting a bill** deletes its days and so its payments (097's cascade);
  the delete dialog says so and offers **Stop repeating** instead, which
  keeps the history.
- **Bills given to staff** (an owner can still pick staff in the full chore
  form): staff finish with the usual two photos; an owner can add the amount
  afterwards from the done row. The quick-add sheet only offers owners for
  bills (D7).

## Gas and drinking water (D6)

Gas and gallons run out **by use, not by date**. A monthly "buy gas" chore
would be early or late most months. Recommended: the quick-add sheet's
**Gas (LPG)** and **Drinking water (gallon)** rows add an item to **Kitchen →
Shopping → Stok di rumah** (household supplies), where staff already tap
**running low** or **out** and the item lands on the shopping list. No new
code beyond creating the supply item; the row shows "Added to Stok di rumah".

## What staff see

- **Bills:** nothing new. A bill given to an owner never appears on staff
  phones' lists (163 and the staff view show staff their own and unclaimed
  chores). Amounts and receipts are in an owner-only table and bucket that
  staff sessions cannot read.
- **Upkeep given to staff or to anyone** (toren cleaning, watching the AC
  technician, pest control): an ordinary chore on their list, on its day,
  with before and after photos. The quick-add sheet saves its **Indonesian
  name** when the chore goes to staff or anyone ("Kuras toren", "Servis AC"),
  so staff never read English; a bill for an owner is saved in the owner's
  language.
- Nothing changes in the staff app's code, so **no staff tutorial card**.

## The quick-add list

| Item | Category | Repeat · day (default) | Who (default) | Remind me (default) | Saved title EN / ID |
| --- | --- | --- | --- | --- | --- |
| Electricity, postpaid | Bills | Every month · 20th | Me | 3 days before | Electricity (PLN) / Listrik PLN |
| Electricity, token | Bills | Every month · 1st | Me | On the day | Electricity token (PLN) / Token listrik PLN |
| Water (PDAM) | Bills | Every month · 20th | Me | 3 days before | Water (PDAM) / Air PDAM |
| Internet | Bills | Every month · day you pick | Me | 3 days before | Internet / Internet |
| Iuran RT/RW | Bills | Every month · 1st | Me | On the day | Iuran RT/RW / Iuran RT/RW |
| BPJS Kesehatan | Bills | Every month · 10th | Me | 3 days before | BPJS Kesehatan / BPJS Kesehatan |
| PBB (land and building tax) | Bills | Every year · 31 Aug | Me | 1 week before | PBB / PBB |
| Vehicle tax (STNK) | Bills | Every year · date you pick | Me | 1 week before | Vehicle tax (STNK) / Pajak kendaraan (STNK) |
| AC service | Maintenance | Every 3 months | Anyone | 1 day before | AC service / Servis AC |
| Toren cleaning | Maintenance | Every 6 months | Anyone | Off | Clean the water tank (toren) / Kuras toren |
| Pest control | Maintenance | Every 3 months | Me | 1 day before | Pest control / Pest control |
| Gas (LPG) | Supply | — (Stok di rumah) | — | — | Gas LPG |
| Drinking water (gallon) | Supply | — (Stok di rumah) | — | — | Air galon |

Bills are saved under the thing's name ("Electricity (PLN)", not "Pay
electricity"): the Bills category and its receipt icon already say it's to
be paid, and the name reads well in a push ("Due today: Electricity (PLN)")
and a toast ("Paid: Electricity (PLN)"). Titles are the household's text
afterwards, as for any chore, and can be renamed.

Electricity postpaid and token are one row with a two-way choice
(**Postpaid · Token**), since a home has one or the other. The days are
suggestions, editable before adding; the sheet notes "PBB deadlines differ
by region: check your SPPT". Regional facts (PLN and PDAM's 20th, BPJS's
10th) are re-checked before building.

## Owner text (EN / ID)

| Where | English | Bahasa Indonesia |
| --- | --- | --- |
| Chores button, sheet title | Bills and upkeep | Tagihan dan perawatan |
| Sheet groups | Bills · Upkeep | Tagihan · Perawatan rumah |
| Sheet lead | Pick what your home pays or services regularly. You can change each one later. | Pilih yang rutin dibayar atau dirawat di rumah Anda. Semua bisa diubah nanti. |
| Row, added | Added | Sudah ditambahkan |
| Row cadence | Every month · 20th · Every 3 months · Every year · 31 Aug | Setiap bulan · tgl 20 · Setiap 3 bulan · Setiap tahun · 31 Agu |
| Electricity choice | Postpaid · Token | Pascabayar · Token |
| PBB hint | Deadlines differ by region: check your SPPT. | Batas bayar tiap daerah berbeda: cek SPPT Anda. |
| Supplies row | Added to Supplies at home | Ditambahkan ke Stok di rumah |
| Button | Add 4 | Tambah 4 |
| Link | Other bill | Tagihan lain |
| Category | Bills | Tagihan |
| Repeat options | Every 2 weeks · Every 3 months · Every 6 months · Every year | Setiap 2 minggu · Setiap 3 bulan · Setiap 6 bulan · Setiap tahun |
| Form row | Remind me | Ingatkan saya |
| Remind options | Off · On the day · 1 day before · 3 days before · 1 week before | Mati · Pada harinya · 1 hari sebelumnya · 3 hari sebelumnya · 1 minggu sebelumnya |
| Today quiet line | Coming up: PBB · Mon 31 Aug · 3 bills coming up | Segera: PBB · Sen 31 Agu · 3 tagihan segera jatuh tempo |
| My tasks row | Due today · last Rp 412.000 | Jatuh tempo · terakhir Rp 412.000 |
| Push title | Reminder | Pengingat |
| Push body | Due today: Electricity (PLN) and Iuran RT/RW. Tomorrow: AC service. | Hari ini: Listrik PLN dan Iuran RT/RW. Besok: Servis AC. |
| Sheet button | Mark paid | Tandai sudah dibayar |
| Amount field | Amount (optional) · Last time Rp 412.000 | Jumlah (opsional) · Terakhir Rp 412.000 |
| Receipt field | Receipt (optional) | Bukti bayar (opsional) |
| Owners-only note | Only owners see amounts and receipts. | Hanya pemilik yang bisa melihat jumlah dan bukti bayar. |
| Done row | Paid · Rp 418.500 | Sudah dibayar · Rp 418.500 |
| Toast | Paid: Electricity (PLN) · Undo | Sudah dibayar: Listrik PLN · Batalkan |
| History | Last paid Rp 412.000 · 18 Oct · Payments | Terakhir dibayar Rp 412.000 · 18 Okt · Riwayat bayar |
| Delete dialog | Deleting this bill also deletes its payment history. Stop repeating keeps it. | Menghapus tagihan ini juga menghapus riwayat bayarnya. Hentikan pengulangan untuk menyimpannya. |
| Link | Edit bill | Ubah tagihan |

Wording follows `docs/indonesian-glossary.md`: **Anda**; **Ubah**;
**Batalkan** for Undo (163); **(opsional)** because these are owner-only
forms; **Hanya pemilik** for what staff never see; dates as `id-ID`
("31 Agu"); rupiah with dots (Rp 412.000). "Iuran RT/RW", "PBB", "BPJS",
"STNK", "PDAM", "PLN", "token" and "toren" are the everyday words and stay
as they are in English too.

## Glossary rows to add (before any Indonesian text)

The glossary is a shared file, so these are added when the phase is built,
not in this plan's PR:

| English | Bahasa Indonesia |
| --- | --- |
| Bills (category) / Bill | **Tagihan** |
| Upkeep / Bills and upkeep | **Perawatan rumah** / **Tagihan dan perawatan** (Maintenance stays **Perbaikan** as the category) |
| Mark paid / Paid | **Tandai sudah dibayar** / **Sudah dibayar** (not "Lunas", which reads as a loan paid off) |
| Amount | **Jumlah** |
| Receipt (of a bill) | **Bukti bayar** (a repair's paper receipt stays **Nota**) |
| Remind me / Reminder (push title) | **Ingatkan saya** / **Pengingat** |
| Due today / Coming up | **Jatuh tempo hari ini** / **Segera** |
| Every 3 months · Every year | **Setiap 3 bulan · Setiap tahun** |
| Postpaid / Token (electricity) | **Pascabayar** / **Token** |
| Clean the water tank | **Kuras toren** |

## The database: migrations 137 and 138

Everything below is one design. **PR A uses migration 137** (the repeat
interval, reminders, the re-created day check and guard, the reminder job);
**PR B uses migration 138** (`bill_payments`, the receipt and orphan
clean-ups, the payments clean-up job, the export). Both numbers are reserved.

Additive. **136 is Phase 163's**; re-check `supabase/migrations` and open PRs
before building. Not created in this PR.

**`household_tasks`, two columns**

| Column | |
| --- | --- |
| `recurrence_interval` | `smallint not null default 1`, check 1–12. Read with `weekly` and `monthly` (D1). |
| `remind_days_before` | `smallint`, null = no reminder; check in (0, 1, 3, 7) (D3). |

Plus `unique (id, household_id)` on `household_tasks` (as 105 and 130 have),
for the composite key below; it goes in 138 with the table that needs it. New category value `bill`: no database change
(the column has no CHECK); added to `HouseholdTaskCategory`, labels and the
icon map (Lucide `ReceiptText`).

**Re-created**

- `chore_occurs_on(household_tasks, date)` (128): the interval rule; same
  grants (revoked from public, anon, authenticated; service_role only).
- `household_tasks_owner_guard()` (128): a day a staff phone writes must
  carry its template's `recurrence_interval` and a null
  `remind_days_before`; staff can't change either on any row (they're not
  in the staff columns, so the existing check already refuses that).
  Same `security definer`, empty `search_path`, same revokes.

**Table `bill_payments`** (owners only)

| Column | |
| --- | --- |
| `id`, `household_id` | household FK, cascade on household delete |
| `task_id` | the paid day's row (a materialised day, or a one-off); composite FK `(task_id, household_id)` → `household_tasks (id, household_id)`, `on delete cascade`; `unique (task_id)`: one payment per day |
| `amount_idr` | bigint, nullable, 0 to 10¹³ (as `repair_costs`) |
| `receipt_url` | nullable; `owner-receipts`, `<household>/bills/<id>/…` |
| `paid_at` | timestamptz, default now() |
| `created_by`, `updated_at` | stamped by a server-fields trigger; household and task can't be changed (as `repair_costs_server_fields`) |

RLS: one policy for all commands, `to authenticated`, through a
`household_members` check of `auth.uid()` against `household_id` (as
`owner_all_repair_costs`), never `get_user_household_ids()`, which every
staff phone passes (AGENTS.md). `revoke all … from anon`.

**Receipts.** No change to the bucket or its policies. Re-created, same
names and signatures so the Edge Function doesn't change:

- `repair_receipts_due_for_pruning(p_secret, p_limit)`: also keeps every
  receipt a `bill_payments` row points at while the payment is under 2 years
  old, and lists it after. Without this, **a bill receipt would be deleted
  the night after it's saved** (it only keeps what `repair_costs` points at).
- `orphaned_household_photos(p_secret, p_limit)` (131): never lists a file a
  payment still points at.
- Both stay `security definer`, empty `search_path`, revoked from public,
  anon, authenticated, `service_role` only.

**Clean-up**: the nightly clean-up deletes `bill_payments` rows older than 2
years (a cron job beside the existing ones); their receipts are then
unreferenced and the sweep above removes them.

**Reminders**: `notify_chores_due()`, modelled on 124's
`notify_food_expiring()`: not `security definer`, called only by its cron
job (`5 0 * * *` UTC, 07:05 Jakarta, just after the food push). For each
template and one-off chore with `remind_days_before` set, not cancelled,
not already completed on that day: due on `today + remind_days_before`, or
due today with the reminder day already past. Groups per owner (D4), writes
EN or ID per `locale_of`, queues with `queue_push` (one owner) and tag
`chores-due-<date>`, url `/dashboard?module=agenda`. Revoked from public,
anon, authenticated; `service_role` only.

**Export**: `export_household_data()` (131) re-created to include
`bill_payments` (the export is owners-only). Same `security definer`, empty
`search_path`, admin check through `caller_admin_household()`, revoked from
public and anon, granted to authenticated.

**Tests**: `supabase/tests/137_bills_upkeep.sql`, rolled back:
- `chore_occurs_on`: every 3 months from 31 Jan (30 Apr, 31 Jul, 31 Oct),
  every year from 29 Feb, every 2 weeks across a year end;
- a staff phone finishes a 3-monthly chore on its day (allowed) and an
  in-between month (refused), and can't set `remind_days_before`;
- owners write and read `bill_payments`; a staff session reads nothing and
  can't insert; another household's owner can't either; logged-out gets
  nothing; a payment can't point at another household's chore;
- `repair_receipts_due_for_pruning` keeps a fresh bill receipt and lists one
  older than 2 years; still keeps repair receipts as before;
- `notify_chores_due`: one push per owner, an owner's bill only to them,
  a staff chore to every owner, nothing for a done or skipped day, the second
  push on the due day, nothing the day after;
- the export includes payments; every function's grants.

Applied local first, then staging, then production with the owner's OK,
before the PR merges (`main` deploys to production).

## Privacy policy and `legal.ts` (same PR as the migration, both languages)

**Yes, this changes what Miamus stores.** New kind of data: **bill
payments**: what was paid, when, how much, and a photo of the receipt,
**owners only**, kept 2 years and then deleted. No new service (Supabase
only, same region); receipts in the same private bucket as repair receipts.
Reminder pushes use the existing notification service. `policyVersion` bumped
with a dated comment; `effectiveDate` updated. If D5 B (no amounts or
receipts) is chosen, there is no privacy-policy change.

## How it's built (after the owner's OK)

**After Phase 163 has merged** (My tasks, migration 136). Two PRs, both small:

**PR A: cadence, reminders, quick-add** (migration 137 without
`bill_payments`): `recurrence_interval` and `remind_days_before`, the two
re-created functions, `notify_chores_due` and its cron, the Bills category,
the Repeat and Remind rows in the chore form, the **Bills and upkeep** sheet,
gas and gallons into Stok di rumah, the Coming up line on Today, the What's
new card. No privacy-policy change (no new personal data).

**PR B: Mark paid** (migration 138, `bill_payments`, receipts, clean-up,
export): the Mark paid sheet, amount and receipt, history, the delete
dialog's warning, the privacy policy.

Splitting means the reminders can go out before the receipts design is
reviewed (decided with D1–D9: two PRs, 137 then 138).

Each: unit tests (`occursOn` with intervals, the quick-add defaults, rupiah
formatting), Playwright on the stub (add three bills, see one on Today,
mark it paid with an amount, undo), `tsc`, `next build`, CI, Codex until
clean, migration local → staging → production with the owner's OK, merge
with the owner's OK.

## Decisions for the owner

**Decided 2026-11-10: the owner delegated to the recommendations, so D1–D9
are all A.**

- **D1 — Every 3 months and every year.**
  **A (recommended):** a repeat interval for weekly and monthly chores
  (every 2 weeks, 3 months, 6 months, every year), one new column. B: add
  only a **Yearly** repeat; AC and toren stay monthly or are done by hand. C:
  no change; PBB and vehicle tax become one-off chores you re-add each year.
- **D2 — Where you add them.**
  **A (recommended):** a **Bills and upkeep** button on Chores → Today, next
  to Add chore, and a one-time What's new card that opens it. B: a page in
  the Household tab that lists bills and upkeep (a new place to look). C:
  only as extra choices in the chore form's category picker (no checklist,
  one at a time).
- **D3 — Reminders.**
  **A (recommended):** a **Remind me** choice on any chore (off, on the day,
  1, 3 or 7 days before), turned on by the quick-add for bills and for
  upkeep that needs someone home; a 07:00 push on the reminder day and
  again on the due day if not done, plus a Coming up line on Today. B: the
  same, but push only on the due day. C: no push; the Today line only.
- **D4 — Who gets a reminder.**
  **A (recommended):** the owner it's assigned to; every owner when it's
  for staff or anyone. B: every owner, always. C: only owners assigned to
  it (staff chores never remind anyone).
- **D5 — Amount and receipt.**
  **A (recommended):** optional amount and receipt photo when marking a
  bill paid, owners only, kept 2 years, with a short history on the bill.
  Needs `bill_payments` and a privacy-policy update. B: no amounts, no
  receipts: Mark paid is just done. C: a free-text amount in the chore's
  notes (no new table, but **staff phones can read chore notes**, so not
  recommended).
- **D6 — Gas and drinking water.**
  **A (recommended):** the quick-add puts them in **Stok di rumah**, where
  staff already mark running low or out. B: a monthly "Check gas" chore for
  staff. C: leave them out.
- **D7 — Who can be given a bill.**
  **A (recommended):** in the quick-add, owners only (bills are private
  money matters); the full chore form still allows anyone, with the usual
  staff photos. B: anyone in the quick-add too.
- **D8 — The list.**
  **A (recommended):** the roadmap's nine plus **BPJS** and **vehicle tax
  (STNK)**, both common misses. B: the roadmap's nine only.
- **D9 — Tutorial.**
  **A (recommended):** one What's new card for owners on Chores and Today,
  with **Show me** opening the sheet; no staff card (nothing changes for
  staff). B: no card; the button is enough.

## Tutorial (shown once, owners only)

1. "Never miss a bill: **Chores → Bills and upkeep**, tick what your home
   pays, then **Add**." / "Jangan sampai telat bayar: **Tugas → Tagihan dan
   perawatan**, centang yang rutin dibayar, lalu **Tambah**."
2. "We remind you the morning it's due, or a few days before." / "Kami
   ingatkan pagi hari saat jatuh tempo, atau beberapa hari sebelumnya."
3. "Tap a bill on Today to **mark it paid**, with the amount and a receipt
   if you like. Only owners see them." / "Ketuk tagihan di Hari ini untuk
   **menandai sudah dibayar**, boleh dengan jumlah dan bukti bayar. Hanya
   pemilik yang bisa melihatnya."

**Staff**: no card. Upkeep given to them is an ordinary chore.

## Not in this phase

- Totals, monthly spending, charts or budgets.
- Paying bills from Miamus, or reading a bill's amount from a photo (Kakak
  could do this later, as a paid extra).
- A staff "token almost out" report (the meter beeps; staff hear it first).
  A good later idea for the Lapor sheet.
- Reminders to staff phones (no pushes go to staff today).
- Appliance list (each AC unit with its own history); spots cover it for now.
- Staff pay and THR (roadmap item 14).
