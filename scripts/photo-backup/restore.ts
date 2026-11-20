/**
 * Puts photos back from the backup bucket into Supabase Storage, at the same
 * bucket and path, so the rows that point at them work again. Run by hand,
 * from a laptop, during a restore (docs/photo-backups.md, "Restore drill").
 *
 *   set -a; source ~/.miamus-photo-restore.env; set +a
 *   npx tsx scripts/photo-backup/restore.ts --object household-logs/<household>/<folder>/<file> --include-deleted
 *   npx tsx scripts/photo-backup/restore.ts --household <household id> --include-deleted
 *   npx tsx scripts/photo-backup/restore.ts --all --at 2026-12-01T00:00:00Z
 *   ... add --apply to actually write; without it, it only reports.
 *
 * Options:
 *   --at <time>         the backup as it stood then (default: now)
 *   --include-deleted   also bring back photos deleted from Miamus since
 *                       (kept 30 days after the delete)
 *   --overwrite         replace a photo that is already in Supabase (default:
 *                       leave it; keys are unique, so it is the same photo)
 *
 * Reads with the restore key (list and read the backup bucket, nothing else)
 * and writes with the target project's secret key: both from the environment,
 * a file outside the repository (scripts/photo-backup/env.example). Prints
 * counts only.
 */
import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { backupS3, listVersions, mb, s3Kit } from "./io";
import {
  PHOTO_BUCKETS,
  type ObjectVersion,
  eachLimited,
  inScope,
  listBackupObjects,
  parseBackupKey,
  parseRestoreArgs,
  pickRestoreVersions,
  requireEnv,
  restorePrefixes,
  scrubError,
} from "../../supabase/functions/_shared/photo-backup";

const PARALLEL = 6;

/**
 * Every version under the prefixes. An S3-compatible store without versioning
 * (the local rehearsal: Supabase's own S3 endpoint) lists no versions, or
 * refuses the call; then the current objects stand in, which is right for
 * "what is there now" and refused for --at or --include-deleted. AWS, with
 * versioning on, always lists a version for every current object.
 */
async function versionsFor(s3: S3Client, bucket: string, prefixes: string[], needHistory: boolean) {
  let versions: ObjectVersion[] = [];
  let versionError: unknown = null;
  try {
    versions = (await Promise.all(prefixes.map((p) => listVersions(s3, bucket, p)))).flat();
  } catch (err) {
    versionError = err;
  }
  if (versions.length > 0) return versions;
  const current = (await Promise.all(prefixes.map((p) => listBackupObjects(s3Kit(s3), bucket, p)))).flat();
  if (current.length === 0 && versionError) throw versionError;
  if (current.length > 0 && needHistory) {
    throw new Error("This backup bucket keeps no versions, so --at and --include-deleted can't work here.");
  }
  return current.map<ObjectVersion>((o) => ({
    key: o.key,
    versionId: "",
    lastModified: new Date(0),
    deleteMarker: false,
    size: o.size,
  }));
}

async function main() {
  const args = parseRestoreArgs(process.argv.slice(2));
  const env = requireEnv(process.env, [
    "BACKUP_S3_BUCKET",
    "BACKUP_S3_RESTORE_ACCESS_KEY_ID",
    "BACKUP_S3_RESTORE_SECRET_ACCESS_KEY",
    "TARGET_SUPABASE_URL",
    "TARGET_SUPABASE_SECRET_KEY",
  ]);
  const started = Date.now();
  const bucket = env.BACKUP_S3_BUCKET;
  const s3 = backupS3(process.env, env.BACKUP_S3_RESTORE_ACCESS_KEY_ID, env.BACKUP_S3_RESTORE_SECRET_ACCESS_KEY);
  const target = createClient(env.TARGET_SUPABASE_URL, env.TARGET_SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`target: ${new URL(env.TARGET_SUPABASE_URL).host}`);
  for (const name of PHOTO_BUCKETS) {
    const { data, error } = await target.storage.getBucket(name);
    if (error || !data) throw new Error(`Target has no bucket ${name} (apply the migrations first): ${error?.message ?? ""}`);
  }

  const needHistory = Boolean(args.at || args.includeDeleted);
  const versions = await versionsFor(s3, bucket, restorePrefixes(args.scope), needHistory);
  const picked = pickRestoreVersions(
    versions.filter((v) => inScope(v.key, args.scope)),
    { at: args.at, includeDeleted: args.includeDeleted }
  );
  const bytes = picked.reduce((s, v) => s + v.size, 0);
  console.log(`backup: ${picked.length} photos to restore, ${mb(bytes)}${args.apply ? "" : " (dry run: add --apply to write)"}`);
  if (!args.apply || picked.length === 0) return;

  let restored = 0;
  let alreadyThere = 0;
  const failed: string[] = [];
  await eachLimited(picked, PARALLEL, async (v) => {
    const ref = parseBackupKey(v.key);
    if (!ref) return;
    try {
      const got = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: v.key, VersionId: v.versionId || undefined })
      );
      const body = Buffer.from(await got.Body!.transformToByteArray());
      const { error } = await target.storage
        .from(ref.bucket)
        .upload(ref.path, body, { contentType: got.ContentType ?? "image/jpeg", upsert: args.overwrite });
      if (error) {
        if (!args.overwrite && /already exists|duplicate/i.test(error.message)) alreadyThere++;
        else throw new Error(error.message);
      } else {
        restored++;
      }
    } catch (err) {
      failed.push(scrubError(String((err as Error).message ?? err), [ref.path]));
    }
    const n = restored + alreadyThere + failed.length;
    if (n % 200 === 0) console.log(`  ${n}/${picked.length}`);
  });

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`restored ${restored}, already there ${alreadyThere}, failed ${failed.length}, in ${seconds} s`);
  for (const e of [...new Set(failed)].slice(0, 5)) console.error(`  error: ${e}`);
  if (failed.length > 0) {
    console.error("RESTORE NOT COMPLETE. Safe to run again: photos already back are left alone.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`RESTORE FAILED: ${scrubError(String((err as Error).message ?? err))}`);
  process.exit(1);
});
