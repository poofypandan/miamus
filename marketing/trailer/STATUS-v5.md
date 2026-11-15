# Trailer v5 (ElevenLabs voice): where it stands

Branch `claude/trailer-voice-elevenlabs-77406a`, cut from v4 (c99d56f). Only Kakak's voice changes;
picture, music, sound and timing stay v4's.

## Pipeline

- `audio/eleven/key.zsh`: hidden prompt for the key, runs `el.py serve` (job queue in
  `audio/eleven/queue/`, git-ignored). Key never on disk; cleared on exit.
- `audio/eleven/jobs.py search | shortlist | audition | final | place`.
- `audio/eleven/page.py`: blind A–E page; answer key in `audio/out/eleven/audition/labels.json`.
- The built v4 tools and audio were reused from the v4 worktree (`.tools` is a symlink to
  `../phase-177-pr1-foundation-9acd90/marketing/trailer/.tools`; `audio/out/` and `public/shots/` copied).

## Progress

- [x] Generator, wrapper, page builder (tested with a fake key and stand-in clips)
- [x] Manager asked for a key (TTS access + Voices read, 10,000 credit cap); estimate ~5,100 characters
- [x] Key session open (manager tab c6); searches done; 1,956 characters spent on auditions
- [x] Shortlist: Velora, Aita, Lyly (Indonesian), Alexandra (American); all clips checked with Whisper
- [x] Blind page: https://claude.ai/artifact/JdBsKXEm5CTCb7SaeZD6aA (key: docs/private/marketing/trailer-v5/audition-labels.json)
- [x] Owners picked Voice E = Lyly (ZF5uWKM2iVvSId3tBCYt)
- [x] Name test, final takes (3 each), end-line retake: 5,908 characters in all
- [x] Placed (`audio/eleven/picks-lyly.json`), mixed, rendered; four MP4s, NOTE, LICENCES,
      provenance and the voice takes in `docs/private/marketing/trailer-v5/`
- [x] Frames and loudness checked in the MP4s
- [ ] Owner watches v5; checks the two items in LICENCES.md (no beta tag on Eleven v4; keep the
      November invoice); optionally adds Lyly to My Voices; deletes the key when done

## v6 (15 Nov)

- [x] Mama (Aita), nonverbal girl, Fable's pacing and framing, end card "For every" + "Mama, look!"
- [x] Four MP4s, NOTE, LICENCES, provenance, voice takes and covers in `docs/private/marketing/trailer-v6/`
- [ ] The owners watch v6

## v7 (15 Nov)

- [x] "That one's yours." softly at the end, after Mama's answer and the hand; no notification, no ping
- [x] Four MP4s and docs in `docs/private/marketing/trailer-v7/`
- [ ] The owners watch v7

## v8 (15 Nov)

- [x] Kakak on the tug, Mama "I'm here, sweetie.", smooth typing, soft screen changes, stutter check clean
- [x] Four MP4s and docs in `docs/private/marketing/trailer-v8/`
- [ ] The owners watch v8

## v9 (15 Nov)

- [x] The climax spaced on the bars (garden 44.2, tug 45, Kakak 47, Mama 49.4); end card "For the little moments."
- [x] Four MP4s and docs in `docs/private/marketing/trailer-v9/`

## v10 (15 Nov)

- [x] Mama says the sentence to Kakak: the real listening screen (captured), her words appearing as she speaks
- [x] Four MP4s and docs in `docs/private/marketing/trailer-v10/`
- [ ] The owners watch v10

## v11 (15 Nov)

- [x] Cards cut from the real captures, the phone once, "Kak," in Mama's request, no clock, 68 s (score bars repeated)
- [x] Composed for the whole safe area; four MP4s and docs in `docs/private/marketing/trailer-v11/` (long cut `miamus-68-*`)
- [ ] Fable reviews after Wednesday's reset; the owners watch v11

## v12 (15 Nov)

- [x] Kakak's intro is the why (AI tag on screen), no presses on cards, quicker cards, 62 s, one continuous push-in at the end
- [x] Four MP4s and docs in `docs/private/marketing/trailer-v12/` (long cut `miamus-62-*`)
