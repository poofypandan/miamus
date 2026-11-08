# Google sign-in branding — owner steps

Goal: Google's sign-in screen shows **Miamus** with the Miamus logo (not
just "miamus.app"), and its support email is no longer a personal Gmail.

These are account steps for the owner. Claude prepared the files and the
instructions and did not touch Google Cloud, Search Console or Cloudflare.
Checked against Google's help pages on 2026-11-08:
[brand verification](https://support.google.com/cloud/answer/15549049),
[domain verification for OAuth](https://support.google.com/cloud/answer/13464321).

**Sign in with the Google account that owns the Google Cloud project
"miamus"** for every step below (Google Cloud, Search Console and the Google
Group). Google requires the domain to be verified by a project Owner or
Editor, and the support-email group to be managed by the account that is
signed in to Google Cloud.

Order: **A → B → C → D.** About 20 minutes, plus waiting for DNS.

---

## A. Upload the logo (2 minutes)

The file: [`docs/brand/miamus-logo-120.png`](miamus-logo-120.png) — 120 × 120
PNG, 2 KB, the same drawing as the app icon (`src/components/brand/brand-mark.tsx`):
white roof and "M" on near-black, with a margin so nothing is cut off if
Google shows it in a circle. Google asks for JPG/PNG/BMP, square, 120 × 120
is best, under 1 MB.

1. Download the file to your laptop (GitHub → the file → **Download raw file**).
2. Go to **console.cloud.google.com** → pick the project **miamus** (top bar).
3. Menu → **Google Auth Platform** → **Branding**.
4. Under **App logo**, upload `miamus-logo-120.png`.
5. Check the rest of the page while you are there:
   - App name: **Miamus**
   - Application home page: **https://miamus.app**
   - Application privacy policy link: **https://miamus.app/privacy**
   - Authorized domains: **miamus.app** is listed.
6. **Save**. Don't press *Verify branding* yet (that is step C).

> Uploading a logo is what makes Google ask for brand verification. Until
> it is verified, Google may keep showing the plain screen.

---

## B. Prove you own miamus.app in Google Search Console (10 minutes + DNS wait)

1. Go to **search.google.com/search-console** (same Google account).
2. **Add property** → choose the left box, **Domain** → type `miamus.app`
   (no https://, no www) → **Continue**.
3. Google shows a **TXT record** that starts with `google-site-verification=`.
   Click **Copy**.
   - If Google offers **"Start verification"** with Cloudflare (automatic),
     you can use it: it signs in to Cloudflare and adds the same record for
     you. Check afterwards that it added only one TXT record.
4. Otherwise, in another tab: **dash.cloudflare.com** → **miamus.app** →
   **DNS** → **Records** → **Add record**:
   - Type: **TXT**
   - Name: **@** (it shows as `miamus.app`)
   - Content: paste the whole `google-site-verification=…` value
   - TTL: **Auto**
   - **Save.** (TXT records have no orange cloud; nothing to switch off.)
   - Leave the existing records alone (the two Vercel CNAMEs, `auth` and its
     two TXT records for the Supabase custom domain).
5. Back in Search Console → **Verify**. If it says it can't find the record
   yet, wait 10 minutes and press **Verify** again (Cloudflare is usually
   quick; Google says it can take up to a day).
6. **Keep the TXT record forever.** Removing it un-verifies the domain, and
   the brand verification can lapse with it.

---

## C. Submit brand verification (2 minutes, result in minutes)

1. Back to **Google Auth Platform → Branding**.
2. Press **Verify branding**. (While it runs, the branding page can't be
   edited; *Cancel* stops it.)
3. Usually a few minutes later the status is one of:
   - **Ready to publish** → press **Publish branding**. **Do this within 7
     days**, or the verified status is lost.
   - **Need to fix issues** → **View issues** shows what failed. Send Claude
     the list; most fixes are on our side (see "Likely issue" below).
4. When published, open **miamus.app** in a private window → *Continue with
   Google*: the screen should name **Miamus** (not only miamus.app) and show the logo.

Miamus asks Google only for name, email and profile picture (the basic
scopes), so **no app verification, video or security assessment is
needed** — only this brand check.

### Likely issue: "homepage is only a login page"

Google's rules say the homepage must describe what the app does and "can
not be only a login page", and must link to the privacy policy. miamus.app
today is the sign-in screen: it has the name, the promise, a one-line
description and the privacy link, which may be enough — or Google may flag
it. If it does, the fix is small and on our side: a short "What Miamus
does" section under the sign-in buttons (three or four lines, both
languages). Tell Claude and it will open a PR; then press **Verify
branding** again.

---

## D. Replace the personal Gmail as the support email (10 minutes)

Today the sign-in screen's **User support email** is your personal Gmail,
which anyone who clicks the app name can see. Replace it with a free Google
Group that forwards to the support Gmail inbox.

Google only accepts, as support email, the signed-in account's own address
**or a Google Group that account manages** — so create the group with the
account that owns the Google Cloud project.

### D1. Create the group

1. Go to **groups.google.com** (same account as Google Cloud) → **Create group**.
2. Group name: **Miamus Support**
3. Group email: **miamus-support** → it becomes
   `miamus-support@googlegroups.com`. (If that name is taken, try
   `miamus-help` or `poofylabs-miamus`, and use that name below.)
4. Description: *Support for Miamus by Poofy Labs.* → **Next**.
5. Privacy settings:
   - **Who can search for group:** Only members of the group
   - **Who can join group:** Only invited users
   - **Who can view conversations:** Group managers
   - **Who can post:** **Anyone on the web** (so users can email it)
   - **Who can view members:** Group managers
6. Add members: invite **the support Gmail inbox** (the account that
   support@poofylabs.dev already forwards to). Set its email delivery to
   **Each email**. → **Create group**.
7. Open the support Gmail inbox, **accept the invitation**.

### D2. Test it

1. From any other email account, send a short email to
   `miamus-support@googlegroups.com`.
2. It should arrive in the support Gmail inbox within a minute. If it lands
   in the group but not the inbox: groups.google.com → the group → **My
   membership settings** for that member → **Each email**. Check spam once
   and mark it "Not spam".
3. Optional: in the group's settings → **Email options** → subject prefix
   `[Miamus]`, so these emails stand out.

### D3. Switch the sign-in screen to the group

1. **Google Auth Platform → Branding** → **User support email** → pick
   `miamus-support@googlegroups.com` from the list (it only appears if the
   signed-in account manages the group). → **Save**.
2. Also check **Developer contact information** at the bottom of
   Branding: that address is private (Google uses it to reach you), so it
   can stay your personal Gmail or the support Gmail inbox.
3. If brand verification (C) is in progress, the page is locked: wait for
   the result, publish, then change the email (changing it may trigger a
   quick re-check).

### What the group changes, and what it doesn't

- The **public** contact for Miamus stays **support@poofylabs.dev**
  (`src/config/legal.ts`, the privacy policy, the About page). The group is
  only the address Google shows on its own sign-in screen.
- Both end in the same support Gmail inbox, so nothing new to watch.
- Never put the group's member list or the Gmail address in the app or the
  repo.

---

## After all four

Tell Claude: "Google branding done" — Claude will update the handoff and the
business-setup memory (brand verified, support email replaced) and remind
you later to remove the Tokyo and staging authorized domains once Tokyo is
deleted.
