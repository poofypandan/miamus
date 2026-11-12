# Kakak demo script: "Tell Miamus once"

A 60–90 second shot list for the intro video and the Sunday family demo
(15 Nov). One routine, told once to Kakak, carried out by staff, and an
evening with nothing to report. Built in Phase 173 PR B.

**The idea the video has to land:** *Tell Miamus once; your staff know what
to do, and you only hear about what didn't happen.*

Two phones: the owner's (Bahasa Indonesia or English) and Syam's (staff,
always Bahasa Indonesia). Light mode, notifications on, the screen clean (no
other cards open). Kakak's reading aloud (**Bacakan jawaban Kakak**) is
optional: on, she says the "Done" line out loud, which works well on camera.

## Shot list

| # | Time | Phone | What to do | What it shows (the benefit) |
| --- | --- | --- | --- | --- |
| 1 | 0:00–0:08 | Owner, Today | Open Miamus. Tap **Bilang ke Kakak** / **Tell Kakak**. | Kakak lives one tap from Today. No menus, no forms. |
| 2 | 0:08–0:20 | Owner, Kakak | Type, or say with the mic, the sentence below. Tap **Kirim** / **Send**. | One plain sentence, the way you'd ask a person. |
| 3 | 0:20–0:35 | Owner, Kakak | Hold while Kakak answers in her own words and the card assembles itself, row by row: Matikan lampu, 21.30, Setiap hari, Syam, Foto, the two switches on. | She understood all of it: both dogs, the time, the photo, who does it, the reminder and the alert. Nothing is saved yet. |
| 4 | 0:35–0:45 | Owner, Kakak | Tap **Simpan** / **Save**. Hold on the "Done" line and **Di rutinitas Anda**. | The benefit, in her words: Syam gets a reminder; you only hear if it isn't done. The routine is now in the list. |
| 5 | 0:45–0:60 | Syam's phone, Tugas Hari Ini | Scroll to **21.30 · Matikan lampu**, with the Mocha and Matcha badges and Syam's name. (Optional: at 21.30 the reminder **Pengingat · 21.30 · Matikan lampu** arrives.) Tap the round camera, take one photo. | Staff see it exactly like every other task. One photo covers both dogs. No reading, no setup on their side. |
| 6 | 0:60–0:75 | Owner, Today, evening | Open the evening summary (**Belum selesai hari ini** / **Not done today**). It says **Semua sudah selesai.** / **Everything is done.** | Nothing to report, so nothing reaches you. Silence means it was done. |
| 7 | 0:75–0:90 | Either | End card: the Miamus mark, "Tell Miamus once." | — |

### The sentences (shot 2)

Use the household's real names. Each one is a single sentence; Kakak needs
nothing else.

- **Bahasa Indonesia:** Lampu dimatikan untuk Mocha dan Matcha jam 21.30,
  pakai foto. Syam yang kerjakan. Ingatkan Syam, kabari saya kalau belum.
- **English:** Lights off for Mocha and Matcha at 9:30 pm, with a photo. Syam
  does it. Remind Syam, and tell me if it isn't done.

Kakak's reply (shot 3) is written by the AI, so the exact words vary; she is
told to answer in one warm sentence, for example *"Baik. Kakak siapkan:
Syam mematikan lampu untuk Mocha dan Matcha setiap malam jam 21.30, dengan
foto."* The card and the "Done" line are the app's own words and are always:

- ID: **Beres. Syam diingatkan jam 21.30; Kakak hanya mengabari Anda jika
  belum dikerjakan.**
- EN: **Done. Syam gets a reminder at 21:30; you'll only hear from me if it
  isn't done.**

A second example, if there's time (one dog only, three photos):

- ID: Jalan-jalan Matcha tiap sore jam 5, Mocha tidak usah.
- EN: Walk Matcha every evening at 5, not Mocha.

### Things to check before filming

- The real Kakak is on (Vercel: `KAKAK_ENABLED`, the key; see
  `docs/kakak-weekend-go-live.md`) and switched on in Settings → Kakak (Pengaturan → Kakak).
- Syam is on the household's list and Syam's phone is linked, with
  notifications on, so the reminder can arrive at 21.30.
- Delete any old "Matikan lampu" routine first (Pets → a dog → Manage
  routines), or Kakak will say 21.30 is already there.
- For shot 6, film after 21.30 once Syam has taken the photo; earlier, the
  summary lists routines still to come.

## Recording without the real API

The whole story can be recorded with no Anthropic key and no real household,
from the browser tests. The backend is the test stub and Kakak's reply is
scripted; both live in `tests/` and never ship with the app.

1. Build against the stub (once):

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=http://supabase.test NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-test-key NEXT_TELEMETRY_DISABLED=1 npm run build
   ```

2. Run the demo, saving a screenshot of each beat to a folder and a video of
   each test to `test-results/`:

   ```bash
   DEMO_DIR=demo-shots CI=1 npx playwright test tests/e2e/kakak-demo.spec.ts
   ```

   Screenshots: `id-1-ask.png`, `id-2-build.png`, `id-3-payoff.png`,
   `4-staff.png`, `id-5-evening.png`, and the same in English (`en-…`).
   Videos: one `.webm` per test in `test-results/`, at phone size (Pixel 7).
   Without `DEMO_DIR`, the same file is an ordinary test that checks every
   beat.

3. The household in the recording is Mocha and Matcha, with Syam on staff.
   Names and sentences are at the top of `tests/e2e/kakak-demo.spec.ts`.

Practice mode (`KAKAK_PRACTICE=true`, never on production) also runs these
sentences through the real Kakak route with scripted answers, on staging or a
laptop. It marks itself with a "Practice mode" note and a "(Latihan)" prefix,
so it's for rehearsing, not for the video.
