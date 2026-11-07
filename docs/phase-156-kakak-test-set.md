# Tell Kakak — test set (Phase 156, step 2)

40 sentences an owner might type, with what Kakak should suggest or ask. It
is written for a fixed pretend household, so the answers are checkable. It
becomes `tests/kakak/test-set.json` and an automatic run
(`tests/kakak/run-test-set.ts`, by hand with a key; not in CI). Plan:
`docs/phase-156-step2-kakak-plan.md`, section 7.

Later, 30–50 real sentences from the household are added in the same format.

## The pretend household

- **Today:** Wednesday 11 November 2026, 08.30, Asia/Jakarta.
- **Owner:** Dewi, who chose **Bahasa Indonesia** (sentences marked *EN
  owner* are run with English chosen instead). Her own roster row is `M1`.
- **People:** `S1` Sari · `S2` Nah · `S3` Budi · `S4` Yanti · `S5` Yati.
  (Sari, Yanti and Yati are the women addressed as "Mbak"; Nah is "Bik
  Nah"; Budi is "Mas" or "Pak" Budi. Yanti and Yati are the look-alikes.)
- **Pets:** `P1` Mochi (dog) · `P2` Kopi (dog) · `P3` Luna (cat).
- **Pet routines today:** Mochi meals 07.00 and 17.00; Kopi meal 07.00.
- **Rooms:** `R1` Teras · `R2` Dapur · `R3` Kamar mandi atas · `R4` Kamar
  mandi bawah · `R5` Kamar utama · `R6` Ruang tamu · `R7` Garasi · `R8`
  Taman · `R9` Kamar anak. (No "Gudang".)
- **Shopping items:** `I1` Telur · `I2` Sabun cuci piring · `I3` Deterjen ·
  `I4` Beras · `I5` Makanan anjing (pet) · `I6` Pee pad (pet) · `I7` Tisu ·
  `I8` Minyak goreng · `I9` Galon air.

## How a case is marked

- **Pass** when the tool and every field listed match. Titles and notes
  are marked by meaning, not exact words ("Pel teras" or "Mengepel teras"
  both pass). Where a range is given, anything in it passes.
- Fields not listed must be the default: `recurrence` none, `due_time`
  null, `assignee` null only when the sentence says anyone,
  `requires_supervision` false, `notes` null or harmless.
- **Questions** pass when Kakak asks about the listed thing and the right
  people/choices are among the answers. The run then taps the scripted
  answer and checks the next turn.
- **Must never** (any one fails the whole run, whatever the score):
  inventing a person, pet or room reference; filling in a food's expiry
  date the owner didn't give without asking first; picking one of two look-alike
  names without asking; claiming something is saved; suggesting a change
  or deletion; more than three questions for one sentence; a reply in the
  wrong language for the owner.
- **Pass mark:** 36 of 40 and no "must never".

## Chores that repeat

| # | Sentence | Lang | Expected |
| --- | --- | --- | --- |
| 1 | Mbak Sari pel teras tiap Senin jam 9 | ID | `create_chore`: "Pel teras", S1, due 2026-11-16, 09:00, weekly, R1, cleaning |
| 2 | Bik Nah masak rendang tiap Jumat | ID | `create_chore`: "Masak rendang", S2, due 2026-11-13, weekly, R2 or null, category errand (no cooking category; any category passes if the card shows it) |
| 3 | Budi cuci mobil tiap weekend, hari Sabtu pagi aja | Mixed | `create_chore`: "Cuci mobil", S3, due 2026-11-14, weekly, time null or 06:00–09:00, R7 or null, cleaning |
| 4 | Every day Yanti waters the garden at 4pm | EN owner | `create_chore`: title in Indonesian ("Siram taman") with `title_en`, S4, due 2026-11-11, 16:00, daily, R8 |
| 5 | Have Sari change the bedsheets in the master bedroom every Monday and Thursday | EN owner | two `create_chore`: "Ganti sprei", S1, R5, weekly — one due 2026-11-16, one due 2026-11-12 |
| 6 | Tiap tanggal 1 Budi check air aki mobil | Mixed | `create_chore`: "Cek air aki mobil", S3, due 2026-12-01, monthly, R7 or null, maintenance |
| 7 | Bersihin AC kamar anak sebulan sekali, siapa aja boleh | ID | `ask_question`: when to start (e.g. Hari ini · Sabtu ini · Pilih tanggal). Scripted answer "Sabtu ini" → `create_chore`: "Bersihkan AC kamar anak", assignee null, due 2026-11-14, monthly, R9, maintenance |
| 8 | Yati sapu halaman tiap minggu | ID | `ask_question`: which day ("tiap minggu" = every week). Scripted "Senin" → `create_chore`: "Sapu halaman", S5, due 2026-11-16, weekly, R8 or null |

## One-off chores and relative days

| # | Sentence | Lang | Expected |
| --- | --- | --- | --- |
| 9 | Besok Budi bersihkan kamar mandi atas | ID | `create_chore`: "Bersihkan kamar mandi atas", S3, due 2026-11-12, R3, cleaning |
| 10 | Lusa Yanti setrika baju jam 2 siang | ID | `create_chore`: "Setrika baju", S4, due 2026-11-13, 14:00 |
| 11 | Sabtu ini ada tamu, minta Sari rapikan ruang tamu sebelum jam 10 | ID | `create_chore`: "Rapikan ruang tamu", S1, due 2026-11-14, time 08:00–10:00, R6 |
| 12 | Tomorrow morning Budi should take the dog to the groomer | EN owner | `ask_question`: which dog (Mochi · Kopi). Scripted "Mochi" → `create_chore`: "Antar Mochi ke grooming", S3, due 2026-11-12, time null or 07:00–10:00, errand |
| 13 | Nanti sore Mbak Yan please beresin dapur | Mixed | `ask_question`: Yanti or Yati (both among the answers). Scripted "Yati" → `create_chore`: "Bereskan dapur", S5, due 2026-11-11, time null or 15:00–17:00, R2 |
| 14 | Suruh mbak bersihin kulkas hari Kamis | ID | `ask_question`: which person (Sari, Yanti, Yati among the answers; Nah allowed). Scripted "Sari" → `create_chore`: "Bersihkan kulkas", S1, due 2026-11-12, R2 |
| 15 | Next Tuesday I need Budi to fix the leaking tap in the downstairs bathroom, and I want to be there | EN owner | `create_chore`: "Perbaiki keran bocor", S3, due 2026-11-17, R4, maintenance, requires_supervision true |
| 16 | Gudang dibersihin besok sama Budi | ID | `ask_question`: add "Gudang" as a new room? Scripted "Tambahkan Gudang" → `create_chore`: "Bersihkan gudang", S3, due 2026-11-12, room null, new_room_name "Gudang" |
| 17 | Akhir bulan Nah bersihin oven | ID | `create_chore`: "Bersihkan oven", S2, due 2026-11-30, R2 |
| 18 | Ingatkan saya bayar listrik tiap tanggal 20 | ID | `create_chore`: "Bayar listrik", M1, due 2026-11-20, monthly, errand |
| 19 | Minggu depan Sari cuti, jadi Yati yang pel teras hari Senin | ID | `create_chore`: "Pel teras", S5, due 2026-11-16, one-off, R1; plus one line that leave is set by hand (no leave tool) |
| 20 | Setengah 8 besok Budi antar anak ke sekolah | ID | `create_chore`: "Antar anak ke sekolah", S3, due 2026-11-12, **07:30** ("setengah 8" is 7.30), errand |

## Shopping

| # | Sentence | Lang | Expected |
| --- | --- | --- | --- |
| 21 | Beli telur sama sabun cuci | ID | `ask_question`: which soap (Sabun cuci piring · Deterjen) — or `add_to_shopping_list` with I1 out and I2 or I3 out, the card showing which. Either passes; I1 must be matched, not a new note |
| 22 | We're out of rice and cooking oil | EN owner | `add_to_shopping_list`: I4 out, I8 out |
| 23 | Makanan anjing tinggal sedikit | ID | `add_to_shopping_list`: I5 low |
| 24 | Tolong tambahin ke list belanja: gula 2 kg, kopi bubuk, sama baterai AA | Mixed | `add_to_shopping_list`: three new notes "Gula 2 kg", "Kopi bubuk", "Baterai AA" (not the dog Kopi) |
| 25 | Galon habis, pesan 2 ya | ID | `add_to_shopping_list`: I9 out (the amount may show on the card as not saved) |
| 26 | Pee pad buat Luna udah abis, tolong add ke list | Mixed | `add_to_shopping_list`: I6 out |

## Pet routines

| # | Sentence | Lang | Expected |
| --- | --- | --- | --- |
| 27 | Mochi makan jam 7 pagi dan 6 sore | ID | `add_pet_routine`: P1, meal, times [18:00]; the card says 07.00 is already there (a suggestion with 07:00 and 18:00 also passes if the route drops 07:00) |
| 28 | Luna makan 3 kali sehari: jam 7, jam 12, jam 6 sore | ID | `add_pet_routine`: P3, meal, [07:00, 12:00, 18:00] |
| 29 | Kopi needs to go out for a pee every 3 hours from 6am to 9pm | EN owner | `add_pet_routine`: P2, potty, [06:00, 09:00, 12:00, 15:00, 18:00, 21:00] |
| 30 | Anjing-anjing makan jam 5 | ID | `ask_question`: 05.00 or 17.00. Scripted "17.00" → `add_pet_routine` for P2 only, meal, [17:00] (Mochi already has 17.00; the card says so) |
| 31 | Kasih obat cacing ke Mochi tiap 3 bulan | ID | no tool; a short reply that medicine isn't something Kakak sets up yet, and that it's on the Hewan tab |

## Food

| # | Sentence | Lang | Expected |
| --- | --- | --- | --- |
| 32 | Kami dapat lapis legit dari Tante Rina | ID | `ask_question`: when it expires (answers include "Tidak tahu" and may include a cautious guess). Scripted "Tebakan Kakak" → `add_food`: "Lapis legit", gift, from "Tante Rina", kept_in counter or pantry or fridge, expires 2026-11-14 to 2026-11-18, expiry_is_guess true |
| 33 | Ada sisa rendang di kulkas, masak kemarin | ID | `ask_question`: when it expires (a cautious guess and "Tidak tahu" among the answers). Scripted "Tebakan Kakak" → `add_food`: "Rendang", source home, fridge, expires 2026-11-11 to 2026-11-13, expiry_is_guess true |
| 34 | Bu Ani sent a box of klepon, it's on the counter, finish it today | EN owner | `add_food`: "Klepon", gift, from "Bu Ani", counter, expires 2026-11-11, expiry_is_guess false |
| 35 | Parcel dari kantor suami: kue kering, kedaluwarsa 31 Desember, di lemari | ID | `add_food`: "Kue kering", gift, from "Kantor suami" (or similar), pantry, expires 2026-12-31 |
| 36 | Nasi kotak dari acara RT tadi siang, 4 box, taruh di meja | Mixed | `ask_question`: when it expires (a cautious guess among the answers). Scripted "Tebakan Kakak" → `add_food`: "Nasi kotak", gift, from "Acara RT" (or similar), counter, expires 2026-11-11 (rice at room temperature: today), expiry_is_guess true, notes mention 4 |
| 37 | Tante Rina bawa rantang isi opor, rantangnya harus dikembalikan | ID | `ask_question`: when it expires (a cautious guess among the answers). Scripted "Tebakan Kakak" → `add_food`: "Opor" (or "Opor ayam"), gift, from "Tante Rina", return_container true, fridge (santan), expires 2026-11-11 to 2026-11-13, expiry_is_guess true |

## Several things, questions, and what Kakak doesn't do

| # | Sentence | Lang | Expected |
| --- | --- | --- | --- |
| 38 | Besok Sari pel teras, terus beli telur juga | ID | two suggestions in one turn: `create_chore` "Pel teras", S1, due 2026-11-12, one-off, R1; `add_to_shopping_list` I1 out |
| 39 | Apa yang dikerjakan Sari hari ini? | ID | no tool; a short reply that Kakak can't answer questions yet, pointing to Hari ini |
| 40 | Hapus tugas pel teras yang tiap Senin | ID | no tool; a short reply that Kakak only adds things, and that chores are changed or deleted in Tugas |

## Coverage

- **Languages:** Indonesian 27, English 7 (run with the owner's language set
  to English, so Kakak replies in English and chore titles stay Indonesian),
  mixed 6.
- **Honorifics:** Mbak Sari, Bik Nah, Mbak Yan, a bare "mbak", Bu Ani, Tante
  Rina.
- **Days and times:** besok, lusa, nanti sore, Sabtu ini, minggu depan,
  akhir bulan, tiap Senin, tiap minggu, tiap tanggal 1/20, sebulan sekali,
  setengah 8, jam 2 siang, jam 6 sore, jam 5 (ambiguous), 4pm, next
  Tuesday.
- **Questions expected:** 7, 8, 12, 13, 14, 16, 30, 32, 33, 36, 37 (21 may ask). Food with no date given always asks first (plan, decision K5); a suggestion with an invented date fails.
- **Not done by Kakak:** 31 (medicine), 39 (questions), 40 (deleting), and
  the leave in 19.

## Results table (filled in by each run)

| Model | Effort | Score /40 | Must-never | Median reply | Slowest | Cost of the run |
| --- | --- | --- | --- | --- | --- | --- |
| Opus 5.5 | low | | | | | |
| Opus 5.5 | medium | | | | | |
| Sonnet 5.5 | low | | | | | |
| Haiku 5.5 | medium | | | | | |
