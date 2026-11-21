/**
 * Nightly photo backup (security audit S5): copies new and changed photos
 * from every Miamus photo bucket to the versioned backup bucket in AWS
 * Singapore, and marks deleted there the ones Miamus deleted (kept 30 more
 * days by the bucket's lifecycle rule). Plan: docs/photo-backups.md. The
 * run itself is supabase/functions/_shared/photo-backup.ts, shared with the
 * laptop scripts and the unit tests.
 *
 * Why here and not in GitHub Actions: this function runs in Singapore, beside
 * the photos and the backup bucket, so photos never leave the region. GitHub
 * only starts it each night (.github/workflows/photo-backup.yml), calling it
 * again while it reports copies left, and fails loudly (an email) when it
 * reports a problem. GitHub sees counts, never a photo or a path.
 *
 * Who can do what:
 *  - Calling it needs PHOTO_BACKUP_TRIGGER_SECRET (x-photo-backup-secret);
 *    deployed with verify_jwt off, as prune-task-photos is. Without the
 *    secret it does nothing. With it, it can only run a backup.
 *  - It reads Supabase as the backup reader account (migrations/179), not
 *    with the project's secret key: read the photo buckets, nothing else.
 *  - It writes with the backup writer key: add to the backup bucket and mark
 *    files deleted; it can't erase a version (no s3:DeleteObjectVersion).
 *
 * Secrets (Edge Functions -> Secrets; never in code):
 *   PHOTO_BACKUP_TRIGGER_SECRET, PHOTO_BACKUP_READER_EMAIL,
 *   PHOTO_BACKUP_READER_PASSWORD, PHOTO_BACKUP_S3_BUCKET,
 *   PHOTO_BACKUP_S3_REGION, PHOTO_BACKUP_AWS_ACCESS_KEY_ID,
 *   PHOTO_BACKUP_AWS_SECRET_ACCESS_KEY
 *   (PHOTO_BACKUP_S3_ENDPOINT only for the local rehearsal.)
 *
 * POST {}                          -> back up (as much as fits in one call)
 * POST {"dryRun": true}            -> report what it would do, change nothing
 * POST {"allowMassDelete": true}   -> let a large removal through (a person decided)
 * Answers { ok, remaining, summary } with counts only.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "npm:@aws-sdk/client-s3@3.1150.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { backupDeps, runBackup, scrubError, type StorageLike } from "../_shared/photo-backup.ts";

// Stop starting copies after this long, leaving time to finish the ones in
// flight and the removals, inside the platform's wall-clock limit (150 s on
// the free plan, 400 s on Pro). The workflow calls again for the rest.
// PHOTO_BACKUP_BUDGET_MS overrides it, for the local rehearsal only.
const BUDGET_MS = Number(Deno.env.get("PHOTO_BACKUP_BUDGET_MS")) || 100_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function publishableKey(): string {
  const keys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (keys) {
    const key = JSON.parse(keys).default;
    if (key) return key;
  }
  return Deno.env.get("SUPABASE_ANON_KEY")!;
}

const NEEDED = [
  "PHOTO_BACKUP_TRIGGER_SECRET",
  "PHOTO_BACKUP_READER_EMAIL",
  "PHOTO_BACKUP_READER_PASSWORD",
  "PHOTO_BACKUP_S3_BUCKET",
  "PHOTO_BACKUP_AWS_ACCESS_KEY_ID",
  "PHOTO_BACKUP_AWS_SECRET_ACCESS_KEY",
];

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const missing = NEEDED.filter((n) => !Deno.env.get(n));
  if (missing.length > 0) return json({ ok: false, error: `Not set up: ${missing.join(", ")}` }, 500);
  const env = (n: string) => Deno.env.get(n)!;

  if (!sameSecret(req.headers.get("x-photo-backup-secret") ?? "", env("PHOTO_BACKUP_TRIGGER_SECRET"))) {
    return json({ error: "Unauthorized" }, 401);
  }
  const body = await req.json().catch(() => ({}));
  const started = Date.now();

  const endpoint = Deno.env.get("PHOTO_BACKUP_S3_ENDPOINT") || undefined;
  const s3 = new S3Client({
    region: Deno.env.get("PHOTO_BACKUP_S3_REGION") || "ap-southeast-1",
    endpoint,
    forcePathStyle: Boolean(endpoint),
    credentials: {
      accessKeyId: env("PHOTO_BACKUP_AWS_ACCESS_KEY_ID"),
      secretAccessKey: env("PHOTO_BACKUP_AWS_SECRET_ACCESS_KEY"),
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 5,
  });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, publishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: env("PHOTO_BACKUP_READER_EMAIL"),
    password: env("PHOTO_BACKUP_READER_PASSWORD"),
  });
  if (signInError) {
    return json({ ok: false, error: `Backup reader could not sign in: ${scrubError(signInError.message)}` }, 500);
  }

  try {
    const deps = backupDeps(
      supabase.storage as unknown as StorageLike,
      {
        send: (command) => s3.send(command as never),
        PutObjectCommand,
        ListObjectsV2Command,
        DeleteObjectsCommand,
        md5Base64: (b) => createHash("md5").update(b).digest("base64"),
      },
      env("PHOTO_BACKUP_S3_BUCKET"),
      { encrypt: !endpoint, log: (m) => console.log(m) }
    );
    const { summary, remaining } = await runBackup(deps, {
      dryRun: body?.dryRun === true,
      allowMassDelete: body?.allowMassDelete === true,
      deadline: started + BUDGET_MS,
    });
    return json({ ok: summary.ok, remaining, summary });
  } catch (err) {
    const message = scrubError(err instanceof Error ? err.message : String(err));
    console.error(`photo backup failed: ${message}`);
    return json({ ok: false, error: message }, 500);
  } finally {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
});
