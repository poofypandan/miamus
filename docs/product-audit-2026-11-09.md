# Product audit after the Paz research: 9 November 2026

Status: **for the owner's review. Nothing built.** The owner picks a batch
first.

Inputs:

- Codex's research (9 Nov): `miamus-vs-Paz.canvas.tsx` and
  `miamus-market-research.canvas.tsx`, in the owner's Cursor canvases folder.
  Competitor capabilities are treated as **public claims** (the research
  didn't test Paz end to end). Our own positioning and pricing are treated as
  **hypotheses**.
- The code on `main` at `5a51bda` (everything through migration 131), read
  for this audit. Older handoff docs weren't trusted where the code says
  otherwise.
- The landing-page proposal (PR #43), which covers area 1.

## The finding in one paragraph

Paz's pitch is one loop: **the owner gives an instruction → staff receive
it → staff respond → the owner sees the outcome.** Miamus already does the
first and last steps well for the happy path: set a chore or routine once;
staff finish it with photos; the owner sees who and when. It's weakest in
the middle and at the edges:

- **Staff aren't told** about new work. Staff phones get no notifications;
  the push system supports them, but nothing subscribes or sends.
- **Staff can't say "I couldn't"**. A task is either done with photos or
  left red.
- **The owner isn't told what didn't happen**. Pushes cover a sick pet, food,
  urgent repairs and a locked PIN, never a missed task.

So the owner still opens Today to check, or asks on WhatsApp. That "sudah
belum?" message is the work Miamus should remove.

## The five areas

### 1. Product explanation

- **Sign-in screen** (`src/app/page.tsx`): mark, "A little less on your
  mind", one line listing pets, chores, kitchen and helpers, then **Continue
  with Google** and **Saya staf**. Right for returning users. A new owner
  can't tell from it who it's for, how work reaches staff, what it costs, or
  whether staff need accounts.
- **Marketing experience:** none. `/` renders only a splash on the server
  (it routes in the browser), so link previews and search see nothing.
- **Inside the app**, the explanation exists but only after sign-in: About
  Miamus (`about-miamus.tsx`), What's new (`whats-new.tsx`), the invite panel's
  plain description of family vs staff phones (`invite-panel.tsx`).
- **Addressed by PR #43** (`/welcome` + `/selamat-datang`, owner asks → staff
  do it → owner sees it). Not repeated below.

### 2. First useful outcome

Walking through a new household, from the code:

| Step | Where | Effort or confusion |
| --- | --- | --- |
| 1. Continue with Google | `/` | Fine. |
| 2. Choose a language | `/onboarding` `LanguageScreen` | Fine. Pre-selects the phone's language. |
| 3. Request access, then wait | `RequestScreen`, `WaitingScreen` (migration 113) | **Nothing tells them when they're approved.** The screen says "open Miamus again". No email service exists. |
| 4. Name the household | `CreateHouseholdForm` | Fine. One field. |
| 5. Empty Today: "Add Pet" or "Add Chore" | `agenda-tab.tsx` (brand-new state) | **Staff aren't mentioned.** The first screen points at data entry, not at connecting the people who'll do the work. |
| 6. Add the staff member | Household → **Staff** → Add Person, then Set PIN or "Let them choose" | Found only by exploring the Household tab. |
| 7. Link their phone | Household → **Invite someone** → Link a staff phone → copy | A second, separate screen. Copy only: the owner pastes it into WhatsApp and writes their own message. |
| 8. Staff open the link | `/join/staff` → `/staff` → pick name → create PIN | Works. Then "Add to Home Screen" is left to the staff member (the owner's banner mentions it, `staff-onboarding-banner.tsx`). |
| 9. Add a repeating task for them | Chores → Add Chore | Repeat is none / daily / weekly / monthly; **weekly means one weekday** (`chore-recurrence.ts`). "Mon, Wed, Fri" needs three chores. |
| 10. Staff finish it | Staff Today → tap → before photo → after photo | **Both photos are required for every chore** (migration 104), even "Buang sampah". |
| 11. Owner sees it | Today, the staff strip, photos | Only by opening the app. No push, no summary. |

Unnecessary effort: steps 5–7 (three places, nothing guiding the order),
step 3's silent wait, step 9's weekday limit, step 10 for small chores.

### 3. Daily staff experience

- **Finding today's work:** good. One list, "Tugas Hari Ini", overdue first,
  done folded away, "Semua tugas hari ini sudah selesai 🎉"
  (`app/staff/page.tsx`). Staff see their own and unassigned work.
- **Clutter above the list:** up to three "Yang baru" cards stack above the
  first task (`app/staff/page.tsx`, the `StaffWhatsNewCard`s for floors,
  repairs and repair notes). For a slow reader, the first thing on screen is
  news, not work.
- **Understanding instructions:**
  - Chore notes show on the card at `text-xs` in muted grey
    (`chore-card.tsx:133`), the smallest, lightest text on the card.
  - **Pet routines have no instructions at all**: title and times only
    (`CreateScheduleInput`, `src/lib/data/types.ts:84`). Portion, which food
    and the dose live in WhatsApp or memory.
- **Completing:** clear tap hints ("Ketuk untuk foto", "Saya kerjakan"), big
  buttons. Photos for every chore (above).
- **Reporting problems:** the **Lapor** button opens a sheet: Makanan masuk,
  Lapor kerusakan, Stok menipis, Usulan jadwal, Catatan ekstra (Pipis Ekstra
  / Muntah / Sakit / Lainnya). Good for things *noticed*. **None of it is
  attached to a task** the staff member is looking at.
- **Correcting mistakes:**
  - Routines have a 5-minute undo (`undo-window.ts`, `agenda-group-card.tsx`).
  - **Chores have none** (`finish-chore-sheet.tsx`). A wrong finish stays
    until an owner edits it.
- **Older users:** plain Indonesian, *Anda*, 24-hour times, 44–52 px buttons.
  Weak spots: 11–12 px grey subtitles, the tip cards, and two photo steps per
  chore.

### 4. Exceptions and handovers

| Situation | What happens today | Owner still has to chase? |
| --- | --- | --- |
| Supplies missing | Staff can file "Stok menipis" in Lapor; the owner sees a quiet "to buy" line on Today. The task itself just stays undone. | **Yes**: why the task is red isn't linked to the missing item, and there's no push. |
| A task can't be done | No way to say so. It turns red ("Belum selesai dari …"). | **Yes.** |
| Pet refuses food | A meal is logged by photo + ticking pets. No "ate half / refused". Staff can add Catatan ekstra → Lainnya with words. Only "Muntah / Sakit" pushes the owner. | **Yes**, unless staff think to write a note, and the owner thinks to look. |
| Someone else already did it | Chores: claimed chores say "Tugas ini sudah diambil orang lain". Routines: one log covers everyone. | Mostly no. Fine. |
| Usual staff member away | Leave (cuti) is built in: tasks pause or open to others; a fallback person can be named (`leave-request.tsx`, `leave_requests.fallback_assignee_id`). | **Partly**: leave requests don't push the owner; staff are told to WhatsApp them. |
| Staff suggestion / restock / leave waiting on the owner | Saved, then staff see "Kirim pesan supaya cepat ditanggapi" with a WhatsApp button (`whatsapp-notify-panel.tsx`, whose comment still says "the app has no push channel to the owner", outdated since Phase 119). | **Yes**: the owner learns via WhatsApp, or on their next visit. |
| A stand-in does a pet routine | They see the title and time, not the portion or the dose. | **Yes**: instructions are repeated by message. |

### 5. Repeat paid value (Kakak)

- **What she does** (`src/lib/kakak/tools.ts`): create a chore, add to the
  shopping list, add a pet routine, add food, ask a clarifying question.
  Owners only, typed (the keyboard's dictation works), and every change is
  confirmed on a card. Built, **off** until the key and eval
  (`docs/kakak-setup.md`).
- **After setup:** most of these are one-time setup actions. The ones that
  recur are shopping and food ("beli sabun cuci", "Tante Rina kasih rendang").
  She can't answer "what's left today?", "did Mochi eat this week?", or turn
  a staff note into an owner action. She has nothing on the staff side.
- **Direction kept:** manual is free, AI is the paid extra. The free evening
  summary proposed below (item 2) is a fixed list; it doesn't compete with
  Kakak, and it removes the weakest reason anyone would pay.

Assumptions to test before pricing (practice mode on staging, 5 owners, 2
weeks):

1. An owner who used Kakak for setup still uses her **3+ times a week in
   week 3**, mostly for shopping and food.
2. **Free-form changes** ("the vet says half portions for a week") are worth
   paying for: Kakak updates the routine's instructions (item 6) and a
   medicine course. Needs one new tool; test with scripted practice first.
3. **Questions about the household** ("anything not done today?", "when was
   the AC last serviced?") are asked often enough to justify a read-only
   tool. Ask owners to write down every question they'd ask for a week.
4. **Staff voice reports** ("Mochi cuma makan setengah, muntah sedikit"),
   which Kakak turns into a log or an exception, may be the strongest repeat
   use. They are also the biggest privacy change: staff voice and text sent to
   Anthropic, a staff-facing notice, cost per household. Interview first,
   build later.
5. The household **would pay for convenience while the coordination stays
   free**. If owners love the manual app but rarely open Kakak, bring that
   evidence back before changing the agreed boundary.

## The ranked plan

Ranked by how much owner follow-up and staff friction each removes, for its
effort. "Privacy" means a privacy-policy update in both languages and
`src/config/legal.ts` (the owner approves the text first).

| # | Improvement | Size | Migration | Privacy / data / pricing / services |
| --- | --- | --- | --- | --- |
| 1 | **"Tidak bisa dikerjakan"**: staff say why a task couldn't be done | Medium | Yes | A short policy line (reasons and notes staff write); no new service |
| 2 | **Evening "not done today" summary** for owners, plus a push when staff requests wait on them | Small–medium | Yes | A policy line (new notification types); no new service |
| 3 | **First-run checklist**: household → staff → link → first task → done | Small | No | None |
| 4 | **Notifications on staff phones** ("new task for you", "the owner answered") | Medium | Yes | Policy (push subscriptions on staff phones); no new service |
| 5 | **Calmer staff Today**: one tip at a time, readable notes and subtitles | Small | No | None |
| 6 | **Instructions on pet routines** ("Catatan untuk staf") | Small–medium | Yes | None expected (household instructions, like chore notes) |
| 7 | **Undo a finished chore** for 5 minutes, like routines | Small | Optional (tighten the guard) | None |
| 8 | **Photo proof per chore**: before & after / after only / none | Medium | Yes (trigger 104) | Fewer photos collected; optional policy note |
| 9 | **Tell approved owners**: reply from support@ when a request is approved | Tiny (process) | No | None (the email already shared for the request) |
| — | Product explanation: landing page | — | — | PR #43 |
| — | WhatsApp delivery and replies | Experiment | — | **New service, new personal data**; see the separate section |

### 1. "Tidak bisa dikerjakan": say why a task couldn't be done

- **User problem.** A staff member finds no detergent, a locked room, or a
  dog that won't eat. Miamus has no answer for that, so the task goes red and
  the owner has to ask.
- **Evidence.**
  - A chore only finishes, with two photos (`finish-chore-sheet.tsx`,
    migration 104).
  - A routine only logs, with a photo and the pets ticked
    (`agenda-group-card.tsx`).
  - The Lapor sheet isn't tied to a task (`staff-actions-fab.tsx`,
    `staff-reports-panel.tsx`).
- **Smallest useful improvement.** A quiet second button in both sheets,
  **"Tidak bisa dikerjakan"**, then four big reasons:
  - **Barang habis**: optionally adds the item to the shopping list;
  - **Hewan tidak mau makan** (routines);
  - **Sudah dikerjakan orang lain**;
  - **Lainnya**, with a note and an optional photo.

  The owner sees the task in amber, "Tidak bisa: Barang habis · Sari ·
  09.10", instead of red, and it appears in the evening summary (item 2).
  "Hewan tidak mau makan" on a medicine routine pushes the owner, like
  "Muntah / Sakit".
- **Benefit / effort.** Turns silent failures into answers. It's the
  "staff respond" half of the Paz loop, and the research's point that
  exceptions matter more than checkmarks. Medium: a nullable status and
  reason on chores and logs, the staff chore guard (migration 128) widened
  to allow it, two sheets, the owner's row.
- **Validate.**
  - 3 households, 2 weeks before and after: count red tasks with no
    explanation, and owner "kenapa belum?" messages.
  - 3 staff (40+) use it unaided on a test household; can they find it in
    under 10 seconds?
- **Privacy / data / pricing / services.** A new field (the reason, an
  optional note and photo, staff-written like existing notes), with the same
  retention as the task. One policy line. No pricing change, no new service.

### 2. Evening "not done today" summary, and pushes for requests that wait

- **User problem.** Owners learn about missed work only by opening Today.
  Leave requests, schedule suggestions and restock notes reach them through
  WhatsApp.
- **Evidence.**
  - Owner pushes today are a sick report, PIN locked, food from staff, food
    expiring, urgent repair and household deletion (migrations 103/114,
    115, 123, 124, 130, 127).
  - Nothing fires on overdue routines or chores, leave requests, routine
    proposals or inventory alerts.
  - `whatsapp-notify-panel.tsx` asks staff to message the owner instead.
- **Smallest useful improvement.**
  - One push at a time the owner picks (default 19.00), only when something
    is open: **"2 belum selesai hari ini: Obat Mochi 18.00, Pel teras"**.
    Tapping it opens Today. Off or on per owner, under Notifications.
  - A plain push when a leave request, suggestion or "Stok menipis" arrives,
    grouped so three restock notes make one push.
  - The staff's WhatsApp nudge then says "Admin sudah diberi tahu" when an
    owner has notifications on.
- **Benefit / effort.** The most direct cut to "sudah belum?" follow-up: the
  owner hears about the exception and doesn't have to check for success.
  Small–medium: one migration (pg_cron job + triggers through
  `queue_owner_push`), one settings row, the panel's wording.
- **Validate.**
  - 3 households for 2 weeks: owners count their checking messages before
    and after.
  - Ask whether the evening push felt useful or like nagging (keep it only
    if 2 of 3 keep it on).
- **Privacy / data / pricing / services.** No new data, no new service (Web
  Push already runs). New notification types: one policy line, like the
  food pushes got. Free tier: it's manual, not AI.

### 3. First-run checklist

- **User problem.** A new owner names the household and lands on "Add a pet
  or a chore". Connecting staff is two separate screens they have to find,
  and the link needs a message they write themselves.
- **Evidence.**
  - The brand-new empty state in `agenda-tab.tsx` mentions only pets and
    chores.
  - Staff and Invite are separate rows in `staff-tab.tsx`.
  - `invite-panel.tsx` copies the link only.
- **Smallest useful improvement.** A card on Today until it's done, built
  from data the app already has:
  1. **Add who helps at home** (opens Staff → Add Person).
  2. **Send them their link**: the existing invite, plus a "Kirim lewat
     WhatsApp" button with a ready Indonesian message (the same `wa.me` link
     pattern staff use; the owner sends it themselves).
  3. **Add one repeating task for them** (the chore form, assignee
     pre-filled).
  4. **See it done**: ticks itself when the first staff completion arrives.

  The card can be dismissed, has the copy in both languages, and gets a
  tutorial line in What's new.
- **Benefit / effort.** Shorter time to the first useful outcome for every
  household the landing page brings in. Small: client only, no migration.
- **Validate.** Watch 3 new owners set up unaided (screen share or in
  person). Measure the minutes to the first staff completion and where they
  stop.
- **Privacy / data / pricing / services.** None. The WhatsApp button only
  opens the owner's own WhatsApp with a message they send.

### 4. Notifications on staff phones

- **User problem.** Staff learn about a new task, a moved chore or the
  owner's answer only when they next open Miamus. That is the "staff receive
  it" step Paz sells.
- **Evidence.**
  - `push_dispatch_plan` already supports `target_role` staff (migration
    103).
  - The only subscribe UI is in the owner's Household tab
    (`push-notification-settings.tsx`).
  - No trigger sends to staff.
- **Smallest useful improvement.**
  - A one-time card on the staff Today: **"Nyalakan notifikasi"**.
  - Then pushes only for a new or changed task assigned to *this person*
    today, and for an owner's answer to their report.
  - No reminders and no nagging.
  - On a shared house phone, a push names the person: "Untuk Sari: …".
- **Benefit / effort.** Closes the loop inside Miamus with the channel we
  already pay nothing for. Medium: phone-to-person mapping, iPhone needs the
  app installed (iOS 16.4+), triggers, staff copy.
- **Validate.** 3 households, 2 weeks:
  - time from an owner adding a same-day task to staff starting it;
  - how many staff turn notifications on, and keep them on.
- **Privacy / data / pricing / services.** Push subscriptions from staff
  phones become a stored item: policy update. No new service. Run this
  **before** the WhatsApp experiment, because it answers whether a channel
  is the problem at all.

### 5. Calmer staff Today

- **User problem.** On a busy morning, an older staff member first reads up
  to three news cards, then small grey text under each task. The notes that
  matter are the hardest text on the screen to read.
- **Evidence.** Three `StaffWhatsNewCard`s above the list
  (`app/staff/page.tsx`); notes at `text-xs text-muted-foreground`
  (`chore-card.tsx:133`); subtitles at 11–12 px.
- **Smallest useful improvement.**
  - At most **one** tip card at a time (newest first).
  - Chore notes at 14 px in normal ink, with a small "Catatan" label.
  - Staff subtitles at 13 px.
  - **No emoji in what staff and owners see** (owner, 2026-11-09): being
    done separately. PR #45 (merged) added the review rule. PR #46 removes
    the app's existing emoji (the workload sheet, share text, cancel note,
    and push titles in migration 132). The remaining "selesai ✅", 🏥 and 🏠
    in `agenda-group-card.tsx` follow there.
  - Nothing else moves.
- **Benefit / effort.** Instructions get read, and the screen starts with
  the work. Small: client only.
- **Validate.** 3 staff (40+) read their Today aloud; count missed notes and
  time to the first task, before and after.
- **Privacy / data / pricing / services.** None.

### 6. Instructions on pet routines

- **User problem.** "Makan, 07.00" doesn't say how much, which food or which
  bowl. A stand-in staff member asks, or guesses.
- **Evidence.** Routines carry a title and times only (`CreateScheduleInput`,
  `src/lib/data/types.ts:84`). Chores have notes (`chore-editor-dialog.tsx`
  "Catatan (opsional)").
- **Smallest useful improvement.** An optional **"Catatan untuk staf"** on a
  routine ("1 gelas dry food + ½ kaleng, mangkuk biru"), shown on the staff
  routine card and sheet. Kakak can fill it later (assumption 2).
- **Benefit / effort.** Cuts repeated instructions and survives handovers:
  the narrow, useful version of Paz's "household memory". Small–medium: a
  nullable column on `master_schedules`, the schedule editor, the staff card.
- **Validate.** Owners write instructions for one routine; a different staff
  member does it without asking anyone.
- **Privacy / data / pricing / services.** None expected (the same kind of
  household instructions as chore notes). Confirm against the policy's list
  when building.

### 7. Undo a finished chore

- **User problem.** A wrong chore finished, or the wrong photo, can't be
  taken back by the staff member.
- **Evidence.** Routines: 5-minute undo (`undo-window.ts`). Chores: no undo
  in the app (`finish-chore-sheet.tsx`). The database already lets a staff
  phone set a chore back to pending: the staff chore guard (migration 128)
  accepts `pending` or `completed` and the completion fields, without checking
  who finished it or when. So the gap is the missing button, not a blocked
  write.
- **Smallest useful improvement.** A **"Batalkan"** toast for 5 minutes
  after finishing. The chore goes back to claimed and keeps its photos for a
  retake.
- **Benefit / effort.** Safe correction, which the research names as a staff
  need. Small for the button alone (client only). Optionally tighten the
  guard (migration) so a staff phone can only reopen a chore *it* finished,
  within 5 minutes; today any staff phone could reopen any finished chore
  through the API, which is worth closing in the same change.
- **Validate.** Count owner edits of completed chores per week; staff test.
- **Privacy / data / pricing / services.** None.

### 8. Photo proof per chore

- **User problem.** Every chore needs a before and an after photo, even
  taking out the rubbish. It costs time and can feel like being watched.
- **Evidence.** Migration 104 enforces both photos on every completion.
- **Smallest useful improvement.** On the chore form: **Foto bukti: Sebelum &
  sesudah (default) / Sesudah saja / Tanpa foto**. Trigger 104 reads the
  chore's setting. Existing chores stay as they are.
- **Benefit / effort.** Less friction and fewer photos, with proof kept where
  owners actually look. Medium: a trigger change needs care and tests.
- **Validate.** Ask owners which chores they open photos for; ask staff
  (privately) which photos feel useful and which feel intrusive.
- **Privacy / data / pricing / services.** Collects less. An optional policy
  note.

### 9. Tell approved owners

- **User problem.** Someone requests access and is never told it was
  approved.
- **Evidence.** `WaitingScreen` in `/onboarding`: "open Miamus again"; no
  email service.
- **Smallest useful improvement.** During the beta, the operator replies
  from support@poofylabs.dev when approving. That's process, not code. An
  automatic email needs a provider (a new service and a policy change), so
  not now.
- **Validate.** The share of approved requests that create a household
  within 48 hours.
- **Privacy / data / pricing / services.** None. It uses the Google email
  the request already shares, for the same purpose.

## Recommendation

**The first three improvements: 1, 2, 3.** Together they close the loop
without a new service:

- staff can answer "I couldn't" (1);
- the owner hears what didn't happen, without checking (2);
- a new household reaches its first finished task without hunting (3).

**One small implementation batch to build first: items 3 + 5** (first-run
checklist and calmer staff Today).

- The emoji clean-up is no longer part of this batch: PR #46 does it.
- Client only: no migration, no privacy change, no new service. It can ship
  while 1 and 2, which need migrations and a policy line each, get their
  mockups and the owner's decisions.
- Mockup first, as usual. Feature tutorials: an owner What's new line for
  the checklist (EN/ID); nothing new for staff.
- About 1–2 days, Codex review, staging, then the owner's OK to merge.

Then: **item 1 and item 2 as one plan with mockups** (they share the
evening summary). Then item 4. The WhatsApp experiment comes after item 4,
and only if staff push doesn't close the gap.

## WhatsApp delivery and replies: a separate experiment

**Today (manual, no service):** owners copy an invite link and send it
themselves. After a report, staff tap a `wa.me` link that opens *their own*
WhatsApp with a prefilled message (`generateWhatsAppLink`,
`whatsapp-notify-panel.tsx`). Miamus never sends, receives or reads a
WhatsApp message. No phone numbers are stored (`StaffProfile` has a name and
a PIN only).

**What Paz claims (public, untested):** owner app → WhatsApp → staff reply
→ back in the owner's app.

**What an automated delivery-and-reply integration would need:**

| Piece | What it means for Miamus |
| --- | --- |
| WhatsApp Business Platform (Cloud API) | A Meta Business account for Poofy Labs, business verification (needs the registered entity, still in progress), a dedicated sending number with a display name Meta approves. |
| A provider, or Meta directly | Meta's Cloud API directly (cheapest, we run everything), or a business solution provider (Twilio, 360dialog, or a local one such as Qontak / Wati) for tooling and support, at a monthly fee or markup. |
| Message templates | Anything Miamus starts (the morning task list, a new task) must be a **pre-approved template**, in Indonesian, category "utility", with quick-reply buttons ("Sudah", "Tidak bisa"). Free-form replies are possible only inside the 24-hour window after the staff member writes. |
| Inbound webhook | A server endpoint (Supabase Edge Function or a Vercel route) that verifies Meta's signature, matches each reply to **one task** (button payload = task id), and handles "sudah semua", typos, voice notes, photos and replies to old messages. That's the hard part. |
| Consent | Each staff member opts in to WhatsApp messages from Poofy Labs **themselves**, separate from the employer's choice, with STOP / MULAI handling and a staff-facing notice in Indonesian. |
| Costs | Meta charges per template message; Indonesian utility templates cost a few US cents each (check Meta's current rate card; providers add their fee). Illustration only: 2 staff × 5 messages a day × 30 days ≈ 300 messages ≈ several US dollars per household per month, before provider fees and support time. That's a real line in the pricing model. |
| Privacy policy and law | **New personal data:** staff phone numbers and message content. **New processors:** Meta (and the provider), with transfer outside Indonesia (UU PDP). Retention of messages, a DPA with the provider, both languages of the policy and `legal.ts` updated, the owner's approval first. |
| Operations | Number quality rating (blocks if staff report spam), template rejections, delivery failures, a support path when replies go to the wrong task. |

**The experiment, if run:** after item 4 has been live for 2 weeks.

- 3–5 households, one flow only: a **07.00 template** listing today's tasks
  for that person, with **Siap** (seen) / **Ada yang tidak bisa** buttons.
- **Replies acknowledge; they don't complete.** A chore can only become
  completed with both proof photos (trigger 104), and a pet routine with its
  photo, so a "done" button in WhatsApp can't record a completion without
  weakening the proof rule. "Siap" marks the list as seen; "Ada yang tidak
  bisa" opens a link to the task's item-1 exception in the app; completion
  stays in the app with its photos. A per-task WhatsApp photo flow (staff
  send the after photo in the chat) is possible but is the expensive part
  of the webhook. Leave it out of the first experiment.
- Measure acknowledgement in WhatsApp, and completion in the app, for both
  arms. That keeps the comparison with staff push fair.
- Compare with staff push (item 4) on:
  - time to acknowledgement;
  - tasks finished;
  - owner follow-ups;
  - staff preference (asked privately);
  - cost per household per month.
- Build only on a clear win. Budget a test number and the provider's sandbox
  first.

## Not changing

Five tabs; the calm design; staff screens in Bahasa Indonesia only; the pet
workflows (routines, meds courses, clinic stays) as they are; manual free,
AI paid. Nothing here copies Paz's look or assets. Borrowed principles only:
name the household, show the loop, make the staff's reply easy.

## Decisions for the owner

| # | Decision | Recommended |
| --- | --- | --- |
| B1 | First batch to build | **Items 3 + 5** (checklist, calmer staff Today), mockup first |
| B2 | Next plan | **Items 1 + 2** together, with mockups and the policy lines |
| B3 | Staff push (item 4) before any WhatsApp work | **Yes** |
| B4 | WhatsApp experiment | **Later**, only after item 4, and only with the entity and Meta verification in place |
| B5 | Kakak assumptions | Test 1–3 in practice mode with 5 owners; interview before building staff voice (4) |
| B6 | Approval replies (item 9) | Start now, by hand from support@ |
