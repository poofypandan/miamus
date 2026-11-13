# Phase 177 — Kitchen: fixing what cooking took off, and recipes that learn

Design, 13 Nov 2026. Docs only: nothing here is built yet. The manager gave
the phase number (177) and the migration number (156).

## 1. The problem, in the owner's words

> "Make sure if we start 'cooking' and using up the ingredients for certain
> recipe, that if we overuse or underuse certain ingredients there's a simple
> way to change this … she herself or one of the staff cooks it, there's a
> way to make sure that if there are overused or underused ingredients that
> there's an easy way to change."

What exists today:

- **Sudah dimasak** opens *Bahan yang dipakai*: each ingredient ticked, with
  minus and plus, before anything comes off.
- The toast has **Batalkan** for 8 seconds.
- After that, a wrong amount is fixed ingredient by ingredient, by hand, in
  Food → Ingredients. Nothing on the cooked dish helps.

## 2. What we build

1. **Change what was used.** On a cooked dish, for the rest of that day, the
   same sheet opens again with what was used. Saving applies only the
   difference to what is at home.
2. **Recipes that learn.** When the same ingredient of a recipe was changed
   the same way three times in a row, the owner is offered, once, to update
   the recipe's amount.
3. **Small fixes carried from Phase 176** (section 5): Undo of cooking brings
   back a date that cooking cleared, and three smaller ones.

Everything else is in section 10, *Later*.

### What does not change

- Cooking itself: the confirm sheet, the 8-second Undo, *Any leftovers?*,
  owners' *Mark not cooked*.
- Who may cook: owners and every staff phone. The same people may change what
  was used.
- Where it shows: only where the Menu shows, so only while the **Kitchen**
  switch is on. A home with it off sees no change at all.
- No new required field, no new tab, no new table. One new column and one new
  function.
- No prices anywhere: none of these tables or screens holds money.
- Everything is done by hand. Nothing here uses Kakak.

## 3. Change what was used

### 3a. Where it is

The dish's sheet (`DishSheet`), once the dish is cooked, on the owner's
Kitchen → Menu and on the staff's *Menu hari ini*:

```
Rendang
Wednesday · Dinner · 4 servings
…the recipe, as now…

Cooked · 18.40 · Sari                         (as now)
[ Change what was used                      ]  (new; outline, rounded-xl)
[ Edit ]  [ Mark not cooked ]                  (owners, as now)
```

The button shows when all of these are true:

- the dish was cooked **today** on this phone's calendar (the local day of
  `cooked_at`);
- there is at least one line to show (3b);
- the recipe and the household's lists came from the server in this session,
  as cooking already requires (`cookReadiness`). While they load, the button
  shows *Loading…*; if the read failed, *Couldn't load. Try again*, as the
  cook button does.

The day after, the button is gone. Section 3e says why.

### 3b. The sheet

The cook's confirm sheet (`ConfirmSheet` in `cook-flow.tsx`), in a second
mode. Same rows, same minus and plus, same ticks, same *Not counted* list.

```
Change what was used
Rendang. Only the difference is added to or taken off what's at home.

(x) Daging sapi                [ − ]  600 g  [ + ]
    1,4 kg left
(x) Santan                     [ − ]  400 ml [ + ]
    600 ml left
( ) Bawang merah               [ − ]  100 g  [ + ]     (was not counted)
    250 g left

Not counted
garam secukupnya · 2 sdm minyak

[ Save changes                              ]
```

The lines, from a new pure function `changeLines(dish, recipe, items,
forStaff)` in `src/lib/menu.ts`:

1. Every ingredient this dish's cooking took off (`cooked_uses`), **ticked**,
   at the amount the person said last time (`said`, section 6).
2. Every other line of the recipe that could come off stock now (`cookLines`
   at the dish's servings), **unticked**, at the recipe's amount. These are
   the ones the cook unticked.
3. Order: the recipe's order, then anything in 1 that the recipe no longer
   lists.

Not shown: an ingredient that was deleted since, is no longer tracked, or
whose unit was changed to one that does not convert (g to buah). The server
leaves those entries exactly as they are.

- The grey line under the name is what is at home **now**, as on the cook
  sheet.
- **Save changes** is disabled until something differs from how the sheet
  opened.
- Unticking everything is allowed: it all goes back and the dish stays
  cooked. *Mark not cooked* is still the owner's way to un-cook a dish.
- After saving, the sheet closes. Toast: *Rendang · ingredients updated*,
  with **Undo** for 8 seconds (which sends the previous amounts back the same
  way). *Any leftovers?* is not asked again.

### 3c. What saving does to the stock

Only the difference, per ingredient:

| Before | Now | What happens |
|---|---|---|
| 500 g | 700 g | 200 g more comes off. |
| 500 g | 300 g | 200 g goes back. |
| 500 g, ticked | unticked | 500 g goes back. |
| unticked | 100 g, ticked | 100 g comes off, as in cooking. |
| 500 g | 2 kg, with 1 kg at home | 1 kg comes off (never below zero, as cooking); the item is Out. |

An ingredient whose amount was not changed on the sheet is never written,
whatever else was changed.

One case needs a rule of its own. If cooking asked for 500 g when only 300 g
was on record, 300 g came off and the entry remembers that 200 g was
**missing**. That 200 g stays out of every later sum, so a change never
takes it from stock that was bought since:

- saying 600 g takes 100 g more (if it is there);
- saying 400 g puts 100 g back;
- going back to 500 g ends exactly where it started, which is also what
  **Undo** on the toast does.

In words: what should be off the stock is what the person now says, less
what was missing when it first came off.

**One known limit.** If a *change* (not the cooking) asks for more than is at
home, it takes what is there, as the last row of the table says. Undo, or
changing it back, returns exactly that. But if more of that ingredient is
bought later the same day and the same ingredient is changed again, the
change takes the rest then. It needs three things in one day (a change that
ran out, a purchase, a second change of the same line), and closing it would
mean a second remembered number per line. The plan accepts it.

### 3d. When it cannot save

All four are toasts; the sheet closes and the menu is read again.

| Case | English | Bahasa Indonesia |
|---|---|---|
| Another phone changed the same dish while this sheet was open | Changed on another phone. Open it again. | Sudah diubah di HP lain. Buka lagi. |
| An owner marked it not cooked meanwhile | This dish was marked not cooked. | Masakan ini sudah ditandai belum dimasak. |
| More than a day has passed (a phone left open overnight) | A day has passed. Change the amount on the ingredient itself. | Sudah lewat sehari. Ubah jumlahnya langsung di bahannya. |
| No signal, or anything else | Not saved yet. Try again. | Belum tersimpan. Coba lagi. (as cooking) |

Like cooking, a change needs a signal. A retry after a weak signal is safe:
the phone sends the whole list, never a difference, so sending it twice
changes nothing the second time.

### 3e. Why only that day

- By the next day the stock has moved on: things were bought, counted, used
  for other dishes. The honest place to fix an old number is the ingredient
  itself (plus, minus, *Set amount*), which shows what is there now.
- The person who cooked remembers today, not last Tuesday.
- A short window keeps the learning in section 4 clean: a recipe learns from
  what the cook said on the day.

The screen's rule is "today on this phone". The server's rule is a backstop:
it refuses a change more than **30 hours** after `cooked_at`. A day is at
most 24 hours; the margin covers phones in WITA and WIT and a clock that is a
little off, so the server never refuses a tap the screen offered.

## 4. Recipes that learn

### 4a. The rule

For one recipe and one of its ingredients:

- the ingredient is a tracked item, linked by **exactly one** line of the
  recipe, with an amount and a unit that converts (the lines cooking can
  take off);
- look at the dishes cooked from this recipe **since the recipe was last
  saved**, newest first, and keep those where this ingredient came off with
  both numbers on record: what the recipe asked for at the servings cooked
  (`planned`) and what the person said was used (`said`, after any change
  that day);
- if the **newest three** were all at least **10% more** than the recipe
  asked, or all at least **10% less**, there is a suggestion.

The suggested amount is the recipe's amount times the middle one of the three
ratios, rounded so it reads like a recipe:

| Unit of the recipe's line | Rounded to |
|---|---|
| g, ml | 5 below 100; 10 from 100 to 999; 50 from 1,000 |
| kg, L | 0.05 |
| anything counted (pcs, buah, butir, siung, …) | 1, and never below 1 |

If the rounded amount equals the recipe's, there is no suggestion.

What never counts: a line the cook unticked (that says "not from this stock",
not "a different amount"); dishes cooked before this phase or by a phone
still on the old version (no `planned` on record); an ingredient the owner
already said **Keep** for (4c).

Three and 10% are two constants in one file (`HINT_COOKS`,
`HINT_MIN_CHANGE`). Fewer than three is one big family dinner; more than
three takes months for a dish cooked every other week.

Worked out on the owner's phone by a pure function `recipeHints(recipes,
cooked, items)` in a new `src/lib/recipe-hints.ts`. No new database function:
the phone reads the household's cooked dishes of the last 120 days (owners
may already read `menu_dishes`; at most 300 rows; `id, recipe_id, cooked_at,
cooked_uses`). Staff phones never run it.

### 4b. The offer (owners only)

One card, in two places the owner already goes:

- **Kitchen → Menu**, above the week. One card at a time: the recipe cooked
  most recently comes first.
- **The recipe's own sheet**, above its ingredients, also when opened from a
  dish.

```
Rendang
The last 3 times, this used a different amount than the recipe says.

Daging sapi    recipe 500 g · used about 600 g
Santan         recipe 400 ml · used about 300 ml

[ Update recipe ]   [ Keep recipe ]
```

- A neutral card (border, no tint; it is not urgent). Icon: `Scale`, the one
  Track amount uses. No sparkle: this is arithmetic, not Kakak.
- Both buttons are `rounded-xl` action buttons. All the recipe's suggested
  ingredients are in the one card and answered together.
- Staff never see the card. After **Update recipe** they read the new amount,
  as after any recipe edit.

### 4c. The two answers

- **Update recipe** saves the recipe with those lines' amounts replaced,
  through the save that exists (`save_recipe`, which takes the whole recipe;
  a small `payloadOfRecipe(recipe)` beside `payloadFrom` builds it, and only
  from a recipe list that came from the server). Toast: *Rendang updated*,
  with **Undo** (saves the old amounts back). Saving moves the recipe's
  `updated_at`, so the count starts again from zero.
- **Keep recipe** remembers those ingredients on the recipe (`hints_off`,
  section 6). Toast: *Recipe kept. Miamus won't suggest this again.* The
  card never comes back for those ingredients of that recipe.

That is what "offer once" means here: **Keep** is final for that ingredient;
**Update** starts a fresh count, so a new suggestion needs three new dishes
that all differ from the *new* amount.

Any other edit of the recipe (a typo in the steps) also starts the count
again. That is on purpose: after an edit, old dishes may have been cooked
from different amounts, and a suggestion built on them could be wrong. A
wrong suggestion is worse than a late one.

Miamus never changes a recipe by itself.

## 5. Small fixes carried from Phase 176

1. **Undo of cooking brings back the date** (the accepted Later item). When
   cooking uses the last of an ingredient it goes Out, and an Out item has no
   date (migration 154). The dish's entry now remembers the date it cleared.
   *Undo* and *Mark not cooked* put the date back with the amount, if the
   item has no date by then. The same holds for *Change what was used* when
   it puts some back.
2. **A tap on the outlined place confirms it.** An ingredient nobody has
   placed shows under its default (Fridge or Cupboard) with nothing stored,
   so Kakak says its place "hasn't been noted yet". On the ingredient's
   sheet, while nothing is stored, a tap on the outlined place now saves it
   (`tapSelected`, as the add form already does). No toast and no freezer
   line: nothing on screen changes.
3. **Add ingredient: amount 0 is the same as blank.** Today 0 saves the item
   as tracked and Out, which silently clears the date just chosen.
4. **The staff tip of Phase 176**, third line, says *Ketuk Buka*, but that
   button is only in Dapur → Makanan. New line: *Di Dapur → Makanan, kalau
   makanan yang ditambahkan sudah ada di Bahan masakan, ketuk Buka untuk
   mencatatnya di sana.*

Not fixed here: a tap on **Out** by mistake still loses the date, because a
status tap has no Undo today. That is item 4 in *Later*.

## 6. Data model: migration 156

Additive only. One column, one new function, two functions re-created from
their newest definition (153) with the same signatures. No new table, no new
policy, no change to RLS.

### 6a. `recipes.hints_off`

```sql
alter table public.recipes
  add column if not exists hints_off uuid[] not null default '{}';
alter table public.recipes drop constraint if exists recipes_hints_off_size;
alter table public.recipes add constraint recipes_hints_off_size
  check (cardinality(hints_off) <= 200);
```

The ids of the items the owner said **Keep** for. Written by owners with an
ordinary update, under the policy that exists (`admin_update_recipes`,
`is_household_admin`). Staff phones cannot write it. `save_recipe` names its
columns, so it leaves the column alone; an old app version never sends it. An
id of an item deleted later is harmless.

### 6b. What a `cooked_uses` entry holds

`menu_dishes.cooked_uses` stays a jsonb array, written only by the cooking
functions (the trigger of 153 refuses every other writer). An entry gains
four optional keys:

| Key | Meaning |
|---|---|
| `item_id`, `unit` | As now. |
| `amount` | As now: what came off stock, which is what Undo puts back. May now be 0 (nothing was there). |
| `said` | What the person confirmed, in the item's unit. Equal to `amount` unless the stock ran out. An entry without it (cooked before 156) reads as `amount`. |
| `short` | What was missing when the ingredient first came off for this dish: `said − amount` at that moment. Written once, when the entry is created, and never changed. Absent means 0. |
| `planned` | What the recipe asked for at the servings cooked, in the item's unit, as the phone sent it. Null when the phone did not send it. |
| `cleared_date` | The date the item had when this dish emptied it. Absent otherwise. |

### 6c. `cook_menu_dish` (re-created, same signature)

As 153, plus:

- each line of `p_uses` may carry `planned`: null, or a number above 0 and at
  most 100,000 (`bad_amount` otherwise). Lines of one item are summed, and
  `planned` is converted with the line's unit, exactly as `amount` is;
- an entry is written for **every** line sent, also when nothing was there to
  take (`amount` 0), with `said`, `planned` and, when less came off than was
  said, `short`;
- if the item had a date before the update and has none after (it went Out),
  the entry gets `cleared_date`.

An old phone sends no `planned`; everything else behaves as today. A new
phone talking to a database before 156 sends a key the old function ignores.

### 6d. `uncook_menu_dish` (re-created, same signature)

As 153, plus: an entry with `amount` 0 is skipped; when an entry has
`cleared_date` and the item has no date now, the date goes back in the same
update as the amount.

### 6e. `change_cooked_uses` (new)

```sql
change_cooked_uses(
  p_dish_id uuid,
  p_uses jsonb default '[]'::jsonb,     -- the whole new list, as cook_menu_dish takes it
  p_staff_id uuid default null,
  p_was jsonb default null              -- cooked_uses as the phone read it
) returns jsonb                         -- { dish, items }, as cook_menu_dish
```

**Security**, the same as `cook_menu_dish` and for the same reason:

- `security definer`, `set search_path = ''`;
- `revoke all … from public, anon;` then `grant execute … to authenticated,
  service_role;` in the same migration;
- **deliberately open to staff phones**: the check is household membership
  (`get_user_household_ids()`), the documented exception to the admin guard.
  It changes only the dish's `cooked_uses` and the quantity (and, when
  restoring, the date) of the household's own tracked items, all of which a
  staff phone may already change. Say so in the migration's header, as 153
  does;
- the staff id is null or a non-archived member of the dish's household.

**Checks, in order** (each refusal by name, as the phone matches on it):

1. Signed in; the dish exists in one of the caller's households (`not_found`).
   The dish row is locked.
2. The dish is cooked (`not_cooked`, 55000).
3. `cooked_at` is at most 30 hours ago (`too_late`, 55000).
4. `p_was`, when given, equals `cooked_uses`, compared as jsonb, a null on
   either side read as an empty list (`changed_elsewhere`, 55000). The phone
   sends the array exactly as it read it.
5. The staff id (`staff_not_in_household`); `p_uses` is an array of at most
   200 lines (`bad_uses`); every amount above 0 and at most 100,000, one unit
   per item (`bad_amount`, `unit_mismatch`).

**Then, for every item in the old entries or in `p_uses`, in item id order**
(the order `cook_menu_dish` locks in, so the two never deadlock):

1. Lock the item. If it is gone, no longer tracked, or the old entry's unit
   no longer converts to the item's unit: refuse if `p_uses` names it
   (`item_not_tracked`, `unit_mismatch`); otherwise keep the old entry as it
   is and go on.
2. In the item's unit now: `took` (the old `amount`, 0 without an entry),
   `said_before` (the old `said`, or `amount`; 0 without an entry), `short`
   (the old `short`, or 0), `want` (the new amount, 0 when the item is not in
   `p_uses`).
3. `want = said_before`: the person did not change this ingredient. The item
   is not written and the entry stays as it is.
4. Otherwise `target = greatest(want − short, 0)`: what should be off the
   stock now.
   - `target < took`: add `took − target` to the quantity; `amount` becomes
     `target`. If the entry has `cleared_date` and the item has no date, put
     the date back and drop the key.
   - `target > took`: take `least(quantity, target − took)`; `amount` grows
     by what was taken. If that emptied a dated item, set `cleared_date`.
   - equal: the item is not written.
5. `want > 0`: the entry is kept with `said = want`, the item's unit, `short`
   as it was, and `planned` (the old one, converted; else the one the phone
   sent). A **new** entry (no old one) gets `short = want − amount` when that
   is above 0. `want = 0`: the entry is removed.
6. Every item written gets `amount_set_by = p_staff_id`. The amount-rules
   trigger does the rest (status, `amount_set_at`, the Out rule), as for any
   amount change.

Why this shape: for one entry, what is off the stock depends only on what the
person says now and on `short`, which never moves. So changing an amount and
changing it back, or Undo, returns exactly what the change took or gave,
also when the cooking or the change ran the stock out. The one exception is
the known limit in 3c.

`cooked_at` and `cooked_by` are not touched: the cook stays the cook.

### 6f. The app's twins

- `CookedUse` (`src/types/database.ts`) gains `said?`, `short?`, `planned?`,
  `cleared_date?`; `Recipe` gains `hints_off?`.
- `CountedLine` gains `planned` (the recipe's amount before the person's
  taps); `usesFrom` sends it.
- A pure `applyUsesChange(dish, uses, items, staffId, now)` in
  `src/lib/menu.ts` holds the rules of 6e. The demo data (`mock-provider`)
  and the browser tests' stub (`tests/e2e/stub-backend.ts`) both call it, so
  there is one copy to keep in step with the SQL, and it is unit-tested.
- The same two places mirror `cleared_date` in their cook and un-cook.
- Data provider (both, in PR 1, so PR 3 adds none):
  `changeCookedUses(id, uses, staffId, was)`; for section 4,
  `listCookedDishes()` and `setRecipeHintsOff(recipeId, itemIds)`.
  `menu-store`: `changeDishUses`, which replaces the dish and hands the
  changed items to `applyInventoryRows`, as `cookDish` does.

### 6g. Export and privacy

- **Export:** `export_household_data` already writes `cooked_uses` as it is
  and whole rows of `recipes`, so the new keys and `hints_off` are in the
  export. Check this in the migration's test.
- **Privacy:** my reading is that no policy change is needed. The policy
  already says the menu holds "the ingredients that cooking took off the
  list" and that item amounts record "when and by whom the amount was last
  changed". The new numbers are of that kind; there is no new "who did it"
  column, no new service, nothing sent to Kakak, same region. I was wrong on
  this once in Phase 176, so the manager should confirm; the policy and
  `legal.ts` are the manager's files.

## 7. Staff view

Bahasa Indonesia only, no prices (there are none on these screens).

- *Menu hari ini* → a cooked dish → **Ubah bahan yang dipakai**, until the
  end of that day. Any staff phone, not only the one that cooked.
- The sheet is the one they already use for *Sudah dimasak*.
- New reading for staff: the button, the sheet's title and one line under
  it, **Simpan perubahan**, the toast, and the three messages of 3d. Nothing
  else.
- Staff never see recipe suggestions and still cannot edit recipes or mark a
  dish not cooked.

## 8. Words

New glossary rows, to add to `docs/indonesian-glossary.md` (the manager's
file) in the first PR. Words not listed are on screen today and reused as
they are (*Bahan yang dipakai*, *Tidak dihitung*, *Sisa …*, *Batalkan*,
*Simpan perubahan*, *Belum tersimpan. Coba lagi.*).

| English | Bahasa Indonesia | Where |
|---|---|---|
| Change what was used | Ubah bahan yang dipakai | The button on a cooked dish, and the sheet's title. Owners and staff. |
| {dish}. Only the difference is added to or taken off what's at home. | {dish}. Hanya selisihnya yang ditambah atau dikurangi dari stok di rumah. | Under the title. |
| {dish} · ingredients updated | {dish} · bahan diperbarui | Toast, with Undo / **Batalkan**. |
| Changed on another phone. Open it again. | Sudah diubah di HP lain. Buka lagi. | Toast. "HP", never "ponsel". |
| This dish was marked not cooked. | Masakan ini sudah ditandai belum dimasak. | Toast. |
| A day has passed. Change the amount on the ingredient itself. | Sudah lewat sehari. Ubah jumlahnya langsung di bahannya. | Toast. |
| The last 3 times, this used a different amount than the recipe says. | 3 kali terakhir, jumlah yang dipakai berbeda dari resepnya. | The suggestion card. Owners. |
| recipe 500 g · used about 600 g | resep 500 g · dipakai sekitar 600 g | One line per ingredient on the card. |
| Update recipe / Keep recipe | Perbarui resep / Biarkan resep | The card's two buttons. |
| {recipe} updated | Resep {recipe} diperbarui | Toast, with Undo / **Batalkan**. |
| Recipe kept. Miamus won't suggest this again. | Resep tidak diubah. Miamus tidak akan menyarankan ini lagi. | Toast after Keep recipe. |

No emoji. Icons: `SlidersHorizontal` on the new button, `Scale` on the card.

## 9. Kakak

Nothing changes: no new tool, no new line in the household block, so the
strict-schema totals do not move and nothing new is sent to Anthropic. Kakak
changing what a dish used ("the rendang took 700 g") is item 6 in *Later*.

## 10. Later (not in this version)

1. Typing an amount on the sheet (a tap on the number), for a big
   difference. Today 500 g to 1.2 kg is fourteen taps.
2. Adding an ingredient the recipe does not list on the change sheet. Until
   then it is taken off in Food → Ingredients.
3. *Tandai belum dimasak* for staff on the same day (the wrong dish tapped).
   The server already allows it; only the button is the owner's.
4. Undo on a status tap, so **Out** tapped by mistake brings back the amount
   and the date.
5. The suggestion in Today's *Waiting for you* or the evening summary, if the
   Menu card proves too easy to miss.
6. Kakak changing what a dish used, and mentioning a suggestion.
7. A change after the day has passed.
8. A dish's history: what each cooking of a recipe used.

Phase 176's own *Later* list still stands as written there.

## 11. Build: small PRs

| PR | What | Files | Runs |
|---|---|---|---|
| **1. Foundation** | Migration 156 and its test. Types. `usesFrom` sends `planned`. `changeLines` and `applyUsesChange`, with unit tests. Both data providers, the store, the browser tests' stub, and the date mirror in their cook and un-cook. The glossary rows of section 8. | `supabase/migrations/156_*.sql`, `supabase/tests/156_*.sql`, `src/types/database.ts`, `src/lib/menu.ts`, `src/lib/menu-store.ts`, `src/lib/data/*`, `tests/e2e/stub-backend.ts`, `tests/unit/menu.test.ts`, `docs/indonesian-glossary.md` | First. Nothing visible changes. |
| **2. Change what was used** | Section 3 and the staff view. | `cook-flow.tsx`, `dish-sheet.tsx`, `menu-today-card.tsx`, `menu-view.tsx`, new `tests/e2e/kitchen-cook-change.spec.ts` | After 1. |
| **3. Recipes that learn** | Section 4. | new `src/lib/recipe-hints.ts` and `tests/unit/recipe-hints.test.ts`, a small hook, a new `recipe-hint-card.tsx`, `menu-view.tsx`, `recipe-detail-sheet.tsx`, `recipes-store.ts`, new `tests/e2e/kitchen-recipe-hints.spec.ts` | After 2 (both touch `menu-view.tsx`). |
| **4. Small fixes** | Section 5, items 2 and 3. | `ingredient-where-when.tsx`, `inventory-item-form.tsx`, and their two browser specs | Any time; shares no file with 1 to 3. |
| **5. Telling people** | A What's new card for owners (EN and ID), a staff tip (ID), and the corrected Phase 176 tip line (section 5, item 4). | `src/lib/whats-new.ts` (a shared file: the manager's, or one executor at a time) | Last. |

Every PR: `tsc`, the unit tests, the build, its own browser tests, `@codex
review` until clean. Merges and database steps are the manager's, on the
owner's OK. The migration goes local, then staging, then production; PR 1
merges after it is on production, as 154 did.

### Tests

- **SQL** (`supabase/tests/156_*.sql`):
  - a staff session and an owner can change a dish; a second household
    cannot; `anon` cannot execute any of the three functions;
  - more comes off, less goes back, untick puts all back, a new tick takes
    off; never below zero;
  - the 300-of-500 case of section 3c: 600 takes 100 more, 400 puts 100
    back, and back to 500 leaves the stock and the entry as they were, also
    when stock was bought in between;
  - a change that runs the stock out, then the previous list sent again (the
    toast's Undo): exactly what the change took comes back;
  - an ingredient whose amount is unchanged is not written, though another
    line changed;
  - the same list sent twice changes nothing the second time;
  - `p_was` that no longer matches is refused; a dish not cooked is refused;
    a dish cooked 31 hours ago is refused;
  - an untracked or deleted item's entry is kept untouched, and naming it is
    refused;
  - cooking the last of a dated item stores `cleared_date`; un-cook puts the
    date back; un-cook leaves a date someone set meanwhile; a change that
    puts some back restores the date;
  - `cooked_at` and `cooked_by` do not move; a direct update of `cooked_uses`
    by an owner is still refused;
  - a staff session cannot write `recipes.hints_off`; 201 ids are refused;
  - the export holds `said`, `planned` and `hints_off`.
- **Unit:** `changeLines` (ticked from the dish, unticked from the recipe,
  hidden when untracked or the unit no longer converts); `applyUsesChange`
  (every row of the table in 3c, the 300-of-500 round trip, a change that
  runs out and its Undo, the date);
  `recipeHints` (three more, three less, two is not enough, a mixed third
  breaks it, exactly 10%, an unticked dish is skipped, two lines for one
  item, `hints_off`, dishes before the recipe's `updated_at`, the rounding
  table, a rounded amount equal to the recipe's).
- **Browser, owner (EN):** cook, open the dish, change one amount up and one
  down, save, the stock shows only the differences; Undo; untick everything;
  the button is gone on a dish cooked yesterday; another phone's change is
  refused with its message; three cooks at plus 20% show the card on Menu and
  on the recipe; *Update recipe* changes the amount and the card goes; *Keep
  recipe* and the card never returns; a cooked dish with no recipe, or with
  nothing that can come off stock, shows no button.
- **Browser, staff (ID):** the button and the sheet in Indonesian; a staff
  phone changes a dish another staff member cooked; no card; no English.
- **Not changed, must still pass:** `kitchen-menu.spec.ts`,
  `kitchen-recipes.spec.ts`, `kitchen-amounts.spec.ts`,
  `kitchen-places.spec.ts`, `kitchen-add-ingredient.spec.ts`,
  `sheet-back.spec.ts`, `weak-signal.spec.ts`.

## 12. Release

After Sunday's demo, staging first. PRs 1 and 2 are the owner's request and
can go to production without waiting for 3; PR 4 can go whenever it is
ready.

### Seven checks on a phone

1. Cook a dish, open it, **Change what was used**, raise one amount: only
   the extra comes off.
2. Lower one and untick one: both go back.
3. **Undo** on the toast puts it as it was.
4. On a staff phone: the same in Indonesian, on a dish someone else cooked.
5. A dish cooked yesterday has no button.
6. Cook the last of an ingredient that has a date, then **Undo**: the date is
   back.
7. Cook one recipe three times, each with about a fifth more of one
   ingredient: the card shows on Menu. **Update recipe** changes the amount.

## 13. Open questions for the owner

None block the build. The defaults stand unless the owner says otherwise.

1. A change is possible until the end of the day the dish was cooked
   (recommended), rather than for longer.
2. Staff may change what was used, on any dish cooked that day
   (recommended: yes; they cook, and they know what went in).
3. A suggestion needs three dishes in a row, each at least 10% off
   (recommended).
4. **Keep recipe** is final for that ingredient (recommended), rather than
   asking again after three more dishes.
