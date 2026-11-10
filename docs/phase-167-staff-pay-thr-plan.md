# Phase 167 — Staff pay, THR and days off

Status: **plan for the owner's decision (D1–D14).** Nothing is built.
Roadmap item 14 (`docs/roadmap-2026-11-09.md`, P2): "Staff pay, THR and
days off under the new domestic workers law (UU PPRT, April 2026). Legal
clarity and trust between household and staff; leave already exists.
Medium + privacy policy." Mockup: `docs/mockups/phase-167-staff-pay.html`
(open in a browser, phone width; owner screens in English and Bahasa
Indonesia side by side, staff screens in Bahasa Indonesia).

Database: migration **141**, described here only, not created. 139 is
reserved for "couldn't do it" (#64), 140 for staff push (#70). Re-check
`supabase/migrations` and open PRs before building.

> **Not legal advice.** The summary below is our reading of the law as
> published, written so the product does the right thing. The government's
> implementing regulations (Peraturan Pemerintah) for UU PPRT aren't out
> yet; when they are, this plan and the app's wording must be checked
> again. Owners with a specific question should ask a lawyer or their
> local Disnaker.

## The problem

Most Indonesian households with staff agree pay by word of mouth, pay cash
on a day both sides remember a little differently, and work out THR from
memory a week before Lebaran. Disagreements are about **what was agreed**
and **what was paid**, and neither side has a record. Days off are worse:
nobody knows how many days of leave are left this year, or whether two days
off sick count.

Since 30 April 2026 this has a legal frame. **UU No. 2 Tahun 2026 tentang
Pelindungan Pekerja Rumah Tangga** (UU PPRT) makes pay, THR, rest and leave
rights of the worker, owed "according to the agreement" (*sesuai dengan
Kesepakatan atau Perjanjian Kerja*). So the agreement and a record of
keeping it are exactly what both sides need. Miamus already knows who works
in the house and when they're on leave; it doesn't know what they're paid,
when, or how much leave they have.

## What the law says (read 2026-11-10)

Source for everything marked UU: the official copy of **UU 2/2026**, signed
and promulgated 30 April 2026, LN 2026 No. 47, in force on promulgation
(Pasal 37). JDIH Kemnaker: <https://jdih.kemnaker.go.id/asset/data_puu/2026uu002.pdf>
(also BPK: <https://peraturan.bpk.go.id/Download/416259/UU%20No.%202%20Tahun%202026.pdf>).
The DPR passed it on 21 April 2026.

### Required by law (for the household)

| Topic | What UU 2/2026 says | Where |
| --- | --- | --- |
| **The agreement** | The working relationship rests on a **Kesepakatan** (agreement; for staff the household hires directly, and it may be spoken) or a **Perjanjian Kerja** (written; for staff placed through an agency, a P3RT). A direct hire *may* put the agreement in writing. | Pasal 1 angka 8–9, 6(2), 11(1), 12 |
| Written agreement (agency hires) | Must contain at least: both parties' identities; the work address; start date and duration; scope of work; rights and duties; working conditions; **the amount and method of pay**; place and date; signatures or thumbprints. In Bahasa Indonesia, 2 copies with meterai, copies to the agency and RT/RW. Changes in writing, agreed by both. | Pasal 11(2)–(6) |
| **Pay (upah)** | A right of the worker, paid "according to the amount and time of payment agreed". Pay may be money and/or another form (e.g. meals, lodging), as agreed. The household **must** pay it as agreed. | Pasal 1 angka 12, 15(1)e, 15(2), 19a |
| **THR** | A right to a religious-holiday allowance **in money**, amount and timing as agreed. The household **must** pay it as agreed. | Pasal 15(1)f, 15(2), 19a |
| Details still to come | The amount and timing of pay are to be set out further in a **Peraturan Pemerintah**; all implementing rules are due within 1 year, so **by 30 April 2027**. Not issued as of September 2026 (Kemnaker, 14 Sep 2026). | Pasal 15(3), 36(2) |
| **Working hours** | A right to "humane working hours": fair, limited and reasonable, within the worker's physical and mental capacity. **No number of hours** is set. | Pasal 15(1)b and its Penjelasan |
| **Rest, weekly rest** | A right to rest, which the Penjelasan says includes breaks, daily rest, **weekly rest**, and rest before and after childbirth or miscarriage, as agreed. The household **must** give rest and leave. No number of days is set. | Pasal 15(1)c and its Penjelasan, 19d |
| **Leave (cuti)** | A right to leave as agreed. No number of days is set. The worker asks permission when unable to work (illness, childbirth, a death in the family); the household may approve or refuse. | Pasal 1 angka 15, 15(1)d, 17c, 18c, 19d |
| **BPJS Kesehatan** (health) | Paid by the government if the worker is a PBI (*penerima bantuan iuran*); **otherwise by the household**, as agreed, known to the RT/RW. | Pasal 15(1)g, 16(1)–(2) |
| **BPJS Ketenagakerjaan** (work accident, death) | Contributions **paid by the household**, as agreed; at least **JKK** (work accident) and **JKM** (death). Details to come in a PP. | Pasal 15(1)h and its Penjelasan, 16(3)–(4) |
| Other rights | Worship; healthy food; decent lodging for live-in staff; a safe workplace; end the relationship if the agreement isn't kept. | Pasal 15(1)a, j, k, l, m |
| Other household duties | Tell the worker about the household and the work; **report that the worker lives or works there to the head of the RT/RW**. | Pasal 19g, 19h |
| The worker's side | Give true information; keep the agreement; ask permission when unable to work; **give 1 month's notice** before leaving. | Pasal 17 |
| Disputes | Talk it through (musyawarah) within 7 days; then mediation by the RT/RW head. With an agency involved, a Disnaker mediator, whose decision on a **pay** dispute is final and binding. | Pasal 31–32 |
| Sanctions | The law sets administrative sanctions for agencies (P3RT). It sets **none for households**. | Pasal 28 |
| Who it covers | Full-time (live-in) and part-time (at least 2 hours a day, living elsewhere) staff, 18 or older. Family, customary, religious or study arrangements aren't covered. | Pasal 4(2), 5, 9 and its Penjelasan |

**In one line:** the law requires an agreement (written when an agency
places the worker), and that the household pays the agreed pay and THR on
the agreed dates, gives rest including a weekly rest and leave, and pays
BPJS as described. It leaves the amounts and the numbers of days to the
agreement until the PP arrives.

### Good practice (benchmarks the app suggests, not legal duties)

| Topic | Benchmark | Source |
| --- | --- | --- |
| **THR amount** | **1 month's pay** after 12 months' continuous work; **months worked ÷ 12 × 1 month's pay** from 1 month; nothing under 1 month. Once a year, for the worker's own holiday. | Permenaker 6/2016, Pasal 2–3, 5(1) |
| **THR timing** | **At least 7 days before the holiday** (H-7). Late payment by a company costs a 5% fine. | Permenaker 6/2016, Pasal 5(4), 10 |
| Does Permenaker 6/2016 bind households? | Debated. It's written for *pengusaha* "running a company"; Hukumonline's legal clinic applies it to household staff and drivers by analogy; commentators have called for it to name PRT explicitly. UU PPRT says THR follows the agreement. So: the usual rule, used as the default. | Hukumonline klinik on THR for ART and drivers; pasal.id text of Permenaker 6/2016 |
| **Written agreement, even for direct hires** | Write it down, in Indonesian, both sign or thumbprint, both keep a copy, the RT knows. The 2015 rules required an agreement "in writing or spoken", known to the RT head, and listed THR "once a year" and social security as household duties. | UU 2/2026 Pasal 12; Permenaker 2/2015 Pasal 5–7, 11 (agency articles 12–27 revoked by Permenaker 18/2024; the rest is in force as far as it doesn't conflict with UU PPRT, Pasal 36(1)) |
| **Pay at least monthly, with a record** | Regular payment, at least once a month, and a written statement of what was paid. | ILO Convention 189, Art. 12 (Indonesia hasn't ratified it) |
| **Weekly rest** | At least **24 consecutive hours** a week. | ILO C189, Art. 10 |
| **Annual leave** | **12 working days** a year after 12 months' work: the general rule for company workers, the usual reference households use. | UU 13/2003 Pasal 79, as amended by UU 6/2023 |
| **Working hours** | 40 hours a week (7 × 6 days or 8 × 5) is the general rule for company workers; UU PPRT only says "humane". | UU 13/2003 Pasal 77, as amended |
| **BPJS Ketenagakerjaan for a PRT** | Register as *Bukan Penerima Upah* (BPU) online or at a branch, at least JKK + JKM. BPU contributions: JKK 1% of declared income, JKM Rp 6.800 a month; a 50% discount on BPU JKK/JKM was announced to run to December 2026. **Re-check rates before building.** | RRI, 30 Apr 2026; BPJS Ketenagakerjaan BPU brochure; Suara Surabaya, Aug 2026 |

### Holiday dates (for THR reminders)

SKB 3 Menteri on 2027 national holidays (signed 15 September 2026; Setneg):
Imlek Sat 6 Feb · Nyepi Mon 8 Mar · **Idul Fitri Wed–Thu 10–11 Mar** ·
Waisak Thu 20 May · **Natal Sat 25 Dec**. Natal 2026 is Fri 25 Dec.
Idul Fitri's date is confirmed by Kemenag's sidang isbat and can move by a
day, so the app shows "about" for Lebaran until it's confirmed, and keys the
reminder on the SKB date.

Next deadlines, with the H-7 benchmark:

- Natal 2026 → THR by **Fri 18 Dec 2026** (a 30-day reminder would be
  Wed 18 Nov, eight days from today: too soon for this phase, see D13).
- Lebaran 2027 → THR by **Wed 3 Mar 2027** (30-day reminder Mon 1 Feb).

### Sources

- UU 2/2026 (official copy): <https://jdih.kemnaker.go.id/asset/data_puu/2026uu002.pdf>
- Kemnaker on UU PPRT (Padang Ekspres, 15 Sep 2026): <https://padek.jawapos.com/indonesia/2609150001/kemnaker-uu-pprt-perjelas-hak-dan-kewajiban-pekerja-rumah-tangga>
- Hukumonline, 14 rights and duties under UU PPRT: <https://www.hukumonline.com/berita/a/ini-14-hak-pekerja-rumah-tangga-dan-kewajiban-majikan-dalam-uu-pprt--dpr-siap-kawal-aturan-turunan-lt69eada7a0d622/>
- Detik, contents of UU PPRT: <https://news.detik.com/berita/d-8454395/isi-uu-perlindungan-pekerja-rumah-tangga-soal-upah-hingga-jaminan-sosial>
- Permenaker 6/2016 on THR (text and status): <https://pasal.id/en/peraturan/permen/permenakertrans-no-6-tahun-2016>
- Hukumonline klinik, THR for ART and drivers: <https://www.hukumonline.com/klinik/a/cara-menghitung-thr-untuk-art-dan-sopir-lt5937eee9e3618/>
- Setkab, THR at the latest H-7: <https://setkab.go.id/menaker-thr-bagi-pekerja-wajib-diberikan-maksimal-h-7-lebaran/>
- Permenaker 2/2015 (historical text): <https://pasal.id/peraturan/permen/permenaker-no-2-tahun-2015>; Permenaker 18/2024 (revokes its agency articles): <https://peraturan.bpk.go.id/Details/312746/permenaker-no-18-tahun-2024>
- ILO on C189 and weekly rest: <https://www.ilo.org/resource/article/ilo-domestic-workers-should-have-right-rest>
- RRI, registering a PRT with BPJS Ketenagakerjaan (30 Apr 2026): <https://rri.co.id/nasional/2377351/langkah-mendaftar-bpjs-tenaga-kerja-bagi-pekerja-domestik>
- SKB 2027 holidays (Setneg): <https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027>
- UU 27/2022 (UU PDP), Pasal 4(2)f: personal financial data is specific personal data.

## What exists (read 2026-11-10)

- **Staff roster** (`staff_profiles`): one row per person who can be given a
  chore. Staff on PIN phones (`user_id` null) and, since 106, admins too
  (`user_id` set). Removed staff are **archived** (`archived_at`), not
  deleted, so their name stays on past work.
- **Who is on a staff phone:** the phone is a household session (anonymous
  auth, `device_sessions`), not a person. The person is picked on the phone
  and checked by **PIN** (`check_staff_pin` → `check_pin_internal`, 115):
  hashed, 5 wrong tries lock that person for 15 minutes and push the owners,
  every try logged in `staff_sign_in_attempts` (kept 30 days). After the
  gate, who's on duty lives only in the phone's `localStorage`
  (`useStaffIdentity`). **The database can't tell which person is asking**
  unless a PIN comes with the request.
- **Leave** (`leave_requests`, 108; `src/lib/leave.ts`): staff ask from the
  Lapor sheet (**Ajukan Cuti**, `src/components/staff/leave-request.tsx`),
  an admin approves with a fallback for chores. Start and end dates, status
  (`pending`, `approved`, `rejected`, `ended_early`), `ended_on`. **No kind**
  (annual, sick…), **no allowance, no balance.** Every session of the house
  can read every request (`get_user_household_ids()`), so the cover person
  sees why chores moved. Owners see it under Household → **Leave / Cuti**.
- **Owners-only pattern** (131 `repair_costs`, 138 `bill_payments`): a table
  with one RLS policy through `household_members` (never
  `get_user_household_ids()`, which staff phones pass), server-fields
  trigger, receipts in the private **`owner-receipts`** bucket. Lesson from
  138: **the nightly sweep `repair_receipts_due_for_pruning` deletes any
  `owner-receipts` file nothing it knows points at**, and
  `orphaned_household_photos` must also know; both are re-created whenever a
  new kind of receipt is added.
- **Reminders** (164, migration 137): `notify_chores_due()` at 07:05 WIB, one
  push per owner per morning, composed in the database in each owner's
  language, plus a **Coming up** quiet line on Today so it works with push
  off. Pushes to staff phones are Phase 166 (migration 140), not built.
- **Export** (`export_household_data()`, last re-created in 138): owners only
  (`caller_admin_household()`); includes staff and leave.
- **Kakak** (`src/lib/kakak/household.ts`): sends staff first names, pets,
  rooms, shopping names. Nothing about money.
- **Privacy policy** (`src/components/legal/privacy-policy.tsx`, policy
  version `2026-11-10.4`): section 3 lists what's collected, 5 who sees it,
  7 retention, 9 tells admins to inform staff what's recorded (tasks, photos,
  leave).

## The idea in one line

**Each staff person gets an owners-only pay record (what was agreed) and a
payment history (what was paid), with a payday reminder, a THR calculator
and reminder, and a leave balance built on the leave that already exists.
Staff can see their own, behind their PIN.** No new tab.

## What changes for people

| Who | What's new |
| --- | --- |
| Owners | **Household → Pay and days off** (**Gaji dan cuti**): everyone on the staff list with their pay, next payday, this month's status, THR due and leave left. |
| Owners | **Pay setup** per person: monthly pay, payday, cash or transfer, the day they started, which holiday their THR is for, weekly day off, leave days a year. |
| Owners | **Payday**: a 07:00 reminder and a quiet line on Today ("Payday today: Sari"). **Mark paid** with the agreed amount filled in, editable, an optional receipt photo and an owners-only note. Bonuses and other extras as separate entries. |
| Owners | **THR**: a calculator (months worked, the usual rule, the amount, the date to pay by), a reminder 30 days before that date and on it, and **Mark THR paid**. |
| Owners | **Days off**: the weekly day off and this year's leave balance ("8 of 12 days left"); a kind on each leave (Annual, Sick, Family, Other); only Annual counts. |
| Owners | An optional **agreement checklist** drawn from Pasal 11 and 19: what's agreed, written down, reported to the RT/RW, BPJS. Ticks only, no documents. |
| Staff | **Gaji & cuti saya** in the Lapor sheet: their leave balance and day off straight away; their pay history and THR **after entering their PIN**; a **Sudah diterima** button to confirm a payment. Indonesian only. |
| Staff | **Ajukan Cuti** asks what kind of leave it is (can be left empty). |

## Where it lives

No new tab and no new segmented control.

- **Household → Pay and days off**, a new row in the group with Family,
  Staff, Rooms (icon `Wallet`), owners only (D1). It opens a page listing
  each staff person (not admins; family who are admins aren't paid staff),
  then a page per person with three blocks: **Pay**, **THR**, **Days off**,
  and the checklist at the bottom.
- **Household → Leave** stays where it is; approving a request now also
  asks its kind (prefilled from what staff picked).
- **Today**: the payday and THR quiet lines, among the existing ones, for
  owners only.
- **Staff phones**: one new row in the Lapor sheet, beside **Ajukan Cuti**.

## Owner features

### 1. Pay setup (D2)

Per staff person, all optional except the amount and payday:

| Field | Notes |
| --- | --- |
| **Monthly pay** | Rupiah with dots as you type (3.200.000). Weekly pay (some part-time staff) as a second choice: amount + weekday (D2). |
| **Payday** | Day of the month (1–31, clamped to the month's end, as 137's monthly chores); or a weekday for weekly pay. |
| **Paid by** | Cash · Transfer. Prefills Mark paid. |
| **Started working** | Date. Used for THR months and the leave year. Prefilled with the date they were added to Miamus, which is usually later; the owner corrects it. |
| **THR for** | Lebaran (Idul Fitri) · Natal · Nyepi · Waisak · Imlek · Another date. Named by **holiday**, not religion, and only this (D6). |
| **Weekly day off** | One or two weekdays (chips). Informational, and shown to staff. |
| **Leave days a year** | Number, default 12 (D7). Counted per work year from the start date. |
| **Staff can see their pay** | On by default (D8). Per household, in the page's footer. |

The page says, under the form: "Only owners see pay. Staff see their own
after entering their PIN." and "Not legal advice. The law (UU 2/2026) leaves
the amounts to what you and your staff agree."

### 2. Payday and Mark paid (D3, D12)

- **Reminder**: at 07:00 on payday, in the morning push owners already get
  (a separate cron job beside 164's, so either can be off): "Payday today:
  Sari and Budi." **No amounts in pushes** (lock screens, D12). On Today, the
  quiet line **Payday today: Sari** from the day before until it's marked
  paid; tapping it opens Mark paid. After payday, unpaid: **Pay due: Sari ·
  since Wed 25 Nov** in amber, until paid.
- **Mark paid** (sheet): the period (November 2026), **Amount** prefilled
  with the agreed pay (editable; if it differs, an optional note field
  appears: "What's different?"), **Paid on** (today), **Cash · Transfer**,
  **Receipt (optional)**: a photo of the transfer proof or a signed kuitansi,
  resized on the phone (PR #39's path), in `owner-receipts` under
  `<household>/pay/<payment>/…`. **Mark paid**. Toast: "Paid: Sari ·
  November · Undo".
- **Extras**: **Add a payment** on the person's page: Bonus · Overtime ·
  Other, with amount, date and an optional note. THR has its own button.
- **No deductions in this phase** (D3): no kasbon (advances) or fines lines.
  Kasbon belongs with roadmap item 15 (household cash), which can add it.
- **History**: the person's page lists payments newest first: "Nov 2026 ·
  Rp 3.200.000 · Transfer · Received 25 Nov" (the last part once staff
  confirm, D9). Tap to edit or delete (deleting also deletes the receipt).

### 3. THR calculator and reminder (D4, D5, D6)

- **The holiday**: from the person's **THR for**, the next date from the
  built-in holiday table (D6), or the owner's own date. Lebaran shows
  "about 10 Mar 2027" until the date is confirmed.
- **Pay by**: holiday − 7 days (the benchmark), editable per year.
- **Months worked**: whole months from **Started working** to the holiday.
- **The usual rule** (D4): 12 months or more → 1 month's pay; 1 to 11
  months → months ÷ 12 × the monthly pay, rounded to the nearest Rp 1.000;
  under 1 month → nothing by the rule ("Many households still give
  something"). Shown as the working: "9 of 12 months × Rp 4.000.000 =
  Rp 3.000.000".
- **Amount**: prefilled with the rule's result, editable. Weekly-paid staff:
  the monthly pay is weekly × 52 ÷ 12, shown.
- The explainer, one line: "The usual rule for companies (Permenaker
  6/2016). For households, UU 2/2026 says THR is paid in money, as you
  agreed." with a **Learn more** link to a short help page (the legal table
  above, in plain words, both languages).
- **Reminder** (D5): 30 days before *pay by*, in the morning push ("THR for
  Maria is due by Fri 18 Dec (Natal).") and a quiet line on Today from then
  until marked paid; again on *pay by* if not paid. Amber after *pay by*.
- **Save THR** stores this year's plan (holiday date, amount, pay-by date)
  in `staff_thr_plans` (below), before anything is paid. The reminder and
  the staff view read the plan. If there's no plan yet, the reminder uses
  holiday − 7 days and the staff view shows "Belum diatur pemilik".
- **Mark THR paid**: the same sheet as Mark paid, kind THR, the holiday and
  year shown, prefilled with the plan's amount.
- **One THR a year per person** by default; a second can be added by hand
  (some households give at both Lebaran and Natal).

### 4. Days off and leave balance (D7)

- **Weekly day off**: from pay setup, shown on the person's page and to
  staff.
- **Leave kind**: **Annual · Sick · Family · Other**, on each leave request.
  Staff can pick it when asking (or leave it empty); owners set or change it
  when approving or afterwards. Empty counts as Annual until changed, so
  nothing escapes the count.
- **Balance**: leave days a year minus approved **Annual** days in the
  current work year (from the start-date anniversary). A day counts if it's
  covered by the leave (the same rule as `leaveCovering`: approved or ended
  early, up to `ended_on`) and **isn't the person's weekly day off**. Shown
  as "8 of 12 days left · year from 14 Jul". Below: this year's leave, each
  with its kind and days, Sick and Family marked "not counted".
- Going below zero is allowed (shown "2 days over"); the app never refuses
  leave because of the balance.
- **No carry-over** in this phase; the balance resets each work year. The
  page says so.

### 5. Agreement checklist (D10)

Optional, at the bottom of the person's page: **What you've agreed**. Ticks,
each with the date ticked, no documents:

1. Pay and payday agreed (ticks itself when pay setup is saved)
2. Work and hours agreed
3. Weekly day off and leave agreed (ticks itself when set)
4. THR agreed (ticks itself when THR for is set)
5. Written down and signed (or thumbprinted) by both of you, each with a copy
6. Reported to the RT/RW (Pasal 19h)
7. BPJS Kesehatan: **PBI (paid by the government) · We pay · Covered
   elsewhere** (a choice, Pasal 16)
8. BPJS Ketenagakerjaan (JKK and JKM) registered and paid (Pasal 16(3))
9. One month's notice agreed (Pasal 17e)

"BPJS Ketenagakerjaan" offers **Add as a bill**, which opens Phase 164's
quick-add with a monthly bill "BPJS Ketenagakerjaan · Sari", so the
contribution gets a reminder. No BPJS numbers, KTP numbers or document
photos are stored (D10). The checklist is a guide, not proof: the page says
"This checklist helps you remember. It isn't a contract."

## What staff see (Indonesian only)

**Gaji & cuti saya**, a row in the Lapor sheet under **Ajukan Cuti** (icon
`Wallet`), for the person signed in on the phone.

- **Straight away** (no PIN): **Libur mingguan: Minggu**, **Sisa cuti: 8
  dari 12 hari** with "Tahun kerja sejak 14 Jul", and this year's leave with
  its kind. Leave is already visible to every session of the house, and the
  allowance is not money.
- **Pay, behind the PIN** (D8): a card "Gaji dan THR" with amounts shown as
  **Rp ••••••** and **Lihat dengan PIN**. The PIN pad is the existing staff
  PIN screen, worded "Masukkan PIN Anda untuk melihat gaji". Then: agreed pay
  and payday ("Rp 3.200.000 · tiap tgl 25"), the last 12 payments ("Nov 2026
  · Rp 3.200.000 · Transfer · 25 Nov"), THR ("THR Lebaran: paling lambat 3
  Mar 2027" once the owner has set an amount: "Rp 3.200.000"), and for any
  payment not yet confirmed, **Sudah diterima** (D9). Amounts hide again
  when the sheet closes, after 2 minutes, or when the phone locks; nothing
  about pay is cached on the phone.
- **Not shown to staff**: receipt photos (they can show an owner's bank
  details), owners' notes, other people's pay, the checklist.
- If the owner turned **Staff can see their pay** off: the pay card says
  "Gaji tidak ditampilkan di HP ini. Tanyakan langsung ke pemilik rumah."
  Leave balance still shows.
- **Ajukan Cuti** gains one optional row: **Jenis cuti (boleh
  dikosongkan)**: Cuti tahunan · Sakit · Keluarga · Lainnya.

Why a PIN every time: a staff phone is often shared (one phone, two staff,
or the family's spare phone), and the person on duty is only remembered in
the browser. The database can't otherwise tell Sari's request from Budi's
on the same phone, so the PIN is sent with the request and checked by the
server, with the existing lockout. It also keeps amounts off the screen
until the person chooses to look.

## Data sensitivity and privacy (UU PDP)

**This is new personal data, and the most sensitive Miamus has held.** Pay
is *data keuangan pribadi*, which UU 27/2022 (UU PDP) Pasal 4(2)f counts as
**specific personal data**, needing stronger protection. The THR holiday can
hint at religion; we store the holiday, not religion, and only for THR.

Rules for the build:

1. **Owners only** in the database: RLS through `household_members`, never
   `get_user_household_ids()` (staff phones pass it; AGENTS.md).
2. **Staff read only their own, only through a function that checks their
   PIN** (`my_pay`, below), never by table access. No pay table is granted to
   staff sessions in any way.
3. **Never sent to Kakak / Anthropic**: pay tables are excluded from Kakak's
   household context, and the plan for Kakak help later (below) must keep it
   that way unless the privacy policy changes first.
4. **No amounts in pushes, WhatsApp text or toasts on staff phones**; names
   only in owner pushes.
5. **Receipts** in the existing private `owner-receipts` bucket, under
   `<household>/pay/…`, with both sweep functions updated (138's lesson).
6. **Minimal**: no KTP, BPJS or bank account numbers, no document photos, no
   religion, no free-text field shown to staff.
7. **Retention** (D11): while the person is on the staff list, and for **2
   years after they're removed** (archived), then their pay setup, payments,
   receipts and checklist are deleted automatically. Each payment is also
   deleted **5 years** after it was paid, even while they still work there.
   Owners can delete any payment at any time. Deleting the household deletes
   everything (cascade + the photo sweep), as now.
8. **Export**: the owners' "Your data" export includes pay setup and
   payments (it's household data and owners only). A staff member who wants
   a copy of their own records sees them in the app, or writes to
   support@poofylabs.dev (UU PDP access right); the help page says so.
9. **Impact assessment**: UU PDP Pasal 34 asks for a data-protection impact
   assessment for high-risk processing, which includes processing specific
   personal data. Write a
   short one (a page in `docs/private/`) before production; it reuses this
   section.

### Privacy policy lines (same PR as the migration; `policyVersion` and `effectiveDate` bumped)

Section 3, "What we collect", a new bullet:

> **EN:** Staff pay (if admins use it): what was agreed with each staff
> member (pay, payday, how it's paid, when they started, which holiday their
> THR is for, their weekly day off and leave days), the payments made to them
> (amount, date, how, an optional receipt photo and an admin's note), THR
> (the amount and date agreed for each holiday, and when it was paid),
> when a staff member confirmed receiving a payment, the kind of each leave
> (annual, sick, family, other), and an optional checklist of what was agreed
> (for example whether it is written down, reported to the RT/RW, and how
> BPJS is paid). We don't store ID, BPJS or bank account numbers or documents.
>
> **ID:** Gaji staf (jika admin memakainya): yang disepakati dengan tiap
> staf (gaji, tanggal gajian, cara bayar, tanggal mulai bekerja, hari raya
> untuk THR-nya, libur mingguan, dan jumlah hari cuti), pembayaran kepada
> mereka (jumlah, tanggal, cara, foto bukti bayar opsional, dan catatan
> admin), THR (jumlah dan tanggal yang disepakati untuk tiap hari raya, dan
> kapan dibayar), kapan staf mengonfirmasi sudah menerima pembayaran, jenis tiap
> cuti (tahunan, sakit, keluarga, lainnya), dan daftar periksa opsional
> tentang yang disepakati (misalnya sudah tertulis atau belum, sudah dilapor
> ke RT/RW, dan cara pembayaran BPJS). Kami tidak menyimpan nomor KTP, BPJS,
> atau rekening bank, maupun dokumen.

Section 5, "Who can see it", a new bullet:

> **EN:** Staff pay: only the household's admins. Each staff member can see
> their own pay, payments and THR in the app after entering their PIN, unless
> an admin turns this off; they can't see anyone else's, or receipt photos.
> Pay is never sent to Anthropic (Kakak).
>
> **ID:** Gaji staf: hanya admin rumah. Tiap staf dapat melihat gaji,
> pembayaran, dan THR miliknya sendiri di aplikasi setelah memasukkan PIN,
> kecuali admin mematikannya; staf tidak dapat melihat milik orang lain
> maupun foto bukti bayar. Data gaji tidak pernah dikirim ke Anthropic
> (Kakak).

Section 7, "How long we keep it", a new bullet:

> **EN:** Staff pay records (pay agreed, THR planned, payments, receipts, the checklist)
> are kept while the staff member is on the household's list and for 2 years
> after they are removed, then deleted automatically. A payment is deleted 5
> years after it was made even if they still work there. Admins can delete
> a payment at any time.
>
> **ID:** Catatan gaji staf (gaji yang disepakati, rencana THR, pembayaran,
> bukti bayar, daftar periksa) disimpan selama staf masih ada di daftar rumah dan 2 tahun
> setelah dihapus dari daftar, lalu dihapus otomatis. Pembayaran dihapus 5
> tahun setelah dibayarkan walaupun staf masih bekerja. Admin dapat menghapus
> pembayaran kapan saja.

Section 9, "For household admins: your staff", the sentence changes:

> **EN:** Tell your staff that Miamus records their tasks, photos and leave,
> **and their pay if you use it**, and why.
>
> **ID:** Beri tahu staf Anda bahwa Miamus mencatat tugas, foto, dan cuti
> mereka, **serta gaji mereka jika Anda memakainya**, dan alasannya.

`src/config/legal.ts`: version bump with a dated comment ("staff pay,
Phase 167"). No new service, region or processor.

## The database: migration 141 (described only)

Additive. All of it in one migration, applied local → staging → production
with the owner's OK, before the PR that uses it merges (`main` deploys to
production).

**Keys first.** `staff_profiles` gains `unique (id, household_id)` if missing
(as 105, 130, 138 did for their tables), so every pay row's composite
foreign key can only point at a person in its own household.

**Table `staff_pay_terms`** (one per staff person, owners only)

| Column | |
| --- | --- |
| `staff_id` | primary key; composite FK `(staff_id, household_id)` → `staff_profiles (id, household_id)`, `on delete cascade` |
| `household_id` | FK households, cascade |
| `pay_amount_idr` | bigint, 0 to 10¹³ |
| `pay_period` | `monthly` · `weekly` |
| `payday` | smallint: 1–31 for monthly, 0–6 for weekly (check by period) |
| `paid_by` | `cash` · `transfer`, nullable |
| `started_on` | date, nullable |
| `thr_holiday` | `idul_fitri` · `natal` · `nyepi` · `waisak` · `imlek` · `other`, nullable |
| `thr_other_date` | date, required when `other` (month and day used each year) |
| `weekly_days_off` | smallint[] of 0–6, at most 2 |
| `leave_days_per_year` | smallint 0–60, nullable (no balance shown when null) |
| `agreement` | jsonb: checklist key → `{ "on": date }`, BPJS Kesehatan choice; schema checked in the app and a CHECK on keys |
| `created_by`, `updated_at` | server-fields trigger, as `bill_payments_server_fields` |

A trigger refuses a row for a profile with `user_id` set (admins aren't paid
staff).

**Household setting** `households.staff_see_pay boolean not null default true`
(D8), changed by owners only (the existing admin update path).

**Table `staff_payments`** (owners only)

| Column | |
| --- | --- |
| `id`, `household_id` | household FK, cascade |
| `staff_id` | composite FK as above, cascade |
| `kind` | `wage` · `thr` · `bonus` · `overtime` · `other` |
| `period` | date, the first of the month (or the week's Monday) for `wage`; the holiday date for `thr`; null otherwise |
| `amount_idr` | bigint not null, 0 to 10¹³ |
| `paid_on` | date not null |
| `paid_by` | `cash` · `transfer` · `other`, nullable |
| `receipt_url` | nullable; `owner-receipts`, `<household>/pay/<id>/…` |
| `owner_note` | text ≤ 200, nullable, never returned to staff |
| `received_at` | timestamptz, set once by `confirm_pay_received` (D9) |
| `created_by`, `created_at`, `updated_at` | server-fields trigger; household, staff and kind fixed after insert; editing amount or date clears `received_at` |

`unique (staff_id, kind, period)` where `kind in ('wage','thr')`: one wage
per period, one THR per holiday.

**Table `staff_thr_plans`** (owners only): the THR agreed for one person and
one holiday, **before** it's paid (Codex, PR #73). Without it, an edited
amount or an earlier pay-by date would have nowhere to live until payment.

| Column | |
| --- | --- |
| `id`, `household_id` | household FK, cascade |
| `staff_id` | composite FK as above, cascade |
| `holiday` | as `thr_holiday` |
| `holiday_date` | date: this year's date, copied from `holiday_dates` or the owner's own; `unique (staff_id, holiday_date)` |
| `amount_idr` | bigint not null, 0 to 10¹³: the rule's result or the owner's own |
| `pay_by` | date not null, default `holiday_date - 7`, at most `holiday_date` |
| `remind_days_before` | smallint, default 30; check in (0, 7, 14, 30); null = no reminder |
| `created_by`, `updated_at` | server-fields trigger; household and staff fixed after insert |

A THR **payment** (`staff_payments`, kind `thr`) has `period =
holiday_date`, so it matches its plan; once it exists the plan counts as
paid. Plans are deleted with their payment's retention, or 2 years after
their holiday if never paid.

RLS on all three tables: one policy for all commands, `to authenticated`, via
`household_members` of `auth.uid()` against `household_id` (as
`owner_all_bill_payments`). `revoke all … from anon`.

**`leave_requests.kind`**: `text` check in (`annual`, `sick`, `family`,
`other`), nullable. Insert policy unchanged (staff may set it when asking);
owners change it through the existing update policy. Old app builds don't
send it: null, counted as Annual. No change to `lib/leave.ts`'s triage.

**Table `holiday_dates`** (reference data): `(holiday, on_date)` primary
key, `confirmed boolean`. Seeded with Idul Fitri, Natal, Nyepi, Waisak, Imlek
for 2026–2028 from the SKBs; a yearly migration adds the next year after
each SKB (a review-task reminder each September). `select` granted to
`authenticated`; no writes from clients.

**Functions** (every one revokes `EXECUTE` from `public, anon` in the same
migration; AGENTS.md):

- `my_pay(p_staff_id uuid, p_pin text) returns jsonb` — **SECURITY
  DEFINER**, empty `search_path`. Refuses unless the caller is a staff phone
  session of that person's household (`require_staff_phone_session()`), the
  household's `staff_see_pay` is on, and `check_pin_internal(...)` says
  `ok` (so wrong PINs count toward the existing lockout and are logged).
  Returns only that person's pay amount, period, payday, weekly days off,
  THR holiday, their next unpaid `staff_thr_plans` row (holiday date,
  amount, pay-by) if there is one, and their last 12
  payments as `{id, kind, period, amount_idr, paid_on, paid_by,
  received_at}`: no receipts, no notes. Granted to `authenticated`.
- `confirm_pay_received(p_payment_id uuid, p_staff_id uuid, p_pin text)` —
  SECURITY DEFINER, same checks; sets `received_at = now()` once, only on
  that person's payment. Granted to `authenticated`.
- `staff_pay_server_fields()`, `staff_payments_server_fields()` — triggers,
  run as the caller; revoked from public, anon, authenticated.
- `notify_staff_pay_due()` — not SECURITY DEFINER, cron only (`10 0 * * *`
  UTC, 07:10 WIB, after 164's 07:05). For each household: people whose
  payday is today (or tomorrow, for the Today line only) with no `wage`
  payment for the period; people whose THR is due, with no `thr` payment for
  that holiday. The pay-by date and the lead time come from their
  `staff_thr_plans` row when there is one (`pay_by`, `remind_days_before`).
  Without a plan, the date is the next `holiday_dates` date (or
  `thr_other_date`) minus 7 days, with a 30-day lead. It pushes on the lead
  day and on the pay-by day. One push per owner per
  morning, EN or ID by `locale_of`, names and dates only, tag
  `staff-pay-<date>`, url `/dashboard?module=access&view=pay`. Revoked from
  public, anon, authenticated; `service_role` only.
- `prune_staff_pay()` — cron, nightly before the photo sweep: deletes pay
  terms, THR plans and payments of profiles archived more than 2 years ago;
  payments paid more than 5 years ago; and THR plans whose holiday is more
  than 2 years past with no payment. Revoked; `service_role` only.

**Re-created** (copied from their latest definitions in 138):

- `repair_receipts_due_for_pruning(p_secret, p_limit)`: keeps a pay receipt
  while its payment exists; lists it once the payment is gone (after a day's
  grace for uploads).
- `orphaned_household_photos(p_secret, p_limit)`: never lists a file a
  payment points at.
- `export_household_data()`: adds `staff_pay` (terms), `staff_thr_plans`
  and `staff_payments`.
  Same SECURITY DEFINER, empty `search_path`, `caller_admin_household()`,
  revoked from public and anon, granted to authenticated.

**Tests** (`supabase/tests/141_staff_pay.sql`, rolled back):

- owners read and write all three tables; a staff session reads nothing and can't
  insert, update or delete; another household's owner can't either;
  logged-out gets nothing; a row can't point at another household's person
  or at an admin's profile;
- `my_pay`: right PIN returns only that person's data, without receipts or
  notes; wrong PIN returns nothing and counts toward the lockout; a locked
  person gets nothing; an owner session is refused; another household's
  phone is refused; `staff_see_pay` off returns nothing;
- `confirm_pay_received` sets `received_at` once, only for that person;
  editing the amount clears it;
- `leave_requests.kind`: staff insert with and without it; old-shape insert
  still works;
- `notify_staff_pay_due`: payday push, nothing once paid, THR push at 30 days
  and on the day; a plan with an earlier `pay_by` or a 14-day lead is
  honoured; no plan falls back to holiday − 7; no amounts in any text, one
  push per owner;
- `my_pay` returns the next unpaid THR plan's amount and pay-by date, and
  nothing once it's paid;
- `prune_staff_pay`, the two sweeps keeping and then listing a pay receipt,
  the export including pay; every function's grants.

## Owner text (EN / ID)

| Where | English | Bahasa Indonesia |
| --- | --- | --- |
| Household row, page title | Pay and days off | Gaji dan cuti |
| Row detail | 3 staff · payday Wed 25 Nov | 3 staf · gajian Rab 25 Nov |
| Person row | Rp 3.200.000 a month · payday 25th | Rp 3.200.000 per bulan · gajian tgl 25 |
| Status | Paid for Oct · Not set up yet | Oktober sudah dibayar · Belum diatur |
| Blocks | Pay · THR · Days off · What you've agreed | Gaji · THR · Cuti dan libur · Yang sudah disepakati |
| Setup fields | Monthly pay · Weekly pay · Payday · Paid by · Cash · Transfer · Started working · THR for · Weekly day off · Leave days a year | Gaji per bulan · Gaji per minggu · Tanggal gajian · Cara bayar · Tunai · Transfer · Mulai bekerja · THR untuk · Libur mingguan · Jumlah cuti per tahun |
| Holidays | Lebaran (Idul Fitri) · Natal · Nyepi · Waisak · Imlek · Another date | Lebaran (Idul Fitri) · Natal · Nyepi · Waisak · Imlek · Tanggal lain |
| Owners-only line | Only owners see pay. Staff see their own after entering their PIN. | Hanya pemilik yang melihat gaji. Staf melihat miliknya sendiri setelah memasukkan PIN. |
| Legal line | Not legal advice. The law (UU 2/2026) leaves the amounts to what you and your staff agree. | Bukan nasihat hukum. UU 2/2026 menyerahkan jumlahnya pada kesepakatan Anda dan staf. |
| Today lines | Payday today: Sari · Pay due: Sari · since Wed 25 Nov · THR: Maria by Fri 18 Dec | Hari gajian: Sari · Gaji belum dibayar: Sari · sejak Rab 25 Nov · THR: Maria paling lambat Jum 18 Des |
| Push title | Payday · THR reminder | Hari gajian · Pengingat THR |
| Push body | Payday today: Sari and Budi. · THR for Maria is due by Fri 18 Dec (Natal). | Hari ini gajian: Sari dan Budi. · THR Maria paling lambat Jum 18 Des (Natal). |
| Mark paid sheet | Pay for November · Amount · Paid on · Receipt (optional) · Note (optional, owners only) · What's different? · Mark paid | Gaji November · Jumlah · Dibayar tanggal · Bukti bayar (opsional) · Catatan (opsional, hanya pemilik) · Apa yang berbeda? · Tandai sudah dibayar |
| Toast | Paid: Sari · November · Undo | Sudah dibayar: Sari · November · Batalkan |
| Extras | Add a payment · Bonus · Overtime · Other | Tambah pembayaran · Bonus · Lembur · Lainnya |
| History | Received 25 Nov · Not confirmed yet | Diterima 25 Nov · Belum dikonfirmasi |
| THR block | THR for Lebaran · about Wed 10 Mar 2027 · Pay by Wed 3 Mar · Months worked · The usual rule · 9 of 12 months × Rp 4.000.000 · Amount · Remind me 30 days before · Mark THR paid | THR Lebaran · sekitar Rab 10 Mar 2027 · Bayar paling lambat Rab 3 Mar · Lama bekerja · Aturan yang lazim · 9 dari 12 bulan × Rp 4.000.000 · Jumlah · Ingatkan 30 hari sebelumnya · Tandai THR sudah dibayar |
| THR explainer | The usual rule for companies (Permenaker 6/2016). For households, UU 2/2026 says THR is paid in money, as you agreed. · Learn more | Aturan yang lazim untuk perusahaan (Permenaker 6/2016). Untuk rumah tangga, UU 2/2026 menyebut THR dibayar dalam bentuk uang, sesuai kesepakatan. · Pelajari |
| Under 1 month | Under a month's work: nothing by the usual rule. Many households still give something. | Belum sebulan bekerja: menurut aturan yang lazim belum dapat. Banyak rumah tetap memberi. |
| Days off block | Weekly day off: Sunday · 8 of 12 days left · Work year from 14 Jul · 2 days over · Not counted | Libur mingguan: Minggu · Sisa 8 dari 12 hari · Tahun kerja sejak 14 Jul · Lebih 2 hari · Tidak dihitung |
| Leave kinds | Annual · Sick · Family · Other | Tahunan · Sakit · Keluarga · Lainnya |
| Checklist | What you've agreed · Pay and payday · Work and hours · Day off and leave · THR · Written down and signed by both, each with a copy · Reported to the RT/RW · BPJS Kesehatan: PBI (paid by the government) · We pay · Covered elsewhere · BPJS Ketenagakerjaan (JKK and JKM) · One month's notice · Add as a bill | Yang sudah disepakati · Gaji dan tanggal gajian · Pekerjaan dan jam kerja · Libur dan cuti · THR · Ditulis dan ditandatangani berdua, masing-masing pegang salinan · Sudah dilapor ke RT/RW · BPJS Kesehatan: PBI (dibayar pemerintah) · Kami yang bayar · Ditanggung pihak lain · BPJS Ketenagakerjaan (JKK dan JKM) · Pemberitahuan satu bulan sebelum berhenti · Jadikan tagihan |
| Checklist note | This checklist helps you remember. It isn't a contract. | Daftar ini untuk membantu mengingat, bukan kontrak. |
| Staff see pay switch | Staff can see their own pay | Staf bisa melihat gajinya sendiri |

Wording follows `docs/indonesian-glossary.md`: **Anda**, **HP**, **staf**,
**Hanya pemilik**, **(opsional)** on owner forms, **Batalkan** for Undo,
**Bukti bayar** (164), dates as `id-ID`, rupiah with dots. **Gaji**, not
*upah*, on screens: it's what households say; the help page explains that
the law calls it *upah*. Never "pembantu" or "majikan".

## Staff text (Bahasa Indonesia only)

| Where | Text |
| --- | --- |
| Lapor row | Gaji & cuti saya |
| Leave block | Libur mingguan: Minggu · Sisa cuti: 8 dari 12 hari · Tahun kerja sejak 14 Jul · Cuti tahun ini |
| Pay card, hidden | Gaji dan THR · Rp •••••• · Lihat dengan PIN |
| PIN screen | Masukkan PIN Anda untuk melihat gaji |
| Pay card, open | Gaji: Rp 3.200.000 · tiap tgl 25 · Riwayat gaji · Nov 2026 · Rp 3.200.000 · Transfer · 25 Nov |
| Confirm | Sudah diterima · Terima kasih, sudah dicatat. |
| THR | THR Lebaran: paling lambat 3 Mar 2027 · Rp 3.200.000 · Belum diatur pemilik |
| Hidden by owner | Gaji tidak ditampilkan di HP ini. Tanyakan langsung ke pemilik rumah. |
| Auto-hide | Disembunyikan lagi supaya aman. |
| Ajukan Cuti | Jenis cuti (boleh dikosongkan) · Cuti tahunan · Sakit · Keluarga · Lainnya |

Short sentences, **Anda** or no pronoun, never *kamu*; **(boleh
dikosongkan)** on staff forms.

## Glossary rows to add (when built, not in this PR)

| English | Bahasa Indonesia |
| --- | --- |
| Pay (wage) / Pay and days off | **Gaji** / **Gaji dan cuti** (the law's word is *upah*; screens say gaji) |
| Payday | **Hari gajian** / "gajian tgl 25" |
| THR | **THR** (everyday; the law's *tunjangan hari raya keagamaan* on the help page only) |
| Received (staff confirm) / Not confirmed yet | **Sudah diterima** / **Belum dikonfirmasi** |
| Weekly day off | **Libur mingguan** |
| Leave left / Work year | **Sisa cuti** / **Tahun kerja** |
| Annual · Sick · Family · Other (leave) | **Tahunan · Sakit · Keluarga · Lainnya**; on the staff form **Cuti tahunan** |
| Cash · Transfer | **Tunai · Transfer** |
| Overtime | **Lembur** |
| Months worked | **Lama bekerja** |
| The usual rule | **Aturan yang lazim** |
| Agreement / What you've agreed | **Kesepakatan** / **Yang sudah disepakati** (the law: *Kesepakatan*, *Perjanjian Kerja*) |
| Reported to the RT/RW | **Sudah dilapor ke RT/RW** |

## Decisions for the owner

- **D1 — Where it lives.**
  **A (recommended):** a **Pay and days off** row in Household, a page per
  person; payday and THR lines on Today. B: inside each person's existing
  staff sheet (less to find, but buries the THR overview). C: a new pill
  under Chores (wrong place: pay isn't a chore).
- **D2 — What the pay record holds.**
  **A (recommended):** pay (monthly, or weekly for part-time), payday, cash
  or transfer, start date, THR holiday, weekly day off, leave days a year.
  B: pay and payday only (no THR or leave help). C: A plus working hours and
  in-kind benefits (meals, room): more to fill in, little the app can do
  with it yet.
- **D3 — Mark paid.**
  **A (recommended):** agreed amount prefilled and editable, date, cash or
  transfer, optional receipt and owners-only note; extras (bonus, overtime)
  as separate entries; **no deductions** for now. B: also deduction lines
  (kasbon, breakages): useful, but sensitive and better with household cash
  (item 15). C: paid / not paid only, no amounts (no record to point to in a
  disagreement).
- **D4 — THR amount.**
  **A (recommended):** prefill with the usual rule (1 month's pay at 12
  months; months ÷ 12 before that; due H-7), editable, labelled as the
  company rule and not a household duty. B: the owner types the amount, no
  rule shown. C: the rule's amount, not editable (contradicts the law's
  "as agreed").
- **D5 — THR reminder.**
  **A (recommended):** 30 days before the pay-by date and again on it,
  plus a Today line from 30 days until paid. B: 14 days before. C: only on
  the pay-by date (too late to plan the cash).
- **D6 — Holiday dates.**
  **A (recommended):** a built-in table of the national religious holidays
  from each year's SKB, added by a small migration every September, plus
  "another date" per person; THR named by holiday, not religion. B: the
  owner types the date every year. C: Lebaran only (wrong for Christian,
  Hindu, Buddhist or Konghucu staff).
- **D7 — Leave balance.**
  **A (recommended):** leave days a year per person (default 12), a kind on
  each leave (Annual, Sick, Family, Other; empty counts as Annual), only
  Annual counts, weekly days off don't, no carry-over, balance can go
  negative but never blocks a request. B: every approved day counts (sick
  days eat holiday). C: no balance, just "days taken this year".
- **D8 — Staff see their own pay.**
  **A (recommended):** yes, behind their PIN every time, amounts hidden until
  then and hidden again after; leave balance without PIN; one household
  switch to turn pay off. B: staff see leave only, never pay. C: pay visible
  without a PIN (anyone holding the phone sees it).
- **D9 — Staff confirm a payment.**
  **A (recommended):** an optional **Sudah diterima** (with PIN), shown to
  owners as "Received 25 Nov". The record both sides agreed on. B: no
  confirmation.
- **D10 — Agreement checklist.**
  **A (recommended):** optional ticks from Pasal 11, 16, 17 and 19, a BPJS
  Kesehatan choice, "Add as a bill" for BPJS Ketenagakerjaan; **no document
  photos or ID numbers**. B: also store a photo of the signed agreement
  (contains KTP numbers and signatures: more risk, more privacy text).
  C: no checklist. Later, separately: a printable Indonesian agreement made
  from the pay setup (Kakak or a template).
- **D11 — How long pay records are kept.**
  **A (recommended):** while on the staff list and 2 years after removal;
  each payment at most 5 years. B: 2 years from each payment, as bills
  (loses the history of a long-serving worker). C: until an owner deletes
  them (against UU PDP's minimisation).
- **D12 — Pushes.**
  **A (recommended):** names and dates only, never amounts; owners only.
  B: include amounts (visible on lock screens).
- **D13 — When and how it's built.**
  **A (recommended):** one migration (141), two app PRs: **PR A** pay setup,
  Mark paid, payday reminder, staff view and confirm, privacy policy; **PR
  B** THR calculator and reminder, leave kinds and balance, checklist. Aim
  for both live by **mid-January 2027**, ahead of the Lebaran THR reminder
  on 1 Feb. Natal 2026 (THR by 18 Dec) is too close to build for safely; a
  What's new note can remind Christian households' owners by hand. B: all in
  one PR (bigger review). C: THR first, pay later (THR without the pay record
  has nothing to calculate from).
- **D14 — Tutorial.**
  **A (recommended):** one owner What's new card and one staff card (below).
  B: owner card only.

## Tutorial lines

**Owners** (What's new, once, on Household):

1. "Keep track of staff pay: **Household → Pay and days off**. Set what you
   agreed once." / "Catat gaji staf: **Rumah → Gaji dan cuti**. Atur yang
   sudah disepakati sekali saja."
2. "On payday we remind you. Tap **Mark paid**, with a receipt if you like.
   Only owners see pay." / "Saat hari gajian kami ingatkan. Ketuk **Tandai
   sudah dibayar**, boleh dengan bukti bayar. Hanya pemilik yang melihat
   gaji."
3. "THR is worked out for you, with a reminder a month before it's due."
   / "THR dihitungkan, dan kami ingatkan sebulan sebelum jatuh tempo."
4. "Your staff can see their own pay and leave left, after entering their
   PIN." / "Staf bisa melihat gaji dan sisa cutinya sendiri setelah
   memasukkan PIN."

**Staff** (once, in the Lapor sheet, Indonesian only):

1. "Baru: **Gaji & cuti saya**. Lihat sisa cuti dan libur mingguan Anda."
2. "Gaji dan THR bisa dilihat dengan PIN Anda. Ketuk **Sudah diterima**
   kalau gaji sudah sampai."

## Manual first, Kakak later

Everything above works by hand. Later, as the paid extra, Kakak could
draft a printable agreement in Indonesian from the pay setup, explain the
THR working in plain words, or answer "how many days off has Sari got
left?". Any of that sends pay to Anthropic, so it waits for its own plan
and a privacy-policy change first; until then pay stays out of Kakak's
context.

## Not in this phase

- Deductions and advances (kasbon); household cash (item 15).
- Payroll, tax (PPh 21), or paying staff from Miamus.
- Registering BPJS from the app, or storing BPJS numbers.
- Working-hours or overtime tracking.
- Leave carry-over, half days, accrual.
- Pushes to staff phones about pay (Phase 166 is the base if wanted later).
- Agency (P3RT) contracts and documents.
- "Who gave what" at Lebaran and Natal (roadmap item 22).

## Re-check before building

- Whether the PP on pay amount and timing (Pasal 15(3)) or on social
  security (Pasal 16(4)) has been issued; due by 30 April 2027.
- BPJS Ketenagakerjaan BPU rates and the discount's end date.
- Lebaran 2027's confirmed date (sidang isbat).
- `supabase/migrations` and open PRs for the next free number.
