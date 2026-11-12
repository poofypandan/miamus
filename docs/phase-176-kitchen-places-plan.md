# Phase 176 — Kitchen: where ingredients are and when they expire

Design, 12 Nov 2026. Docs only: nothing here is built yet. The phase number
and the migration number (154 is the next free one today) are the manager's
to confirm.

## 1. The problem, in the owner's words

An owner who cooks added raw chicken with the big **Add food** button,
because that sheet lets her say *freezer* and a date. It landed under
**Later** in *Ready to eat*. The same chicken was already under
**Ingredients** ("6 pcs left"), where she could not say where it is or when
it expires. So: one chicken, two rows, and neither row is complete.

What she asked for:

- ingredients say **where** they are and **when** they expire, with an
  amount;
- she can **move** an ingredient between places (freezer to fridge);
- one thing is never listed twice.

## 2. What we build (the tight first version)

1. An ingredient gets a **place** (Fridge, Freezer, Cupboard, Counter) and an
   optional **expiry date**. Amount already exists (Track amount); it can now
   be given when the ingredient is added.
2. The Ingredients list is grouped **by place**, with **Use soon** on top.
3. Tapping an ingredient shows its place as four buttons. Tapping another one
   **moves** it, with Undo. Taking something out of the freezer asks for the
   new date.
4. The add sheets say so when the name is **already in Ingredients**, and open
   that ingredient instead.
5. Kakak puts ingredients away with a new suggestion, and stops using
   *add_food* for raw ingredients.

Everything else is in section 12, *Later*.

### What does not change

- Two tables stay: `food_items` (ready-to-eat food, finished once eaten) and
  `inventory_items` (things the home keeps buying). Recipes, cooking, To buy,
  purchases and Kakak's shopping tool all point at `inventory_items`; merging
  the tables would break every one of them for no gain the cook can see.
- Shown only while **Kitchen amounts** and **Food at home** are both on
  (`ingredientsUnderFood`), like the Ingredients section itself. A home with
  either switch off sees no change at all.
- No new required field. Place has a default; date and amount are optional.
- No prices anywhere: none of these tables or screens holds money.

## 3. One list or two

**Recommendation for this version: keep two sections** (*Ready to eat*, then
*Ingredients*), and organise Ingredients by place.

Why not one merged list now:

- It is a rebuild of the screen staff use every day, two days before a family
  demo, and the stop rule says no new reading for staff.
- The two kinds behave differently when tapped (Eaten · Given away · Thrown
  away, against Enough · Running low · Out). One list hides that until the
  tap.
- Her problem is that ingredients lacked details, and that is fixed without
  it.

Where I disagree with the framing "leftovers on top, ingredients below": a
cook planning meals asks *what do I have, and what must go first*, whatever
its kind. If she still hesitates between the two add buttons after a week
with this version, the next step is one list by place with a shared *Use
soon* strip (section 12, item 4). That is a decision to take on evidence, not
tonight.

## 4. Data model and migration

One migration (154 if still free). Additive only.

```sql
-- 1. Two nullable columns on inventory_items.
alter table public.inventory_items
  add column if not exists kept_in text,
  add column if not exists expires_on date;

alter table public.inventory_items drop constraint if exists inventory_items_kept_in_check;
alter table public.inventory_items add constraint inventory_items_kept_in_check
  check (kept_in is null or kept_in in ('fridge', 'freezer', 'pantry', 'counter'));

-- 2. stamp_inventory_stock_status(): re-created from its NEWEST definition
--    (migrations/153), unchanged except one rule, for INSERT and UPDATE
--    alike:
--      if new.stock_status = 'out' then new.expires_on := null; end if;
--    The function has two exits (the INSERT branch returns early), so the
--    rule goes before each `return new`, after the status is settled.
--    Keep 153's revoke from public, anon, authenticated.
```

Rules:

- **`kept_in`** uses the same four values as `food_items.kept_in`
  (`FoodPlace`). Null means nobody has said. The app then shows the default
  for the category (Fresh Food in the Fridge, Pantry in the Cupboard) without
  storing it. The first move writes it.
- **`expires_on`** is the earliest date among what is there. Null means no
  date.
- **An item that is Out has no date.** The trigger clears it, so a date from
  the last pack never comes back when the item is bought again. This also
  covers cooking that uses the last of something and a tap on Out.
- **Who may write them:** owners and staff phones. Putting shopping away and
  taking chicken out to thaw is kitchen work. So `inventory_items_owner_guard`
  is **not** changed: the two columns are deliberately left out of its
  owner-only list. Say so in the migration's header. Staff still cannot add,
  rename or delete items, or change tracking, units or low levels.
- **No new function, no SECURITY DEFINER, no new policy.** RLS on
  `inventory_items` is unchanged.
- **Nothing is backfilled.** Existing rows keep `kept_in` null and no date.
- **Old app versions** (a cached PWA) never send the two columns, so their
  writes leave them alone.
- **Export:** `export_household_data` takes whole rows of `inventory_items`,
  so the columns are in the export already. Check this in the migration's
  test rather than trusting this sentence.
- **Privacy:** no new kind of personal data (a place and a date of an
  ingredient; no new "who did it" column), no new service, same region. No
  privacy-policy change is needed. If a reviewer disagrees, the policy and
  `legal.ts` are the manager's files.

Rollout: local, then staging, then production, each on the owner's OK, as
`docs/handoff-2026-11-07.md` says. `supabase/tests/154_*.sql` covers: the
check refuses `'garage'`; a staff session can update `kept_in` and
`expires_on` but still cannot change `name` or `track_amount`; status to Out
clears the date (by a tap, and by an amount reaching 0 on a tracked item);
a second household cannot read or write them; the export holds both columns.

### Types and rules in the app

- `InventoryItem` gains `kept_in?: FoodPlace | null` and
  `expires_on?: string | null` (optional, as rows cached by an older build
  lack them).
- `InventoryItemInput` gains both as optional; `InventoryItemPatch` already
  covers them through it.
- `applyAmountRules` (lib/kitchen-units.ts) mirrors the new rule, so the demo
  data and the screen clear the date at once when an item goes Out.
- New pure file `src/lib/ingredients.ts`, unit-tested:
  - `defaultPlace(category)`: `fresh_food` is `fridge`, `pantry` is `pantry`;
  - `placeOf(item)`: `item.kept_in ?? defaultPlace(item.category)`;
  - `isUseSoon(item, today)`: not Out, has a date, 7 days or fewer left
    (past dates included);
  - `groupIngredients(items, today)`: `soon`, then `fridge`, `freezer`,
    `counter`, `pantry`. Each item is in exactly one group. `soon` is sorted
    by date; the place groups keep today's order (Out, Running low, then
    name);
  - `ingredientExpiryText(days, locale)`: the words in section 9;
  - `sameName(a, b)`: trimmed, lower-cased, inner spaces collapsed.
- Two actions on the household context, both through the existing
  `writeInventoryItem` (the screen updates first, the server's row replaces
  it): `setIngredientPlace(id, place)` and `setIngredientExpiry(id, date |
  null)`. Each sends only its own column, so two phones changing different
  facts never overwrite each other.
- A third action for ready-to-eat food, `moveFood(id, place)`, which sends
  only `kept_in` through `updateFoodItem`. `editFood` sends the whole form
  and would overwrite a portion another phone took in the meantime.

## 5. Screens

All words are in section 9. Sketches are 375px wide.

### 5a. Food, the Ingredients section

```
Ingredients                                   (text-base, as part A)
Fresh food and pantry
[ +  Add ingredient                        ]  (full width, outline; owners)

Use soon
  Dada Ayam                          2 pcs left
  Fridge · Expires tomorrow                    (amber)
  Santan                             Running low
  Fridge · 2 days past date — check first      (red)

Fridge
  Telur                             12 butir left
  Tomat
Freezer
  Daging sapi                        1 kg left
  Expires in 40 days
Counter
  Bawang merah
Cupboard
  Beras                             Running low
  Minyak goreng
```

- Group headings are small grey `h3`s, as `ItemList` already draws its Pets /
  Home headings. An empty group is not shown.
- A row keeps what it has today (photo or icon, name, amount or status on the
  right). New: one muted line under the name, only when there is something to
  say. In *Use soon* it is the place and the date; in a place group it is the
  date, if any.
- Colour, as food rows: red once past the date, amber for today and tomorrow,
  grey otherwise.
- An item that is Out stays in its place group, as now, with no date.
- Build this as a new `IngredientList` beside `ItemList`. `ItemList` keeps
  serving Shopping's *Supplies at home* and the staff's Belanja, unchanged.

### 5b. The ingredient's sheet (tap a row)

`StockStatusSheet`, for an ingredient while the feature is on. The staff's
main job stays first; the new blocks follow it.

```
Dada Ayam
Fresh Food · Fridge · Expires tomorrow        (the sheet's small line)

[ −  ]   2 pcs   [ + ]     Set amount         (tracked items, as now)
[ Enough ] [ Running low ] [ Out ]            (as now)

Where is it kept?
[ Fridge ] [ Freezer ] [ Cupboard ] [ Counter ]     (current one outlined)

Expires
( Today ) ( Tomorrow ) ( 3 days ) ( 1 week ) ( Pick a date ) ( No date )

Track amount  ·  Edit item                    (owners, as now)
```

- **Moving:** a tap on another place saves at once. The sheet stays open.
  Toast: *Dada Ayam · moved to Fridge*, with **Undo** (which puts back the
  place and the date as they were).
- **Out of the freezer** (the place was Freezer and is now anything else):
  a line appears above the date chips, *Out of the freezer. When does it
  expire now?* No date is filled in. The app never writes a date nobody gave;
  that is the rule for food already.
- **Into the freezer** with a date set: a line under the chips, *In the
  freezer it keeps longer. Tap No date if the old date no longer applies.*
  The date is not cleared for her: a frozen pack often has a printed date
  that is still right.
- **Date chips** save at once. *Pick a date* shows the date field and saves
  when a date is chosen. The chip that matches the stored date is selected.
- The date block is hidden while the item is Out.
- The sheet scrolls (`max-h-[92dvh] overflow-y-auto`), as the food sheets do.
- The same four-button block goes on the **ready-to-eat** food's detail sheet
  (`FoodDetailSheet`), saving through `moveFood`, so moving leftover rendang
  from the freezer to the fridge works the same way. Its date still lives in
  Edit food.

Build the four buttons and the chips as two small shared components
(`PlacePicker`, `ExpiryChips`). `food-form-sheet.tsx` keeps its own copies
for now; folding them in is a later tidy-up, to keep this change small.

### 5c. Add ingredient (owners)

`InventoryItemForm`, when opened from Ingredients. Fields, top to bottom:

1. **Name** (as now).
2. **Category** (as now: Fresh Food · Pantry · Household Supplies).
3. **Where is it kept?** The four buttons. Starts on the category's default
   and follows the category until she taps one.
4. **Expires.** The same chips; starts on *No date*.
5. **Amount (optional).** A number and the unit chips Track amount uses. Left
   blank, the item is saved as today (not tracked). With a number, it is
   saved tracked, with that amount and unit: one sheet instead of two.
6. **Reference photo** (as now).

Editing an ingredient shows place and date too. Amount stays in Track amount
when editing, so a number has one place to change. Items in Household
Supplies, and everything opened from Shopping, show the form as it is today.

### 5d. No double entries

- **Add ingredient:** as the name is typed, if an ingredient with the same
  name exists (`sameName`), a line under the field says *Dada Ayam is already
  in Ingredients.* with a button **Open it**. That closes the form and opens
  the ingredient's sheet. Save still works: two packs under one name are
  sometimes wanted, and a hard stop would be a new way to get stuck.
- **Add ready-to-eat food** (owners and staff): the same check against
  ingredients. *Dada Ayam is in Ingredients. Open it there to say where it is
  or when it expires.* with **Open it** where the Ingredients list is on the
  page (Kitchen → Food). In the staff's *Makanan masuk* sheet and the
  leftovers step there is no list to open, so the line shows without the
  button.
- Exact names only. A near match ("Ayam" against "Dada Ayam") says nothing:
  a wrong warning is worse than none.

## 6. Drag, swipe or tap

**No drag, no swipe. One tap on the place.**

- On a phone a row that can be dragged fights with scrolling the list and
  with pull-to-refresh. Nothing on the row says it can be dragged.
- A long list means dragging chicken past twenty rows to reach *Fridge*.
- Staff would have to learn a gesture; the stop rule says no new reading for
  staff, and a hidden gesture is worse than reading.
- A swipe action is a new pattern in an app that has none, and it is as
  hidden as drag.

Tap the item, tap *Fridge*: two taps, the same on every phone, with Undo.
Moving out of the freezer then asks for the new date, which a drag could not
do without opening a sheet anyway.

**Moving part of an item** (2 of 6 pieces to the fridge) is not in this
version. The whole item moves. In practice the two pieces are cooked that
day and come off the amount through *Cooked*; tracking a thaw that lasts a
few hours is work for nobody's benefit. If she asks for it, it is item 3 in
*Later*.

## 7. Existing items, and the double Dada Ayam

- Every ingredient keeps working with no place stored and no date. It shows
  in its category's default place until someone moves it.
- Nothing is converted or merged by the migration. A script that guessed
  which food rows are "really" ingredients would be guessing with someone's
  food.
- **The double Dada Ayam, by hand, once** (four taps, after go-live):
  1. Food → Ingredients → Dada Ayam → **Freezer**.
  2. Set its date there, if the pack has one.
  3. Food → Ready to eat → Dada Ayam → **Delete** (owners only).

  The ingredient already says "6 pcs", so nothing is lost. A one-tap "this is
  an ingredient" on a food row is item 6 in *Later*; one household with one
  double does not need it.
- Tell her plainly that the double was the app's gap, not her mistake.

## 8. Staff view (Dapur → Makanan)

Bahasa Indonesia only, no prices (there are none on these screens).

- The same Ingredients section, grouped by place, with *Segera dipakai* on
  top.
- Staff can move an ingredient and set its date in the sheet. They still
  cannot add, rename or delete ingredients, or change tracking.
- New words on a staff screen: the heading *Segera dipakai*, and the two
  hints about the freezer. *Disimpan di mana?*, *Kedaluwarsa*, the place
  names and the date chips are already on the staff's *Tambah makanan* sheet.
- Belanja (the staff's shopping) is unchanged.

## 9. Words

New glossary rows, to add to `docs/indonesian-glossary.md` (the manager's
file) in the first PR. Words not listed here are already in the glossary or
on screen today, and are reused as they are.

| English | Bahasa Indonesia | Where |
|---|---|---|
| Use soon | Segera dipakai | First group under Ingredients. "Dipakai", as in *Pakai bahan ini*. |
| Expires today | Kedaluwarsa hari ini | Under an ingredient's name. |
| Expires tomorrow | Kedaluwarsa besok | |
| Expires in 5 days | Kedaluwarsa 5 hari lagi | |
| 2 days past date — check first | Lewat 2 hari — cek dulu | Already the food row's words. |
| Dada Ayam · moved to Fridge | Dada Ayam · dipindahkan ke Kulkas | Toast, with Undo / **Batalkan**. |
| Out of the freezer. When does it expire now? | Keluar dari freezer. Sekarang kapan kedaluwarsa? | Above the date chips after a move. |
| In the freezer it keeps longer. Tap No date if the old date no longer applies. | Di freezer lebih awet. Ketuk Tidak ada kalau tanggal lama sudah tidak berlaku. | Under the date chips. |
| Amount (optional) | Jumlah (opsional) | Add ingredient, owner form. |
| Dada Ayam is already in Ingredients. | Dada Ayam sudah ada di Bahan masakan. | Add ingredient. |
| Dada Ayam is in Ingredients. Open it there to say where it is or when it expires. | Dada Ayam ada di Bahan masakan. Buka di sana untuk mencatat tempat atau tanggal kedaluwarsanya. | Add ready-to-eat food. |
| Open it | Buka | The button beside both lines. |

Reused: *Where is it kept?* / **Disimpan di mana?**; *Expires* /
**Kedaluwarsa**; *Fridge · Freezer · Cupboard · Counter* / **Kulkas ·
Freezer · Lemari · Meja**; the chips *Today · Tomorrow · 3 days · 1 week ·
Pick a date · No date* / **Hari ini · Besok · 3 hari · 1 minggu · Pilih
tanggal · Tidak ada**; *Unit* / **Satuan**; *Add ingredient* / **Tambah
bahan masakan** (part A).

No emoji. Icons are the four place icons the food sheet already uses
(`Refrigerator`, `Snowflake`, `Archive`, `Utensils`).

## 10. Kakak

Strict tools are at 15 of 16 union-typed parameters
(`tests/unit/kakak-tool-limits.test.ts`). This adds **none**: the new tool is
not strict, like `add_food` and `add_to_shopping_list`, and is checked in
full by `validateToolCall`.

- **Household block.** An item on the Fresh Food or Pantry shelf is marked
  `(ingredient)`, followed by its place and date only when they are stored:
  `- I7: Dada Ayam (ingredient) · freezer · expires 2026-11-20`. A default
  place is never sent, so Kakak never states a guess as a fact.
- **New tool `put_away_ingredient`** (not strict): "Suggest where a listed
  ingredient is kept and when it expires: bought and put away, moved, or
  taken out to thaw. Only for an item marked (ingredient). Never saves
  anything."
  - `item`: an item reference, required;
  - `kept_in`: `fridge` | `freezer` | `pantry` | `counter` | null (null
    leaves the place alone);
  - `expiry`: `set` | `clear` | `keep`;
  - `expires_on`: a date when `expiry` is `set`, else null;
  - `expiry_is_guess`: boolean, as `add_food`.
- **Instructions.** `add_food` is for food ready to eat: leftovers, gifts,
  bought dishes and cakes. A raw ingredient the home keeps (meat, fish,
  vegetables, eggs, rice) is never `add_food`. If it is listed and marked
  `(ingredient)`, use `put_away_ingredient`. If it is not listed, say in one
  line that it can be added in Dapur / Kitchen → Makanan / Food → Tambah
  bahan masakan / Add ingredient. Dates follow the food rule: never fill in a
  date the owner did not give; out of the freezer, ask, and offer a cautious
  guess as one answer.
- **"Where is the beef?"** Kakak may answer in one line from the block when a
  place is stored, and otherwise say it has not been noted yet.
- **The card.** A new suggestion kind, `ingredient`: *Dada Ayam → Kulkas ·
  kedaluwarsa besok*, saved on confirm through the two context actions in one
  update. `isSaveableSuggestion` and practice mode gain the kind.
- **Evaluation.** About eight new sentences in `tests/kakak/`: put away,
  move, thaw with and without a date, a raw ingredient that is not listed, a
  cake (still `add_food`), and a name that is both a pet and an ingredient.

If the night is short, the smallest useful Kakak change is the instruction
alone (raw ingredients are not `add_food`), which already stops Kakak from
creating doubles. The tool can follow.

## 11. Menu to Shopping

The flow is the one part A put in order: **Food** (what is there, and where),
**Menu** (plan the week), **Shopping** (what is missing).

- *Add missing to Shopping* reads amounts only. Place and date do not change
  what is missing.
- *Cooked → Use these ingredients* takes amounts off as now. When the last of
  an ingredient is used it goes Out, and its date clears with it.
- *Bought* is unchanged. An item that was Out comes back with no date; the
  place it had is kept, which is right, since chicken goes back in the
  freezer. Asking for the date on the Bought sheet is item 2 in *Later*.

## 12. Later (not in this version)

1. Dated ingredients in Today's "to eat soon" line and the 07.00 push
   (`notify_food_expiring` would be re-created).
2. Date and place on the Bought sheet.
3. Moving part of an item.
4. One list by place for dishes and ingredients, with a shared Use soon
   strip (section 3).
5. "Don't know" and a label photo for an ingredient's date.
6. One tap to turn a ready-to-eat row into an ingredient.
7. Kakak adding a new ingredient.
8. The menu review saying what to use first.
9. A place filter or search, once the Cupboard passes about 25 items.
10. Places of the home's own ("second fridge").

## 13. Build: small PRs

Part A (`kitchen-words-order`) changes `features.ts`, `food.ts`,
`food-view.tsx`, `ingredients-section.tsx` and the glossary. **PR 2 starts
from main after part A is merged.**

| PR | What | Files | Runs |
|---|---|---|---|
| **1. Foundation** | Migration and its test. Types. `lib/ingredients.ts` and the mirror rule in `kitchen-units.ts`, with unit tests. Both data providers. The three context actions. `PlacePicker` and `ExpiryChips` as new, unused components. The glossary rows of section 9. | `supabase/migrations/154_*.sql`, `supabase/tests/154_*.sql`, `src/types/database.ts`, `src/lib/data/*`, `src/lib/ingredients.ts`, `src/lib/kitchen-units.ts`, `src/context/household-context.tsx`, `src/components/kitchen/place-picker.tsx`, `expiry-chips.tsx`, `tests/unit/ingredients.test.ts`, `docs/indonesian-glossary.md` | First. Nothing visible changes. |
| **2. List, sheet, move** | Sections 5a and 5b, and the staff view. | `ingredients-section.tsx`, new `ingredient-list.tsx`, `stock-items-panel.tsx`, `stock-status-sheet.tsx`, `food-detail-sheet.tsx`, `kitchen-tab.tsx`, new `tests/e2e/kitchen-places.spec.ts`, and `kitchen-amounts.spec.ts` only where the list's new shape breaks it | After 1 and part A. |
| **3. Add sheet, no doubles** | Sections 5c and 5d. | `inventory-item-form.tsx`, `track-amount-sheet.tsx` (only to share its unit chips), `food-form-sheet.tsx`, `food-view.tsx`, new `tests/e2e/kitchen-add-ingredient.spec.ts` | After 2 (it uses PR 2's "open this ingredient"). |
| **4. Kakak** | Section 10. | `src/lib/kakak/*`, `tests/kakak/*`, the suggestion card, `tests/unit/kakak-tool-limits.test.ts` (its totals must not move) | After 1. **In parallel with 2 and 3**: no shared files. |
| **5. Telling people** | A What's new card and the short how-to for owners (EN and ID) and staff (ID). | `src/lib/whats-new.ts` (a shared file: the manager's, or one executor at a time) | Last, after 2 and 3. |

Every PR: `tsc`, the unit tests, the build, its own browser tests, `@codex
review` until clean. Merges and database steps are the manager's, on the
owner's OK.

### Tests

- **SQL** (`supabase/tests/154_*.sql`): the list in section 4.
- **Unit:** `groupIngredients` (each item once; soonest first; Out has no
  date and is never in Use soon; the default place by category);
  `ingredientExpiryText` in both languages; `sameName`; `applyAmountRules`
  clearing the date on Out; `validateToolCall` for `put_away_ingredient`
  (good call, unknown field, bad place, `set` without a date).
- **Browser, owner (EN):** the groups in order; move Freezer to Fridge, the
  toast, Undo; the thaw line, then *Tomorrow*, and the row moves up to Use
  soon; add an ingredient with place, date and amount in one sheet; the
  "already in Ingredients" line and *Open it*; Kitchen amounts off shows the
  screen exactly as before.
- **Browser, staff (ID):** the same groups in Indonesian; staff move an item
  and set a date; no Add button; no English.
- **Not changed, must still pass:** `food.spec.ts`, `kitchen-menu.spec.ts`,
  `kitchen-recipes.spec.ts`, `sheet-back.spec.ts`, `weak-signal.spec.ts`.

## 14. Release

The manager's plan is staging over the weekend and production on Monday 17,
after Sunday's demo. I agree with it as the default.

It could go to production before Saturday's 12.00 freeze, but only if every
one of these is true by Friday 20.00 WIB:

- PRs 1 to 3 merged, Codex clean, CI green;
- the migration applied on staging and its SQL test passing there;
- one person has done the six checks below on a real phone on staging.

Why it is not reckless: the migration adds two nullable columns and one line
to a trigger, and the screens show only where Kitchen amounts is on. Why it
is still a risk: the only household with Kitchen amounts on is the one giving
the demo, and the trigger it touches is the one behind every stock tap. If
any gate is missed, it waits for Monday. Kakak (PR 4) and the What's new card
(PR 5) are not gates; they can follow.

### Six checks on a phone

1. Ingredients are grouped by place, with nothing listed twice.
2. Dada Ayam → Freezer → Fridge: the toast, Undo, and the question about the
   date.
3. Set *Tomorrow*: it moves to Use soon, in amber.
4. Tap Out: the date is gone. Buy it again: still no date.
5. Add an ingredient with a place, a date and an amount, in one sheet.
6. On a staff phone: the same list in Indonesian, a move works, and there is
   no Add button.

## 15. Open questions for the owner

None block the build. The defaults above stand unless the owner says
otherwise.

1. Staff may move ingredients and set dates (recommended: yes).
2. Moving into the freezer keeps the date and shows a hint (recommended),
   rather than clearing it.
3. A second ingredient with the same name is allowed after the "already in
   Ingredients" line (recommended), rather than refused.
