/* eslint-disable @typescript-eslint/no-require-imports -- a plain CommonJS Node script, run directly with `node` */
// ============================================================================
// Maintenance: delete objects in the household-logs bucket that nothing
// references (rewritten Phase 120).
//
//   node scripts/sweep-orphans.js            # dry run — prints what it would do
//   node scripts/sweep-orphans.js --delete   # actually removes them
//
// Needs:
//   - `pg`  (npm i --no-save pg — it is not an app dependency)
//   - .env.local: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, and for --delete a
//     secret key as SUPABASE_SECRET_KEY (sb_secret_…) or
//     SUPABASE_SERVICE_ROLE_KEY. Never commit either.
//
// WHY IT WAS REWRITTEN. The old version read references through the REST API
// with the anon key. Since migrations/088–090 that key sees no rows at all, so
// "referenced" came back empty and EVERY photo in the bucket was an orphan. It
// also never looked at household_tasks (chore proof, before/after),
// task_entities.metadata.full_image_url (pet master photos) or inventory
// photos, and only understood the /object/public/ URL shape.
//
// HOW IT DECIDES NOW — nothing to keep in step by hand:
//   1. Every text / varchar / json / jsonb column of every table in `public`
//      is scanned, through a direct Postgres connection (which RLS does not
//      filter), for storage URLs of either shape. A photo column added next
//      year is covered without touching this file.
//   2. The columns the app is known to store photos in (KNOWN_PHOTO_COLUMNS)
//      must all be among the scanned ones. If one has been renamed or moved
//      out of reach, the scan cannot be trusted and the script stops.
//   3. Anything younger than MIN_AGE_HOURS is held back: a photo is uploaded
//      before the form that points at it is saved (a pet being added, a chore
//      being finished), so a fresh one is legitimately unreferenced.
//   4. --delete refuses if the result looks wrong: no references found at
//      all, or more than MAX_SWEEP_FRACTION of the bucket about to go.
//
// Retention (photos older than 30 days) is NOT this script's job — that is
// the prune-task-photos Edge Function (migrations/101, 102). This only clears
// files no row has ever pointed at, or no longer does.
// ============================================================================
const fs = require("fs");
const path = require("path");

let Client;
try {
  ({ Client } = require("pg"));
} catch {
  console.error("This script needs `pg`: run `npm i --no-save pg` first.");
  process.exit(1);
}

const ENV = path.join(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  fs.readFileSync(ENV, "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  })
);

const BUCKET = "household-logs";
const MIN_AGE_HOURS = 24;
const MAX_SWEEP_FRACTION = 0.25;

// Where the app is known to keep photos in this bucket. Not the source of
// truth — the scan is — but a tripwire: each must be scanned, or we stop.
const KNOWN_PHOTO_COLUMNS = [
  "task_logs.photo_url",
  "household_tasks.photo_url",
  "household_tasks.before_photo_url",
  "household_tasks.after_photo_url",
  "task_entities.metadata", // avatar_url, full_image_url
  "medical_records.document_photo_url",
  "inventory_items.photo_url",
  "inventory_audit_logs.photo_url",
];

// The same shapes lib/photos.ts parses: getPublicUrl() and signed URLs.
const STORAGE_URL = /\/storage\/v1\/object\/(?:public|sign)\/([^/"?\s]+)\/([^"?\s]+)/g;

const ident = (s) => `"${s.replaceAll('"', '""')}"`;

function poolerUrl() {
  const u = new URL(env.DATABASE_URL);
  const ref = u.hostname.split(".")[1];
  u.username = "postgres." + ref;
  u.hostname = "aws-0-ap-northeast-1.pooler.supabase.com";
  u.port = "5432";
  return u.toString();
}

(async () => {
  const client = new Client({ connectionString: poolerUrl(), connectionTimeoutMillis: 25000 });
  await client.connect();

  // 1. Every column that could hold a URL.
  const { rows: columns } = await client.query(`
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.data_type in ('text', 'character varying', 'json', 'jsonb')
    order by 1, 2`);
  const scanned = new Set(columns.map((c) => `${c.table_name}.${c.column_name}`));

  // 2. The tripwire.
  const missing = KNOWN_PHOTO_COLUMNS.filter((c) => !scanned.has(c));
  if (missing.length) {
    console.error("ABORT: known photo columns not found in the schema:", missing.join(", "));
    console.error("Update KNOWN_PHOTO_COLUMNS once you know where those photos live now.");
    process.exit(1);
  }

  const referenced = new Set();
  const sources = {};
  for (const { table_name, column_name } of columns) {
    const { rows } = await client.query(
      `select ${ident(column_name)}::text as v from public.${ident(table_name)}
        where ${ident(column_name)}::text like '%/storage/v1/object/%'`
    );
    let n = 0;
    for (const { v } of rows) {
      for (const [, bucket, objectPath] of v.matchAll(STORAGE_URL)) {
        if (bucket !== BUCKET) continue;
        referenced.add(decodeURIComponent(objectPath));
        n++;
      }
    }
    if (n) sources[`${table_name}.${column_name}`] = n;
  }

  const { rows: objects } = await client.query(
    `select name, created_at, coalesce((metadata->>'size')::bigint, 0) as size
       from storage.objects where bucket_id = $1 order by created_at`,
    [BUCKET]
  );

  const cutoff = Date.now() - MIN_AGE_HOURS * 3600e3;
  const orphans = objects.filter((o) => !referenced.has(o.name));
  const sweepable = orphans.filter((o) => new Date(o.created_at).getTime() < cutoff);
  const tooNew = orphans.length - sweepable.length;

  const mb = (n) => (n / 1048576).toFixed(2) + " MB";
  const total = (list) => list.reduce((a, o) => a + Number(o.size), 0);
  console.log("columns scanned:        ", columns.length);
  console.log("objects in bucket:      ", objects.length, mb(total(objects)));
  console.log("referenced by:          ", JSON.stringify(sources));
  console.log("referenced total:       ", referenced.size);
  console.log("orphans:                ", orphans.length, mb(total(orphans)));
  console.log(`held back (<${MIN_AGE_HOURS}h old): `, tooNew);
  console.log("to delete:              ", sweepable.length, mb(total(sweepable)));
  console.log("by folder:", JSON.stringify(sweepable.reduce((a, o) => {
    const k = o.name.split("/").slice(0, -1).join("/");
    a[k] = (a[k] || 0) + 1;
    return a;
  }, {})));

  // Guards. Each one is a reason the scan itself may be wrong.
  const leak = sweepable.filter((o) => referenced.has(o.name));
  if (leak.length) {
    console.error("ABORT: referenced files in delete list", leak);
    process.exit(1);
  }
  if (objects.length > 0 && referenced.size === 0) {
    console.error("ABORT: no references found at all — the scan is not seeing the data.");
    process.exit(1);
  }

  if (!process.argv.includes("--delete")) {
    console.log("\nDRY RUN — nothing deleted. Re-run with --delete to remove them.");
    await client.end();
    return;
  }

  if (sweepable.length > objects.length * MAX_SWEEP_FRACTION) {
    console.error(
      `ABORT: ${sweepable.length} of ${objects.length} objects would go — more than ` +
        `${MAX_SWEEP_FRACTION * 100}% of the bucket. Check the dry run before raising the limit.`
    );
    process.exit(1);
  }

  // The bucket is private (migrations/092): only a secret key may delete
  // outside a household's own RLS scope. New sb_secret_ keys go on `apikey`
  // only; a legacy service_role JWT also on Authorization.
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error("ABORT: --delete needs SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
    process.exit(1);
  }
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_")) headers.Authorization = "Bearer " + key;

  let removed = 0;
  for (let i = 0; i < sweepable.length; i += 100) {
    const batch = sweepable.slice(i, i + 100).map((o) => o.name);
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ prefixes: batch }),
    });
    const body = await r.json();
    const n = Array.isArray(body) ? body.length : 0;
    removed += n;
    console.log(`batch ${i / 100 + 1}: requested ${batch.length}, removed ${Array.isArray(body) ? n : JSON.stringify(body).slice(0, 120)}`);
  }
  const { rows: after } = await client.query(
    "select count(*)::int as n from storage.objects where bucket_id = $1",
    [BUCKET]
  );
  console.log(`\ndeleted ${removed} files; bucket now holds ${after[0].n}`);
  await client.end();
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
