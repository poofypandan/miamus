# Plan: staff sign-in with a house code + PIN

Status: **proposal, not built.** Written 2026-11-06 for the owner to decide on.
Nothing here changes the database or the app until the decisions below are made
and the privacy policy is on GitHub (handoff conflict 8).

## Why

Today a staff phone gets in only through an invite link, which binds that phone
once. If the phone loses its sign-in, the owner has to send a new link.

Phases 146–147 (branch `claude/offline-and-relink-fixes`) fix the two causes
found in the code:

- Bad Wi-Fi used to look like being signed out.
- An invite link opened on bad Wi-Fi signed the phone in again as a new user.

Watch for a week after those merge before building this. If logouts stop, this
becomes a convenience for new phones rather than a repair.

Causes those phases cannot fix, which this plan covers:

- On iPhone, the installed app and Safari keep separate storage, so a link
  opened from WhatsApp may land in the wrong one.
- Site data gets cleared.
- A new or replacement phone has never been bound.

## How it would work

1. **Front door.** A phone with no sign-in sees two choices:
   - *Pemilik rumah* — Google sign-in, as now.
   - *Staf* — enter the house code.
2. **House code.** One per household, shown to the owner in Manage → People &
   PINs, and changeable there at any time. The staff member types it once per
   phone.
3. **Name and PIN.** The same "Siapa yang bertugas?" screen and PIN pad used
   today. A correct PIN is what binds the phone. It does the job an invite link
   does now.
4. **Database.** One new function that needs no admin, called from an anonymous session
   (anonymous sign-ins stay on). It:
   - refuses Google sessions;
   - checks the code;
   - checks the PIN against the existing hash;
   - refuses archived people;
   - records the attempt;
   - on success, binds the device exactly as `redeem_staff_invite` does.

   It revokes `public, anon` and grants `authenticated` explicitly, like every
   function since 111.
5. **Limits.** Without these, a 4-digit PIN is guessable (10,000 options). Wrong
   attempts are counted three ways:
   - per person: lock that name for a while;
   - per house code: pause the code and tell the owner;
   - per phone.
6. **Owner controls.** In Manage:
   - a list of bound phones (name, last used);
   - a remove button per phone;
   - a button to change the code;
   - a notification when a phone joins with the code.

## Decisions for the owner

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Replace invite links, or keep both? | Keep both for the beta. The link stays the easy first setup; the code is the way back in. Revisit after the beta (handoff Q15) |
| D2 | House code format | 8 characters, letters and digits without look-alikes (no 0/O, 1/I). No automatic expiry; the owner changes it when someone leaves |
| D3 | What a phone sees after a correct code and before the PIN | The name list, as today. Anyone with the code sees staff first names; they already see them in the house |
| D4 | Lockout numbers | 5 wrong PINs for one name → that name locked 15 minutes. 20 wrong attempts on one code in an hour → code paused until the owner changes it. Unlock by waiting or by the owner, not by support |
| D5 | Tell the owner when a phone joins with the code? | Yes: a push notification and an entry in the phone list |
| D6 | Phone list with "remove this phone"? | Yes. It is also how a lost phone is shut out |
| D7 | Keep 4-digit PINs or move to 6? | Keep 4; the limits in D4 carry the security. Moving to 6 means every staff member sets a new PIN |
| D8 | One person signed in on several phones? | Allow it, as invite links do today; the phone list shows it |
| D9 | What gets logged about attempts, and for how long | Phone ID, name chosen, time, success or failure. Delete after 30 days, matching the photo window |
| D10 | Who reviews before launch | A security review of the function and limits, and the policy text in both languages |

## What has to change besides code

- **Privacy policy, both languages, in the same PR.** It must cover:
  - the house code;
  - the attempt log and how long it is kept;
  - the "Staff phone sign-ins" row in the policy table.
- **`src/config/legal.ts`.** Update it if the policy version changes.
- **Migrations.** Use the next free numbers after 112. 112 is set aside for
  making `redeem_staff_invite` refuse Google sessions; that is the database
  half of Phase 147. Write both only after 111 is on GitHub, because 111 may
  already redefine these functions.
- **Order.** Staging first. The owner applies to production.

## Rough size

About two days of work once the decisions are made:

- three migrations: code + rotation, attempts table + join function, phone
  list + revoke;
- the front-door choice and the code screen (Indonesian);
- the owner's code card and phone list (English);
- the policy update;
- tests: simulated-session SQL tests on staging, and browser tests against a
  stub backend, like those used for Phases 146–147.
