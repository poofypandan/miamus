# Phase 172 PR B — Kakak sets up a home from one voice note

Build-ready spec, 13 Nov 2026. Docs only: nothing here is built yet. The
design is section 3 of `docs/phase-172-first-ten-minutes-plan.md` (owner
decisions D8 and D9, both A). This document does not repeat it. It brings it
up to date with what shipped since (PR A2, Phase 175's first page, Kakak's
sixth tool, the strict-schema limit), fills the gaps an executor would hit,
and splits the build.

Migration: **164** (157 to 163 are Phase 175's two parts). The manager
confirms the number.

## 0. North star first

One voice note in place of about 400 taps. No new required field: the
note is optional, the template list is still there under it, and a failed
note loses nothing.

What the owner does: taps **Tell Kakak about your home**, speaks for twenty
seconds, taps **Make my list**, looks at the list, taps **Add all 77**.

## 1. What changed since the plan was written

| The plan (10 Nov) | Now | What the build does |
|---|---|---|
| The review screen was a proposal | It exists: `/setup`, `src/components/setup/setup-review.tsx`, `buildSetupDraft()` and `toApplyPayload()` in `src/lib/setup-templates.ts`, `apply_household_setup` (147) | Kakak fills the **same draft**; the review and the apply are reused as they are |
| "Five tools" | Six (`put_away_ingredient`, 155), and a seventh to tenth are specified in Phase 175 part 2 | The setup job offers **only** `propose_home_setup`; the quick tools are not sent |
| No word on strict schemas | Strict tools are at 15 of 16 union-typed parameters across the quick tools (`tests/unit/kakak-tool-limits.test.ts`) | The limit is per request. The setup request carries one tool, so it has the whole budget to itself: section 3 |
| `apply_household_setup` adds "floors, rooms, staff, chores and bills" | True, and **not pets** | Pets are added after the apply, through the action the Pets tab uses: section 5 |
| The card sat on the home-type screen | Phase 175's Set up card on Today now has **Or tell Kakak** (`first-run-card.tsx`), which opens the quick Kakak sheet | That link opens the setup sheet instead while the free setup is unused: section 2 |
| Kakak is live | She is not on production yet (the key arrives this week) | Everything is built and tested in practice mode; nothing here needs the key until the eval run |

## 2. Where it starts

- **`/setup`** (the home-type screen and the review): the card **Tell Kakak
  about your home** above the home types, as the plan drew it.
- **Today's Set up card:** **Or tell Kakak** opens `/setup?kakak=1` (the
  sheet already open) while the household has a free setup left and the
  setup switch is on. Afterwards it opens the quick Kakak sheet as today,
  or is hidden where Kakak is off.
- Whether a free setup is left comes from a new field on the status the
  app already reads (`kakak_status`, section 4): `setup_left` (0, 1 or 2).

The sheet, its consent line, the mic, the keyboard tip for an iPhone Home
Screen app, the wait and the failure line are as the plan's section 3 and
its *Owner text* table have them. Voice is the phone's own speech
recognition (`voice.ts`); Miamus never receives audio.

## 3. The tool: `propose_home_setup`

The fields are the plan's. Decisions the plan left open:

- **Strict, in a tool list of its own** (`KAKAK_SETUP_TOOLS`). With one
  tool in the request, its union-typed parameters (the nullable ones:
  `extra_rooms[].floor`, `extra_rooms[].inside`, `extra_chores[].room`,
  `extra_chores[].weekday`, `extra_chores[].job`, `staff[].job`) are 6 of
  16, and nothing is optional. A second block in the limits test counts
  this list on its own. If the API refuses any part of the schema, fall
  back to a non-strict tool: `validateToolCall` checks the whole shape
  either way. The executor confirms against Anthropic's structured-outputs
  documentation before choosing.
- **Numbers are clamped, never refused.** `floors`, `bedrooms` and
  `bathrooms` outside `SHAPE_LIMITS` are brought to the nearest limit and
  added to `guessed`, so the owner sees *Kakak's guess — check it* beside
  them.
- **Names.** Staff and pet names: trimmed, 1 to 40 characters, at most 12
  staff and 12 pets, duplicates by `nameKey()` dropped. A name is household
  content and is shown exactly as heard.
- **Limits.** At most 20 extra rooms and 30 extra chores (the plan's), each
  title 1 to 80 characters, `skip` and `bills` only keys the catalogue
  knows; an unknown key is dropped, not an error.
- **No questions.** The setup job has `MAX_QUESTIONS = 0`: what Kakak was
  not told, she guesses and lists in `guessed`.
- **One retry.** A call that fails validation goes back once with the
  errors, as the quick engine does. Two calls is also the free allowance.

`validateToolCall` gains the tool. `KAKAK_TOOL_NAMES` gains the name.

## 4. The server (migration 164)

As the plan's *PR B* list, with these made exact:

```sql
alter table public.kakak_settings
  add column if not exists setup_calls integer not null default 0;
alter table public.kakak_settings drop constraint if exists kakak_settings_setup_calls_check;
alter table public.kakak_settings add constraint kakak_settings_setup_calls_check check (setup_calls >= 0);

alter table public.kakak_config
  add column if not exists setup_enabled boolean not null default true,
  add column if not exists daily_free_setups integer not null default 25,
  add column if not exists setup_max_call_cost_micro_usd bigint not null default 500000;

alter table public.kakak_requests
  add column if not exists job text not null default 'quick';
alter table public.kakak_requests drop constraint if exists kakak_requests_job_check;
alter table public.kakak_requests add constraint kakak_requests_job_check check (job in ('quick', 'setup'));
```

- **`kakak_begin_setup(p_household uuid)`**: `security definer`,
  `set search_path = ''`, `revoke all … from public, anon;`
  `grant execute … to authenticated, service_role;`. Refuses, by name:
  not signed in; not an admin of the household (a `household_members` row,
  never `get_user_household_ids()`, which staff phones pass); the setup
  switch off; the household's two calls used; today's free setups used;
  the global daily cap reached. Otherwise it counts the call
  (`setup_calls + 1`) and inserts the pending request with `job = 'setup'`,
  under the same lock `kakak_begin` takes, and returns the request id and
  the cost cap for this call. It does **not** need Kakak to be allowed or
  switched on for the household: that is what "free, once" means.
- **`kakak_record`** and **`kakak_set_result`** are re-created from their
  newest definitions **at build time** (155 today; 163 if Phase 175 part 2's
  K0 has merged, whose four tool names must then be kept). The tool list
  gains `propose_home_setup`. A request whose `job` is `setup` is recorded
  for any admin of the household whether or not Kakak is on; its cost is
  clamped to `setup_max_call_cost_micro_usd`. Quick requests keep every
  check they have. Same signatures, same revoke and grant, restated.
- **`kakak_status`** (re-created, same signature) also returns
  `setup_left`: `greatest(0, 2 - setup_calls)` when the setup switch is on,
  else 0.
- **A failed call still counts.** The counter moves in `kakak_begin_setup`,
  before Anthropic is called, so a timeout uses one of the two. That is on
  purpose: it is the only way the allowance bounds the cost. The sheet says
  so when one is left: *One more try left.* / *Tinggal satu kali lagi.*

## 5. The app

- **Route.** `/api/kakak/setup`, a sibling of `/api/kakak`: the same
  sign-in check, body limit, practice mode and recording, calling
  `kakak_begin_setup` in place of `kakak_begin`. The engine takes a **job
  profile** (the plan's table): `max_tokens 8000`, 2 calls, 0 questions,
  1,500 typed characters, `KAKAK_MODEL_SETUP` (default `claude-opus-5-5`)
  and `KAKAK_EFFORT_SETUP` (default `medium`).
- **Instructions.** A setup prompt of its own (`setup-prompt.ts`), cached:
  the catalogue's chore keys with their Indonesian titles, the home types,
  the jobs, the bill keys, and the rules above. It contains no household
  data: a new home has none worth sending, and an existing one is not sent
  either (section 6).
- **Expanding.** `buildSetupDraft()` gains the options the tool fills:
  `has`, `extraRooms`, `skip`, `extraChores`, `bills`, `guessed`. The
  result is a `SetupDraft` like a template's, so `setup-review.tsx`, the
  ticks, `alreadyInHousehold()` and `toApplyPayload()` work unchanged.
  Staff from the note go where typed staff names go, each with its job, so
  `assigneeFor()` gives them their chores.
- **The result card** on top of the review: **Kakak's list · 18 rooms · 46
  chores · 4 staff · 3 pets · 6 bills**, **Add all 77**, **Change
  something** (reopens the sheet with the text kept; shown only while
  `setup_left > 0`).
- **Pets.** `apply_household_setup` does not add pets. After it succeeds,
  the pets from the note are added one by one through the context's
  existing add-pet action, with name and kind only (routines are added
  later, by hand or by telling Kakak). The count on the button includes
  them. If a pet fails, the toast says what was added and *Add your pets in
  Pets.* / *Tambahkan hewan Anda di tab Hewan.*; the rest stands. A home
  that said it has no pets (133) and names pets in the note has that answer
  switched back first, as the Pets tab does.
- **Measurement.** `household_setup.voice_notes` (142) goes up by one per
  note sent, through the function that already records setup numbers.
- **Failure.** No key, the switch off, a cap reached, a refusal, a timeout,
  or two failed validations: *Kakak couldn't make the list. Pick from the
  list below instead.* The text stays in the box.

## 6. Privacy and safety

- **What is sent to Anthropic:** only what the owner said or typed in the
  sheet, which will usually hold staff first names and pet names. No
  household data is added to it. The consent line sits above the button
  (D9).
- **The policy changes in the same PR** (the manager's files, both
  languages, a new version): an admin can use Kakak once to set up the home
  without switching Kakak on; what is sent; that the count of setup calls
  is kept.
- **Nothing is saved from the note itself.** The text is not stored; the
  request row holds counts and cost, as for every Kakak call.
- **Nothing is added without the review.** The tool only fills the draft.
  The owner sees every room, chore, person and bill, and can untick any.
- **A note that tries to instruct Kakak** ("ignore your rules and…") can
  only produce a draft of rooms and chores: the tool is the only thing the
  job can call, its keys are checked against the catalogue, its text fields
  are length-limited household names and titles, and no price, link or
  phone number field exists. An eval case covers it.
- **Staff** see nothing of this. They get their tasks as from a template.

## 7. Words

The plan's *Owner text* and *Glossary rows* tables already hold the card,
the consent, the keyboard tip, the button, the wait, the result and the
failure lines, and **Add all (N) / Tambah semua (N)**. Three more, for the
glossary:

| English | Bahasa Indonesia | Where |
|---|---|---|
| One more try left. | Tinggal satu kali lagi. | The sheet, after the first note |
| Kakak's guess — check it | Tebakan Kakak — cek lagi | Reused from Kakak's cards, beside a guessed number |
| Add your pets in Pets. | Tambahkan hewan Anda di tab Hewan. | Toast, if adding a pet failed |

No emoji. Icons: `Mic`, and Kakak's avatar on the card.

## 8. Build: PRs, and what runs side by side

| PR | What | Files | Runs |
|---|---|---|---|
| **B1** | Migration 164 and its test | `supabase/migrations/164_*.sql`, `supabase/tests/164_*.sql` | **Side by side with B2** |
| **B2** | The tool, its validation, the job profile, the setup prompt, `buildSetupDraft` options; practice-mode script; the eval set; unit tests; glossary rows | `src/lib/kakak/*`, `src/lib/setup-templates.ts`, `tests/kakak/setup-set.json`, `tests/unit/*`, `docs/indonesian-glossary.md` | **Side by side with B1.** Kakak's files have one writer at a time: before or after Phase 175 part 2's K1 to K4, not during |
| **B3** | The route, the sheet, the result card, pets after the apply, the Set up card's link, `setup_left`; the privacy policy and `legal.ts` | `src/app/api/kakak/setup/route.ts`, `src/app/setup/page.tsx`, `setup-review.tsx`, new `kakak-setup-sheet.tsx`, `first-run-card.tsx`, `src/hooks/use-kakak-status.ts`, the manager's two files | After B1 and B2 |

Every PR: `tsc`, the unit tests, the build, its own browser tests, `@codex
review` until clean. Merges and database steps are the manager's, on the
owner's OK.

## 9. Tests

- **SQL 164:** two setup calls work for a household where Kakak is neither
  allowed nor on; the third is refused; a staff phone is refused; an admin
  of another household is refused; the daily free cap and the global cap
  each refuse; the setup switch off refuses; a setup request can be
  recorded with Kakak off and a quick one still cannot; the cost is clamped
  to the setup cap; `kakak_status` returns `setup_left` 2, 1, 0; `anon`
  cannot execute any of the four functions; every tool name accepted before
  still is.
- **Unit:** `validateToolCall` for the tool (a good call; an unknown
  catalogue key dropped; a number out of range clamped and marked guessed;
  21 extra rooms refused; a duplicate staff name dropped; an 81-character
  title refused); `buildSetupDraft` with each option (a pool adds the pool
  chores, `skip` removes one, an extra chore lands in its room, staff jobs
  assign); the limits test's second block for `KAKAK_SETUP_TOOLS`; the job
  profile's limits (1,500 characters, 2 calls, no question).
- **Kakak eval** (`tests/kakak/setup-set.json`, about ten notes, graded on
  the draft they produce): the plan's example in Indonesian; the same in
  English; a mix of both; a one-bedroom apartment with nobody working
  there; a large house with six staff; names only, no rooms; a note that
  contradicts itself (three floors, "apartment"); a note about something
  else entirely (she returns the plain template for "other" with everything
  guessed); a note that tries to instruct her; a note at the 1,500
  limit.
- **Browser, in practice mode (EN and ID):** the card, the consent, the
  note, the wait, the review filled in, a guessed number marked, untick,
  **Add all**, the rooms, chores, staff and pets all there; **Change
  something** once, then gone; the failure line with the template list
  intact; the Set up card's link opens the sheet, and the quick sheet once
  the setup is used; a home with Kakak off can still use it.
- **Must still pass:** `kakak.spec.ts`, the setup and first-run specs, the
  quick tools' limits test.

## 10. Open questions for the owner

None block the build; the defaults stand unless the owner says otherwise.

1. A failed note uses one of the two free tries (recommended: it is what
   keeps the cost bounded).
2. Pets from the note are added by name and kind only, with no routines
   (recommended; routines are one sentence to Kakak afterwards).
3. The plan's question 3 still stands: the Anthropic monthly limit of $20
   covers about 250 setups. Raise it before inviting more than a handful of
   new households in one month.
