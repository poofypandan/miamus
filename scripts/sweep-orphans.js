// ============================================================================
// Maintenance: delete objects in the household-logs bucket that nothing
// references.
//
//   node scripts/sweep-orphans.js            # dry run — prints what it would do
//   node scripts/sweep-orphans.js --delete   # actually removes them
//
// Needs `pg` available and DATABASE_URL in .env.local (it lists the bucket
// through storage.objects, which the REST API cannot page through).
//
// Orphans should be rare now that migrations/080 lets the app delete photos
// for real, but an upload whose log row never lands still leaves one behind.
//
// WHAT COUNTS AS REFERENCED — all three must stay in step with the app, or
// this deletes something it shouldn't:
//   - task_logs.photo_url                  task and ad-hoc photos
//   - task_entities.metadata.avatar_url    pet avatars, same bucket
//   - medical_records.document_photo_url   health passport documents
// ============================================================================
const fs = require("fs");
const { Client } = require("pg");

const ENV = require("path").join(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  fs.readFileSync(ENV, "utf8").split(/\r?\n/).filter(l => l.includes("=")).map(l => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  })
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };
const BUCKET = "household-logs";
// Anything uploaded very recently may belong to a capture still in progress —
// the photo is uploaded before the staff member has finished tagging it, so it
// is legitimately unreferenced for a minute or two.
const MIN_AGE_HOURS = 2;

const toPath = (url) => {
  if (!url) return null;
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
};

const rest = async (path) => {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
};

(async () => {
  const pool = (() => {
    const u = new URL(env.DATABASE_URL);
    const ref = u.hostname.split(".")[1];
    u.username = "postgres." + ref;
    u.hostname = "aws-0-ap-northeast-1.pooler.supabase.com";
    u.port = "5432";
    return u.toString();
  })();
  const client = new Client({ connectionString: pool, connectionTimeoutMillis: 25000 });
  await client.connect();

  const { rows: objects } = await client.query(
    `select name, created_at, coalesce((metadata->>'size')::bigint, 0) as size
       from storage.objects where bucket_id = $1 order by created_at`,
    [BUCKET]
  );

  // Every column anywhere in the app that can point at this bucket.
  const referenced = new Set();
  let sources = {};
  for (const [label, query, field] of [
    ["task_logs.photo_url", "task_logs?select=photo_url&photo_url=not.is.null", "photo_url"],
    ["medical_records.document_photo_url", "medical_records?select=document_photo_url&document_photo_url=not.is.null", "document_photo_url"],
  ]) {
    const rows = await rest(query);
    let n = 0;
    for (const row of rows) { const p = toPath(row[field]); if (p) { referenced.add(p); n++; } }
    sources[label] = n;
  }
  // Pet avatars live in the same bucket, referenced from JSON metadata.
  const entities = await rest("task_entities?select=metadata");
  let avatars = 0;
  for (const e of entities) {
    const p = toPath(e.metadata?.avatar_url);
    if (p) { referenced.add(p); avatars++; }
  }
  sources["task_entities.metadata.avatar_url"] = avatars;

  const cutoff = Date.now() - MIN_AGE_HOURS * 3600e3;
  const orphans = objects.filter(o => !referenced.has(o.name));
  const sweepable = orphans.filter(o => new Date(o.created_at).getTime() < cutoff);
  const tooNew = orphans.length - sweepable.length;

  const mb = (n) => (n / 1048576).toFixed(2) + " MB";
  console.log("objects in bucket:      ", objects.length, mb(objects.reduce((a, o) => a + Number(o.size), 0)));
  console.log("referenced by:          ", JSON.stringify(sources));
  console.log("referenced total:       ", referenced.size);
  console.log("orphans:                ", orphans.length, mb(orphans.reduce((a, o) => a + Number(o.size), 0)));
  console.log(`held back (<${MIN_AGE_HOURS}h old):  `, tooNew);
  console.log("to delete:              ", sweepable.length, mb(sweepable.reduce((a, o) => a + Number(o.size), 0)));
  console.log("by folder:", JSON.stringify(sweepable.reduce((a, o) => { const k = o.name.split("/")[0]; a[k] = (a[k] || 0) + 1; return a; }, {})));
  console.log("sample:", sweepable.slice(0, 5).map(o => o.name).join("\n        "));

  // Guard: referenced files must never be in the delete list.
  const leak = sweepable.filter(o => referenced.has(o.name));
  if (leak.length) { console.error("ABORT: referenced files in delete list", leak); process.exit(1); }

  if (!process.argv.includes("--delete")) {
    console.log("\nDRY RUN — nothing deleted. Re-run with --delete to remove them.");
    await client.end();
    return;
  }

  let removed = 0;
  for (let i = 0; i < sweepable.length; i += 100) {
    const batch = sweepable.slice(i, i + 100).map(o => o.name);
    const r = await fetch(`${SUPA}/storage/v1/object/${BUCKET}`, {
      method: "DELETE", headers: H, body: JSON.stringify({ prefixes: batch }),
    });
    const body = await r.json();
    removed += Array.isArray(body) ? body.length : 0;
    console.log(`batch ${i / 100 + 1}: requested ${batch.length}, removed ${Array.isArray(body) ? body.length : JSON.stringify(body).slice(0, 80)}`);
  }
  const { rows: after } = await client.query("select count(*)::int as n from storage.objects where bucket_id = $1", [BUCKET]);
  console.log(`\ndeleted ${removed} files; bucket now holds ${after[0].n}`);
  await client.end();
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
