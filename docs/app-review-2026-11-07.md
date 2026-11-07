# Miamus — whole-app review, 2026-11-07 (night)

Asked by the owner: "do a full evaluation of the entire app to see if we're
missing anything; suggest improvements; execute them." This is what was
checked, what was found, what was fixed tonight, and what is recommended
next, in order. Nothing here was merged or applied to production.

## How it was checked

- Supabase's security and performance advisors on **staging** (structure
  only, no data read). Production was not queried.
- Every screen's text, scanned for English on staff screens and for owner
  text with no Bahasa Indonesia version; wording checked against
  `docs/indonesian-glossary.md`.
- The app's files against what a production PWA needs (error screens,
  not-found page, error reporting, data export, account deletion).
- The open backlog (`docs/handoff-2026-11-06.md` section 5,
  `docs/handoff-2026-11-07.md` sections 3–6) and the Phase 156 plan.
- The new Food at home work (PR #10), end to end: SQL tests, unit tests,
  browser tests, phone screenshots in both languages.

## What was found, and what happened

| # | Finding | Area | Done tonight? |
| --- | --- | --- | --- |
| 1 | **No error screen.** A crash showed Next's default English "Application error" page — to staff too. No custom 404 either. | Reliability, language | **Yes** — calm error screen in the viewer's language (staff: Indonesian) with "Try again" in place; a last-resort page in both languages; a bilingual 404. |
| 2 | **Staff text said "anjing" (dog) for any pet** — "Pilih anjing", "Ambil Foto untuk 2 Anjing", "Anjing sedang di klinik". Wrong for homes with cats; the English side already said "pet". | Language | **Yes** — "hewan", the glossary's word (Pets tab = Hewan). Product categories ("Makanan Anjing") unchanged. |
| 3 | The owner's home-screen banner still said **"Mode Kerja" / "Action Mode"**, renamed to Staf / Staff on 2026-11-07. | Language | **Yes** — "tampilan Staf" / "the Staff view". |
| 4 | **12 foreign keys without an index** (deleting a staff member, pet or account scans whole tables). | Database performance | **Yes** — migration 124 adds them. |
| 5 | `storage_object_household` had **no fixed search_path** (security advisor warning). | Database security | **Yes** — migration 124. |
| 6 | **Morning food reminder (decision F4)** was approved but not built. | Food | **Yes** — migration 124: 07:00 Jakarta, owners, both languages: "Perlu segera dimakan: Rendang, Lapis legit, dan 1 lagi." |
| 7 | Bought food that runs out had no way back to the shopping list. | Food ↔ Shopping | **Yes** — "Beli lagi / Buy again" on the Eaten / Thrown away toast. |
| 8 | The staff-food push (migration 123) would also fire for a row written with **no session** (maintenance). | Database | **Yes** — fixed in 123 (PR #10), SQL test added, staging updated. |
| 9 | A sheet opened within ~1 s of closing another **closed itself** (shared back-button hook). | Every sheet | **In progress** — separate session and PR ("Fix: sheet opened right after another closes…"). |
| 10 | **15 access rules** call `auth.uid()` per row instead of once (performance advisor "auth_rls_initplan"). Harmless at a few households, slow at thousands. | Database performance | No — recommended (R5). Touching 15 security policies deserves its own careful PR. |
| 11 | **No error reporting**: a crash on someone's phone is never seen by us. | Reliability | No — needs a new outside service and a privacy-policy change (R3). |
| 12 | **No self-serve data export or account deletion.** Today it's by email to support@poofylabs.dev, which the policy states; UU PDP is satisfied, but self-serve is better. | Privacy | No — recommended (R7). |
| 13 | **Backups are off** (Free plan). | Data safety | No — owner action (see below). |
| 14 | Browser tests cover staff screens only; **owner screens have none** (the middleware checks membership on the server, which the stub can't fake). | Testing | No — recommended (R6). |
| 15 | `npm audit` leftovers need major upgrades (Next 16). React dev-mode hook warning on Access. | Maintenance | No — known; revisit with Next 16. |

## Owner actions (only you can do these)

1. **Backups:** move staging to its own free Supabase organisation, then
   upgrade poofypandan to **Pro** (spend cap on). Check Database → Backups
   the next day.
2. **Protect `main`:** GitHub → Settings → Branches → require a pull request
   and the "Typecheck, lint, tests, build" check.
3. **Codex security review** returns nothing in this repo — turn it on in
   the Codex settings if you want it.
4. **Merging PR #10** needs migration 123 on production first (your OK).
   PR "Phase 157" (this review's fixes) then needs 124 the same way.

## Recommended next, in order

| # | What | Why | Size |
| --- | --- | --- | --- |
| R1 | **Merge PR #10** (after production 123) and the sheet fix | Food at home is done and reviewed | Owner |
| R2 | **Phase 157 PR** (this review's fixes; migration 124 to staging then production) | Error screens, wording, indexes, morning reminder | Small |
| R3 | **Error reporting** (e.g. Sentry, EU/Asia region, no personal data in events) + privacy policy | We are blind to crashes on real phones | Small, needs your OK for the service |
| R4 | **Step 2: Tell Kakak (typed)** — plan PR tonight | The reason to pay; reuses Food's pipeline | Large |
| R5 | Rewrite the 15 per-row `auth.uid()` policies as `(select auth.uid())` | Speed at scale, no behaviour change | Small, careful |
| R6 | Owner-screen browser tests against local Supabase | Owners' screens are untested end to end | Medium |
| R7 | Self-serve "Download my household's data" and "Delete my household" (admins) | UU PDP rights without an email | Medium |
| R8 | Step 3: Rooms · floors · repairs (by hand) | In the accepted plan | Large |
| R9 | "My tasks" card for owners who have chores; staff listed first in Chores | Owners never need the staff view | Small |
| R10 | Queue saves that fail on bad Wi-Fi (not only when the phone says offline) | Fewer lost logs on weak signal | Medium |
| R11 | Lebaran / Natal "who gave what" list (data already saved by Food) | Thank-yous and returning the favour | Small |
| R12 | Thank-you cards for staff (no points or leaderboards) | Warmth, retention | Medium |

## What I would not add

- A sixth tab, or splitting Supplies out of Kitchen: five tabs is the rule,
  and supplies live where shopping happens.
- Food-safety estimates by hand (fixed "3 days" defaults): estimates are
  Kakak's job, labelled and cautious; by hand, people pick the date.
- Points, streaks or leaderboards for staff.
