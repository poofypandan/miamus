# Tests and checks

Every pull request runs `.github/workflows/checks.yml`:

1. typecheck (`npx tsc --noEmit`)
2. lint (`npm run lint`)
3. unit tests (`npm test`)
4. build (`npm run build`)
5. browser tests (`npm run test:e2e`)

A PR is ready for review only when this check is green, alongside Vercel's.

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
- every outcome of an invite link.

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
