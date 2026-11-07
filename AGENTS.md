<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Code Review Rules

These guide Codex's pull-request reviews. They don't replace `npm run build`,
staging tests or the owner's approval. Background: `docs/handoff-2026-11-05.md`.

### Database

- **Flag any new or replaced `SECURITY DEFINER` function that doesn't revoke
  `EXECUTE` from `public, anon` and grant it only to the roles that need it.**
  Supabase grants `EXECUTE` to `PUBLIC` by default, which lets logged-out
  callers reach it; Phase 143 had to close seven. Safe path:
  `revoke all on function … from public, anon;` then an explicit `grant` in the
  same migration.
- **Flag admin-only functions or policies guarded only by
  `get_user_household_ids()`.** Staff phones sign in anonymously and hold the
  `authenticated` role, and that helper includes device sessions, so the check
  passes on every staff phone. Safe path: guard admin-only actions with
  `caller_admin_household()` (or a `household_members` check).
- **Flag database changes without a matching file in `supabase/migrations/`.**
  Production drifted from the repo when Phases 141–142 were applied directly.
  Safe path: a numbered migration file in the same PR, applied to staging
  before production.

### Privacy

- **Flag changes that collect a new kind of personal data, add a third-party
  service, change where data is stored, or change retention, without updating
  `src/components/legal/privacy-policy.tsx` (both the English and Indonesian
  text) and `src/config/legal.ts`.** The published policy must match what
  Miamus actually stores (UU PDP).
- **Flag personal contact details (personal email addresses, phone numbers)
  in user-facing text, config or emails.** The public contact for Miamus is
  support@poofylabs.dev, set in `src/config/legal.ts`.
