/**
 * Photo backups: everything but the network, so it can be unit-tested
 * (tests/unit/photo-backup.test.ts) and shared, unchanged, by:
 *
 *   - the photo-backup Edge Function (supabase/functions/photo-backup), which
 *     runs the nightly copy in Singapore, beside the photos and the backup;
 *   - scripts/photo-backup/backup.ts and restore.ts, run from a laptop.
 *
 * No imports, on purpose: Deno and Node both load this file as it is. The
 * callers hand runBackup() the few network calls it needs.
 *
 * Layout of the backup bucket (S3, ap-southeast-1, versioned):
 *
 *   <supabase bucket>/<object path>     one copy per photo, same path, so a
 *                                       restore puts it back exactly where
 *                                       the rows' URLs expect it
 *   _manifests/<UTC time>.json          what each night copied and removed
 *
 * Why the paths alone are enough for a restore: every row stores a URL of the
 * shape …/storage/v1/object/public/<bucket>/<path> (src/lib/photos.ts,
 * parseStorageRef), and object keys are unique and never rewritten
 * (`<household>/<prefix>/<ms>-<random>.<ext>`, supabase-provider.ts). Put
 * the bytes back at the same bucket and path and the existing rows work.
 */

/**
 * Every Supabase Storage bucket Miamus keeps photos in. A test checks this
 * against the buckets the migrations create and the ones src/lib/photos.ts
 * serves, so a new bucket can't quietly go unbacked.
 */
export const PHOTO_BUCKETS = ["household-logs", "inventory_audits", "owner-receipts"] as const;
export type PhotoBucketName = (typeof PHOTO_BUCKETS)[number];

export const MANIFEST_PREFIX = "_manifests/";

/**
 * A night may remove at most this share of what the backup holds before it
 * stops and asks a person (allow_mass_delete). The normal night removes about
 * 1/30 of the chore photos (the 30-day rule) and the odd deleted repair; a
 * deleted household can be more, and then someone should look first.
 */
export const MAX_DELETE_FRACTION = 0.1;
/** Below this many removals the fraction rule doesn't apply (a tiny backup). */
export const DELETE_GUARD_FLOOR = 50;

export type SourceObject = {
  bucket: string;
  path: string;
  size: number;
  etag?: string | null;
  contentType?: string | null;
};

export type BackupObject = {
  key: string;
  size: number;
  etag?: string | null;
};

export function backupKey(bucket: string, path: string): string {
  return `${bucket}/${path}`;
}

export function isPhotoBucketName(value: string): value is PhotoBucketName {
  return (PHOTO_BUCKETS as readonly string[]).includes(value);
}

/** The Supabase bucket and path a backup key stands for; null for manifests and anything else. */
export function parseBackupKey(key: string): { bucket: PhotoBucketName; path: string } | null {
  const slash = key.indexOf("/");
  if (slash <= 0) return null;
  const bucket = key.slice(0, slash);
  const path = key.slice(slash + 1);
  if (!isPhotoBucketName(bucket) || !path || path.endsWith("/")) return null;
  return { bucket, path };
}

/**
 * An ETag as a plain lowercase MD5, or null when it isn't one. Supabase and
 * S3 both quote it; a multipart upload's ETag ("<hash>-<parts>") is not the
 * file's MD5, so it can't be compared across the two.
 */
export function normalizeEtag(etag: string | null | undefined): string | null {
  if (!etag) return null;
  const bare = etag.replace(/^W\//, "").replace(/"/g, "").trim().toLowerCase();
  return /^[0-9a-f]{32}$/.test(bare) ? bare : null;
}

/** Same size, and the same MD5 when both sides know it. */
export function sameContent(source: SourceObject, backup: BackupObject): boolean {
  if (source.size !== backup.size) return false;
  const a = normalizeEtag(source.etag);
  const b = normalizeEtag(backup.etag);
  return a === null || b === null || a === b;
}

export type BackupPlan = {
  copy: SourceObject[];
  unchanged: number;
  /** Backup keys whose photo is gone from Supabase (removed only if `refusal` is null). */
  remove: string[];
  /** Why removals are held back this night; copies still go ahead. */
  refusal: string | null;
};

export type PlanOptions = {
  allowMassDelete?: boolean;
  maxDeleteFraction?: number;
  deleteGuardFloor?: number;
};

/**
 * What tonight's run should do: copy what is new or changed, and mark as
 * deleted what Supabase no longer has. The bucket is versioned, so "remove"
 * only hides the copy; it stays recoverable until the 30-day lifecycle rule
 * expires it. Removals are refused, and the run fails so a person looks, when
 * they look like a broken read rather than real deletes:
 *
 *  - a bucket that read as empty while its backup isn't. Storage answers a
 *    reader who lost its permission with an empty list, not an error, so an
 *    empty bucket is the signature of a broken read;
 *  - more than MAX_DELETE_FRACTION of the backup at once.
 */
export function planBackup(
  sources: SourceObject[],
  backups: BackupObject[],
  options: PlanOptions = {}
): BackupPlan {
  const maxFraction = options.maxDeleteFraction ?? MAX_DELETE_FRACTION;
  const floor = options.deleteGuardFloor ?? DELETE_GUARD_FLOOR;

  const backupByKey = new Map<string, BackupObject>();
  for (const b of backups) {
    if (parseBackupKey(b.key)) backupByKey.set(b.key, b);
  }

  const copy: SourceObject[] = [];
  const sourceKeys = new Set<string>();
  let unchanged = 0;
  for (const s of sources) {
    const key = backupKey(s.bucket, s.path);
    sourceKeys.add(key);
    const existing = backupByKey.get(key);
    if (existing && sameContent(s, existing)) unchanged++;
    else copy.push(s);
  }

  const remove = [...backupByKey.keys()].filter((key) => !sourceKeys.has(key)).sort();

  let refusal: string | null = null;
  if (remove.length > 0 && !options.allowMassDelete) {
    const emptyButBacked = PHOTO_BUCKETS.filter(
      (bucket) =>
        !sources.some((s) => s.bucket === bucket) &&
        [...backupByKey.keys()].some((key) => key.startsWith(`${bucket}/`))
    );
    if (emptyButBacked.length > 0) {
      refusal = `${emptyButBacked.join(", ")} read as empty but the backup has photos in it: the reader may have lost its permission. Nothing removed.`;
    } else if (remove.length > floor && remove.length > maxFraction * backupByKey.size) {
      refusal = `${remove.length} of ${backupByKey.size} backed-up photos would be removed (more than ${Math.round(maxFraction * 100)}%). Nothing removed; rerun with allow_mass_delete if this is expected.`;
    }
  }

  return { copy, unchanged, remove, refusal };
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export type BucketCount = { objects: number; bytes: number };

export type Manifest = {
  kind: "miamus-photo-backup";
  version: 1;
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  source: Record<string, BucketCount>;
  unchanged: number;
  copied: { key: string; size: number }[];
  removed: string[];
  heldBack: string[];
  failed: { key: string; error: string }[];
  refusal: string | null;
};

/** Counts only, for GitHub's logs and job summary: no paths, no household ids. */
export function summarize(manifest: Manifest) {
  return {
    dryRun: manifest.dryRun,
    startedAt: manifest.startedAt,
    finishedAt: manifest.finishedAt,
    source: manifest.source,
    unchanged: manifest.unchanged,
    copied: manifest.copied.length,
    copiedBytes: manifest.copied.reduce((sum, c) => sum + c.size, 0),
    removed: manifest.removed.length,
    heldBack: manifest.heldBack.length,
    failed: manifest.failed.length,
    refusal: manifest.refusal,
    ok: manifest.failed.length === 0 && manifest.refusal === null,
  };
}

export function manifestKey(startedAt: string, dryRun: boolean): string {
  const stamp = startedAt.replace(/[:.]/g, "-");
  return `${MANIFEST_PREFIX}${stamp}${dryRun ? "-dry-run" : ""}.json`;
}

/**
 * An error message fit for a public-ish log: object paths (which carry
 * household ids) replaced, and cut short.
 */
export function scrubError(message: string, paths: string[] = []): string {
  let out = message;
  for (const p of paths) if (p) out = out.split(p).join("<object>");
  out = out.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>");
  return out.length > 200 ? `${out.slice(0, 200)}…` : out;
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

export type RestoreScope =
  | { kind: "all" }
  | { kind: "household"; householdId: string }
  | { kind: "object"; bucket: PhotoBucketName; path: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The backup-key prefixes to list for a scope (one per bucket, or the one key). */
export function restorePrefixes(scope: RestoreScope): string[] {
  switch (scope.kind) {
    case "all":
      return PHOTO_BUCKETS.map((b) => `${b}/`);
    case "household":
      return PHOTO_BUCKETS.map((b) => `${b}/${scope.householdId.toLowerCase()}/`);
    case "object":
      return [backupKey(scope.bucket, scope.path)];
  }
}

export function inScope(key: string, scope: RestoreScope): boolean {
  const ref = parseBackupKey(key);
  if (!ref) return false;
  switch (scope.kind) {
    case "all":
      return true;
    case "household":
      return ref.path.toLowerCase().startsWith(`${scope.householdId.toLowerCase()}/`);
    case "object":
      return ref.bucket === scope.bucket && ref.path === scope.path;
  }
}

export type ObjectVersion = {
  key: string;
  versionId: string;
  lastModified: Date;
  deleteMarker: boolean;
  size: number;
};

/**
 * Which version of each key to put back.
 *
 *  - `at`: the backup as it stood then (default: now). For each key, the
 *    newest version written at or before that time; a key whose newest entry
 *    by then is a delete marker was already deleted, and is skipped.
 *  - `includeDeleted`: also bring back photos deleted since (the newest real
 *    version, ignoring delete markers). This is the "someone deleted it by
 *    mistake" restore.
 */
export function pickRestoreVersions(
  versions: ObjectVersion[],
  options: { at?: Date; includeDeleted?: boolean } = {}
): ObjectVersion[] {
  const at = options.at?.getTime() ?? Number.POSITIVE_INFINITY;
  const byKey = new Map<string, ObjectVersion[]>();
  for (const v of versions) {
    if (!parseBackupKey(v.key)) continue;
    if (v.lastModified.getTime() > at) continue;
    const list = byKey.get(v.key) ?? [];
    list.push(v);
    byKey.set(v.key, list);
  }
  const picked: ObjectVersion[] = [];
  for (const list of byKey.values()) {
    list.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    const newest = list[0];
    if (!newest.deleteMarker) {
      picked.push(newest);
    } else if (options.includeDeleted) {
      const real = list.find((v) => !v.deleteMarker);
      if (real) picked.push(real);
    }
  }
  return picked.sort((a, b) => a.key.localeCompare(b.key));
}

// ---------------------------------------------------------------------------
// Command lines
// ---------------------------------------------------------------------------

export type BackupArgs = { dryRun: boolean; allowMassDelete: boolean };

export function parseBackupArgs(argv: string[]): BackupArgs {
  const args: BackupArgs = { dryRun: false, allowMassDelete: false };
  for (const a of argv) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--allow-mass-delete") args.allowMassDelete = true;
    else throw new Error(`Unknown option ${a}. Options: --dry-run, --allow-mass-delete`);
  }
  return args;
}

export type RestoreArgs = {
  scope: RestoreScope;
  apply: boolean;
  overwrite: boolean;
  includeDeleted: boolean;
  at?: Date;
};

export const RESTORE_USAGE = `Usage:
  npx tsx scripts/photo-backup/restore.ts (--all | --household <id> | --object <bucket>/<path>)
      [--at <ISO time>] [--include-deleted] [--overwrite] [--apply]

Without --apply it only reports what it would restore.`;

export function parseRestoreArgs(argv: string[]): RestoreArgs {
  let scope: RestoreScope | null = null;
  const setScope = (s: RestoreScope) => {
    if (scope) throw new Error("Choose one of --all, --household, --object.");
    scope = s;
  };
  const out: Omit<RestoreArgs, "scope"> = { apply: false, overwrite: false, includeDeleted: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new Error(`${a} needs a value.`);
      return v;
    };
    if (a === "--all") setScope({ kind: "all" });
    else if (a === "--household") {
      const id = value();
      if (!UUID.test(id)) throw new Error("--household takes a household id (a UUID).");
      setScope({ kind: "household", householdId: id.toLowerCase() });
    } else if (a === "--object") {
      const ref = parseBackupKey(value());
      if (!ref) throw new Error(`--object takes <bucket>/<path>, bucket one of ${PHOTO_BUCKETS.join(", ")}.`);
      setScope({ kind: "object", bucket: ref.bucket, path: ref.path });
    } else if (a === "--at") {
      const raw = value();
      const at = new Date(raw);
      if (Number.isNaN(at.getTime())) throw new Error(`--at: not a time: ${raw}`);
      out.at = at;
    } else if (a === "--include-deleted") out.includeDeleted = true;
    else if (a === "--overwrite") out.overwrite = true;
    else if (a === "--apply") out.apply = true;
    else throw new Error(`Unknown option ${a}.\n${RESTORE_USAGE}`);
  }
  if (!scope) throw new Error(`Say what to restore.\n${RESTORE_USAGE}`);
  return { scope, ...out };
}

/** Throws naming every missing variable, never printing a value. */
export function requireEnv(env: Record<string, string | undefined>, names: string[]): Record<string, string> {
  const missing = names.filter((n) => !env[n]);
  if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  return Object.fromEntries(names.map((n) => [n, env[n] as string]));
}

/** Runs `work` over `items`, `parallel` at a time. */
export async function eachLimited<T>(items: T[], parallel: number, work: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(parallel, queue.length)) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
    })
  );
}

// ---------------------------------------------------------------------------
// The run itself (the Edge Function and backup.ts both call this)
// ---------------------------------------------------------------------------

/** The network calls a run needs; each runtime supplies its own. */
export type BackupDeps = {
  /** Every photo in a Supabase bucket, read as the backup reader. Throws if it can't read. */
  listSource(bucket: PhotoBucketName): Promise<SourceObject[]>;
  /** Every current object in the backup bucket under a prefix. */
  listBackup(prefix: string): Promise<BackupObject[]>;
  /** Download from Supabase and upload to the backup; returns the bytes copied. */
  copy(file: SourceObject, key: string): Promise<number>;
  /** Mark keys deleted in the backup (a delete marker; versions stay). */
  removeMany(keys: string[]): Promise<{ key: string; error: string }[]>;
  /** Upload the manifest. */
  putJson(key: string, value: unknown): Promise<void>;
  log(message: string): void;
};

export type RunOptions = {
  dryRun?: boolean;
  allowMassDelete?: boolean;
  /** Stop starting copies after this time (ms since epoch); the rest are left for the next call. */
  deadline?: number;
  parallel?: number;
  now?: () => number;
};

export type RunResult = {
  manifest: Manifest;
  summary: ReturnType<typeof summarize>;
  /** Copies not attempted this call (the deadline came first). Call again. */
  remaining: number;
};

const mbText = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * One backup call: list both sides, plan, copy until the deadline, and, once
 * every copy has been attempted, remove what Supabase no longer has (unless
 * the plan held removals back). Writes the manifest (not on a dry run).
 * Never throws for a single photo: failures are counted, and `summary.ok`
 * is false.
 */
export async function runBackup(deps: BackupDeps, options: RunOptions = {}): Promise<RunResult> {
  const now = options.now ?? Date.now;
  const startedAt = new Date(now()).toISOString();
  const dryRun = Boolean(options.dryRun);

  const sources: SourceObject[] = [];
  const source: Record<string, BucketCount> = {};
  for (const name of PHOTO_BUCKETS) {
    const files = await deps.listSource(name);
    sources.push(...files);
    source[name] = { objects: files.length, bytes: files.reduce((s, f) => s + f.size, 0) };
    deps.log(`${name}: ${files.length} photos, ${mbText(source[name].bytes)}`);
  }
  const backups: BackupObject[] = [];
  for (const name of PHOTO_BUCKETS) backups.push(...(await deps.listBackup(`${name}/`)));
  deps.log(`backup: ${backups.length} photos`);

  const plan = planBackup(sources, backups, { allowMassDelete: options.allowMassDelete });
  deps.log(
    `plan: copy ${plan.copy.length}, unchanged ${plan.unchanged}, remove ${plan.remove.length}` +
      (plan.refusal ? " (held back)" : "")
  );
  if (plan.refusal) deps.log(`HELD BACK: ${plan.refusal}`);

  const manifest: Manifest = {
    kind: "miamus-photo-backup",
    version: 1,
    startedAt,
    finishedAt: startedAt,
    dryRun,
    source,
    unchanged: plan.unchanged,
    copied: [],
    removed: [],
    heldBack: plan.refusal ? plan.remove : [],
    failed: [],
    refusal: plan.refusal,
  };

  let remaining = 0;
  if (dryRun) {
    manifest.copied = plan.copy.map((f) => ({ key: backupKey(f.bucket, f.path), size: f.size }));
    manifest.removed = plan.refusal ? [] : plan.remove;
  } else {
    const queue = [...plan.copy];
    let started = 0;
    const worker = async () => {
      for (;;) {
        // Past the deadline, start nothing new, but always at least one copy
        // per call, so a slow night still moves forward.
        if (options.deadline !== undefined && now() >= options.deadline && started > 0) return;
        const file = queue.shift();
        if (!file) return;
        started++;
        const key = backupKey(file.bucket, file.path);
        try {
          const size = await deps.copy(file, key);
          manifest.copied.push({ key, size });
        } catch (err) {
          manifest.failed.push({ key, error: scrubError(errorText(err), [file.path]) });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, options.parallel ?? 6) }, worker));
    remaining = queue.length;

    if (remaining === 0 && !plan.refusal) {
      for (let i = 0; i < plan.remove.length; i += 1000) {
        const chunk = plan.remove.slice(i, i + 1000);
        let failed: { key: string; error: string }[];
        try {
          failed = await deps.removeMany(chunk);
        } catch (err) {
          failed = chunk.map((key) => ({ key, error: `remove: ${errorText(err)}` }));
        }
        const failedKeys = new Set(failed.map((f) => f.key));
        for (const f of failed) manifest.failed.push({ key: f.key, error: scrubError(f.error) });
        manifest.removed.push(...chunk.filter((k) => !failedKeys.has(k)));
      }
    } else if (remaining > 0) {
      deps.log(`deadline: ${remaining} copies left for the next call; removals wait for the last one`);
    }
  }

  manifest.finishedAt = new Date(now()).toISOString();
  if (!dryRun) await deps.putJson(manifestKey(startedAt, false), manifest);
  const summary = summarize(manifest);
  deps.log(
    `${dryRun ? "DRY RUN: would copy" : "copied"} ${summary.copied} (${mbText(summary.copiedBytes)}), ` +
      `${dryRun ? "would remove" : "removed"} ${summary.removed}, failed ${summary.failed}`
  );
  for (const e of [...new Set(manifest.failed.map((f) => f.error))].slice(0, 5)) deps.log(`  error: ${e}`);
  return { manifest, summary, remaining };
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// The network side, written against the SDKs' shapes rather than imports, so
// Deno (npm: specifiers) and Node (node_modules) share it
// ---------------------------------------------------------------------------

/** The part of supabase-js Storage a backup reads with. */
export type StorageLike = {
  from(bucket: string): {
    list(
      prefix: string,
      options: { limit: number; offset: number; sortBy: { column: string; order: string } }
    ): Promise<{ data: { name: string; id: string | null; metadata: Record<string, unknown> | null }[] | null; error: { message: string } | null }>;
    download(path: string): Promise<{ data: Blob | null; error: { message: string } | null }>;
  };
};

/** The @aws-sdk/client-s3 pieces a backup writes with, passed in by the caller. */
export type S3Kit = {
  send(command: object): Promise<unknown>;
  PutObjectCommand: new (input: {
    Bucket: string;
    Key: string;
    Body: Uint8Array | string;
    ContentType: string;
    ContentMD5?: string;
    ServerSideEncryption?: "AES256";
  }) => object;
  ListObjectsV2Command: new (input: { Bucket: string; Prefix: string; ContinuationToken?: string }) => object;
  DeleteObjectsCommand: new (input: {
    Bucket: string;
    Delete: { Objects: { Key: string }[]; Quiet: boolean };
  }) => object;
  md5Base64(body: Uint8Array): string;
};

type ListOut = {
  Contents?: { Key?: string; Size?: number; ETag?: string }[];
  IsTruncated?: boolean;
  NextContinuationToken?: string;
};
type DeleteOut = { Errors?: { Key?: string; Code?: string; Message?: string }[] };

const LIST_PAGE = 1000;

/**
 * Every file in a Supabase bucket, as the signed-in caller may see it.
 * Folders come back with no id and are walked into. An error stops the run:
 * a bucket we couldn't read must never look empty.
 */
export async function listSupabaseBucket(storage: StorageLike, bucket: string, prefix = ""): Promise<SourceObject[]> {
  const files: SourceObject[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await storage
      .from(bucket)
      .list(prefix, { limit: LIST_PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`Could not list ${bucket}: ${error.message}`);
    for (const entry of data ?? []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        files.push(...(await listSupabaseBucket(storage, bucket, path)));
      } else {
        const meta = entry.metadata ?? {};
        files.push({
          bucket,
          path,
          size: typeof meta.size === "number" ? meta.size : 0,
          etag: typeof meta.eTag === "string" ? meta.eTag : null,
          contentType: typeof meta.mimetype === "string" ? meta.mimetype : null,
        });
      }
    }
    if (!data || data.length < LIST_PAGE) break;
  }
  return files;
}

/** Every current object in the backup bucket under a prefix. */
export async function listBackupObjects(kit: Pick<S3Kit, "send" | "ListObjectsV2Command">, bucket: string, prefix: string) {
  const out: BackupObject[] = [];
  let token: string | undefined;
  do {
    const page = (await kit.send(
      new kit.ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token })
    )) as ListOut;
    for (const o of page.Contents ?? []) {
      if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0, etag: o.ETag ?? null });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/**
 * Everything runBackup needs, from a signed-in reader's Storage and the
 * writer's S3. `encrypt` asks AWS for SSE-S3 on every object (the bucket
 * default does too); off only for the local stand-in, which refuses it.
 */
export function backupDeps(
  storage: StorageLike,
  kit: S3Kit,
  bucket: string,
  options: { encrypt: boolean; log: (message: string) => void }
): BackupDeps {
  const sse = options.encrypt ? ("AES256" as const) : undefined;
  return {
    listSource: (name) => listSupabaseBucket(storage, name),
    listBackup: (prefix) => listBackupObjects(kit, bucket, prefix),
    async copy(file, key) {
      const { data, error } = await storage.from(file.bucket).download(file.path);
      if (error || !data) throw new Error(`download: ${error?.message ?? "no data"}`);
      const body = new Uint8Array(await data.arrayBuffer());
      await kit.send(
        new kit.PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: file.contentType ?? (data.type || "application/octet-stream"),
          ContentMD5: kit.md5Base64(body),
          ServerSideEncryption: sse,
        })
      );
      return body.length;
    },
    async removeMany(keys) {
      const result = (await kit.send(
        new kit.DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } })
      )) as DeleteOut;
      return (result.Errors ?? []).map((e) => ({
        key: e.Key ?? "?",
        error: `remove: ${e.Code ?? ""} ${e.Message ?? ""}`.trim(),
      }));
    },
    async putJson(key, value) {
      const body = JSON.stringify(value, null, 1);
      await kit.send(
        new kit.PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: "application/json",
          ServerSideEncryption: sse,
        })
      );
    },
    log: options.log,
  };
}
