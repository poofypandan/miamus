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
  // 2026-11-10.7: usage counts (Phase 172 PR 0, migrations/145) — how long
  // setting up a household took, how many things it added, how many fields
  // were typed, and when tasks are first finished; numbers only, never
  // content. Read by Poofy Labs as totals across households, without names;
  // kept while the household exists, deleted with it. No new service.
  policyVersion: "2026-11-10.7",
  effectiveDate: { en: "10 November 2026", id: "10 November 2026" },
  /**
   * Where Supabase (database, sign-in, photo storage) runs. The production
   * project is in AWS ap-southeast-1 (moved from ap-northeast-1, Tokyo, on
   * the date above). Update this if the project moves region again.
   */
  dataRegion: { en: "Singapore", id: "Singapura" },
} as const;

export const isLegalDraft = !LEGAL.operatorName || !LEGAL.contactEmail;
