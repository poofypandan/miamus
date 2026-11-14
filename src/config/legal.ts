/**
 * The facts the privacy policy (/privacy, /privasi) states about who runs
 * Miamus and where its data lives. One place, so a change here is a change on
 * both language versions at once.
 *
 * TODO(owner): fill in operatorName and contactEmail before this reaches
 * production — until both are set, the policy shows a "Draft" banner. Bump
 * policyVersion and effectiveDate whenever the policy's substance changes.
 */
export const LEGAL = {
  /** Who runs Miamus: your name, or your company's registered name. */
  operatorName: "Poofy Labs",
  /** An inbox you actually check. Data requests under UU PDP arrive here. */
  contactEmail: "support@poofylabs.dev",
  // 2026-11-06: requests to set up a household, and their 30-day retention
  // (Phase 148, migrations/113); an admin's language choice (Phase 149,
  // migrations/114).
  // 2026-11-07: the language picked on the sign-in screen, kept on the phone
  // (Phase 150). Staff sign-in attempts (30 days) and the linked-phones list
  // admins see (Phase 151, migrations/115).
  // 2026-11-07.3: food the household lists — where it came from, where it
  // is kept, its expiry (or "don't know"), its photo (kept while listed) —
  // finished food (kept 90 days), and the admins' notification when staff
  // add food (Phase 156, migrations/123).
  // 2026-11-07.4: the admins' morning notification of food that expires
  // today or tomorrow (Phase 157, migrations/124).
  // 2026-11-08.1: data moves from Tokyo to Singapore (new Supabase project
  // in ap-southeast-1); the app's server code also runs in Singapore
  // (vercel.json, PR #15). Set effectiveDate to the day of the move.
  // 2026-11-08.2: signing out deletes this phone's offline copy, unsent
  // logs and photos, and chore drafts (PR #17).
  // 2026-11-08.3: admins download a copy of their household's data and the
  // founder deletes the household in the app, 7 days after asking; photos
  // follow in the nightly clean-up, 2,000 a night (R7, migrations/127).
  // 2026-11-09.1: Kakak, the AI assistant an admin can turn on (off by
  // default). Anthropic (United States) becomes a processor: what admins
  // type to Kakak plus first names of staff, pets, rooms and shopping items
  // are sent with each request; Anthropic keeps them up to 30 days, longer
  // only if flagged for safety, and doesn't train on them. Miamus keeps only
  // request counts and costs (no text), 13 months (Phase 156).
  // 2026-11-09.2: repairs — what broke, where, photos of the problem and of
  // each visit before and after, who reported it, who fixed it (a name
  // only), kept while open and 2 years after closing; admins are notified
  // of urgent staff reports (Phase 159, migrations/130). No new service.
  // 2026-11-09.3: repairs, part 2 — a warranty end date; notes on a repair
  // by admins or staff (optional photo); for admins only, a repair's cost,
  // receipt photo and note, in storage only admins can open. Kept as long as
  // the repair (open, then 2 years). No new service (migrations/131).
  // 2026-11-09.4: what waits on the phone until it is sent now also covers
  // finished chores and new food, and anything saved on a signal too weak
  // to send, not only while offline (Phase 161, R10). No new service; still
  // deleted on sign-out.
  // 2026-11-10.1: kept on the phone — whether notifications were turned on
  // in this browser (so they can be renewed) and when the notifications
  // reminder was last put off. No new data on the server, no new service.
  // 2026-11-10.2: feedback sent from the app ("Send feedback" / "Kirim
  // masukan"): the message, an optional type, who sent it, the household,
  // the screen and the app version; read by the operator and the
  // household's admins, never by staff; kept 2 years (migrations/135). No new
  // service.
  // 2026-11-10.3: talking to Kakak (voice beta). The browser's own speech
  // recognition turns the owner's voice into text and may send the audio to
  // its maker (Apple, Google) under their terms with the owner; Miamus never
  // receives or stores audio, only the text, as typed Kakak. Whether replies
  // are read aloud is kept on the phone. No new processor.
  // 2026-11-10.4: bills and upkeep — chores with an optional reminder, and
  // a morning notification to the admin a chore is for (every admin for
  // staff chores), from chore titles already stored (migrations/137); for
  // admins only, a paid bill's amount and receipt photo, in storage only
  // admins can open, kept 2 years from the payment (migrations/138). No new
  // service.
  // 2026-11-10.5: "Tidak bisa dikerjakan" — when staff say a task couldn't
  // be done: the reason, an optional note and photo, the shopping item that
  // ran out, who and when; seen by the household's admins and staff; kept 90
  // days (photo 30). New admin notifications: an evening summary of what
  // wasn't done (at a chosen hour, or off), leave requests, schedule
  // suggestions, and a pet refusing medicine; staff notes never in them.
  // Each admin's notification choices are stored (migrations/139). No new
  // service. Also: Microsoft's push service (Edge on Windows) named beside
  // Apple, Google and Mozilla; the server already sent to it (migrations/103).
  // 2026-11-10.6: notifications on staff phones (Phase 166, migrations/141)
  // — which people each linked phone gives notifications for, that phone's
  // push details, and each household's switch for them; on a shared phone a
  // notification says only whose it is; none 21.00–06.00. Deleted with the
  // phone, when turned off, or when the push service drops the phone. No new
  // service (the same Apple, Google, Microsoft and Mozilla push services).
  // 2026-11-10.7: usage counts (Phase 172 PR 0, migrations/142) — how long
  // setting up a household took, how many things it added, how many fields
  // were typed, when tasks are first finished, and each ended day's due and
  // closed task counts (kept 400 days); numbers only, never content. Read by
  // Poofy Labs as totals across households, without names; kept while the
  // household exists, deleted with it. No new service.
  // 2026-11-10.8: sign-up approval (Phase 172 PR A1, migrations/143) —
  // every request is still reviewed by hand (the owner's choice) and the
  // person is emailed by hand from the support address once approved;
  // automatic approval exists behind a switch that is off, and whether an
  // approval was automatic is stored; the operator still sees the creator's
  // Google name and email. The 30-day deletion of rejected requests is
  // unchanged. No new service.
  // 2026-11-11.1: telling people they're in (Phase 172 PR A1, owner
  // 2026-11-11) — while waiting for approval, someone may leave a WhatsApp
  // number to be told on (optional, Indonesian mobile numbers only); only
  // Poofy Labs sees it, only to say the request is approved; deleted once
  // they're messaged, on rejection, when they set up their household, or 30
  // days after asking at the latest (migrations/143). We tell people by
  // WhatsApp or email. No new service (WhatsApp is opened on the operator's
  // own phone; Miamus sends nothing).
  // 2026-11-11.2: any routine, for any pets (Phase 173 PR A, migrations/144)
  // — walk photos are taken where the walk goes, so they may show a public
  // place and the staff member; Miamus records no location (no GPS; a camera
  // photo is re-encoded by compressPhoto before upload, which drops EXIF);
  // each saved task also notes when it reached the server (a save time, as
  // completed_at already is). A routine's note for staff and the person it
  // is for are "tasks, routines, schedules and notes". Same 30-day photo
  // rule; no new service.
  // 2026-11-11.3: which features a household has switched on (Household →
  // Features: Repairs, Bills and upkeep, Food at home, Pets) and the kind of
  // home picked at sign-up (Phase 171 PR A, migrations/145; the kind of home
  // is household_setup.home_type, migrations/142). Switching off hides, never
  // deletes. No new service.
  // 2026-11-11.4: pre-launch hardening (audit of 11 Nov, migrations/146) —
  // a linked staff phone not used for 60 days is unlinked automatically; an
  // admin account that no longer belongs to any household is deleted 30
  // days later (with its request), unless it joins or asks again first; PIN
  // lockouts grow (15 minutes, 1 hour, then until an admin sets a new PIN);
  // each saved task notes which phone or account saved it (only that phone
  // can undo it, for minutes, or a walk until shortly after it ends); whose
  // PIN last opened a linked phone is kept while it is linked. No new
  // service.
  // 2026-11-11.5: walk-in repairs and supervising (Phase 174 PR A,
  // migrations/149) — a repair person's name or company (optional, typed by
  // staff or an admin; no phone number), when they arrived and left, before
  // and after photos of the work (not of people), an optional result and
  // note: third-party data, kept with the repair (while open, 2 years after
  // closing). Who supervised a walk-in and from when to when (staff data),
  // kept 90 days; a couldn't-do reason "supervising a repair". No new
  // service; no new notification yet (owner pushes come with PR B).
  // 2026-11-11.6: kitchen amounts (Phase 170 PR A, migrations/148) — for
  // items an admin chooses to track: how much is left, the last amount
  // bought, and when and by whom (the staff name picked on the phone) the
  // amount last changed; only the latest amount, no history; kept while the
  // item exists. Portions left on listed food. No new service, region or
  // change to Kakak.
  // 2026-11-11.7: routine reminders and "not done" alerts (Phase 173 PR C,
  // migrations/150) — a staff reminder at a routine's time when an admin
  // turned it on and it isn't done, until 10 PM (other staff notifications
  // still stop at 9 PM); admins told when a chosen routine still isn't done
  // 30 minutes after its time, until 10:30 PM. No new service, no new kind
  // of personal data.
  // 2026-11-11.8: walk-in repair notifications (Phase 174 PR B,
  // migrations/152) — admins are told when staff log a repair person
  // arriving and when the visit is finished; the notification carries the
  // repair, its place, the repair person's name if one was noted and who
  // logged it; never 9 PM to 6 AM; each admin can turn either off (stored
  // with their notification choices). The evening summary can say a task
  // was missed while someone supervised a repair (names and times already
  // stored). No new service; the same push services.
  // 2026-11-11.9: recipes (Phase 170 PR B, migrations/151) — recipes the
  // household's admins write (name, servings, ingredients with amounts,
  // steps, an optional Indonesian version for staff, who wrote it), read by
  // every phone in the household, kept until an admin deletes them; in the
  // household export. No photos, no prices, no new service, region or
  // change to Kakak.
  // 2026-11-11.10: sending repairs to the developer (Phase 174 PR C, no
  // migration) — an admin can share a list of open repairs with their
  // photos from their own phone (share sheet or a page saved as PDF);
  // Miamus sends nothing and makes no public link. No new data, storage or
  // service.
  // 2026-11-11.11: the weekly menu and cooking (Phase 170 PR C,
  // migrations/153) — the menu plan (dishes per day and meal, servings, a
  // note), which dishes were cooked, when, by whom, and what cooking took off
  // stock, kept one year then deleted; the amount to buy that "Add missing"
  // stores on an item; and kitchen notes, which may hold health information
  // (an allergy), shown to staff, one per household, with the admin's
  // one-time confirmation recorded (who and when). In the household export.
  // No prices, no new service, region or change to Kakak.
  // 2026-11-12.1: a removed staff phone forgets the household (demo-day
  // fixes, no migration) — when an admin removes a staff phone, the phone
  // deletes its copies of the household (lists, menu, recipes, kitchen notes,
  // names, the household id, and saves and photos not yet sent) the next time it opens, and keeps only a "this
  // phone was removed" flag until it is linked again. Less kept, nothing new
  // collected, no new service.
  // 2026-11-12.2: wording only (Phase 175 tab names) — "Household → Your
  // data" now reads "Settings → Your data" / "Pengaturan → Data Anda".
  // Nothing stored, collected or shared changes.
  // 2026-11-13.1: Kakak puts ingredients away (Phase 176 PR 4,
  // migrations/155) — while Kitchen amounts is on, each Kakak request also
  // carries, for kitchen ingredients, where each is kept and its use-by date
  // when someone has noted them (migrations/154), and Kakak may suggest a
  // new place or date, saved only when the admin confirms. No new kind of
  // personal data, no new service or region; Anthropic's retention is
  // unchanged.
  // 2026-11-13.2: wording only (audit D4) — "What we store" now names, for
  // kitchen ingredients on the shopping list, where each is kept (fridge,
  // freezer, cupboard or counter) and its use-by date once noted. The
  // storage was already live (migrations/154); nothing stored, collected or
  // shared changes.
  // 2026-11-13.3: what each staff member sees (Phase 178, migrations/165)
  // — which parts of the staff app an admin lets each person see (chores
  // for anyone, pet routines, kitchen, repairs), kept on their staff
  // profile while it exists. It changes only what the phone shows, never
  // what staff can report. No new service, nothing sent to Kakak; not yet in
  // the household export (added when the export is next re-created).
  // 2026-11-14.1: Kakak answers questions and adds ingredients (Phase 180
  // step 1; no migration) — Kakak can answer a question about how Miamus
  // works, from Miamus's own guide (no household data in it), and can
  // suggest an ingredient that isn't listed yet, with its amount, saved
  // only when the admin confirms, exactly as Add ingredient saves it. Each
  // request also says which parts of Miamus the household has switched off
  // (Repairs, Bills and upkeep, Kitchen amounts; Pets and Food at home were
  // already said), so she doesn't describe a screen that isn't there.
  // Amounts and units are never sent: the server works out how an amount
  // lands. No new kind of personal data, no new service or region;
  // Anthropic's retention is unchanged.
  // 2026-11-14.2: Kakak sets what a staff member sees (Phase 178
  // follow-up; migrations/171 only lets the request record name the new
  // tool) — each Kakak request now also carries, for a staff member with
  // parts of the staff app switched off, which parts they don't see (chores
  // for anyone, pet routines, kitchen, repairs), and Kakak may suggest a
  // change, saved only when the admin confirms. No new kind of personal
  // data stored, no new service or region; Anthropic's retention is
  // unchanged.
  policyVersion: "2026-11-14.2",
  effectiveDate: { en: "14 November 2026", id: "14 November 2026" },
  /**
   * Where Supabase (database, sign-in, photo storage) runs. The production
   * project is in AWS ap-southeast-1 (moved from ap-northeast-1, Tokyo, on
   * the date above). Update this if the project moves region again.
   */
  dataRegion: { en: "Singapore", id: "Singapura" },
} as const;

export const isLegalDraft = !LEGAL.operatorName || !LEGAL.contactEmail;
