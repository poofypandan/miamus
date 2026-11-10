# Phase 170 — Cooking, groceries and planning under Kitchen

Status: **plan, waiting for the owner (D1–D16, each with a recommended A).**
Nothing is built. Migration **144** is reserved for PR A (amounts and units);
PR B (recipes) and PR C (menu and the cook's view) each take the next free
number when they're built, and the manager reserves it then. Roadmap item 20
(`docs/roadmap-2026-11-09.md`, P3): "Daily menu for the cook. Ties Kitchen to
the day." Plus a new row for amounts and recipes (the owner's request of
10 November). Mockup: `docs/mockups/phase-170-kitchen.html` (open in a
browser, phone width; owner screens English left and Bahasa Indonesia
right, staff screens Bahasa Indonesia only).

Builds on **Phase 154** (the shopping list, migration 122, decision R3 in
`docs/phase-153-review.md` section 4), **Phase 156** (Food at home, migrations
123–124, `docs/phase-156-step1-food-plan.md`) and **Phase 110** (the counted
inventory, migration 099, whose columns are still in the table). It reuses
their sheets, rows, photo field, the `<SegmentedControl />`, the toast with
Undo and the What's new card.

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
