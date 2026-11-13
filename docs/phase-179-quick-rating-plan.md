# Phase 179 — "How was that?": a quick rating at the right moment

Build-ready spec, 13 Nov 2026. Docs only: nothing here is built yet. Build
after Sunday, after staff areas (Phase 178). The manager confirms the phase
number and the migration number (167; 157 to 166 are reserved).

## 1. The request, in the owner's words

> "It's kinda nice that when using Claude at times it asks 'how is Claude
> doing?' 'bad, fine, good' and 'tell us more' after. Should we implement
> something like this in the app? … so we can get early feedback about
> certain things without users having to go to the 'about me' part. Is this
> annoying? Should it only appear in the 'free' version, non plus version?"

What exists: **Send feedback** (`feedback-sheet.tsx`, migration 135), a note
someone has to go and write, reached from About Miamus and the staff's
Lapor button. Owners of the household can read what is sent, staff notes
included.

## 2. The two questions, answered

**Is it annoying?** It is when it interrupts, repeats, or asks about
everything. So this one never blocks the screen, goes away by itself, asks
at most once in two weeks, and at most twice ever about any one thing. If
those rules are kept it reads as care, not as a survey.

**Only for the free version?** No. There is no paid plan yet, and when there
is, paying homes are the ones whose answers matter most. Asking only people
who do not pay would also read as a penalty. How often it asks is the
lever, and it is the same for everyone.

## 3. What we build

A small card slides up from the bottom after someone finishes something
that matters, **the second time** they do it:

```
How did Kakak do?                                   [x]
[ Not good ]   [ Okay ]   [ Good ]
```

One tap answers it. Then, for owners only: *Thanks. That helps.* and a
quiet **Tell us more** that opens a small box to type in, if they want to.

North star: one tap, nothing required, typing only if the person chooses.

### What it is not

- Not a popup: it never covers the screen or takes the keyboard, and it
  leaves by itself after 20 seconds.
- Not Send feedback: that stays where it is, for anything, any time.
- Not seen by the household: an answer goes to the people who make Miamus
  and nobody else (section 6). That is what lets staff answer honestly.

## 4. When it asks

### 4a. The moments (owners)

| Key | The moment | The question (EN / ID) |
|---|---|---|
| `setup_done` | The Set up card finishes (the first task done). Asked the **first** time; it happens once | How was setting up your home? / Bagaimana rasanya menyiapkan rumah Anda? |
| `kakak_saved` | A Kakak suggestion is saved | How did Kakak do? / Bagaimana bantuan Kakak tadi? |
| `menu_cooked` | A dish is marked cooked and its sheets have closed | How was cooking from the menu? / Bagaimana memasak dari menu tadi? |
| `add_missing` | *Add missing to Shopping* is confirmed | How was adding what's missing to Shopping? / Bagaimana menambahkan yang kurang ke Belanja tadi? |

Answers: **Not good · Okay · Good** / **Kurang · Lumayan · Bagus**, each
with a line icon (`Frown`, `Meh`, `Smile`). Stored as 1, 2, 3.

A new moment later is one line of code (`askQuickRating("key")`) and one
row in the words table; the database takes any key of the right shape.

### 4b. The moment (staff)

One, in Bahasa Indonesia, and only a rating:

| Key | The moment | The question |
|---|---|---|
| `staff_day_done` | The person's own list for today becomes all done | Bagaimana Miamus hari ini? **Susah · Lumayan · Mudah** |

Under the answers, always: *Hanya untuk tim Miamus. Pemilik rumah tidak
melihat jawaban ini.* There is no "tell us more" for staff: nothing to type,
and the place where staff can already write (Kirim masukan) is read by the
household's owners, so this card does not send them there.

### 4c. The caps

Worked out by one pure function, `shouldAsk(key, state, now)` in
`src/lib/quick-rating.ts`, from what is remembered **on that phone**
(`localStorage`; per signed-in staff member on a staff phone):

1. A moment asks on its **second** success (`setup_done` on its first).
2. If the card was ignored or closed, the same moment may ask **once
   more**, on a later success at least 30 days on. Never a third time.
3. Once a moment is answered, it never asks again.
4. **One ask in any 14 days**, whatever the moment. Staff: one in any 21.
5. Never in a household's **first 3 days** (the calm start), except
   `setup_done`, which is the calm start's own end.
6. Never two in one visit, never while a sheet or dialog is open, never
   when the phone is offline (the answer could not be sent).
7. **A switch for the build**: `NEXT_PUBLIC_QUICK_RATING`. Off on staging
   and preview builds, on for production. It ships after Sunday's demo, so
   the demo home never meets it.

The phone remembers, per moment: how many successes, when it last asked,
and whether it was answered. Nothing about "shown" is sent anywhere. A
second phone of the same owner keeps its own count, so an owner with two
phones could be asked twice; that is accepted in exchange for storing
nothing.

## 5. The card

A custom toast (the app's `sonner` toaster), at the bottom, above the tab
bar, where toasts already appear:

- 20 seconds, then it goes. The **x** closes it. Either counts as "ignored".
- It appears **after** the moment's own toast has gone (cooking's Undo
  toast is 8 seconds), so the two are never stacked.
- `role="status"`: read out politely, never taking focus.
- A tap on an answer sends it at once (`send_quick_rating`) and the card
  becomes *Thanks. That helps.* / *Terima kasih. Ini membantu.* for 4
  seconds; for an owner, with **Tell us more** / **Ceritakan lebih
  lanjut**. After **Not good** the link reads **Tell us what went wrong** /
  **Ceritakan apa yang salah**.
- **Tell us more** opens a small bottom sheet: one text box (500
  characters, the placeholder *What happened?* / *Apa yang terjadi?*) and
  **Send** / **Kirim**. Saved onto the same answer (`set_quick_rating_note`).
- A failed send is dropped without a word. A rating is not worth an error
  message.
- Buttons are `rounded-xl` action buttons, at least 44px tall. No emoji.

## 6. Who sees the answers, and why it is a table of its own

**Only the platform admins** (Poofy Labs). Not the household's owners, not
staff, not the household export's readers.

It is not a new column on `feedback`, though that was the first idea,
because `feedback` is built to be read by the household's owners (135:
`owner_select_feedback`), needs a written message, and names the staff
member who sent it. A staff member asked "how is Miamus today?" must be able
to say *Susah* without their employer seeing who said it.

So:

- **An owner's answer** is linked to their account (so a note can be
  followed up, and so it is theirs under UU PDP).
- **A staff answer is linked to nobody.** It records the household and
  "staff", not the person and not the phone.

## 7. The database (migration 167)

```sql
create table if not exists public.quick_ratings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  feature text not null,
  rating smallint not null,
  note text,
  role text not null,                    -- 'owner' or 'staff', decided by the server
  created_by uuid references auth.users (id) on delete set null,   -- owners only; null for staff
  app_version text,
  created_at timestamptz not null default now(),
  constraint quick_ratings_feature_check check (feature ~ '^[a-z][a-z_]{1,39}$'),
  constraint quick_ratings_rating_check check (rating between 1 and 3),
  constraint quick_ratings_note_length check (note is null or char_length(note) <= 500),
  constraint quick_ratings_role_check check (role in ('owner', 'staff')),
  constraint quick_ratings_staff_unlinked check (role = 'owner' or (created_by is null and note is null)),
  constraint quick_ratings_app_version_length check (app_version is null or char_length(app_version) <= 64)
);
create index if not exists quick_ratings_household_idx on public.quick_ratings (household_id, created_at);
create index if not exists quick_ratings_created_by_idx on public.quick_ratings (created_by);
create index if not exists quick_ratings_created_at_idx on public.quick_ratings (created_at);

alter table public.quick_ratings enable row level security;
revoke all on public.quick_ratings from public, anon, authenticated;
grant select, insert, update, delete on public.quick_ratings to service_role;
```

No policy and no client grant: **no client can read or write the table**.
Everything goes through four functions. Each is `security definer`,
`set search_path = ''`, with `revoke all … from public, anon;` and an
explicit grant in the migration.

| Function | Granted to | What it does |
|---|---|---|
| `send_quick_rating(p_household uuid, p_feature text, p_rating smallint, p_app_version text) returns uuid` | `authenticated` | Signed in, and the household is one of the caller's (`get_user_household_ids()`: **deliberately open to staff phones**, the documented exception, since it can only add one rating). The role is the server's: `owner` when the caller has a `household_members` row for that household, else `staff`. An owner's row gets `created_by = auth.uid()`; a staff row gets null. Limits: 10 a day per owner account, 30 a day per household for staff (`too_many`, 54000). Returns the row's id for an owner, **null for staff** (nothing to add a note to) |
| `set_quick_rating_note(p_id uuid, p_note text) returns void` | `authenticated` | Only the owner who made the row (`created_by = auth.uid()`), within 10 minutes, once (the note is still null). Trims; 1 to 500 characters |
| `list_quick_ratings(p_days integer default 30) returns jsonb` | `authenticated` | **Platform admins only** (`is_platform_admin()`, 113; `not_platform_admin` otherwise). `{ "by_feature": [{ feature, role, bad, okay, good }], "notes": [the latest 100 notes: feature, rating, household name, date] }`. No account, no email |
| `prune_old_quick_ratings() returns integer` | `service_role` | Nightly, with the other prunes: rows older than 2 years go, as feedback's do |

An account that is deleted leaves its ratings without a name (`on delete
set null`); a household that is deleted takes its ratings with it.

Nothing that is for admins only is guarded by `get_user_household_ids()`
alone: reading is `is_platform_admin()`, and a note can be added only by the
owner who made the row.

### The export

An owner's own ratings are their personal data. `export_household_data`
lists what it exports by name, so they are added the next time it is
re-created (the Phase 175 "trust" spec does that in migration 158), as
`my_ratings` for the admin who runs the export. Staff answers are linked to
nobody and are not exported. Until then the privacy policy says how to ask
for them.

## 8. Where Poofy Labs reads them

The platform admin's screen that exists (`src/app/dashboard/approvals`)
gains one section, **Quick ratings**: for the last 30 days, one row per
moment and role with the three counts, then the latest notes. English only:
it is the operator's own tool, shown to nobody else. No charts.

## 9. Privacy

New data: a rating, the moment it is about, an optional note from an owner,
the household, the owner's account (never for staff), the app version; kept
2 years; read by Poofy Labs only. The privacy policy gets a short paragraph
in both languages and `legal.ts` a new version, in the PR that ships the
card (the manager's files). No new service. Nothing is sent to Kakak.

## 10. Words

For `docs/indonesian-glossary.md` (the manager's file). The four questions
are in section 4a and the staff question in 4b; the rest:

| English | Bahasa Indonesia | Where |
|---|---|---|
| Not good · Okay · Good | Kurang · Lumayan · Bagus | Owners' answers |
| (staff only) | Susah · Lumayan · Mudah | Staff answers |
| (staff only) | Hanya untuk tim Miamus. Pemilik rumah tidak melihat jawaban ini. | Under the staff answers |
| Thanks. That helps. | Terima kasih. Ini membantu. | After an answer |
| Tell us more / Tell us what went wrong | Ceritakan lebih lanjut / Ceritakan apa yang salah | Owners, after an answer |
| What happened? | Apa yang terjadi? | The box's placeholder |
| Only the Miamus team reads this. | Hanya dibaca tim Miamus. | Under the box |
| Send | Kirim | Existing |
| Close | Tutup | The x's label, existing |

No emoji. Icons: `Frown`, `Meh`, `Smile`.

## 11. Later

1. More moments (the first ingredient move, the weekly check-in, a repair
   closed), one line each, once these four have run for a month.
2. A household switch for owners who do not want their staff asked, if any
   owner asks for it.
3. The caps remembered on the account, not the phone.
4. A reply from Poofy Labs to a note.

## 12. Build: PRs, and what runs side by side

| PR | What | Files | Runs |
|---|---|---|---|
| **Q1** | Migration 167 and its test | `supabase/migrations/167_*.sql`, `supabase/tests/167_*.sql` | **Side by side with Q2** |
| **Q2** | `quick-rating.ts` (the caps) with unit tests; the card and the note sheet; the hook; the four owner moments; data providers and the stub; glossary rows; the privacy paragraph | `src/lib/quick-rating.ts`, new `quick-rating-card.tsx` and `quick-rating-note-sheet.tsx`, `src/hooks/use-quick-rating.ts`, `first-run-card.tsx`, `use-kakak-save.ts`, `cook-flow.tsx`, `add-missing-sheet.tsx`, `src/lib/data/*`, `tests/e2e/stub-backend.ts`, the manager's three files | **Side by side with Q1** |
| **Q3** | The staff moment | `src/app/staff/page.tsx`, a staff spec | After Q2. After Phase 178's V3, which edits the same file |
| **Q4** | The operator's section | `src/app/dashboard/approvals/page.tsx` | After Q1 |

Every PR: `tsc`, the unit tests, the build, its own browser tests, `@codex
review` until clean. Merges and database steps are the manager's, on the
owner's OK.

## 13. Tests

- **SQL 167:** no client role can select, insert, update or delete the
  table directly; an owner's rating stores their account and role `owner`;
  a staff phone's stores no account, no note and role `staff`, and returns
  null; a caller cannot choose the role; another household is refused; a
  rating of 0 or 4 and a bad feature key are refused; the 11th in a day
  for an owner and the 31st for a household's staff are refused; a note is
  accepted once, from the row's owner, within 10 minutes, and refused
  otherwise (another owner of the same household included);
  `list_quick_ratings` refuses a household owner and a staff phone and
  answers a platform admin, with no account or email in it; `anon` can
  execute none of the four; rows older than 2 years go.
- **Unit (`shouldAsk`):** the first success does not ask and the second
  does; `setup_done` asks on the first; ignored once, it asks again only
  after 30 days and never a third time; answered, never again; a second
  moment inside 14 days waits (21 for staff); day 2 of a household does not
  ask and day 4 does; offline, an open sheet and the build switch off each
  stop it; state kept per staff member on a shared phone.
- **Browser, owner (EN and ID):** the second Kakak save shows the card
  after the save's own toast; a tap sends and shows the thanks; **Tell us
  more** saves a note; the x closes it and it does not come back that
  visit; nothing shows with the switch off.
- **Browser, staff (ID):** the card when the list is all done, the line
  about who reads it, no "tell us more", no English.
- **Must still pass:** `kakak.spec.ts`, `kitchen-menu.spec.ts`,
  `first-run`, `calm-start`, the feedback specs.

## 14. Open questions for the owner

None block the build; the defaults stand unless the owner says otherwise.

1. The same for every home, paid or not (recommended).
2. Staff are asked too, a rating only, about once in three weeks, and only
   Poofy Labs sees it (recommended). Say no and Q3 is dropped.
3. An owner's answer is linked to their account so a note can be followed
   up; a staff answer is linked to nobody (recommended).
