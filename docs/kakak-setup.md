# Kakak: turning her on

Phase 156 step 2 (plan: `docs/phase-156-step2-kakak-plan.md`). Kakak is off
everywhere until all four of these are true, in this order:

1. **Migration 126** is applied (`supabase/migrations/126_kakak.sql`):
   local, then staging, then production, each with the owner's OK.
   Test: `PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t -f supabase/tests/126_kakak.sql`
   (one transaction, rolled back).
2. **The server has a key and the switch** (Vercel → Settings → Environment
   Variables, server-only, never `NEXT_PUBLIC_`):
   - `ANTHROPIC_API_KEY`: from a Claude Console workspace with a
     **monthly spend limit** (US$20 suggested for the family phase). That
     limit is the money cap; Miamus has no cost-based limit of its own.
   - `KAKAK_ENABLED=true`. Anything else, or no key, and `/api/kakak`
     answers "not available" before doing anything.
   - Optional: `KAKAK_MODEL` (default `claude-opus-5-5`) and `KAKAK_EFFORT`
     (default `low`). Pick them from the eval (`docs/kakak-eval.md`).
3. **The household is on the family list.** `platform_set_kakak_allowed`
   checks `is_platform_admin()`, so it needs a signed-in platform admin;
   there is no screen for it yet. Until there is, the operator sets it from
   the Supabase SQL editor (which runs as the database owner, not as a user):

   ```sql
   insert into public.kakak_settings (household_id, allowed)
   values ('<household id>', true)
   on conflict (household_id) do update set allowed = true;
   ```

   Only then does the **Kakak** row appear in the Household tab.
4. **An owner turns it on**: Household → Kakak → **Let Kakak help**. The
   page says what is sent to Anthropic and links the privacy policy.

## Limits (migration 126)

- 40 calls per household per Jakarta day (`kakak_settings.daily_limit`).
- 400 calls a day across all households (`kakak_config.daily_call_cap`).
- Per conversation: 8 calls, 3 questions, 500 characters per typed turn.

A sentence with one question is two calls; a reply that fails the route's
checks and is retried is one more.

## What is stored

`kakak_requests`: one row per call with the model, outcome, which tools,
tokens, cost (millionths of a dollar), latency, and what the owner did
(confirmed / changed / cancelled / undone). **No text.** Kept 13 months;
`kakak_usage` 35 days. Both are pruned by the nightly food job
(`prune_finished_food`).

Totals for the operator, on staging or production:

```sql
select date_trunc('day', created_at) as day, model, count(*) as calls,
       sum(cost_micro_usd) / 1e6 as usd,
       percentile_cont(0.95) within group (order by latency_ms) as p95_ms
from kakak_requests group by 1, 2 order by 1 desc;
```

## Turning her off

- One household: the owner's switch, or `platform_set_kakak_allowed(id, false)`
  (also switches it off).
- Everyone, at once: `KAKAK_ENABLED` to anything but `true`, then redeploy.
