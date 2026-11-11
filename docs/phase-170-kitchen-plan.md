# Phase 170 — Cooking, groceries and planning under Kitchen

Status: **decided: owner chose all recommendations (D1–D16 A), 2026-11-10.
PR A (amounts and units, D1–D4, D6, D7, D14) built 2026-11-11 with migration
148** (the plan first reserved 144; 144–147 went to pet routines, features,
security and templates). PR B (recipes) took 151 and PR C (menu and the cook's view) 153, each
reserved by the manager when built.
**Addendum (2026-11-10, end of this file): Menu ↔ food ↔ shopping, D17–D22:
parked after the 10 Nov evaluation; not built.** Roadmap item 20
(`docs/roadmap-2026-11-09.md`, P3): "Daily menu for the cook. Ties Kitchen to
the day." Plus a new row for amounts and recipes (the owner's request of
10 November). Mockup: `docs/mockups/phase-170-kitchen.html` (open in a
browser, phone width; owner screens English left and Bahasa Indonesia
right, staff screens Bahasa Indonesia only).

## The household's answers (2026-11-11)

The four open questions at the end of this plan, answered by the founding
household:

1. **The wife is a co-owner** already: D11 needs no work, no invite.
2. **Both she and the staff cook.** *Menu hari ini* (PR C) goes to every
   staff phone, as D9 A.
3. **No allergies or diets the cook must never miss.** So **D12 → C**: no
   Kitchen notes for health, no health-data confirm, no impact assessment.
   PR C keeps a plain kitchen note only if it's still wanted then, without
   the health wording.
4. **Recipes are written in English or Indonesian, but cooks read Indonesian
   only.** So PR B stores the original text **plus an Indonesian version**;
   staff phones always show the Indonesian; a Kakak-assisted **Translate for
   staff** fills it for the owner to review and save; and the owner is
   warned when a recipe has no Indonesian version yet. (This replaces "Recipe
   text is the household's own words and isn't translated" in D8.)

## Features and Plus (owner, 2026-11-11)

- **Kitchen amounts is an optional switch** in Household → Features
  (Phase 171, `household_features`, feature `kitchen`). It joins **off**
  for new households (171 D4); migration 148 switched it **on for every
  household that existed when it ran** (only the founding household, which
  asked for it). No offer card yet.
- Off hides the amounts, Track amount, "How much did you buy?", staff's
  *Perlu dibeli* and the Ingredients group (everything stays under
  Shopping, as before); the numbers stay saved.
- **Tagged Plus in code** (`src/lib/plans.ts`, `PLUS_FEATURES`) for when
  billing exists. Nothing is gated: everything stays free until billing ships.

## As built in PR A (2026-11-11)

- **Portions on Food (D7) are in PR A** (manager, 2026-11-11: the owner
  asked for "pax" counts): optional, 1–99, set in the food form; the row
  reads "3 portions"; **Ate 1 portion** counts down, and the last one
  finishes it as Eaten.
- **Ingredients under Food (D6)** need both Kitchen amounts and Food at home
  on. With Food at home off there is no Food pill, so they stay under
  Shopping.
- **Staff's *Perlu dibeli*** (D3's "one new staff screen piece") shows the
  items running low or out, with a tick (and *Beli berapa?* on tracked
  ones), while Kitchen amounts is on. The staff's own free-text notes stay
  for owners to tick, as before.
- **Bought's Undo** takes the amount back off as an increment and writes
  back the previous status and pre-fill. The amount's time stays at the
  undo (the server's clock only moves forward).
- No `security definer` function: `adjust_inventory_quantity` and
  `record_purchase` run as the caller, so RLS and the owner guard apply. The
  archived-staff trigger also refuses another household's staff id.

## As built in PR B (2026-11-11, migration 151)

- **Recipes** (`recipes`, `recipe_ingredients`): name (required, the only
  required field), servings (default 4), ingredient lines in order, steps
  (optional, one per line). A line is an item from the household's list
  (composite key on 148's `unique (id, household_id)`, so never another
  household's item; a deleted item leaves the line's name) or a free name;
  an amount (none = *secukupnya*) and a unit (the stock units plus `sdm`,
  `sdt`).
- **The Indonesian version** (answer 4): each recipe is *written in*
  English or Bahasa Indonesia (the owner's language to start). An English
  recipe keeps an optional `name_id`, `steps_id` and each free line's
  `name_id`; staff phones show those, falling back to the English. Linked
  lines read as the item does on the shopping list. The owner sees **No
  Indonesian version yet** on the list and an amber note on the recipe with
  **Add Indonesian version**, and an **English · For staff** switch to see
  what the cook reads.
- **Who**: owners write (`is_household_admin()` in every write policy and in
  `save_recipe`, SECURITY INVOKER); every session of the household reads.
  `save_recipe(recipe, ingredients)` saves the recipe and all its lines in
  one transaction.
- **Where**: the **Menu** pill (Food · Shopping · Menu, D5) opens straight on
  the recipe box until PR C. It belongs to the Kitchen switch (Household →
  Features, now *Kitchen amounts and recipes*), so households with it off
  see no change. Staff get the same pill in *Dapur*, read only, with bigger
  text; the servings stepper scales every amount (stored amounts never
  change). The phone keeps its last copy of the recipes for a weak kitchen
  signal.
- **Not in PR B (decided while building, closest to "less typing")**: no
  recipe photo or notes field (fewer fields; the photo clean-up functions
  stay untouched; both can join later as optional), no *New item* from the
  recipe form (a free name works; link it later), no Kakak **Translate for
  staff** (it would send recipe text to Anthropic: a privacy-policy change
  and a Plus feature, for the manager and owner to decide), no "won't come
  off stock" unit hint (it only means something once cooking exists, PR C).
- **Same PR, Codex P2 on #93**: one food's portion taps and undos now go to
  the server strictly in order (the queue's `portion:<food>` key), so a lost
  reply followed by a second tap never shows one portion too few.
- **Tutorials**: an owner What's new entry (*New: recipes in Kitchen*) on the
  Menu view, held by the calm-start rules (Kitchen amounts had this week's
  card); a staff tip once the household has a recipe.

Builds on **Phase 154** (the shopping list, migration 122, decision R3 in
`docs/phase-153-review.md` section 4), **Phase 156** (Food at home, migrations
123–124, `docs/phase-156-step1-food-plan.md`) and **Phase 110** (the counted
inventory, migration 099, whose columns are still in the table). It reuses
their sheets, rows, photo field, the `<SegmentedControl />`, the toast with
Undo and the What's new card.

## As built in PR C (2026-11-11, migration 153)

- **The week** (Kitchen → Menu, owners): seven day cards, Senin first, each
  with its meals and dishes, today marked, cooked dishes ticked; ‹ › for
  other weeks (`&week=`), the kitchen notes above, **Copy last week** (only
  when it would fill something), **Add missing to Shopping** (only while an
  uncooked recipe dish is left this week) and a **Recipes · N** row
  (`&recipes=1`) below. **Plan this** on a recipe opens the dish form.
- **A dish** (`menu_dishes`): day, meal, a recipe (servings start at the
  recipe's) or just a name, an optional note. Only the dish is typed: day
  and meal are taps. Owners only, through `is_household_admin()`.
- **Cooking**: *Sudah dimasak* on a dish (staff on Menu hari ini, owners on
  the week, today or earlier). With tracked lines that convert, *Bahan yang
  dipakai* lists them scaled to the servings on screen and summed per item
  (minus/plus, untick),
  *Tidak dihitung* the rest; a dish with nothing to take off is cooked in one
  tap. `cook_menu_dish` / `uncook_menu_dish` (SECURITY DEFINER, open to staff
  phones by design, household check); a trigger refuses any client write to
  `cooked_*`, owners included. The toast's *Batalkan* and the owner's *Tandai
  belum dimasak* put back exactly what was taken. *Ada sisa?* opens the Add
  food sheet with the dish's name and *Dimasak di rumah* (Food at home on).
- **Add missing**: the review sheet (To buy ticked with "Perlu 1,5 kg · ada
  1 kg · beli 500 g", Enough shown, Check these and Not on your list
  unticked). `inventory_items.to_buy_amount` stores the shortfall; To buy
  (owner and staff) reads "Beli 500 g" and WhatsApp "- Ayam 500 g". Cleared
  by a purchase or a tap on Enough; while it's set, cooking that leaves the
  amount above the low level keeps the item on the list.
- **Kitchen notes**: `set_kitchen_notes` (owners); neutral hint (the
  household's answer 3), "Staff phones can read this", and a one-time
  confirm about health information on the first save, stamped in
  `kitchen_notes_confirmed_at` / `_by`. Shown on the week, Menu hari ini and
  every dish.
- **Staff**: *Menu hari ini* above the chores on Tugas Hari Ini (the selected
  day; another day reads *Menu Kamis*), and on Dapur → Menu above the
  recipes. Indonesian names of recipe dishes; no planning, no editing.
- **Owners' Today**: one quiet line, "Menu today: …", to the week.
- **Retention**: `prune_old_menu_dishes()` nightly (19:54 UTC), menu days
  older than a year.
- **Export**: `menu`, the kitchen notes and their confirmation, and 152's
  repair push switches in `my_notifications`.
- **Codex round 1 on #101 (six P2s, all fixed)**: cooking takes off what
  the dish's servings stepper shows; Sudah dimasak waits ("Sedang memuat…",
  or "Belum bisa dimuat. Coba lagi") until the recipe and the items came
  from the server in this session, never from the phone's copy alone;
  `cooked_uses` keeps each item's unit and Undo converts it
  (`convert_kitchen_amount`), skipping and saying so when the units no
  longer convert; a menu week whose first read failed is read again on
  refresh, online and back in the foreground; Copy last week waits for both
  weeks from the server; a unit change converts `to_buy_amount` (in the app
  and in the trigger) or clears it.
- **Codex final pass on #101 (two P2s, fixed)**: Add missing takes its
  snapshot only once the week, the recipes and the items came from the
  server (Loading… / Try again until then); a Bought's Undo puts the
  menu's shortfall back (converted if the unit changed).
- **Codex at ad81e21**: the dish editor holds a recipe link by id, so
  editing a dish before the recipes load never unlinks it; only "Not this
  recipe" does. The picker waits for the recipes from the server.
- **Codex at f510cc4**: signing out removes every Miamus key on the phone
  except its display preferences (`src/lib/local-data.ts`, deny by default;
  the recipes cache from #98 had been missed); the kitchen notes editor opens
  only on a note read from the server.
- **Not in PR C (less typing / less reading)**: the addendum (Eat soon,
  leftover dishes, Ready to cook, packs, the Menu changed banner), the "won't
  come off" unit hint (the confirm sheet's *Tidak dihitung* says it), cooking
  in the offline queue (a weak signal shows "Belum tersimpan. Coba lagi."; a
  resend is refused as already cooked, so nothing comes off twice), a
  portions pre-fill for leftovers (unknown; the person types it).

## The problem

The owner's wife checks the stock and loves cooking. She wants cooking,
groceries and planning in the app, under Kitchen, and she wants to know
**exactly how much** the household has: grams, kilos, litres, pieces,
servings. Today she can't:

- **Shopping** only says *Enough · Running low · Out*. That was on purpose.
  Phase 154 (R3) took away the counts because asking staff to weigh and
  count on a schedule is the chore that kills these apps: the counts went
  stale and the same item showed up three times.
- **There are no recipes and no menu.** What's cooked this week lives in her
  head or a WhatsApp message to the cook; the cook asks every morning.
- **Shopping for the week is guesswork.** Nobody can say "the menu needs
  1.5 kg of chicken and there's 1 kg in the freezer, so buy 500 g".
- **Food** (leftovers, gifts, cakes with an expiry) and the **ingredients**
  on the shopping list feel like two separate lists.

**The tension:** an enthusiastic cook wants exact amounts; the history of
these apps (and our own Phase 110) shows that forced counting fails. The
plan has to give her exactness without making anyone count.

## What exists (read 2026-11-10)

- **`inventory_items`** keeps every Phase 110 column, hidden since Phase 154:
  `quantity` (numeric, not null, default 0), `unit` (`InventoryUnit`: pcs,
  pack, box, bottle, roll, tube, kg, g, L, ml; check constraint in 099),
  `min_threshold` (numeric, not null; **default 2 from 083**, so old rows
  carry a guess nobody chose; new items are saved with 0),
  `audit_frequency_days`, `last_audited_at`. The Phase 154 status lives in
  `stock_status` (`ok`, `low`, `out`), stamped by the server (122).
  Shelves: pets (`dog_food`, `dog_supplies`, `medicine`) and home
  (`fresh_food`, `pantry`, `household_supplies`).
- **`inventory_audit_logs`** (083, 099): append-only counts with
  `quantity_counted` (Phase 110) or the older box/loose split (Phase 83),
  each with an optional shelf photo. Nothing reads them now. Included in the
  household export (127).
- **`adjust_inventory_quantity(p_item_id, p_delta)`** (099): an increment
  floored at 0, `security invoker`, granted to `authenticated`. The app
  still has the call in `supabase-provider.ts`; nothing on screen uses it.
  It was **not** in 111's revoke list, so it should be revoked from
  `public, anon` when it's re-created.
- **Who may change what** on an item: RLS (090) lets every session of the
  household read and update; `inventory_items_owner_guard` (099) lets a staff
  phone change only what isn't in its owner-only list (today: `quantity`,
  `stock_status`, `stock_status_by` and the old ledger columns) and never
  insert or delete. 119/122 refuse work recorded under a removed staff member
  (`refuse_archived_staff_on_stock`).
- **`food_items`** (123): name, photo, place (`fridge`, `freezer`, `pantry`,
  `counter`), expiry (or "don't know"), source (`home` = cooked at home,
  `gift`, `bought`), from whom, container to return, notes, outcome
  (`eaten`, `given_away`, `thrown_away`). Any session adds, edits and
  finishes; only admins delete. Finished rows kept 90 days. A 07:00 push
  lists food expiring (124).
- **Kitchen tab** (`src/components/kitchen/kitchen-tab.tsx`): the pill
  **Food · Shopping** (**Makanan · Belanja**), in the URL as `?kitchen=buy`
  (`use-kitchen-view.ts`). Staff see the same pill under **Dapur**.
- **Shopping** (`src/components/shopping/`): *To buy* (quick-add line, items
  running low or out, notes; tick = bought, with Undo; Send on WhatsApp /
  Copy), then **Stok di rumah** (every item, Pets then Home). Staff tap an
  item to say running low or out (`stock-status-sheet.tsx`).
- **Owners** are `household_members` rows; `caller_admin_household()` is true
  for any of them. There is no non-admin family role and no list of family
  members who aren't owners (Phase 162 only stores whether there are pets;
  kids and elders wait for the Care tab, roadmap item 18).
- **Kakak** receives shopping item names with each request (privacy policy);
  this phase changes nothing in Kakak.

## The idea in one line

**Amounts are something the kitchen leaves behind, never a job.** Any item
can *opt in* to an exact amount; it then changes only where work already
happens (buying, cooking, a glance in the cupboard). Recipes and a weekly
menu sit under **Kitchen → Menu**, and the cook sees **Menu hari ini** on
Today. Everything works by hand; Kakak is a later, paid extra.

## Resolving the tension: five rules

| Rule | What it means on screen |
| --- | --- |
| **Opt-in per item** | An owner switches on **Track amount** for the items that matter to her (rice, oil, eggs, chicken, flour). Everything else stays *Enough · Running low · Out*, the one-tap path staff already know. |
| **No scheduled counts, ever** | No "count the pantry" chore, no reminder to update amounts, no red "out of date" badges. |
| **Amounts move with work** | Buying adds ("How much did you buy?", last time pre-filled). Cooking a planned dish takes off what the recipe used, after one confirm tap. A glance in the cupboard: minus, plus or **Set amount**. |
| **Status still wins for staff** | On a tracked item, staff can still tap *Running low* or *Out*. *Out* sets the amount to 0; *Running low* puts it on the list without touching the number. The three states stay the default everywhere. |
| **Honest, not nagging** | An amount not touched for 14 days reads "about 1.2 kg · 3 weeks ago" in grey. It never turns red and never asks anyone to count. |

## What changes for people

| Who | What's new |
| --- | --- |
| Owners | **Track amount** on any shopping item: unit, how much there is now, and an optional **Running low at**. The row then shows **1.2 kg left**; its status follows the amount. |
| Owners and staff | **Bought** on a tracked item asks **How much did you buy?**, with last time's amount pre-filled; the amount is added. |
| Owners | **Kitchen → Food** shows **Ready to eat** (leftovers, gifts, as now) and, under it, **Ingredients** (the fresh-food and pantry items, with amounts where tracked): one place for "what food is in the house". **Shopping** keeps *To buy* and the non-food supplies (D6). |
| Owners | **Kitchen → Menu**, a third pill: the week by day and meal, **Copy last week**, **Add missing to Shopping**, **Kitchen notes** for the cook, and the **Recipes** box. |
| Owners | **Recipes**: name, servings, ingredients linked to items, steps, an optional photo; scaled by servings. |
| Staff | **Menu hari ini** at the top of *Tugas Hari Ini* (only when there's a plan): today's dishes, the kitchen notes, tap for the recipe. **Sudah dimasak** takes the ingredients off with one confirm tap and offers to save leftovers to *Makanan*. |
| Staff | On a tracked item in *Belanja*: the amount, minus and plus, **Ubah jumlah**, and the three states as before. |

## The screens (mockup)

1. **Kitchen → Food** (owner). Pill **Food · Shopping · Menu**. *Ready to
   eat* (Rendang · 3 portions · Fridge · 2 days left). *Ingredients*: Rice
   4.5 kg left, Eggs 8 butir left, Chicken 1 kg left, Cooking oil 0.4 L left
   · Running low, Shallots *Enough* (not tracked), and one stale amount in
   grey.
2. **Track amount** (owner, the item sheet). A switch; unit chips; **How
   much is there now?** with minus/plus; **Running low at (optional)**; the
   Phase 110 count shown as a hint only ("Old count: 2 kg on 3 Oct, not
   used").
3. **How much did you buy?** (owner or staff, from a tick on *To buy*).
   "Rice · usually 5 kg"; the amount pre-filled; the result line "4.5 kg +
   5 kg = 9.5 kg"; **Bought**. **Skip amount** ticks it with no number.
4. **Kitchen → Menu** (owner). The week strip; today's meals (Lunch: Soto
   ayam · 4 servings; Dinner: Rendang · 6 servings, with a recipe icon); the
   **Kitchen notes** line; **Copy last week**; **Add missing to Shopping**;
   **Recipes · 12**.
5. **Add missing to Shopping** (owner). *To buy*: Chicken "need 1.5 kg ·
   have 1 kg · buy 500 g", Coconut milk "need 6 bungkus · have 4 · buy 2
   bungkus", Eggs "enough" (shown, not added). *Check
   these* (not tracked): Shallots, Lemongrass. *Not on your list*: Lime
   leaves (added as a note). **Add 3 to Shopping**.
6. **A recipe** (owner). Photo, servings stepper (6 → 12 doubles every
   amount), ingredients with amounts ("2 sdm sweet soy sauce", "salt to
   taste"), steps, **Edit**, **Plan this**.
7. **Tugas Hari Ini** (staff). **Menu hari ini** card: Siang Soto ayam ·
   4 porsi; Malam Rendang · 6 porsi; the kitchen notes line ("Tanpa babi.
   Raka alergi kacang."). Chores below as now.
8. **Sudah dimasak** (staff). "Bahan yang dipakai" with each tracked
   ingredient ticked and its amount (minus/plus to adjust); *Tidak dihitung*:
   salt to taste, 2 sdm kecap; **Pakai bahan ini**.
9. **Ada sisa?** (staff). After the toast "Rendang sudah dimasak · Batalkan":
   **Simpan ke Makanan** (name, place, portions pre-filled; the expiry is
   picked by the person, never guessed) or **Tidak ada sisa**.

## How it fits the five tabs (D5)

No sixth tab. **Kitchen** gets a third pill:

- **Food · Shopping · Menu** (**Makanan · Belanja · Menu**), in that order,
  for owners and in staff's *Dapur*. Food stays first and stays the default
  (no `?kitchen` param), so every existing link still opens on it and a
  household that never plans menus never sees an empty screen first.
  Menu is `?kitchen=menu`; `use-kitchen-view.ts` gains the value.
- **Recipes live inside Menu**, not as a fourth pill: a **Recipes · 12** row
  on the Menu view opens the recipe box (`?kitchen=menu&recipes=1`, and
  `&recipe=<id>` for one recipe, so Back and the camera's reload work).
  Recipes are also one tap away while planning a day. Four pills would fit
  but crowd a 360 px phone, and a recipe box without a plan is the less-used
  half.
- **Today (owners)**: one quiet line when there's a menu today, **Menu
  today: Soto ayam, Rendang**, beside the existing food and shopping lines.
- **Today (staff)**: the **Menu hari ini** card above the chores.
- **Household**: unchanged.

## Amounts (D1–D4)

### Opting in (owner only)

The item sheet (Shopping → tap an item, or Food → Ingredients → tap) gets a
**Track amount** switch. Turning it on asks three things in place:

- **Unit**: chips from the list below, the item's current unit preselected.
- **How much is there now?** Required: tracking starts from a number. A hint
  says "A guess is fine; it corrects itself next time you buy."
- **Running low at (optional)**: at or below this the item is *Running low*.
  Blank means only *Out* (at 0).

The Phase 110 values (`quantity`, `min_threshold`) are **never used
silently** (D14). If the item has an old count, it shows as a hint under the
field ("Old count: 2 kg on 3 Oct, not used"); the person types the real
number. Turning tracking off keeps the numbers but stops showing them; the
status stays whatever it last was.

### Where the amount changes

| Where | What happens | Who |
| --- | --- | --- |
| **Bought** (tick on *To buy*) | Sheet: **How much did you buy?**, last purchase pre-filled, the sum shown. Adds to the amount. **Skip amount** ticks it without a number (status *Enough*, amount unchanged). Untracked items tick as today, no question. | Owners and staff |
| **Cooked** (a planned dish) | Sheet: the recipe's tracked ingredients, scaled to the servings, each ticked and adjustable. **Use these** takes them off in one go. Undo puts them back. | Owners and staff |
| **A glance in the cupboard** | Minus / plus on the item (step 1 for whole units, 100 for g and ml, 0.5 for kg and L) and **Set amount** to type it. | Owners and staff |
| **Running low / Out** taps | *Out* sets the amount to 0. *Running low* changes only the status. | Owners and staff |

### The status of a tracked item

Derived by the database whenever the amount or the low level changes:
0 → *Out*; at or below *Running low at* → *Running low*; otherwise *Enough*.
A person's tap on *Running low* stays until the amount next changes (they
looked; the number was wrong). Buying 200 g when the low level is 500 g
leaves it *Running low*, and the toast says so ("Bought · still running
low").

### Units (D4)

Stored on the item; labels in each language. New values in **bold**.

| Group | Units | Converts |
| --- | --- | --- |
| Weight | g, kg | g ↔ kg exactly |
| Volume | ml, L | ml ↔ L exactly |
| Pieces | pcs, **buah**, **butir** | 1 : 1 with each other (a piece is a piece) |
| Kitchen counts | **ikat** (bunch), **siung** (clove), **lembar** (leaf), **batang** (stalk), **bungkus**, **sachet** | only with the same unit |
| Packs | pack, box, bottle, roll, tube | only with the same unit |
| Recipe only | **sdm**, **sdt** | never taken off stock: too small and not exact against a bottle or a bag |
| Recipe only | **secukupnya** (to taste): no amount | never taken off, never added to Shopping |

No conversion between groups (no "1 egg ≈ 60 g"). A recipe line whose unit
can't convert to its item's unit is still shown and cooked, just not taken
off; the recipe editor says so beside the line ("Rice is tracked in kg; this
amount won't come off").

### Staff rights (D3)

Staff phones may: change the amount (minus/plus, set), record a purchase
with an amount, tap the three states, mark a planned dish cooked with its
ingredients, save leftovers to Food. They may **not**: switch tracking on or
off, change the unit or the low level, write recipes, or plan the menu. The
guard (099) gets the new owner-only column; staff gain no power over an
item beyond what they already have on `quantity` and `stock_status`.

**One new staff screen piece:** staff's *Belanja* today only marks items.
Staff often do the shopping at the pasar, so it gains the same **Perlu
dibeli** list at the top that owners have, with a tick per item (bought,
with Undo, and *Beli berapa?* on tracked items). Without it, amounts would
only grow when an owner ticks.

## Food and ingredients as one Kitchen (D6, D7)

**Food** becomes "what food is in the house":

- **Ready to eat**: today's Food list unchanged (leftovers, gifts, cakes;
  expiry groups, finish with Eaten · Given away · Thrown away).
- **Ingredients**: the stock items on the **Fresh food** and **Pantry**
  shelves, with their amount or status. Tapping one opens the same item
  sheet as in Shopping.

**Shopping** keeps *To buy* (everything running low or out, ingredients
included) and **Stok di rumah**, now the non-food supplies (Pets, Household
supplies). Each item appears in exactly one browsing place, and the shopping
list still gathers all of it. Staff's *Makanan* gets the same Ingredients
group, so a staff tap on "Beras · Hampir habis" moves from *Belanja* to
*Makanan*: the PR A staff card says so.

**Food items don't get weights.** A leftover is a dish, not an ingredient.
They gain one optional number, **portions** (`porsi`): "Rendang · 3
portions". When set, the detail sheet adds **Ate 1 portion** above *Eaten ·
Given away · Thrown away*; at 0 it's finished as *Eaten*. Unset, Food
behaves exactly as today.

**Leftovers from a cooked dish**: after **Sudah dimasak**, a small sheet asks
**Ada sisa?**. **Simpan ke Makanan** opens the existing Add food sheet with
the dish name, *Cooked at home*, *Fridge* and the portions pre-filled. The
expiry is the person's choice from the usual quick picks: the roadmap rules
out fixed food-safety guesses.

Raw ingredients with a date (chicken in the freezer) are ingredients with an
amount. A per-batch expiry on stock is out of scope.

## Recipes (D8)

- **Fields**: name (required), servings (`porsi`, default 4), ingredients,
  steps (one text block, numbered as typed; up to 4,000 characters), an
  optional photo, an optional note.
- **An ingredient line**: an item from the household's list (search as you
  type; **New item** creates one in the right shelf), **or** a free name
  ("Daun jeruk") when it isn't something the house stocks; an amount
  (decimal, optional); a unit (the list above, or *secukupnya*). Lines keep
  their order.
- **Scaling**: the servings stepper on a recipe or a menu day multiplies
  every amount by servings ÷ recipe servings, rounded sensibly (whole for
  pieces and kitchen counts, 1 decimal for kg and L, nearest 5 for g and ml,
  half for sdm and sdt). Stored amounts never change.
- **Who writes**: owners. Staff read every recipe (they cook from them) and
  can't edit. A hint in the form: "Staff who cook will read this recipe.
  Write it the way they'll understand it." Recipe text is the household's
  own words and isn't translated.
- **Delete**: removes the recipe and its photo. Menu days that used it keep
  the dish name and lose the link ("recipe deleted").

## The weekly menu (D9, D10)

- **The plan**: for each day, up to three meals, **Breakfast · Lunch ·
  Dinner** (**Sarapan · Makan siang · Makan malam**), each with one or more
  dishes. A dish is a recipe (with servings, default the recipe's) or just a
  name ("Nasi goreng") when there's no recipe. Notes per dish ("less
  spicy").
- **Copy last week** fills empty days from the same weekday last week.
- **Kitchen notes** (D12): one short owner-written note for the household,
  shown on the Menu, on **Menu hari ini** and on every recipe the cook opens:
  "No pork. Raka is allergic to peanuts."
- **Add missing to Shopping** (owner): for the days from today to the end of
  the shown week that aren't cooked yet, the app adds up every ingredient
  (scaled), then shows a review sheet:
  - **To buy**: tracked items where the need is more than what's there:
    "Chicken · need 1.5 kg · have 1 kg · buy 500 g". Ticked by default.
  - **Check these**: linked items that aren't tracked: "Shallots · Enough".
    Unticked; tick to put it on the list.
  - **Not on your list**: free-name ingredients. Unticked; tick to add them
    as notes on *To buy* (the existing free-text notes).
  - **Add N to Shopping** sets those items *Running low* (or *Out* when
    there's none) with the shortfall stored, so *To buy* and the WhatsApp
    text read "Chicken 500 g". Nothing is added without the review.
  The shortfall is a snapshot: it clears when the item is bought.
- **Cooking**: **Sudah dimasak** on a dish (staff on Today, owners on the
  Menu). The confirm sheet lists the recipe's tracked lines whose unit
  converts, scaled to the dish's servings, each ticked with its amount;
  adjust with minus/plus or untick. *Tidak dihitung* lists the rest (to
  taste, sdm/sdt, untracked, free names) for information. **Pakai bahan
  ini** takes them off, marks the dish cooked with who and when, and keeps
  what was taken so **Batalkan** puts exactly that back. A dish with no
  recipe is just marked cooked. A retry after bad Wi-Fi never takes things
  off twice: an already-cooked dish is refused.
- **Who sees Menu hari ini** (D9): every staff phone of the household (any
  of them may cook; there's no cook role). Owners see the quiet line.

## Staff flow (Bahasa Indonesia only)

1. **Tugas Hari Ini** opens with **Menu hari ini** when today has a plan:
   meal, dish, porsi, a recipe icon when there's a recipe, and the kitchen
   notes line. No plan, no card.
2. Tap a dish → the recipe at today's servings: bahan (with amounts), cara
   membuat, the photo, the kitchen notes on top.
3. **Sudah dimasak** → **Bahan yang dipakai** → **Pakai bahan ini**. Toast:
   "Rendang sudah dimasak · Batalkan".
4. **Ada sisa?** → **Simpan ke Makanan** (the usual Add food sheet, filled
   in; they pick the expiry) or **Tidak ada sisa**.
5. In **Dapur → Makanan → Bahan** or **Belanja**, a tracked item shows "Sisa
   1,2 kg"; tapping it shows minus/plus, **Ubah jumlah**, and *Masih ada ·
   Hampir habis · Habis* as before. Untracked items work exactly as today.
6. On *Belanja*, a new **Perlu dibeli** list at the top (the owners' To
   buy) with a tick per item; ticking a tracked item asks **Beli berapa?**
   (last time pre-filled). Untracked items tick straight to *Masih ada*.

Staff never plan, write recipes or switch tracking. No staff screen has
English.

## Owner flow (English or Bahasa Indonesia)

1. **Kitchen → Food → Ingredients** (or Shopping): tap Rice → **Track
   amount** → kg, 4.5, running low at 1 → Save. Repeat for the few items
   that matter.
2. **Kitchen → Menu → Recipes → New recipe**: Rendang, 6 servings,
   ingredients from the list, steps, photo.
3. **Menu**: tap Wednesday dinner → pick Rendang (or type "Nasi goreng") →
   servings. **Copy last week** for the rest.
4. **Add missing to Shopping** → review → **Add 3**. *To buy* now reads
   "Chicken 500 g"; **Send on WhatsApp** as today.
5. After shopping: tick **Bought** → "How much did you buy?" → 2 kg.
6. **Kitchen notes**: one line for the cook, edited from the Menu.

## Owner text (EN / ID)

| Where | English | Bahasa Indonesia |
| --- | --- | --- |
| Kitchen pill | Food · Shopping · Menu | Makanan · Belanja · Menu |
| Food groups | Ready to eat · Ingredients | Siap dimakan · Bahan masakan |
| Item switch | Track amount | Catat jumlah |
| Switch hint | Shows exactly how much is left. It changes when you buy or cook, never on a schedule. | Menunjukkan sisa yang pasti. Berubah saat belanja atau memasak, tidak perlu dihitung rutin. |
| Field | How much is there now? · A guess is fine; it corrects itself next time you buy. | Berapa yang ada sekarang? · Perkiraan juga boleh; nanti terkoreksi saat belanja. |
| Field | Running low at (optional) | Hampir habis kalau tinggal (opsional) |
| Old count hint | Old count: 2 kg on 3 Oct, not used | Hitungan lama: 2 kg pada 3 Okt, tidak dipakai |
| Row | 1.2 kg left · about 1.2 kg · 3 weeks ago | Sisa 1,2 kg · sekitar 1,2 kg · 3 minggu lalu |
| Buttons | Set amount | Ubah jumlah |
| Bought sheet | How much did you buy? · Usually 5 kg · Skip amount · Bought | Beli berapa? · Biasanya 5 kg · Lewati jumlah · Sudah dibeli |
| Bought toast | Bought · Rice 9.5 kg · Undo · Bought · still running low | Sudah dibeli · Beras 9,5 kg · Batalkan · Sudah dibeli · masih hampir habis |
| Menu | This week · Copy last week · Recipes | Minggu ini · Salin minggu lalu · Resep |
| Meals | Breakfast · Lunch · Dinner | Sarapan · Makan siang · Makan malam |
| Dish | 4 servings · Add a dish · Recipe deleted | 4 porsi · Tambah masakan · Resep sudah dihapus |
| Kitchen notes | Kitchen notes · For the cook: allergies, what the family doesn't eat. | Catatan dapur · Untuk yang memasak: alergi, makanan yang tidak dimakan keluarga. |
| Add missing | Add missing to Shopping · To buy · Check these · Not on your list · Add 3 to Shopping | Tambahkan yang kurang ke Belanja · Perlu dibeli · Cek dulu · Belum ada di daftar · Tambah 3 ke Belanja |
| Shortfall line | Need 1.5 kg · have 1 kg · buy 500 g | Perlu 1,5 kg · ada 1 kg · beli 500 g |
| Recipe | New recipe · Servings · Ingredients · Steps · Plan this · Edit recipe | Resep baru · Porsi · Bahan · Cara membuat · Masukkan ke menu · Ubah resep |
| Recipe hint | Staff who cook will read this recipe. Write it the way they'll understand it. | Staf yang memasak akan membaca resep ini. Tulis dengan bahasa yang mereka pahami. |
| Unit hint | Rice is tracked in kg; this amount won't come off. | Beras dicatat dalam kg; jumlah ini tidak dikurangi. |
| To taste | to taste | secukupnya |
| Today line | Menu today: Soto ayam, Rendang | Menu hari ini: Soto ayam, Rendang |
| Food portions | 3 portions · Ate 1 portion | 3 porsi · Dimakan 1 porsi |
| Cooked (owner) | Cooked · Use these | Sudah dimasak · Pakai bahan ini |

## Staff text (Bahasa Indonesia only)

| Where | Text |
| --- | --- |
| Today card | Menu hari ini · Siang · Malam · 4 porsi |
| Kitchen notes line | Catatan dapur: Tanpa babi. Raka alergi kacang. |
| Recipe | Bahan · Cara membuat · untuk 4 porsi |
| Button | Sudah dimasak |
| Confirm sheet | Bahan yang dipakai · Tidak dihitung · Pakai bahan ini |
| Toast | Rendang sudah dimasak · Batalkan |
| Leftovers | Ada sisa? · Simpan ke Makanan · Tidak ada sisa |
| Item | Sisa 1,2 kg · Ubah jumlah · Masih ada · Hampir habis · Habis |
| Bought | Beli berapa? · Biasanya 5 kg · Lewati jumlah · Sudah dibeli |
| Food group | Bahan masakan |

Wording follows `docs/indonesian-glossary.md`: **Anda**; **Ubah**;
**Batalkan** for Undo; **(opsional)** only on owner forms; *Masih ada ·
Hampir habis · Habis*; *Makanan · Belanja*; decimals with a comma (1,2 kg).
Staff text never names a role ("yang memasak", not a job title).

## Glossary rows (added to `docs/indonesian-glossary.md` in PR A and PR B, before any Indonesian text)

The glossary is shared and two open PRs append to it, so these rows go in
with the build, not in this plan's PR:

| English | Bahasa Indonesia | Why |
| --- | --- | --- |
| Menu (Kitchen pill) / Menu today | **Menu** / **Menu hari ini** | Everyday word. |
| Recipe / Recipes / New recipe | **Resep** / **Resep baru** | |
| Servings / portions | **Porsi** | What recipes and warungs say. |
| Ingredients (recipe) / Ingredients (Food group) | **Bahan** / **Bahan masakan** | |
| Steps (recipe) | **Cara membuat** | What Indonesian recipes print. |
| Ready to eat (Food group) | **Siap dimakan** | |
| Track amount / Set amount | **Catat jumlah** / **Ubah jumlah** | "Catat", as in Dicatat Sari. |
| N left | **Sisa N** | "Sisa 1,2 kg". |
| Running low at | **Hampir habis kalau tinggal** | Matches *Hampir habis*. |
| How much did you buy? / Skip amount | **Beli berapa?** / **Lewati jumlah** | |
| Breakfast · Lunch · Dinner | **Sarapan · Makan siang · Makan malam** (short: **Pagi · Siang · Malam** on the staff card) | |
| Cooked / Use these ingredients | **Sudah dimasak** / **Pakai bahan ini** | |
| Not counted | **Tidak dihitung** | |
| Leftovers? / Save to Food / No leftovers | **Ada sisa?** / **Simpan ke Makanan** / **Tidak ada sisa** | |
| Kitchen notes | **Catatan dapur** | Neutral; never names the cook's role. |
| Add missing to Shopping / Check these / Not on your list | **Tambahkan yang kurang ke Belanja** / **Cek dulu** / **Belum ada di daftar** | |
| Copy last week | **Salin minggu lalu** | |
| To taste | **secukupnya** | As every Indonesian recipe writes it. |
| Units | **buah, butir, ikat, siung, lembar, batang, bungkus, sachet, sdm, sdt** | The words Indonesian kitchens use, kept in English too; the English unit picker adds a small second line (piece, egg, bunch, clove, leaf, stalk, packet, sachet, tbsp, tsp). |

## Data model

Reuse first: `inventory_items` (amount, unit, low level already there),
`food_items` (leftovers), `inventory_alerts` (free-text notes on *To buy*).
New tables only for recipes and the menu. Additive only; every historical
foreign key nullable; nothing dropped. Re-check `supabase/migrations` and
open PRs before building: 141–143 are reserved (staff push, staff pay,
closet) and 143 also re-creates the photo clean-up functions.

### Migration 144 (PR A): amounts and units

**`inventory_items`, new columns**

| Column | |
| --- | --- |
| `track_amount` | `boolean not null default false`. Owner-only (guard). |
| `amount_set_at` | `timestamptz`, stamped by the server when a tracked item's `quantity` changes or tracking turns on; any value a client sends is ignored (the trigger keeps the old one otherwise). Drives "about … · 3 weeks ago". |
| `amount_set_by` | `uuid` → `staff_profiles (id) on delete set null`, self-declared like every staff id; 119's refusal extended to it. |
| `last_bought_amount` | `numeric`, null or > 0; written by `record_purchase`; the pre-fill. |

Reused as they are: `quantity` (the amount), `unit`, `min_threshold`
(*Running low at*; 0 = none). `inventory_items_unit_check` is replaced with
the old ten plus `buah`, `butir`, `ikat`, `siung`, `lembar`, `batang`,
`bungkus`, `sachet` (sdm and sdt are recipe-only and not allowed here).
The addendum adds `pack_kind`, `pack_size`, `buy_at` and `use_by` here
(D19, D21, D17).
`unique (id, household_id)` added for the composite keys in PR B.

**`food_items`, one column**: `portions smallint`, null or 0–99. Any session
may set it (food is already editable by staff).

**Re-created (same names, `set search_path = ''`, schema-qualified)**

- `inventory_items_owner_guard()` (099): owner-only list gains
  `track_amount`; `unit` and `min_threshold` already in it. Staff keep
  `quantity`, `stock_status`, `stock_status_by`, `amount_set_by`,
  `last_bought_amount`. Still `security definer`; revoked from public,
  anon, authenticated (as 111), `service_role` only.
- `stamp_inventory_stock_status()` (122) becomes the one **amount rules**
  trigger, `before insert or update` (one function, so trigger order can't
  matter): stamps `stock_status_at` as before; on a tracked row, stamps
  `amount_set_at` when `quantity` changes or `track_amount` turns on;
  derives `stock_status` when `quantity`, `min_threshold` or `track_amount`
  changed (0 → `out`, `≤ min_threshold` when > 0 → `low`, else `ok`);
  when only `stock_status` changed to `out` on a tracked row, sets
  `quantity` to 0. Not `security definer`; revoked from public, anon,
  authenticated.
- `refuse_archived_staff_on_stock()` (122): also checks `amount_set_by`.
- `adjust_inventory_quantity(p_item_id uuid, p_delta numeric, p_staff_id uuid default null)`:
  the old two-argument function is **dropped and replaced** (a second
  overload with a default would make two-argument calls ambiguous;
  PostgREST calls by name, so the existing call keeps working). Sets
  `amount_set_by`. `security invoker` (RLS and the guard apply), revoked
  from public, anon; granted to authenticated.

**New function**

- `record_purchase(p_item_id uuid, p_amount numeric, p_staff_id uuid default null)`
  returns the row: `quantity = quantity + p_amount` when tracked and an
  amount is given; `last_bought_amount = coalesce(p_amount, …)`;
  `stock_status = 'ok'` (the trigger re-derives when the amount changed);
  `stock_status_by`, `amount_set_by` = `p_staff_id`. Rejects amounts ≤ 0 or
  over 100,000. `security invoker`; revoked from public, anon; granted to
  authenticated. The tick's Undo takes the amount back off through
  `adjust_inventory_quantity` and writes back the previous `stock_status`,
  `last_bought_amount` and `to_buy_amount` (all staff-writable columns), so
  an undone purchase leaves the item exactly as it was.

**Export**: `export_household_data()` (138) re-created to include the new
columns (it selects whole rows, so likely only a re-check). Same `security
definer`, `caller_admin_household()` check, revoked from public, anon,
granted to authenticated.

### PR B migration (next free number): recipes

**`recipes`**

| Column | |
| --- | --- |
| `id`, `household_id` | household FK, cascade on household delete; `unique (id, household_id)` |
| `name` | 1–80 characters |
| `servings` | smallint 1–50, default 4 |
| `steps` | text, up to 4,000 characters, nullable |
| `notes` | up to 300 characters, nullable |
| `photo_url` | nullable; `household-logs`, `<household>/recipes/<id>/…` |
| `created_by`, `created_at`, `updated_at` | server-stamped |

**`recipe_ingredients`**

| Column | |
| --- | --- |
| `id`, `household_id` | |
| `recipe_id` | composite FK `(recipe_id, household_id)` → `recipes (id, household_id)`, cascade |
| `item_id` | nullable; composite FK `(item_id, household_id)` → `inventory_items (id, household_id)`, `on delete set null` (a deleted item leaves the line's name) |
| `name` | 1–80, the line's text (kept even when linked, so a deleted item still reads) |
| `amount` | numeric, nullable (null = to taste), > 0 |
| `unit` | nullable; check in the stock units plus `sdm`, `sdt` |
| `position` | smallint |

RLS on both, `to authenticated`: **select** for any session of the household
(`get_user_household_ids()`: staff phones read recipes); **insert, update,
delete** only through a `household_members` check of `auth.uid()` against
`household_id` (owners), never `get_user_household_ids()` alone (AGENTS.md).
`revoke all … from anon`.

**Photos**: kept while the recipe exists, deleted with it (Storage API from
the app). The nightly clean-up functions (`task_photos_due_for_pruning`,
`orphaned_household_photos`; last re-created by 131, and by 143 if the
closet lands first) get a `recipes/` folder rule: a file no recipe points at
is removed a day after upload. Re-created with the same names and
signatures, `security definer`, empty `search_path`, revoked from public,
anon, authenticated, `service_role` only. Export includes both tables.

### PR C migration (next free number): menu and cooking

**`menu_dishes`** (one row per dish on a day)

| Column | |
| --- | --- |
| `id`, `household_id` | |
| `day` | date |
| `meal` | `breakfast`, `lunch`, `dinner` |
| `recipe_id` | nullable; composite FK → `recipes (id, household_id)`, `on delete set null` |
| `title` | 1–80; the recipe's name when picked, or typed |
| `servings` | smallint 1–50, nullable (dishes without a recipe) |
| `notes` | up to 200, nullable |
| `position` | smallint |
| `cooked_at` | timestamptz, written only by `cook_menu_dish` (server clock) |
| `cooked_by` | staff FK, `on delete set null`, self-declared; 119's refusal |
| `cooked_uses` | jsonb, what was actually taken off: `[{item_id, amount}]` in each item's unit; written only by `cook_menu_dish`, read by `uncook_menu_dish` |
| `created_by`, `created_at` | |

**`households`, three columns**: `kitchen_notes text` (up to 300), and
`kitchen_notes_confirmed_at` / `kitchen_notes_confirmed_by` (`auth.uid()`),
stamped by the server when an owner confirms the health-data note (D12).
Owners write (the existing households update path is owners only; re-check
at build); every session of the household reads.

**`inventory_items`, one column**: `to_buy_amount numeric`, null or > 0, the
shortfall from *Add missing*; cleared by `record_purchase` and by setting the
status back to *Enough*. Not owner-only (a staff purchase clears it).

RLS on `menu_dishes`, `to authenticated`: **select** for any household
session; **insert, update, delete** owners only (`household_members`).
**Staff phones never write `menu_dishes` directly**; they cook only through
the two functions below. (If staff could write `cooked_uses` and then undo,
they could add stock that was never taken; with the columns written only by
the functions, Undo returns exactly what cooking took.) A trigger stops
owners' direct updates from changing the three `cooked_*` columns too, so
the functions are the only path.

**Functions**

- `cook_menu_dish(p_dish_id uuid, p_uses jsonb, p_staff_id uuid default null)`:
  `security definer`, empty `search_path`. **Deliberately open to staff
  phones** (cooking is staff work), so the check is household membership,
  not admin: the dish's household must be in `get_user_household_ids()`.
  It is not an admin action and changes nothing an owner-only guard
  protects. One transaction: locks the dish row; refuses `already_cooked` if
  `cooked_at` is set (an offline retry can't take things off twice);
  checks every `item_id` is a **tracked item of the same household** and
  every amount is > 0 and ≤ 100,000, and that `p_staff_id` is null or a
  non-archived staff member of that household; for each,
  `quantity = greatest(quantity - amount, 0)` (the amount rules trigger
  re-derives the status and stamps `amount_set_at`); stores what was
  actually taken (after the floor at 0) in `cooked_uses`; stamps
  `cooked_at = now()`, `cooked_by`. Revoked from public, anon; granted to
  authenticated.
- `uncook_menu_dish(p_dish_id uuid)`: same security, same household check;
  adds `cooked_uses` back, clears the three columns; does nothing on a dish
  that isn't cooked. Used by the toast's Undo and an owner's **Mark not
  cooked**. Revoked from public, anon; granted to authenticated.

*Add missing to Shopping* needs no function of its own: the review sheet
writes ordinary updates (owners may set the status and `to_buy_amount`) and
adds notes through the existing `inventory_alerts` path.

**Retention (D16)**: a nightly job deletes `menu_dishes` older than one
year (a cron beside the existing ones, `service_role` only). Long enough for
"what did we cook last Lebaran"; short enough not to keep a diary forever.
Recipes are kept until deleted. Export includes `menu_dishes` and
`kitchen_notes`.

The addendum adds leftover dishes (`menu_dishes.food_item_id`) and the
*Menu changed* bookkeeping to this migration (D17, D20).

### Tests

`supabase/tests/144_kitchen_amounts.sql` (and one per later PR), rolled back,
the 122 style:

- an owner switches tracking on with an amount; status derives (0 → out, at
  the low level → low, above → ok); a staff *Running low* tap survives until
  the amount changes; *Out* sets 0;
- a staff phone can adjust the amount, record a purchase, set the status;
  **can't** switch tracking, change the unit or the low level, insert or
  delete; another household's owner and a logged-out caller can't do any of
  it; a removed staff member's id is refused in `amount_set_by`;
- `record_purchase` adds on tracked items only, rejects ≤ 0, keeps the
  pre-fill; `adjust_inventory_quantity` two-argument calls still work;
- the unit check accepts the new units and refuses `sdm` on stock;
- (PR B) owners write recipes and ingredients, staff read but can't write,
  a line can't point at another household's item, deleting an item leaves
  the line's name; the clean-up keeps a recipe photo and removes an orphan;
- (PR C) staff mark a dish cooked and the amounts drop; a second call is
  refused; Undo restores exactly; a staff phone can't insert, update or
  delete a dish directly, can't cook another household's dish or take off an
  untracked or foreign item, and an owner's direct update can't set the
  `cooked_*` columns; old dishes are deleted by the job; the export includes everything;
- every new or re-created function's grants (public, anon, authenticated,
  service_role as listed above).

Unit tests: `lib/kitchen-units.ts` (conversions, refusals, rounding when
scaling), the shortfall sum (several dishes, mixed units, untracked and
free-name lines), status derivation mirrored in TypeScript for optimistic
updates, the "about … ago" rule. Playwright on the stub: track rice, buy
5 kg, plan a dish, add missing to Shopping, cook it as staff, undo, save a
leftover; owner screens in both languages.

Applied local first (standing OK), staging with the owner's OK, production
with the owner's OK before the PR merges (`main` deploys to production).

## Privacy (D12, and every PR)

**Yes, this changes what Miamus stores.** Supabase only, same region; no new
service. Kakak is unchanged (it still gets shopping item names only).

| PR | New data | Kept |
| --- | --- | --- |
| A | For items an owner chooses to track: the amount, the unit, the low level, the last amount bought, when the amount last changed and who changed it (the staff name picked on the phone). Portions on listed food. | While the item exists (only the latest amount; no history). |
| B | Recipes: name, servings, ingredients, steps, notes, an optional photo, who wrote it. | Until deleted; photo deleted with the recipe. |
| C | The menu (what's planned for which day and meal, servings, notes), which dishes were cooked, when and by whom, and what was taken off stock. **Kitchen notes**, which may describe a family member's allergy or diet. | Menu days 1 year, then deleted; kitchen notes until changed. |

**Health data.** An allergy or a diet tied to a named person ("Raka is
allergic to peanuts") is health information, a **specific kind of personal
data under UU PDP (Pasal 4(2))**, which needs a clear purpose, explicit
consent and stronger care. Recommended handling (D12 A):

- one free-text **Kitchen notes** field per household, never per person,
  with no structured "allergy" field and no list of family members;
- the field's hint names the purpose ("for the cook: allergies, what the
  family doesn't eat") and a line under it says "Staff phones can read
  this. Write only what the cook needs to know.";
- the first save shows a one-time confirm: "This note may include health
  information about your family, such as allergies. It's shown to your
  staff so they can cook safely. Save?" (the owner's explicit choice,
  recorded with who and when in `kitchen_notes_confirmed_at` / `_by`);
- in the export and deleted with the household, like everything else.
- **The manager should ask the owner whether a UU PDP impact assessment is
  needed**, as for staff pay (Phase 167), before PR C ships.

**Privacy-policy lines** (`src/components/legal/privacy-policy.tsx`, both
languages; `policyVersion` bumped with a dated comment and `effectiveDate`
updated in `src/config/legal.ts` in each PR that adds data):

- PR A, "what we store", the shopping list line becomes: "The household's
  shopping list: which supplies are running low or out, who said so, and,
  for items an admin chooses to track, how much is left, the last amount
  bought, and when and by whom the amount was last changed." / "Daftar
  belanja rumah tangga: barang yang hampir habis atau habis, siapa yang
  menandainya, dan, untuk barang yang jumlahnya dipilih admin untuk
  dicatat, sisa jumlahnya, jumlah terakhir yang dibeli, serta kapan dan
  oleh siapa jumlah itu terakhir diubah." The food line gains "how many
  portions are left".
- PR B: "Recipes the household writes: name, servings, ingredients, steps,
  notes and an optional photo, kept until you delete them. A recipe's photo
  is deleted with it." / "Resep yang ditulis rumah tangga: nama, porsi,
  bahan, cara membuat, catatan dan foto (jika ada), disimpan sampai Anda
  menghapusnya. Foto resep ikut terhapus bersama resepnya."
- PR C: "The household's menu plan: dishes planned for each day and meal,
  which were cooked, when and by whom, and the ingredients taken off the
  list; kept one year, then deleted automatically." and "Kitchen notes an
  admin writes for staff, which may include health information such as a
  family member's allergy; shown to the household's staff so they can cook
  safely, and kept until changed or deleted." / "Rencana menu rumah tangga:
  masakan yang direncanakan untuk setiap hari dan waktu makan, mana yang
  sudah dimasak, kapan dan oleh siapa, serta bahan yang dikurangi dari
  daftar; disimpan satu tahun, lalu dihapus otomatis." and "Catatan dapur
  yang ditulis admin untuk staf, yang bisa berisi informasi kesehatan
  seperti alergi anggota keluarga; ditampilkan kepada staf rumah tangga
  agar mereka bisa memasak dengan aman, dan disimpan sampai diubah atau
  dihapus." Plus the retention list: menu days one year.

No new third party, no new region, no change to Kakak: `legal.ts`'s service
list doesn't change; only the version and date.

## Rollout in PRs (D15)

**PR A: amounts and units** (migration 144). Track amount, units, the
amount rules trigger, `record_purchase`, *How much did you buy?*, minus/plus
and *Set amount* for owners and staff, the "about … ago" line, Food's
*Ingredients* group and Shopping's supplies split, portions on Food, glossary
rows, privacy lines, What's new cards (owner and staff). Useful on its own:
she can track exact amounts from day one.

**PR B: recipes** (next free migration). The **Menu** pill arrives here and,
until PR C, opens straight on the recipe box (no empty week, no "coming
soon"). Scaling, photos, the clean-up folder rule, glossary, privacy lines.

**PR C: menu and the cook's view** (next free migration). The weekly plan,
Copy last week, Kitchen notes (with the health-data confirm), Add missing to
Shopping with `to_buy_amount`, Menu hari ini on staff Today, Sudah dimasak
and Undo, leftovers to Food, the owner Today line, the 1-year clean-up,
privacy lines, staff card. **This is roadmap item 20.**

Each PR: unit tests, SQL tests, Playwright on the stub, `tsc`, `next build`,
CI, Codex until clean, migration local → staging → production with the
owner's OK, merge with the owner's OK. PR A can start once 141–143 are
settled or their numbers confirmed (re-check the migration list first).

## Tutorial (What's new, shown once per role)

**Owners, PR A**: 1. "Want exact amounts? Tap an item and switch on **Track
amount**. Only for the items you care about." / "Ingin jumlah yang pasti?
Ketuk barang lalu nyalakan **Catat jumlah**. Cukup untuk barang yang
penting." 2. "It updates when you buy or cook. Nobody has to count." /
"Jumlahnya berubah saat belanja atau memasak. Tidak ada yang perlu
menghitung." 3. "Ingredients now sit under **Food**, next to what's ready to
eat." / "Bahan masakan sekarang ada di **Makanan**, di samping yang siap
dimakan."

**Staff, PR A**: "Bahan masakan (beras, telur, minyak) sekarang ada di
**Dapur → Makanan**. Cara menandainya sama: ketuk, lalu pilih Hampir habis
atau Habis." and "Kalau ada angkanya, tekan minus atau plus saja."

**Owners, PR C**: "Plan the week in **Kitchen → Menu**, then **Add missing
to Shopping**." / "Rencanakan menu seminggu di **Dapur → Menu**, lalu
**Tambahkan yang kurang ke Belanja**."

**Staff, PR C**: "Menu hari ini ada di atas Tugas Hari Ini. Setelah masak,
tekan **Sudah dimasak**."

## Decisions for the owner

**Decided 2026-11-10: the owner chose all recommendations, so D1–D16 are
all A.** D17–D22 are in the addendum at the end: parked, not decided.

- **D1 — Exact amounts: for which items?**
  **A (recommended):** opt-in per item; an owner switches on **Track amount**
  where it matters, everything else stays *Enough · Running low · Out*.
  B: every food item (fresh food and pantry shelves) tracked by default.
  C: no amounts; recipes and menu only.
- **D2 — When amounts change.**
  **A (recommended):** only with work that already happens (buying adds,
  cooking takes off after one confirm, a glance with minus/plus); never a
  scheduled count, never a reminder to count. B: A plus an optional weekly
  "check your amounts" card for owners. C: by hand only (no buying or
  cooking link).
- **D3 — What staff phones may change.**
  **A (recommended):** amounts, purchases, the three states, cooked dishes
  and leftovers; not tracking, units, low levels, recipes or the menu (the
  guard's owner-only list grows by one column). B: staff see amounts but
  can't change them (owners do all the numbers). C: staff may also write
  recipes and plan the menu.
- **D4 — Units.**
  **A (recommended):** metric plus buah, butir, ikat, siung, lembar, batang,
  bungkus, sachet; sdm and sdt in recipes only; exact conversions only
  (g ↔ kg, ml ↔ L, pieces 1 : 1); sdm, sdt and *secukupnya* never come off
  stock. B: metric and pcs only. C: A plus a per-item conversion an owner
  sets ("1 butir = 60 g").
- **D5 — Kitchen's pills.**
  **A (recommended):** **Food · Shopping · Menu**, Food first and default;
  Recipes inside Menu. B: four pills, Food · Shopping · Menu · Recipes.
  C: Menu · Food · Shopping (plan first; but an empty Menu greets households
  that don't plan).
- **D6 — One Kitchen: where ingredients live.**
  **A (recommended):** fresh-food and pantry items move to **Food →
  Ingredients**, beside *Ready to eat*; Shopping keeps *To buy* (everything)
  and the non-food supplies. Each item in one browsing place. B: leave them
  under Shopping; Food and stock meet only through cooking and leftovers.
  C: merge food and stock into one table (a big migration for little gain).
- **D7 — Amounts on Food (leftovers).**
  **A (recommended):** an optional **portions** number, pre-filled from a
  cooked dish; **Ate 1 portion** counts down. No weights on ready food.
  B: no amounts on Food. C: full amounts and units on Food too.
- **D8 — Who writes recipes.**
  **A (recommended):** owners write, every staff phone reads. B: staff may
  add and edit recipes too (owners delete). C: owners only, staff don't
  see recipes (the cook gets dish names only).
- **D9 — Who sees Menu hari ini.**
  **A (recommended):** every staff phone of the household, at the top of
  Tugas Hari Ini when there's a plan; owners get a quiet Today line. B: an
  owner picks one cook; only their phone shows it. C: Menu only in Dapur,
  not on Today.
- **D10 — Add missing to Shopping.**
  **A (recommended):** a review sheet: tracked shortfalls ticked with the
  amount ("buy 500 g"), untracked and unlisted ingredients shown to tick;
  nothing added without the review. B: add the shortfalls automatically
  when a dish is planned. C: no shortfall: the plan just lists ingredients.
- **D11 — The owner's wife's account.**
  **A (recommended):** her own owner account through the existing owner
  invite (her own Google sign-in, English or Bahasa Indonesia, her own name
  on what she does). B: a new "cook / planner" role with Kitchen-only rights
  (a new role across every policy and screen; large, and today every
  `household_members` row is an admin). C: share the owner's account (no;
  her actions would carry his name).
- **D12 — Allergies and diet.**
  **A (recommended):** one household **Kitchen notes** text for the cook,
  shown on the Menu, Menu hari ini and recipes; flagged as possible health
  data with a one-time confirm and privacy-policy lines; no per-person
  records. B: per-person allergies and diets, once the Care tab (item 18)
  has people records. C: nothing now; families keep telling the cook.
- **D13 — Prices.**
  **A (recommended):** no prices in this phase; money comes with **household
  cash** (item 15: money given to staff, receipts, balance), which can then
  store the price of each purchase. B: an optional "last price" per item now
  (staff phones can read item rows, so it would be visible to staff).
- **D14 — Old Phase 83/110 counts when an item opts in.**
  **A (recommended):** never used silently; the old count shows as a hint
  ("Old count: 2 kg on 3 Oct, not used") and the person types today's
  amount; the old `min_threshold` (often the default 2) is ignored; the old
  audit rows stay untouched and in the export. B: carry the old count over
  as the starting amount. C: clear the old counts and audit rows in the
  migration (loses data; no).
- **D15 — Order of PRs.**
  **A (recommended):** PR A amounts and units (144), PR B recipes, PR C menu
  and the cook's view (item 20). B: A, then the menu with plain dish names
  (item 20 sooner), then recipes. C: one large PR.
- **D16 — How long menus are kept.**
  **A (recommended):** one year, then deleted nightly. B: 90 days, like
  finished food. C: forever.

## Open questions only the owner (or his wife) can answer

1. **Does your wife already sign in with her own Google account as an
   owner?** If yes, D11 needs no work; if not, she needs the owner invite
   before PR A.
2. **Who cooks day to day: your wife, a staff member, or both?** If staff
   cook most days, PR C (Menu hari ini) matters more than recipes and D15 B
   may be better.
3. **Does anyone at home have a food allergy or diet the cook must never
   miss?** If yes, D12 A is worth its health-data care; if not, D12 C is
   simpler and avoids health data entirely.
4. **Which language will she write recipes in, and does the cook read it
   comfortably?** Recipe text isn't translated; an English recipe would
   reach a staff phone in English.

## Later (ideas from the owner, 2026-11-11; not built, no decisions yet)

Kept here so they aren't lost. None of these is in PR A, B or C; each needs
the owner's decision (and, where marked, a privacy update) before building.
Order the owner approved: PR A → PR B → PR C → the addendum (D17–D22) as
optional switches → receipt reading.

1. **A photo of a grocery receipt fills the stock (Kakak, Plus).** Kakak
   suggests, a person confirms on a review card ("Wortel 0,5 kg → Carrots");
   nothing is saved before confirm. Per-household aliases remember matches
   ("WRTL IMP 0.512" → Carrots). Tracked items get amounts through
   `record_purchase`; untracked items are just marked bought; unknown lines
   ask "New item?" or are skipped, never created silently. Ambiguous units
   ("1 pack") ask, or use pack sizes (D19). The by-hand Bought sheet stays
   the main path (the pasar has no receipt). Add `receipts` to
   `src/lib/plans.ts` when built.
2. **Receipts as "snap and hand off".** *Free:* the owner taps **Foto
   struk**; Miamus makes a staff task, **Cek belanjaan**, with the photo;
   staff enter or confirm items, amounts, units and use-by dates; the owner
   sees "Checked by Ari". *Plus:* Kakak reads the receipt first and pre-fills
   the staff list, so staff only confirm. Same pattern later for bills (PLN,
   PDAM) and food gifts ("Tante Rina kirim rendang").
3. **Staff never see prices** (owner's standing rule): item prices, receipt
   totals, grocery spending, bill amounts and budgets never reach a staff
   screen, push, WhatsApp text or photo. The original receipt photo is
   owner-only (an owner-only table and storage path, as `repair_costs` and
   `bill_payments`), kept 90 days. *Free:* before the photo goes to staff,
   the owner crops away the price column (**Hide the prices**); only the
   cropped copy reaches the task. *Plus:* Kakak reads the original on the
   server and staff get a text list only. Prices go in owner-only tables
   (RLS through `household_members` / `caller_admin_household()`), tested in
   SQL (a staff session reads 0 rows), never in a staff phone's offline
   cache. Honest caveat: staff who pay at the till know those prices.
4. **Grocery spending for owners**: an owner-only *Spending* view
   (groceries from receipt totals, bill payments, repair costs, a month
   total) belongs with household cash (roadmap item 15) and D13, not as a
   "bill". Pasar purchases without a receipt: the owner types the amount, or
   later "uang belanja".
5. **Menus and recipes follow what's in stock** (the addendum D17–D22 plus
   PR C's cooking and D10): exact only for tracked items, untracked ones
   "not checked"; show what's missing rather than hiding recipes ("Missing
   2"); "use soon" first.
6. **Cook before it expires.** *Free:* recipes using something that expires
   soon rank first, with a quiet line ("uses ayam, expires Thu"), and the
   Menu planner gets a "Use soon" strip (D17). *Plus:* "What can I cook
   before these expire?" gives ideas even without saved recipes; the chosen
   dish goes on the menu through a review card. Needs an optional **use-by**
   on tracked ingredients, set at Bought, or a per-item default shelf life
   the owner sets once (ayam: 2 days in the fridge, 3 months in the
   freezer); never required. Later outcome line: "3 things used before they
   expired this week".
7. **Gaps to raise with the owner**: "always have" staples (salt, oil,
   sugar: a per-item flag so recipes never call them missing; could join
   PR C), pack sizes (D19), use-by dates on raw ingredients (D17), prices and
   budget (item 15, after D13), shopping by place (D21).

**Privacy before building receipts:** the receipt photo goes to Anthropic
only with Kakak switched on, to be read and then deleted; receipts carry
prices, store names and card digits, so everything except item, amount and
(if the owner wants it, owner-only) price is dropped; receipt photos get a
retention period (90 days); the privacy policy (EN and ID) and `legal.ts`
list it before it ships. **Kakak "Translate for staff"** (answer 4) is the
same kind of change: recipe text sent to Anthropic, so a policy line and a
Plus decision first.

## Not in this phase

- **Kakak (the paid extra), later ideas only:** "what can I cook with what
  we have", reading a receipt photo into amounts, suggesting a week's menu,
  turning a pasted recipe into ingredient lines.
- Prices, spending and budgets (item 15, household cash).
- Per-person allergy and diet records (Care tab, item 18).
- Nutrition, calories, macros.
- Per-batch expiry on stock (two packs of chicken with two dates).
- Cooking an unplanned dish from a recipe on a staff phone (owners can plan
  it for today first); a later small addition if asked.
- Snacks and bekal (lunchbox) as meals; later if asked.
- Importing recipes from websites; sharing recipes between households.
- History of amount changes (only the latest amount is kept).
- Push notifications for the menu (the Today card is enough; staff phones
  get no pushes today).

---

## Addendum (2026-11-10): Menu ↔ food ↔ shopping, the closed loop

Status: **Parked after the 10 Nov evaluation (docs/app-evaluation-2026-11-10.md): revisit as optional switches after starter templates and Kakak setup ship and target households ask; D17–D22 not decided.**

Original status (10 Nov): D17–D22 were a plan, waiting for the owner (each with a
recommended A). D1–D16 above stay decided. The owner asked that the menu
connect to the food the house already has and to what it should buy. The
core loop is already in the plan (recipe lines linked to items, *Add
missing to Shopping* with the shortfall, *Sudah dimasak* takes things off,
*Ada sisa?* saves leftovers to Food). This addendum closes the rest: eat
what's about to go off first, see at a glance whether a dish can be cooked,
buy in real packs, notice when the plan changed after the list was made,
and group the list by where the shopper goes. Everything here works by
hand; none of it is Kakak.

### The loop at a glance

```
            +------------------------------------------------+
            |                                                |
            v                                                |
   FOOD (what's in the house)                                |
   Ready to eat: leftovers, gifts (expiry, portions)         |
   Ingredients: tracked amounts, use-by on fresh items       |
            |                                                |
            | Eat soon strip (D17)       Ready to cook /     |
            | "Sisa rendang" onto a day  Missing 2 (D18)     |
            v                                                |
   MENU (the week)  ----- Add missing to Shopping ----->  SHOPPING (To buy)
   dishes from recipes     shortfall in packs (D19),      grouped by Pasar,
   or leftovers            re-check if the menu           Supermarket, Online
            |              changed (D20)                  (D21)
            |                                                |
            | Sudah dimasak: ingredients come off            | Bought: N packs,
            | Sudah dimakan: leftover portions count down    | adds the amount,
            | Ada sisa?: new leftovers go to Food            | optional use-by
            v                                                |
   FOOD again  <---------------------------------------------+
```

Each arrow is a tap someone already makes (planning, cooking, eating,
buying). No arrow is a count, a reminder or a scheduled check.

### Eat soon: use it first (D17)

- **The strip.** At the top of **Kitchen → Menu**, a horizontal row titled
  **Eat soon** (**Perlu segera dimakan**, the glossary's wording for the
  Today line and the morning push, so one idea has one name). It shows:
  ready-to-eat food past its date or expiring today, tomorrow or the day
  after (the Today line's window plus one day), and every leftover that
  has portions, soonest first. Each chip: the name, "3 portions" or "expires
  Thu", and a plus. Shown only when there's something in it.
- **Put it on a day.** Tapping a chip's plus picks the day and meal (today's
  next meal preselected) and adds a dish titled **Leftover rendang**
  (**Sisa rendang**), servings = the portions left (adjustable), linked to
  that food item. On the Menu and on staff's *Menu hari ini* it reads like
  any dish, with the fridge icon instead of the recipe icon.
- **Eating it counts the portion down.** A leftover dish's button is
  **Eaten** (**Sudah dimakan**), not *Cooked*. It takes the dish's servings
  off the food's portions; at 0 the food is finished as *Eaten* (Phase 156's
  outcome, so it leaves the list and keeps its 90-day record). A leftover
  without portions is finished as *Eaten* in one go. Undo puts the portions
  (and the food) back. Nothing comes off stock.
- **Recipes that would use something soon.** Raw ingredients have no expiry
  today, so the plan adds one optional **Expires** date to tracked items on
  the **Fresh food** shelf (chicken, fish, vegetables). It's asked in the
  *How much did you buy?* sheet only, collapsed, with Food's quick picks
  (Tomorrow, 3 days, 1 week, Pick a date). It's the earliest date of what's
  there: a new purchase keeps the older date while old stock remains, and
  the date clears when the amount reaches 0. A recipe whose linked items
  include one expiring within 2 days gets a quiet line, **Uses chicken ·
  expires Thu** (**Pakai ayam · kedaluwarsa Kam**), and sorts first in the
  dish picker. Not red; not a push.

### Can we cook it? (D18)

Worked out on the phone from what's already stored. No AI, no new data.
For a recipe at a given number of servings, each ingredient line is:

| Line | Available when |
| --- | --- |
| Linked to a tracked item, unit converts | the amount there ≥ the scaled amount |
| Linked to a tracked item, unit doesn't convert (sdm, sdt, a different group) | its status is *Enough* |
| Linked to an untracked item | its status is *Enough* (*Running low* and *Out* count as missing) |
| Free name, or *to taste* | not checked (counted as available, listed as "not checked") |

- A recipe or planned dish then shows **Ready to cook** (**Bahan lengkap**)
  or **Missing 2: coconut milk, lemongrass** (**Kurang 2: santan, serai**).
  A tracked item that has enough but a person marked *Running low* counts
  as available for that dish (the amount says so) and keeps its status on
  the shopping list.
- **Per dish, against what's there now.** A dish later in the week doesn't
  subtract the dishes before it; *Add missing to Shopping* is the place that
  adds up the week. On a future day the badge reads **Ready to cook now**,
  so nobody takes it as a promise for Friday.
- **Recipes** get a pill **All · Ready to cook now** (**Semua · Bahan
  lengkap**), the shared `<SegmentedControl />`, in the URL as
  `&recipes=ready`. Ready ones first, then by fewest missing.
- **Staff** see the same line on *Menu hari ini* ("Kurang 1: serai"), so the
  cook knows before starting. Staff can tap the missing item to mark it
  *Hampir habis* (their existing one tap).
- This is the hand-made version of the later Kakak idea "what can I cook
  with what we have".

### Pack sizes (D19)

- **Optional, per tracked item, owner only**: a pack kind and its size in
  the item's unit. **Rice · 1 sack = 5 kg** (**Beras · 1 karung = 5 kg**).
  Pack kinds, a short list so both languages stay consistent:

  | Key | English | Bahasa Indonesia | Typical |
  | --- | --- | --- | --- |
  | `sack` | sack | karung | rice 5 kg, 10 kg |
  | `pack` | pack | pak | noodles, butter |
  | `packet` | packet | bungkus | santan, spices |
  | `bottle` | bottle | botol | kecap, oil 1 L |
  | `jerrycan` | jerry can | jeriken | oil 5 L |
  | `tray` | tray | rak | eggs, 30 butir |
  | `box` | box | kotak | tea, milk |

- **Bought** on an item with a pack asks **How many?** with a pack stepper:
  **1 sack (5 kg)**, the sum line "Now 4.5 kg · after 9.5 kg", and **Type an
  amount instead** for a loose purchase. Without a pack, it asks the amount
  as in the main plan.
- **The shortfall rounds up to whole packs**: "Rice · need 6 kg · have
  4.5 kg · buy 1 sack (5 kg)"; the WhatsApp text says "Beras 1 karung
  (5 kg)". Items without a pack keep the exact amount ("Chicken 500 g").
- The pack is set in the item sheet, under *Track amount*: **Usually bought
  as** (optional): kind chips and the size. Turning tracking off hides it
  but keeps it.

### The plan changed after the list (D20)

- **When.** *Add missing to Shopping* remembers what it looked at: the days
  it covered and a fingerprint of their dishes (each dish's id, recipe or
  leftover, servings, and its recipe's last edit). Cooking a dish doesn't
  change the fingerprint; adding, removing or changing a dish, or editing
  its recipe, does.
- **What people see.** If the fingerprint no longer matches, the Menu shows
  **Menu changed since your list · Review** (**Menu berubah sejak daftar
  belanja dibuat · Cek lagi**), and the *To buy* header shows the same line
  for owners. Tapping it opens the same review sheet.
- **Re-running only touches what the review added.** Items the review put
  on the list are marked as such. On a re-run: their amounts are updated
  to the new shortfall; one that no longer has a shortfall comes off the
  list, **but only if nobody touched its status since** (a staff "Hampir
  habis" afterwards keeps it on). An item someone put on the list by hand is
  never removed; the review may only update the amount shown next to it.
  Notes the review added (free-name ingredients) follow the same rule.
- Staff phones see no banner (they don't plan); the list they see is simply
  the updated one.

### Where to buy (D21)

- **Optional tag per item, owner only**: **Wet market · Supermarket ·
  Online · Other** (**Pasar · Supermarket · Online · Lainnya**), in the item
  sheet as **Where to buy** (**Beli di**).
- **Grouping only when it helps.** While no item on *To buy* has a tag, the
  list looks exactly as today. Once one does, *To buy* groups by tag in that
  order, then **Anywhere** (**Di mana saja**) for untagged items and notes.
  Staff's *Perlu dibeli* groups the same way.
- **WhatsApp / Copy** follows the groups:

  ```
  Belanja
  Pasar
  - Ayam 500 g
  - Serai
  Supermarket
  - Santan 2 bungkus
  - Beras 1 karung (5 kg)
  ```

  Headings and units in the language of the person sending (owners'
  choice; staff always Indonesian), item names as the household typed them.

### Basic nutrition (D22)

The owner asked for basic nutrition, kept simple: **calories, protein,
carbohydrate, fat and fibre**, nothing else.

- **Off by default, for the household.** One switch, **Nutrition**
  (**Nilai gizi**, the words on every Indonesian food label), off until an
  owner turns it on. It's offered in context, once, as a quiet card on the
  Recipes screen ("Show calories, protein, carbs, fat and fibre per
  serving?" **Turn on** · **Not now**), and stays in the Recipes screen's
  menu afterwards. Never at sign-up, never on staff phones. Off, nothing
  below appears anywhere.
- **Values live on items, typed once.** With the switch on, the item sheet
  (tracked or not) gets a small **Nutrition** block: kcal, protein, carbs,
  fat, fibre, **per 100 g** for weight items, **per 100 ml** for volume
  items, **per piece** for pcs, buah and butir, and **per one unit** for
  the other units ("per bungkus"). The basis follows the item's unit; if an
  owner changes the unit to another group (kg to pcs), the values are
  cleared, because they would be wrong.
- **Where values come from.** Typed by hand, or **Pick from the list**: a
  reference list bundled with the app, searchable in both languages, that
  fills the five fields (still editable). The list is ours to curate: about
  200 everyday Indonesian ingredients (beras, ayam, telur, tempe, tahu,
  santan, kangkung, minyak goreng) with Indonesian and English names, each
  mapped to its source entry.
- **Sources and licences (checked 2026-11-10):**
  - **USDA FoodData Central** (U.S. Department of Agriculture): public
    domain, published under **CC0 1.0**; no permission needed; USDA asks
    that apps name FoodData Central as the source. It covers most local
    staples (rice, tempeh, tofu, coconut milk, water spinach). **This is the
    default source.** Attribution goes on the About Miamus page and as a
    small "Source: USDA FoodData Central" under a picked value.
  - **TKPI** (Tabel Komposisi Pangan Indonesia, Kemenkes; online at
    panganku.org): the best source for Indonesian dishes and local foods,
    but **its licence is unclear**. panganku.org states no licence or reuse
    terms (only a 2018 copyright footer crediting GAIN and a liability
    disclaimer). So the list **does not bundle TKPI values** until Kemenkes
    gives written permission; the manager can ask the owner whether to
    request it. Until then: USDA plus manual entry. An owner may of course
    type TKPI numbers themselves.
- **A recipe** shows one line under its title, owners only:
  **Per serving: 520 kcal · protein 32 g · carbs 48 g · fat 18 g · fibre
  6 g**, with **Whole dish** one tap away. Computed on the phone from the
  linked lines whose unit converts exactly to the item's basis (the same
  rule as amounts: g ↔ kg, ml ↔ L, pieces 1 : 1, the same unit). A counted
  line without values, an sdm/sdt line, or a free-name line makes the result
  **partial** ("Partial: 2 ingredients without values"); *to taste* lines
  are left out and don't make it partial. Per serving = whole dish ÷ the
  recipe's servings; the stepper doesn't change it.
- **The menu day** shows, owners only, a day total for **one serving of each
  dish** that day ("Today, one serving of each: 1,480 kcal · …"), partial
  when any dish is. Leftover dishes and dishes without a recipe count as
  partial.
- **Not health advice.** Under the line: "Estimates from the values you
  entered." No targets, no colours for good or bad, no "too much".
- **No per-person tracking in this phase.** No goals, no intake log, no
  weights or body data, nothing tied to a person. Values describe food, not
  people, so they aren't personal or health data and need no consent.
  Per-person intake, goals and full micronutrients come later with the Care
  tab's people records (item 18) and will need **health-data consent under
  UU PDP**.

| Where | English | Bahasa Indonesia |
| --- | --- | --- |
| Switch, card | Nutrition · Show calories, protein, carbs, fat and fibre per serving? · Turn on · Not now | Nilai gizi · Tampilkan kalori, protein, karbohidrat, lemak dan serat per porsi? · Nyalakan · Nanti saja |
| Item block | Nutrition · per 100 g · per 100 ml · per piece · per bungkus · Pick from the list · Source: USDA FoodData Central | Nilai gizi · per 100 g · per 100 ml · per buah · per bungkus · Pilih dari daftar · Sumber: USDA FoodData Central |
| Fields | kcal · Protein · Carbs · Fat · Fibre | kkal · Protein · Karbo · Lemak · Serat |
| Recipe line | Per serving: 520 kcal · protein 32 g · carbs 48 g · fat 18 g · fibre 6 g · Whole dish | Per porsi: 520 kkal · protein 32 g · karbo 48 g · lemak 18 g · serat 6 g · Satu masakan |
| Partial | Partial: 2 ingredients without values | Sebagian: 2 bahan belum ada nilai gizinya |
| Day total | Today, one serving of each: 1,480 kcal | Hari ini, satu porsi tiap masakan: 1.480 kkal |
| Note | Estimates from the values you entered. | Perkiraan dari nilai yang Anda isi. |

Glossary rows (with PR A): **Nilai gizi** (Nutrition; the label word),
**kkal** (kcal, the label unit), **Karbohidrat** in full in the switch's
sentence and **Karbo** in the short line (Carbs), **Lemak** (Fat),
**Serat** (Fibre), **Protein** (unchanged), **Sebagian** (Partial),
**per porsi** / **Satu masakan** (per serving / whole dish). Thousands with
a dot and decimals with a comma in Indonesian (1.480 kkal; 2,5 g), as the
glossary's formatting rules say.

**Data model (migration 144):**

| Where | Column | |
| --- | --- | --- |
| `households` | `nutrition_on` | `boolean not null default false`; owners write. |
| `inventory_items` | `kcal`, `protein_g`, `carbs_g`, `fat_g`, `fibre_g` | `numeric`, each null or 0–10,000 (per the basis; a whole piece can be large). Owner-only (guard). |
| `inventory_items` | `nutrition_source` | `text`, null, `manual` or `usda` (`tkpi` added only with permission); `nutrition_ref` `text` (the FoodData Central id), null. Owner-only. |

- The amount rules trigger (144) clears the five values and the source when
  `unit` changes to another group (weight, volume, pieces, other).
- The bundled reference list is a static JSON file in the app (no table, no
  service, no network call); its build script and the source ids live in
  the repo, with the USDA citation.
- The household export includes the new columns. Privacy policy: one clause
  on the PR A shopping line, "…and, if the household turns it on, nutrition
  values for items" / "…serta, jika rumah tangga menyalakannya, nilai gizi
  barang"; no personal data, no new service. The About page credits USDA
  FoodData Central.
- Tests: the guard refuses a staff phone writing any nutrition column; the
  unit-group change clears values; unit tests for the per-serving sum, the
  partial rule (missing values, sdm, free names; *to taste* ignored), the
  basis per unit group, and Indonesian number formatting.

### Owner text (EN / ID), addendum

| Where | English | Bahasa Indonesia |
| --- | --- | --- |
| Menu strip | Eat soon | Perlu segera dimakan |
| Strip chip | 3 portions · expires Thu · Add to a day | 3 porsi · kedaluwarsa Kam · Masukkan ke menu |
| Leftover dish | Leftover rendang · Eaten | Sisa rendang · Sudah dimakan |
| Recipe hint | Uses chicken · expires Thu | Pakai ayam · kedaluwarsa Kam |
| Bought sheet, fresh items | Expires (optional) | Kedaluwarsa (opsional) |
| Badge | Ready to cook · Ready to cook now · Missing 2: coconut milk, lemongrass · 1 not checked | Bahan lengkap · Bahan lengkap · Kurang 2: santan, serai · 1 tidak dicek |
| Recipes pill | All · Ready to cook now | Semua · Bahan lengkap |
| Item sheet | Usually bought as (optional) · 1 sack (5 kg) | Biasa dibeli per (opsional) · 1 karung (5 kg) |
| Pack kinds | sack · pack · packet · bottle · jerry can · tray · box | karung · pak · bungkus · botol · jeriken · rak · kotak |
| Bought sheet | How many? · Type an amount instead | Beli berapa? · Ketik jumlahnya saja |
| Shortfall | buy 1 sack (5 kg) | beli 1 karung (5 kg) |
| Banner | Menu changed since your list · Review | Menu berubah sejak daftar belanja dibuat · Cek lagi |
| Item sheet | Where to buy | Beli di |
| Where | Wet market · Supermarket · Online · Other · Anywhere | Pasar · Supermarket · Online · Lainnya · Di mana saja |

### Staff text (Bahasa Indonesia only), addendum

| Where | Text |
| --- | --- |
| Menu hari ini | Bahan lengkap · Kurang 1: serai · Sisa rendang · 2 porsi |
| Leftover dish button | Sudah dimakan |
| Beli berapa? | 1 karung (5 kg) · Ketik jumlahnya saja · Kedaluwarsa (boleh dikosongkan) |
| Perlu dibeli groups | Pasar · Supermarket · Online · Lainnya · Di mana saja |

Staff forms say **(boleh dikosongkan)**, never "(opsional)", as the glossary
asks.

### Glossary rows (with PR A and PR C, as above)

| English | Bahasa Indonesia | Why |
| --- | --- | --- |
| Eat soon (Menu strip) | **Perlu segera dimakan** | Already the Today line's and the push's words. |
| Leftover {dish} / Eaten (leftover dish) | **Sisa {masakan}** / **Sudah dimakan** | "Sisa rendang". |
| Ready to cook / Missing N | **Bahan lengkap** / **Kurang N** | "Siap dimasak" reads as "prepped"; "bahan lengkap" says what's checked. |
| Not checked | **Tidak dicek** | |
| Usually bought as | **Biasa dibeli per** | "Biasa dibeli per karung". |
| Sack · jerry can · tray (packs) | **Karung · Jeriken · Rak** | KBBI spellings; "rak telur" is how eggs are sold. pak, bungkus, botol, kotak are already in the units row. |
| Type an amount instead | **Ketik jumlahnya saja** | |
| Menu changed since your list · Review | **Menu berubah sejak daftar belanja dibuat · Cek lagi** | |
| Where to buy / Anywhere | **Beli di** / **Di mana saja** | |
| Wet market · Supermarket · Online · Other | **Pasar · Supermarket · Online · Lainnya** | Everyday words; "swalayan" reads dated. |

### Data model, addendum

**Migration 144 (PR A) gains four `inventory_items` columns:**

| Column | |
| --- | --- |
| `pack_kind` | `text`, null or one of `sack`, `pack`, `packet`, `bottle`, `jerrycan`, `tray`, `box`. Owner-only (guard). |
| `pack_size` | `numeric`, null or > 0 and ≤ 100,000, in the item's `unit`; a check that `pack_kind` and `pack_size` are both set or both null. Owner-only. |
| `buy_at` | `text`, null or one of `market`, `supermarket`, `online`, `other`. Owner-only. |
| `use_by` | `date`, null; only meaningful on tracked Fresh food items. Staff-writable (staff buy). Cleared by the amount rules trigger when `quantity` reaches 0; ignored when tracking is off. |

- `inventory_items_owner_guard()` (re-created in 144 anyway) adds
  `pack_kind`, `pack_size`, `buy_at` to its owner-only list.
- `record_purchase` gains `p_use_by date default null` (the function is new
  in 144, so no overload issue): when given, `use_by` becomes the earlier of
  the current date and `p_use_by` while the old amount is above 0, else
  `p_use_by`. Packs are multiplied on the phone; the function still takes
  the amount in the item's unit. Undo writes back the previous `use_by` too.
- The privacy line for PR A (above) gains: "…and, where an admin sets them,
  the usual pack size, where it's usually bought and when fresh stock
  expires." / "…serta, jika admin mengisinya, ukuran kemasan yang biasa
  dibeli, tempat biasa membelinya dan tanggal kedaluwarsa bahan segar." No
  personal data; no new service.

**PR C's migration gains:**

| Where | Column | |
| --- | --- | --- |
| `menu_dishes` | `food_item_id` | nullable; composite FK `(food_item_id, household_id)` → `food_items (id, household_id)` (needs `unique (id, household_id)` on `food_items`), `on delete set null`. A leftover dish. A check that a dish has a recipe, a leftover, or neither, never both. |
| `menu_dishes` | `updated_at` | server-stamped; part of the fingerprint's inputs. |
| `inventory_items` | `to_buy_by_menu` | `boolean not null default false`: the review put it on the list. Staff-writable (cleared by a purchase). |
| `inventory_alerts` | `from_menu` | `boolean not null default false`: a note the review added. |
| `households` | `menu_list_from`, `menu_list_to`, `menu_list_fingerprint`, `menu_list_at` | what the last review covered. Owners write; every household session reads. |

- `cook_menu_dish` handles a leftover dish: instead of stock, it lowers the
  food's `portions` by the dish's servings (floored at 0) and sets the food's
  outcome to `eaten` at 0 (or at once when the food has no portions); what it
  changed goes into `cooked_uses` as `{food_item_id, portions, finished}`,
  so `uncook_menu_dish` restores exactly. The food must belong to the same
  household and still be listed. Same `security definer`, same household
  check, same revokes and grants.
- The fingerprint is computed by the phone (a stable hash of the sorted
  inputs) and only compared, never trusted for anything but showing the
  banner.
- *Ready to cook* and *Eat soon* need no database change.

**Tests, addendum**: the guard refuses a staff phone setting `pack_kind`,
`pack_size` or `buy_at` and allows `use_by`; the pack check refuses a kind
without a size; `use_by` keeps the earlier date while stock remains and
clears at 0; a leftover dish counts portions down, finishes the food at 0,
and Undo restores both; a leftover dish can't point at another household's
food or a finished one; a re-run of the review removes only items it added
whose status nobody changed since. Unit tests: availability per line (each
row of the D18 table), pack rounding ("need 6 kg, have 4.5 kg, pack 5 kg →
1 pack"), the fingerprint ignoring cooking and noticing an edited recipe,
the WhatsApp grouping.

### Rollout, addendum

- **PR A** (144): pack size, where to buy, the use-by date in the Bought
  sheet, packs in *How many?*, the grouped *To buy* and WhatsApp text.
- **PR B** (recipes): *Ready to cook* on recipes and the **All · Ready to
  cook now** pill; the *Uses chicken · expires Thu* hint.
- **PR C** (menu): the *Eat soon* strip and leftover dishes, *Ready to cook*
  on planned dishes and *Menu hari ini*, the shortfall in packs, the *Menu
  changed* banner and the careful re-run.
- **Nutrition (D22)** follows the same three PRs: the switch, item values
  and the bundled list in PR A (144); the recipe line and the offer card in
  PR B; the menu day total in PR C.

### Decisions for the owner, addendum (D17–D22)

- **D17 — Use it first.**
  **A (recommended):** an **Eat soon** strip on the Menu (ready food
  expiring within 2 days, leftovers with portions), one tap to put a
  leftover on a day as **Sisa rendang**, eating it counts the portions down;
  plus an optional expiry on fresh tracked items, asked only when buying,
  so recipes can say "Uses chicken · expires Thu". B: the strip and leftover
  dishes, but no expiry on stock (no recipe hint). C: no strip; leftovers
  stay in Food only.
- **D18 — Can we cook it?**
  **A (recommended):** by hand, from stored amounts and statuses: **Ready to
  cook** or **Missing 2: …** on recipes, planned dishes and *Menu hari ini*,
  per dish against what's there now, and a **Ready to cook now** pill on
  Recipes. B: the badge on planned dishes only (no filter). C: none until
  Kakak.
- **D19 — Pack sizes.**
  **A (recommended):** an optional pack per tracked item from a short list
  (sack, pack, packet, bottle, jerry can, tray, box) with its size; *Bought*
  asks how many packs, the shortfall rounds up to whole packs. B: free-text
  pack names (the household's own words, but untranslated for staff and
  owners in the other language). C: no packs; the shopper types the amount.
- **D20 — The plan changed after the list.**
  **A (recommended):** remember what the review covered; show **Menu
  changed since your list · Review** on the Menu and *To buy*; a re-run
  adjusts only what the review added and never removes an item someone
  touched or added by hand. B: no banner; the owner re-runs when they
  remember. C: update the list automatically whenever the menu changes
  (surprising for whoever is holding the list in the shop).
- **D21 — Where to buy.**
  **A (recommended):** an optional tag per item (Wet market · Supermarket ·
  Online · Other); *To buy*, staff's *Perlu dibeli* and the WhatsApp text
  group by it once any item has one. B: free-text shop names ("Pasar
  Santa", "Ranch Market"). C: no grouping.
- **D22 — Basic nutrition.**
  **A (recommended):** a household **Nutrition** switch, off by default and
  offered once on the Recipes screen; with it on, items carry kcal,
  protein, carbs, fat and fibre per 100 g / 100 ml / piece, typed or picked
  from a bundled list (USDA FoodData Central, public domain; TKPI only once
  Kemenkes permits it); recipes show per serving and per dish (partial when
  values are missing), the menu day a total per serving; owners only; no
  per-person tracking. B: the same, manual values only (no bundled list).
  C: not now.
  Nutrition stays wanted by the owner's household; it returns as an
  optional switch, Kakak-filled where possible.

### Considered, not now

- **Per-person portions, intake and goals, and full micronutrients**
  (who eats how much, daily targets, vitamins and minerals): needs people
  records (Care tab, item 18) and health-data consent under UU PDP. D22 is
  food-only.
- **Price per pack**: comes with household cash (item 15), which will store
  what each purchase cost; the pack size added here is what it will price.
- **Planning a week automatically**: a Kakak idea (the paid extra), built on
  *Eat soon*, *Ready to cook* and the recipe box from this addendum.
- **Per-batch expiry on stock** (two packs of chicken, two dates): the single
  earliest date covers the "use it first" need.
