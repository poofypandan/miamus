# Tests and checks

Every pull request runs `.github/workflows/checks.yml`:

1. typecheck (`npx tsc --noEmit`)
2. lint (`npm run lint`)
3. unit tests (`npm test`)
4. build (`npm run build`)
5. browser tests (`npm run test:e2e`)

A PR is ready for review only when this check is green. Vercel does not
build PRs (see "Vercel previews are off" below).

## Vercel previews are off

Only `main` deploys on Vercel (production, miamus.app). Pushes to any other
branch create no Vercel deployment. This is set in `vercel.json`:

```json
"git": { "deploymentEnabled": { "main": true, "**": false } }
```

`**` is needed, not `*`: Vercel matches branch names with minimatch, where `*`
stops at `/`, so `*` alone would miss branches like `claude/…`. When a branch
matches both rules, `true` wins, so `main` still deploys.

**Why:** on 2026-11-10 previews for every executor push used up the Hobby
plan's daily deployment limit, and merges to `main` could not deploy until it
reset. The checks above and Codex reviews cover PRs, so previews are not
needed. Revisit when moving to Pro.

**One-off preview, if you need one:**

- from your computer, on the branch: `npx vercel` (creates a preview, not
  production; it counts toward the limit too);
- or in the Vercel dashboard: the project → Deployments → **Create
  Deployment**, then pick the branch or commit.

Preview deployments use Vercel's Preview environment variables, which point
at staging Supabase, not production.

## Unit tests — `tests/unit`

Vitest, for the date logic that is easy to get subtly wrong:

- chore repeats and skipping a day;
- the owner's week summary;
- medicine-course alerts;
- telling "no connection" from "the server said no".

They run in Asia/Jakarta time (`vitest.config.mts`), the zone the household
uses. They take about two seconds.

```sh
npm test
```

## Browser tests — `tests/e2e`

Playwright, on a phone-sized Chromium, against a **stub** Supabase
(`tests/e2e/stub-backend.ts`). The stub can cut the network to test what a
staff phone does on bad Wi-Fi. It covers Phases 146–147:

- opening the app offline;
- a sign-in that can't be renewed;
- the saved copy while offline;
- every outcome of an invite link;
- owner screens (R6): the middleware's three routes (nobody → "/", staff
  phone → /staff, admin → dashboard), the Household tab and its Sign out
  sheet, Kitchen in Bahasa Indonesia, and Today.

### How owner screens are faked

The middleware checks the Google session and household membership **on the
server**, so those requests never pass through the browser where
`stub-backend.ts` answers. `tests/e2e/server-stub.cjs` is preloaded into
`next start` by `playwright.config.ts` (`NODE_OPTIONS=--require …`,
`E2E_SERVER_STUB=1`): it runs a tiny HTTP server inside the Next process and
points connections for `supabase.test` at it. It knows one admin, `OWNER`
(also exported by `stub-backend.ts`). In a test:

```ts
const stub = await installStub(context, { owner: { locale: "en" } });
await page.goto("/dashboard?module=access");
```

It is loaded only by the browser tests, and only touches the fake host.

The app must be built against the stub first:

```sh
NEXT_PUBLIC_SUPABASE_URL=http://supabase.test \
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-test-key npm run build
npm run test:e2e
```

The browser tests never reach a real project. Any request to a supabase.co
host is blocked and fails the test. Afterwards, run a normal `npm run build`
again before `npm run dev` or `npm start`.

## Test data

`tests/fixtures/household.ts` is a made-up household: two dogs, Mochi and
Bento, and staff member "Ari". Never copy real household data into the
repository: no names, schedules, photos or IDs from production.
