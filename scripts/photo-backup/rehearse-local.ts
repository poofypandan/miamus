/**
 * The restore drill, end to end, on the LOCAL Supabase only (refuses any
 * other host). Seeds test photos in all three buckets for two made-up
 * households, backs them up into a local S3 bucket (the local Supabase's own
 * S3 endpoint stands in for AWS), then rehearses, timing each step:
 *
 *   1. one photo deleted by mistake, put back (--object);
 *   2. a whole household's photos lost, put back (--household), byte for byte;
 *   3. the mass-delete guard: a night that would remove too much holds back;
 *   4. the lost-permission guard: a reader that sees nothing removes nothing.
 *
 * Then removes everything it made. What it can't rehearse here is S3
 * versioning (--at, --include-deleted): the unit tests cover the choice of
 * version, and the staging drill (docs/photo-backups.md) covers AWS.
 *
 * Needs migration 179 applied locally and `npx supabase status` running:
 *   npx tsx scripts/photo-backup/rehearse-local.ts
 */
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { PHOTO_BUCKETS } from "../../supabase/functions/_shared/photo-backup";

const status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" }));
const url: string = status.API_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error(`Not local: ${url}. This drill only runs locally.`);

const HOUSE_1 = "00000000-0000-4000-8179-000000000001";
const HOUSE_2 = "00000000-0000-4000-8179-000000000002";
const PER_HOUSE = 150; // photos per household, split over the buckets
const BUCKET = `photo-backup-drill-${randomBytes(3).toString("hex")}`;
const READER = `photo-backup-drill-${randomBytes(3).toString("hex")}@test.local`;
const PASSWORD = randomBytes(24).toString("hex");

const admin = createClient(url, status.SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const work = mkdtempSync(join(tmpdir(), "photo-drill-"));
const env = {
  ...process.env,
  SUPABASE_URL: url,
  SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  BACKUP_READER_EMAIL: READER,
  BACKUP_READER_PASSWORD: PASSWORD,
  BACKUP_S3_BUCKET: BUCKET,
  BACKUP_S3_REGION: status.S3_PROTOCOL_REGION,
  BACKUP_S3_ENDPOINT: status.STORAGE_S3_URL,
  BACKUP_S3_ACCESS_KEY_ID: status.S3_PROTOCOL_ACCESS_KEY_ID,
  BACKUP_S3_SECRET_ACCESS_KEY: status.S3_PROTOCOL_ACCESS_KEY_SECRET,
  BACKUP_S3_RESTORE_ACCESS_KEY_ID: status.S3_PROTOCOL_ACCESS_KEY_ID,
  BACKUP_S3_RESTORE_SECRET_ACCESS_KEY: status.S3_PROTOCOL_ACCESS_KEY_SECRET,
  TARGET_SUPABASE_URL: url,
  TARGET_SUPABASE_SECRET_KEY: status.SECRET_KEY,
};
const here = new URL(".", import.meta.url).pathname;

function run(script: "backup" | "restore", args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync("npx", ["tsx", join(here, `${script}.ts`), ...args], {
      env,
      cwd: work,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    lastOut = out;
    return { code: 0, out };
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string };
    lastOut = `${e.stdout}${e.stderr}`;
    return { code: e.status, out: lastOut };
  }
}

let lastOut = "";
function step(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) {
    process.exitCode = 1;
    console.log(lastOut.trim().split("\n").slice(-6).map((l) => `       | ${l}`).join("\n"));
  }
}

async function timed<T>(fn: () => T | Promise<T>): Promise<[T, string]> {
  const t = Date.now();
  const r = await fn();
  return [r, `${((Date.now() - t) / 1000).toFixed(1)} s`];
}

const md5 = (b: Uint8Array) => createHash("md5").update(b).digest("hex");
const seeded = new Map<string, string>(); // "<bucket>/<path>" -> md5

async function listHouse(house: string) {
  const out: { bucket: string; path: string }[] = [];
  for (const bucket of PHOTO_BUCKETS) {
    const { data: folders } = await admin.storage.from(bucket).list(house, { limit: 1000 });
    for (const folder of folders ?? []) {
      const { data } = await admin.storage.from(bucket).list(`${house}/${folder.name}`, { limit: 1000 });
      for (const f of data ?? []) out.push({ bucket, path: `${house}/${folder.name}/${f.name}` });
    }
  }
  return out;
}

async function removeHouse(house: string) {
  for (const { bucket, path } of await listHouse(house)) await admin.storage.from(bucket).remove([path]);
}

async function main() {
  // Setup: the reader account (as the owner steps make it) and the bucket.
  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: READER,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { miamus_role: "photo_backup_reader" },
  });
  if (userError) throw userError;
  const { error: bucketError } = await admin.storage.createBucket(BUCKET, { public: false });
  if (bucketError) throw bucketError;

  try {
    // Seed: ~185 KB each, as the app's resized photos are.
    const [, seedTime] = await timed(async () => {
      for (const house of [HOUSE_1, HOUSE_2]) {
        for (let i = 0; i < PER_HOUSE; i++) {
          const bucket = PHOTO_BUCKETS[i % PHOTO_BUCKETS.length];
          const path = `${house}/drill/${Date.now()}-${i}.jpg`;
          const body = randomBytes(185 * 1024);
          const { error } = await admin.storage.from(bucket).upload(path, body, { contentType: "image/jpeg" });
          if (error) throw new Error(`seed: ${error.message}`);
          seeded.set(`${bucket}/${path}`, md5(body));
        }
      }
    });
    console.log(`seeded ${seeded.size} photos (${seedTime})`);

    // The first, full backup.
    const [first, firstTime] = await timed(() => run("backup", []));
    step("first backup", first.code === 0 && /failed 0/.test(first.out), firstTime);
    const [again, againTime] = await timed(() => run("backup", []));
    step("next night copies nothing new", again.code === 0 && /copy 0,/.test(again.out), againTime);

    // 1. One photo deleted by mistake.
    const [oneKey, oneMd5] = [...seeded.entries()][7];
    const slash = oneKey.indexOf("/");
    const [oneBucket, onePath] = [oneKey.slice(0, slash), oneKey.slice(slash + 1)];
    await admin.storage.from(oneBucket).remove([onePath]);
    const dry = run("restore", ["--object", oneKey]);
    step("restore one photo: the dry run finds it and writes nothing", /1 photos to restore/.test(dry.out) &&
      !(await admin.storage.from(oneBucket).download(onePath)).data);
    const [one, oneTime] = await timed(() => run("restore", ["--object", oneKey, "--apply"]));
    const back = (await admin.storage.from(oneBucket).download(onePath)).data;
    step("restore one photo: back, same bytes", one.code === 0 && !!back && md5(new Uint8Array(await back.arrayBuffer())) === oneMd5, oneTime);

    // 2. A whole household lost.
    const before = (await listHouse(HOUSE_1)).length;
    await removeHouse(HOUSE_1);
    step("household 1 removed from Supabase", (await listHouse(HOUSE_1)).length === 0);
    const [house, houseTime] = await timed(() => run("restore", ["--household", HOUSE_1, "--apply"]));
    const after = await listHouse(HOUSE_1);
    let same = after.length === before;
    for (const { bucket, path } of after) {
      const { data } = await admin.storage.from(bucket).download(path);
      if (!data || md5(new Uint8Array(await data.arrayBuffer())) !== seeded.get(`${bucket}/${path}`)) same = false;
    }
    step(`restore household: ${after.length}/${before} photos back, every one byte for byte`, house.code === 0 && same, houseTime);
    const rerun = run("restore", ["--household", HOUSE_1, "--apply"]);
    step("restoring again is safe (already there, left alone)", rerun.code === 0 && /restored 0, already there/.test(rerun.out));
    const household2 = run("restore", ["--household", HOUSE_2]);
    step("a household restore sees only that household's photos", /backup: 150 photos to restore/.test(household2.out));

    // 3. The mass-delete guard.
    await removeHouse(HOUSE_2);
    const held = run("backup", []);
    step("a night that would remove 150 of 300+ holds back and fails", held.code === 1 && /HELD BACK/.test(held.out));
    const restoreAfterHold = run("restore", ["--household", HOUSE_2, "--apply"]);
    step("held back means still restorable", restoreAfterHold.code === 0 && /restored 150/.test(restoreAfterHold.out));

    // 4. The lost-permission guard: the reader loses its role.
    await admin.auth.admin.updateUserById(created.user.id, { app_metadata: { miamus_role: null } });
    const blind = run("backup", []);
    step("a reader that sees nothing removes nothing and fails", blind.code === 1 && /read as empty/.test(blind.out));
    await admin.auth.admin.updateUserById(created.user.id, { app_metadata: { miamus_role: "photo_backup_reader" } });

    // Real removals, when a person allows them.
    await removeHouse(HOUSE_2);
    const allowed = run("backup", ["--allow-mass-delete"]);
    step("allow_mass_delete removes them", allowed.code === 0 && /removed 150/.test(allowed.out));

    const summary = JSON.parse(readFileSync(join(work, "photo-backup-summary.json"), "utf8"));
    step("the summary has counts only", !JSON.stringify(summary).includes(HOUSE_1));
  } finally {
    await removeHouse(HOUSE_1);
    await removeHouse(HOUSE_2);
    await admin.storage.emptyBucket(BUCKET);
    await admin.storage.deleteBucket(BUCKET);
    await admin.auth.admin.deleteUser(created.user.id);
    rmSync(work, { recursive: true, force: true });
    console.log("cleaned up");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
