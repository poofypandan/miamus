// Runbook step 12: copy every stored photo from Tokyo to Singapore, same
// bucket, same path, same content type, so every photo link in the data
// keeps working. Prints counts and sizes only, never keys.
//
//   set -a; source ~/.miamus-move.env; set +a
//   node scripts/singapore-move/4-copy-photos.mjs          # copy
//   node scripts/singapore-move/4-copy-photos.mjs --check  # compare only
import { createClient } from "@supabase/supabase-js";

const BUCKETS = ["household-logs", "inventory_audits"];
const PARALLEL = 8;
const checkOnly = process.argv.includes("--check");

for (const name of ["OLD_URL", "OLD_SERVICE_KEY", "NEW_URL", "NEW_SERVICE_KEY"]) {
  if (!process.env[name]) throw new Error(`${name} is not set (source ~/.miamus-move.env with set -a)`);
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const from = createClient(process.env.OLD_URL, process.env.OLD_SERVICE_KEY, options);
const to = createClient(process.env.NEW_URL, process.env.NEW_SERVICE_KEY, options);

/** Every file under a bucket: folders have no id and are walked into. */
async function listAll(client, bucket, prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) files.push(...(await listAll(client, bucket, path)));
      else files.push({ path, size: entry.metadata?.size ?? 0, type: entry.metadata?.mimetype });
    }
    if (data.length < 1000) break;
  }
  return files;
}

async function ensureBucket(bucket) {
  const { data } = await to.storage.getBucket(bucket);
  if (data) return;
  // Normally restored with the data dump (storage.buckets); created private
  // here only as a fallback.
  const { error } = await to.storage.createBucket(bucket, { public: false });
  if (error) throw new Error(`create ${bucket}: ${error.message}`);
}

async function copyOne(bucket, file) {
  const { data: blob, error: downloadError } = await from.storage.from(bucket).download(file.path);
  if (downloadError) throw new Error(`download ${bucket}/${file.path}: ${downloadError.message}`);
  const { error: uploadError } = await to.storage
    .from(bucket)
    .upload(file.path, blob, { contentType: file.type ?? blob.type, upsert: true });
  if (uploadError) throw new Error(`upload ${bucket}/${file.path}: ${uploadError.message}`);
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
let failed = 0;

for (const bucket of BUCKETS) {
  const source = await listAll(from, bucket);
  const total = source.reduce((sum, f) => sum + f.size, 0);
  console.log(`${bucket}: ${source.length} files, ${mb(total)} in Tokyo`);

  if (!checkOnly) {
    await ensureBucket(bucket);
    const queue = [...source];
    let done = 0;
    await Promise.all(
      Array.from({ length: PARALLEL }, async () => {
        for (let file = queue.shift(); file; file = queue.shift()) {
          try {
            await copyOne(bucket, file);
          } catch (err) {
            failed++;
            console.error(String(err.message ?? err));
          }
          done++;
          if (done % 100 === 0) console.log(`  ${done}/${source.length}`);
        }
      })
    );
  }

  const copied = await listAll(to, bucket);
  const copiedTotal = copied.reduce((sum, f) => sum + f.size, 0);
  const missing = source.filter((f) => !copied.some((c) => c.path === f.path)).length;
  console.log(`${bucket}: ${copied.length} files, ${mb(copiedTotal)} in Singapore; missing ${missing}`);
  if (missing > 0) failed++;
}

if (failed > 0) {
  console.error(`NOT COMPLETE: ${failed} problem(s) above. Safe to run again (uploads overwrite).`);
  process.exit(1);
}
console.log("photos: complete");
