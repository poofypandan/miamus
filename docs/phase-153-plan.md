# Phase 153 plan — helping new people find their way

Status: **proposal, for the owner to decide.** Nothing is built yet.

## The question

Family and friends will start using Miamus, among them people who are not
comfortable with apps (the owner's mother is the case to design for). Will
they know what to do, and should there be a guide or a tutorial at sign-up?

## What they see today

- **A new owner:** Google sign-in → language → "Request access" → waiting
  screen → (after approval) household name → an Agenda that says to add a
  first pet (Phase 120). Then a one-time "Add to Home Screen" hint.
- **A co-owner** (invited by link): Google sign-in → language → straight into
  the household's Agenda. No introduction.
- **Staff:** an invite link or the house code → name → PIN → their task list,
  in Bahasa Indonesia. The owner explains the rest in person.
- **Help:** none in the app. The only contact is support@poofylabs.dev.

## Recommendation, in short

Not a tutorial at sign-up. Slideshows shown before someone has used the app
are skipped and forgotten; people learn by doing the first real thing. Instead,
three small pieces that are there when they need them:

### 1. A "Getting started" checklist on a new household's Agenda

A card at the top of the Agenda until the household is set up:

1. Add your pets
2. Add the people who help at home (names)
3. Link each staff phone (send the invite link, or the house code)
4. Set the daily routines (meals, Pipis & Pup, medicine)
5. Turn on notifications on this phone

Each line opens the right screen. Lines tick themselves as they get done
(read from the household's own data, nothing new stored). It disappears when
all five are done, and can be hidden. Both languages.

### 2. A short welcome for co-owners

The first time a co-owner opens the household: one card, not a slideshow.
"Welcome to {household}. This is today's Agenda. Tap a pet to see everything
logged for it. Staff requests (routines, leave) wait for you at the top." with
**Got it**. Shown once on each phone.

### 3. A Guide page ("Panduan") for owners

Linked from the Access tab and from the checklist. Short "How do I…?" answers,
each one or two sentences with one screenshot:

- Add a pet; set its meals and medicine
- Add a staff member and link their phone
- A staff phone is signed out / a staff member forgot their PIN (house code)
- Approve or reject what staff ask for (routines, leave)
- See what was done today, with photos
- Stock running low
- Someone has left: remove them
- Change the language

Plus **"Still stuck? Email support@poofylabs.dev"**.

### 4. A one-page guide for staff (Bahasa Indonesia), to send on WhatsApp

A picture guide the owner sends together with the invite link: open the link,
tap your name, choose a PIN, tick the task, take the photo. Short sentences
(staff reading levels in the glossary). Sent from the invite screen:
"Kirim panduan staf".

## For the owner's mother specifically

- **Set her household up with her**, the first time, in person or on a call.
  Better still, she invites you as a co-owner of her household: you can then
  add pets, staff and routines for her and fix things from your own phone,
  and she only has to look and approve.
- **Watch her use it once without help** for ten minutes after it is set up,
  and note every place she stops. That is the real test of points 1–3 (the
  glossary's "five readers" test, starting with one).
- Text size follows the phone's own setting; check her phone at its usual size.

## Decisions for the owner

| # | Question | Recommended |
| --- | --- | --- |
| D1 | Tutorial at sign-up, or help where it's needed? | Help where it's needed (1–3 above) |
| D2 | Getting-started checklist on the Agenda | Yes |
| D3 | One-card welcome for co-owners | Yes |
| D4 | Guide page with screenshots, both languages | Yes, linked from Access |
| D5 | One-page staff guide to send on WhatsApp | Yes, with the invite |

## Not changed

- "Pipis & Pup" stays as it is: it is the Indonesian screens' word (staff and
  owners who chose Indonesian), and English screens already say "Potty"
  (glossary).
- No new data is collected: the checklist reads the household's existing
  data, and "shown once" flags live on the phone (added to the privacy
  policy's on-phone list if built).
