// Starts the nightly photo backup: calls the photo-backup Edge Function in
// Singapore until it reports no copies left, then fails (exit 1, so GitHub
// emails the repository's owner) if any call reported a problem. Run by
// .github/workflows/photo-backup.yml; plain Node, no packages.
//
//   PHOTO_BACKUP_FUNCTION_URL=https://<ref>.supabase.co/functions/v1/photo-backup \
//   PHOTO_BACKUP_TRIGGER_SECRET=... node scripts/photo-backup/trigger.mjs [--dry-run] [--allow-mass-delete]
//
// The function answers with counts only; this prints them and never the
// secret. x-region pins the call to Singapore, where the photos are: Supabase
// otherwise runs a function near the caller, and GitHub's runners are in the
// United States.
import { appendFileSync, writeFileSync } from "node:fs";

const MAX_CALLS = 40;
const url = process.env.PHOTO_BACKUP_FUNCTION_URL;
const secret = process.env.PHOTO_BACKUP_TRIGGER_SECRET;
const region = process.env.PHOTO_BACKUP_FUNCTION_REGION || "ap-southeast-1";
const dryRun = process.argv.includes("--dry-run");
const allowMassDelete = process.argv.includes("--allow-mass-delete");

if (!url || !secret) {
  console.error("Missing PHOTO_BACKUP_FUNCTION_URL or PHOTO_BACKUP_TRIGGER_SECRET (see docs/photo-backups.md).");
  process.exit(1);
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const total = { copied: 0, copiedBytes: 0, removed: 0, failed: 0, heldBack: 0 };
const problems = [];
let last = null;
let calls = 0;

for (;;) {
  calls++;
  let body;
  let status = 0;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-photo-backup-secret": secret, "x-region": region },
      body: JSON.stringify({ dryRun, allowMassDelete }),
      signal: AbortSignal.timeout(450_000),
    });
    status = res.status;
    body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}, not JSON` }));
  } catch (err) {
    body = { ok: false, error: `call failed: ${err?.message ?? err}` };
  }

  const s = body.summary;
  if (s) {
    last = s;
    total.copied += s.copied;
    total.copiedBytes += s.copiedBytes;
    total.removed += s.removed;
    total.failed += s.failed;
    total.heldBack = s.heldBack;
    console.log(
      `call ${calls}: copied ${s.copied} (${mb(s.copiedBytes)}), unchanged ${s.unchanged}, removed ${s.removed}, ` +
        `failed ${s.failed}, left ${body.remaining ?? "?"}`
    );
    if (s.refusal) problems.push(`held back: ${s.refusal}`);
  } else {
    console.log(`call ${calls}: HTTP ${status}`);
  }
  if (body.error) problems.push(String(body.error).slice(0, 300));
  if (body.ok === false && !body.error && !s?.refusal && !(s?.failed > 0)) problems.push("the function reported not ok");

  // Keep going while copies are left, even past a failed photo or held-back
  // removals (copies still go ahead); stop when the call itself failed.
  if (!body.summary || body.error || !(body.remaining > 0) || dryRun) break;
  if (calls >= MAX_CALLS) {
    problems.push(`still ${body.remaining} copies left after ${MAX_CALLS} calls; the next night continues`);
    break;
  }
}

if (total.failed > 0) problems.push(`${total.failed} photo(s) failed to copy or remove; they are retried tomorrow`);
const ok = problems.length === 0;
const summary = { ok, dryRun, calls, ...total, source: last?.source ?? null, problems };
writeFileSync("photo-backup-summary.json", JSON.stringify(summary, null, 2));

const rows = Object.entries(last?.source ?? {})
  .map(([b, c]) => `| ${b} | ${c.objects} | ${mb(c.bytes)} |`)
  .join("\n");
const report = [
  `## Photo backup${dryRun ? " (dry run)" : ""}: ${ok ? "complete" : "NOT complete"}`,
  "",
  rows ? "| Bucket | Photos in Miamus | Size |\n|---|---|---|\n" + rows : "",
  "",
  `${dryRun ? "Would copy" : "Copied"} ${total.copied} (${mb(total.copiedBytes)}), ${dryRun ? "would remove" : "removed"} ${total.removed}, failed ${total.failed}, in ${calls} call(s).`,
  ...problems.map((p) => `- **${p}**`),
  "",
].join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
if (!ok) {
  console.error("PHOTO BACKUP NOT COMPLETE. What to do: docs/photo-backups.md, 'When the backup fails'.");
  process.exit(1);
}
