/**
 * Deletes chore and routine proof photos older than 30 days (Phase 117;
 * window set by task_photo_retention_cutoff, widened from 14 in Phase 118).
 *
 * Called nightly by pg_cron (scheduled in migrations/102). The database
 * decides what is due — task_photos_due_for_pruning holds the rule and its
 * exclusions (migrations/101) — and
 * this only does the one thing SQL cannot: remove objects through the
 * Storage API, which is what actually deletes the file. A SQL delete on
 * storage.objects would drop the catalogue row and orphan the bytes.
 *
 * Authorisation: deployed with verify_jwt off, because the caller is
 * Postgres, not a user. The x-retention-secret header is passed straight to
 * the RPCs, which compare it with the Vault secret and refuse otherwise —
 * so without it this endpoint can neither list nor delete anything.
 *
 * POST {}               → prune
 * POST {"dryRun": true} → report what is due, delete nothing
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "household-logs";
const BATCH = 100;
// 20 x 100 a night is far above the steady state (a household's daily
// photos); a backlog larger than that simply finishes over several nights.
const MAX_BATCHES = 20;

function adminKey(): string {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    const key = JSON.parse(secretKeys).default;
    if (key) return key;
  }
  // Legacy service_role key — retired by Supabase at the end of 2026.
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Due = { name: string; size: number | null; created_at: string };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = req.headers.get("x-retention-secret") ?? "";
  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, adminKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const due = (limit: number) =>
    admin.rpc("task_photos_due_for_pruning", { p_secret: secret, p_limit: limit });

  if (dryRun) {
    const { data, error } = await due(100_000);
    if (error) return failure(error);
    const rows = (data ?? []) as Due[];
    return json({
      dryRun: true,
      due: rows.length,
      bytes: rows.reduce((sum, r) => sum + (r.size ?? 0), 0),
      oldest: rows[0]?.created_at ?? null,
    });
  }

  let removed = 0;
  let bytes = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data, error } = await due(BATCH);
    if (error) return failure(error);
    const rows = (data ?? []) as Due[];
    if (rows.length === 0) break;

    const { data: gone, error: removeError } = await admin.storage
      .from(BUCKET)
      .remove(rows.map((r) => r.name));
    if (removeError) {
      console.error("Storage remove failed", removeError);
      break;
    }
    const goneNames = new Set((gone ?? []).map((o) => o.name));
    removed += goneNames.size;
    bytes += rows.filter((r) => goneNames.has(r.name)).reduce((s, r) => s + (r.size ?? 0), 0);
    // Anything Storage would not remove comes straight back from the next
    // call; stop rather than spin on it until MAX_BATCHES.
    if (goneNames.size < rows.length) break;
  }

  // Runs even after a partial batch: it clears whichever expired URLs now
  // point at nothing, however they got that way.
  const { data: cleared, error: forgetError } = await admin.rpc("forget_missing_task_photos", {
    p_secret: secret,
  });
  if (forgetError) return failure(forgetError);

  const result = { removed, bytes, urlsCleared: cleared };
  console.log("prune-task-photos", result);
  return json(result);
});

function failure(error: { code?: string; message: string }) {
  if (error.code === "42501") return json({ error: "Forbidden" }, 403);
  console.error(error);
  return json({ error: error.message }, 500);
}
