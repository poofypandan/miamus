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
- [ ] Key session open; searches queued (`01`–`04`)
- [ ] Shortlist 4, auditions, page published, owner and wife pick
- [ ] Final takes, place, `npm run sound -- --voice eleven-<slug>` (mix only), render into
      `docs/private/marketing/trailer-v5/`, review, NOTE and LICENCES
