import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isPhotoBucket } from "@/lib/photos";
import {
  PHOTO_BUCKETS,
  backupKey,
  eachLimited,
  inScope,
  manifestKey,
  normalizeEtag,
  parseBackupArgs,
  parseBackupKey,
  parseRestoreArgs,
  pickRestoreVersions,
  planBackup,
  requireEnv,
  restorePrefixes,
  sameContent,
  scrubError,
  summarize,
  runBackup,
  type BackupDeps,
  type BackupObject,
  type Manifest,
  type ObjectVersion,
  type SourceObject,
} from "../../supabase/functions/_shared/photo-backup";

const HH = "6f1c2d3e-4a5b-4c6d-8e7f-001122334455";
const HH2 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const md5 = (n: number) => n.toString(16).padStart(32, "0");

const src = (bucket: string, path: string, size = 100, etag: string | null = `"${md5(size)}"`): SourceObject => ({
  bucket,
  path,
  size,
  etag,
});
const bak = (key: string, size = 100, etag: string | null = `"${md5(size)}"`): BackupObject => ({ key, size, etag });

describe("photo buckets", () => {
  it("covers every bucket the migrations create", () => {
    const dir = join(__dirname, "../../supabase/migrations");
    const created = new Set<string>();
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
      const sql = readFileSync(join(dir, file), "utf8");
      for (const m of sql.matchAll(/insert into storage\.buckets[^;]*?values\s*\(\s*'([^']+)'/gi)) created.add(m[1]);
    }
    expect(created.size).toBeGreaterThan(0);
    for (const bucket of created) expect(PHOTO_BUCKETS).toContain(bucket);
  });

  it("matches the buckets the app serves photos from", () => {
    for (const bucket of PHOTO_BUCKETS) expect(isPhotoBucket(bucket)).toBe(true);
    expect(isPhotoBucket("not-a-bucket")).toBe(false);
  });

  it("is the list migration 179 lets the reader read", () => {
    const sql = readFileSync(join(__dirname, "../../supabase/migrations/179_photo_backup_reader.sql"), "utf8");
    const listed = /bucket_id in \(([^)]*)\)/.exec(sql)![1].match(/'([^']+)'/g)!.map((s) => s.slice(1, -1));
    expect([...listed].sort()).toEqual([...PHOTO_BUCKETS].sort());
  });
});

describe("backup keys", () => {
  it("is the bucket and the path, unchanged, so a restore lands where rows point", () => {
    const path = `${HH}/pets/1731400000000-abc123.jpg`;
    expect(backupKey("household-logs", path)).toBe(`household-logs/${path}`);
    expect(parseBackupKey(`household-logs/${path}`)).toEqual({ bucket: "household-logs", path });
  });

  it("keeps old photos with no household folder", () => {
    expect(parseBackupKey("household-logs/task-proof/1.jpg")).toEqual({
      bucket: "household-logs",
      path: "task-proof/1.jpg",
    });
  });

  it("ignores manifests, unknown buckets and folders", () => {
    expect(parseBackupKey("_manifests/2026-11-20.json")).toBeNull();
    expect(parseBackupKey("other-bucket/x.jpg")).toBeNull();
    expect(parseBackupKey("household-logs/")).toBeNull();
    expect(parseBackupKey("household-logs/folder/")).toBeNull();
    expect(parseBackupKey("household-logs")).toBeNull();
  });
});

describe("etags", () => {
  it("compares plain MD5s, quoted or not, any case", () => {
    expect(normalizeEtag(`"${md5(1).toUpperCase()}"`)).toBe(md5(1));
    expect(normalizeEtag(`W/"${md5(2)}"`)).toBe(md5(2));
  });

  it("refuses multipart and missing etags", () => {
    expect(normalizeEtag(`"${md5(3)}-4"`)).toBeNull();
    expect(normalizeEtag(null)).toBeNull();
    expect(normalizeEtag("")).toBeNull();
  });

  it("sameContent: size must match; MD5 too when both sides have one", () => {
    expect(sameContent(src("household-logs", "a", 10), bak("household-logs/a", 10))).toBe(true);
    expect(sameContent(src("household-logs", "a", 10), bak("household-logs/a", 11))).toBe(false);
    expect(sameContent(src("household-logs", "a", 10, `"${md5(1)}"`), bak("household-logs/a", 10, `"${md5(2)}"`))).toBe(false);
    expect(sameContent(src("household-logs", "a", 10, `"${md5(1)}-2"`), bak("household-logs/a", 10, `"${md5(2)}"`))).toBe(true);
  });
});

describe("planBackup", () => {
  it("copies what is new or changed, leaves the rest", () => {
    const plan = planBackup(
      [
        src("household-logs", `${HH}/a.jpg`, 10),
        src("household-logs", `${HH}/b.jpg`, 20),
        src("owner-receipts", `${HH}/r.jpg`, 30),
      ],
      [bak(`household-logs/${HH}/a.jpg`, 10), bak(`household-logs/${HH}/b.jpg`, 21)]
    );
    expect(plan.copy.map((c) => c.path)).toEqual([`${HH}/b.jpg`, `${HH}/r.jpg`]);
    expect(plan.unchanged).toBe(1);
    expect(plan.remove).toEqual([]);
    expect(plan.refusal).toBeNull();
  });

  it("removes from the backup what Supabase no longer has", () => {
    const sources = Array.from({ length: 100 }, (_, i) => src("household-logs", `${HH}/${i}.jpg`));
    const backups = [...sources.map((s) => bak(backupKey(s.bucket, s.path))), bak(`household-logs/${HH}/gone.jpg`)];
    const plan = planBackup(sources, backups);
    expect(plan.remove).toEqual([`household-logs/${HH}/gone.jpg`]);
    expect(plan.refusal).toBeNull();
  });

  it("never touches manifests or keys outside the photo buckets", () => {
    const plan = planBackup([src("household-logs", "a.jpg")], [
      bak("household-logs/a.jpg"),
      bak("_manifests/2026-11-20.json"),
      bak("stray/file.txt"),
    ]);
    expect(plan.remove).toEqual([]);
  });

  it("holds removals back when a bucket reads as empty but has backups (a lost permission)", () => {
    const plan = planBackup(
      [src("household-logs", "a.jpg")],
      [bak("household-logs/a.jpg"), bak(`owner-receipts/${HH}/r.jpg`)]
    );
    expect(plan.remove).toEqual([`owner-receipts/${HH}/r.jpg`]);
    expect(plan.refusal).toMatch(/owner-receipts read as empty/);
  });

  it("holds removals back when everything reads as empty", () => {
    const plan = planBackup([], [bak("household-logs/a.jpg")]);
    expect(plan.refusal).not.toBeNull();
  });

  it("holds back more than 10% at once, above the floor of 50", () => {
    const keep = Array.from({ length: 400 }, (_, i) => src("household-logs", `${HH}/${i}.jpg`));
    const gone = Array.from({ length: 60 }, (_, i) => bak(`household-logs/${HH2}/${i}.jpg`));
    const backups = [...keep.map((s) => bak(backupKey(s.bucket, s.path))), ...gone];
    const plan = planBackup(keep, backups);
    expect(plan.remove).toHaveLength(60);
    expect(plan.refusal).toMatch(/60 of 460/);
    // Still copies: the plan holds back removals only.
    const withNew = planBackup([...keep, src("household-logs", `${HH}/new.jpg`)], backups);
    expect(withNew.copy).toHaveLength(1);
    expect(withNew.refusal).not.toBeNull();
  });

  it("lets a person allow it", () => {
    const keep = Array.from({ length: 400 }, (_, i) => src("household-logs", `${HH}/${i}.jpg`));
    const gone = Array.from({ length: 60 }, (_, i) => bak(`household-logs/${HH2}/${i}.jpg`));
    const plan = planBackup(keep, [...keep.map((s) => bak(backupKey(s.bucket, s.path))), ...gone], {
      allowMassDelete: true,
    });
    expect(plan.refusal).toBeNull();
    expect(plan.remove).toHaveLength(60);
  });

  it("does not hold back a large share below the floor (a small backup's normal night)", () => {
    const keep = Array.from({ length: 20 }, (_, i) => src("household-logs", `${HH}/${i}.jpg`));
    const gone = Array.from({ length: 10 }, (_, i) => bak(`household-logs/${HH}/old-${i}.jpg`));
    const plan = planBackup(keep, [...keep.map((s) => bak(backupKey(s.bucket, s.path))), ...gone]);
    expect(plan.remove).toHaveLength(10);
    expect(plan.refusal).toBeNull();
  });
});

describe("manifest", () => {
  const manifest: Manifest = {
    kind: "miamus-photo-backup",
    version: 1,
    startedAt: "2026-11-20T19:17:00.000Z",
    finishedAt: "2026-11-20T19:18:00.000Z",
    dryRun: false,
    source: { "household-logs": { objects: 2, bytes: 300 } },
    unchanged: 1,
    copied: [{ key: `household-logs/${HH}/a.jpg`, size: 200 }],
    removed: [`household-logs/${HH}/old.jpg`],
    heldBack: [],
    failed: [],
    refusal: null,
  };

  it("summarizes with counts only: no paths, no household ids", () => {
    const summary = summarize(manifest);
    expect(summary).toMatchObject({ copied: 1, copiedBytes: 200, removed: 1, failed: 0, ok: true });
    expect(JSON.stringify(summary)).not.toContain(HH);
  });

  it("is not ok when something failed or was held back", () => {
    expect(summarize({ ...manifest, failed: [{ key: "k", error: "e" }] }).ok).toBe(false);
    expect(summarize({ ...manifest, refusal: "too many" }).ok).toBe(false);
  });

  it("is stored under _manifests/ by start time", () => {
    expect(manifestKey(manifest.startedAt, false)).toBe("_manifests/2026-11-20T19-17-00-000Z.json");
    expect(manifestKey(manifest.startedAt, true)).toMatch(/-dry-run\.json$/);
  });
});

describe("scrubError", () => {
  it("hides object paths and household ids", () => {
    const out = scrubError(`Object not found: ${HH}/pets/1.jpg (household ${HH2})`, [`${HH}/pets/1.jpg`]);
    expect(out).not.toContain(HH);
    expect(out).not.toContain(HH2);
    expect(out).toContain("<object>");
  });

  it("cuts long messages", () => {
    expect(scrubError("x".repeat(500)).length).toBeLessThanOrEqual(201);
  });
});

describe("restore scope", () => {
  it("lists one prefix per bucket for everything or a household, the key for one object", () => {
    expect(restorePrefixes({ kind: "all" })).toEqual(PHOTO_BUCKETS.map((b) => `${b}/`));
    expect(restorePrefixes({ kind: "household", householdId: HH })).toEqual(PHOTO_BUCKETS.map((b) => `${b}/${HH}/`));
    expect(restorePrefixes({ kind: "object", bucket: "owner-receipts", path: `${HH}/r.jpg` })).toEqual([
      `owner-receipts/${HH}/r.jpg`,
    ]);
  });

  it("keeps a household's photos in every bucket, and no one else's", () => {
    const scope = { kind: "household", householdId: HH } as const;
    expect(inScope(`household-logs/${HH}/a.jpg`, scope)).toBe(true);
    expect(inScope(`owner-receipts/${HH}/r.jpg`, scope)).toBe(true);
    expect(inScope(`household-logs/${HH2}/a.jpg`, scope)).toBe(false);
    expect(inScope(`household-logs/${HH}x/a.jpg`, scope)).toBe(false);
    expect(inScope(`_manifests/x.json`, { kind: "all" })).toBe(false);
  });

  it("an object scope is exact (a prefix match is not enough)", () => {
    const scope = { kind: "object", bucket: "household-logs", path: `${HH}/a.jpg` } as const;
    expect(inScope(`household-logs/${HH}/a.jpg`, scope)).toBe(true);
    expect(inScope(`household-logs/${HH}/a.jpg.bak`, scope)).toBe(false);
  });
});

describe("pickRestoreVersions", () => {
  const t = (iso: string) => new Date(iso);
  const v = (key: string, id: string, at: string, deleteMarker = false): ObjectVersion => ({
    key,
    versionId: id,
    lastModified: t(at),
    deleteMarker,
    size: deleteMarker ? 0 : 100,
  });
  const A = `household-logs/${HH}/a.jpg`;
  const B = `household-logs/${HH}/b.jpg`;
  const versions = [
    v(A, "a1", "2026-11-01T00:00:00Z"),
    v(A, "a2", "2026-11-05T00:00:00Z"),
    v(B, "b1", "2026-11-02T00:00:00Z"),
    v(B, "bx", "2026-11-10T00:00:00Z", true), // deleted on the 10th
    v("_manifests/x.json", "m1", "2026-11-02T00:00:00Z"),
  ];

  it("now: the newest of each, skipping what was deleted", () => {
    expect(pickRestoreVersions(versions).map((p) => p.versionId)).toEqual(["a2"]);
  });

  it("include deleted: brings a deleted photo back from its last real version", () => {
    expect(pickRestoreVersions(versions, { includeDeleted: true }).map((p) => p.versionId)).toEqual(["a2", "b1"]);
  });

  it("at a time: the backup as it stood then", () => {
    expect(pickRestoreVersions(versions, { at: t("2026-11-03T00:00:00Z") }).map((p) => p.versionId)).toEqual([
      "a1",
      "b1",
    ]);
    expect(pickRestoreVersions(versions, { at: t("2026-10-01T00:00:00Z") })).toEqual([]);
  });

  it("a photo deleted and never really there yields nothing, even with include deleted", () => {
    expect(pickRestoreVersions([v(A, "x", "2026-11-01T00:00:00Z", true)], { includeDeleted: true })).toEqual([]);
  });
});

describe("command lines", () => {
  it("backup: dry run and allow mass delete, nothing else", () => {
    expect(parseBackupArgs([])).toEqual({ dryRun: false, allowMassDelete: false });
    expect(parseBackupArgs(["--dry-run", "--allow-mass-delete"])).toEqual({ dryRun: true, allowMassDelete: true });
    expect(() => parseBackupArgs(["--delete-everything"])).toThrow(/Unknown option/);
  });

  it("restore: dry run unless --apply", () => {
    expect(parseRestoreArgs(["--all"])).toEqual({
      scope: { kind: "all" },
      apply: false,
      overwrite: false,
      includeDeleted: false,
    });
    expect(parseRestoreArgs(["--household", HH.toUpperCase(), "--include-deleted", "--apply"])).toMatchObject({
      scope: { kind: "household", householdId: HH },
      apply: true,
      includeDeleted: true,
    });
    expect(parseRestoreArgs(["--object", `owner-receipts/${HH}/r.jpg`, "--at", "2026-11-01T00:00:00Z"])).toMatchObject({
      scope: { kind: "object", bucket: "owner-receipts", path: `${HH}/r.jpg` },
      at: new Date("2026-11-01T00:00:00Z"),
    });
  });

  it("restore: refuses vague or mixed requests", () => {
    expect(() => parseRestoreArgs([])).toThrow(/Say what to restore/);
    expect(() => parseRestoreArgs(["--all", "--household", HH])).toThrow(/Choose one/);
    expect(() => parseRestoreArgs(["--household", "not-a-uuid"])).toThrow(/UUID/);
    expect(() => parseRestoreArgs(["--object", "stray/x.jpg"])).toThrow(/bucket/);
    expect(() => parseRestoreArgs(["--all", "--at", "yesterday-ish"])).toThrow(/not a time/);
    expect(() => parseRestoreArgs(["--household"])).toThrow(/needs a value/);
  });
});

describe("requireEnv", () => {
  it("names every missing variable and never a value", () => {
    expect(() => requireEnv({ A: "secret-value" }, ["A", "B", "C"])).toThrow("Missing environment variables: B, C");
    try {
      requireEnv({ A: "secret-value" }, ["A", "B"]);
    } catch (err) {
      expect(String(err)).not.toContain("secret-value");
    }
    expect(requireEnv({ A: "1" }, ["A"])).toEqual({ A: "1" });
  });
});

describe("eachLimited", () => {
  it("runs every item, never more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    const seen: number[] = [];
    await eachLimited([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 2));
      seen.push(n);
      running--;
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("handles an empty list", async () => {
    await eachLimited([], 4, async () => {
      throw new Error("never");
    });
  });
});

describe("runBackup", () => {
  type Store = Map<string, number>;
  function fakeDeps(source: SourceObject[], backup: Store, opts: { failCopy?: (path: string) => boolean } = {}) {
    const logs: string[] = [];
    const manifests: string[] = [];
    const deps: BackupDeps = {
      listSource: async (bucket) => source.filter((s) => s.bucket === bucket),
      listBackup: async (prefix) =>
        [...backup.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, size]) => ({ key, size, etag: null })),
      copy: async (file, key) => {
        if (opts.failCopy?.(file.path)) throw new Error(`Object not found: ${file.path}`);
        backup.set(key, file.size);
        return file.size;
      },
      removeMany: async (keys) => {
        for (const k of keys) backup.delete(k);
        return [];
      },
      putJson: async (key) => {
        manifests.push(key);
      },
      log: (m) => logs.push(m),
    };
    return { deps, logs, manifests };
  }
  const photos = (n: number, house = HH) =>
    Array.from({ length: n }, (_, i) => src(PHOTO_BUCKETS[i % 3], `${house}/f/${i}.jpg`, 100 + i, null));

  it("copies everything new, writes a manifest, logs counts but no paths", async () => {
    const backup: Store = new Map();
    const { deps, logs, manifests } = fakeDeps(photos(9), backup);
    const { summary, remaining } = await runBackup(deps, { now: () => 0 });
    expect(summary).toMatchObject({ copied: 9, failed: 0, ok: true });
    expect(remaining).toBe(0);
    expect(backup.size).toBe(9);
    expect(manifests).toHaveLength(1);
    expect(logs.join("\n")).not.toContain(HH);
  });

  it("dry run: changes nothing and writes no manifest", async () => {
    const backup: Store = new Map([[`household-logs/${HH}/gone.jpg`, 5]]);
    const { deps, manifests } = fakeDeps(photos(3), backup);
    const { summary } = await runBackup(deps, { dryRun: true });
    expect(summary).toMatchObject({ dryRun: true, copied: 3, removed: 1 });
    expect([...backup.keys()]).toEqual([`household-logs/${HH}/gone.jpg`]);
    expect(manifests).toHaveLength(0);
  });

  it("stops at the deadline, leaves the rest, and removes nothing until every copy is done", async () => {
    let clock = 0;
    const backup: Store = new Map([[`household-logs/${HH}/gone.jpg`, 5]]);
    const source = photos(30);
    const { deps } = fakeDeps(source, backup);
    deps.copy = async (file, key) => {
      clock += 10;
      backup.set(key, file.size);
      return file.size;
    };
    const first = await runBackup(deps, { now: () => clock, deadline: 50, parallel: 2 });
    expect(first.remaining).toBeGreaterThan(0);
    expect(first.summary.removed).toBe(0);
    expect(backup.has(`household-logs/${HH}/gone.jpg`)).toBe(true);

    let calls = 1;
    let last = first;
    while (last.remaining > 0 && calls < 20) {
      last = await runBackup(deps, { now: () => clock, deadline: clock + 50, parallel: 2 });
      calls++;
    }
    expect(last.remaining).toBe(0);
    expect(last.summary.removed).toBe(1);
    expect(backup.size).toBe(30);
  });

  it("always makes progress, even past the deadline", async () => {
    const backup: Store = new Map();
    const { deps } = fakeDeps(photos(5), backup);
    const r = await runBackup(deps, { now: () => 1000, deadline: 0, parallel: 1 });
    expect(r.summary.copied).toBe(1);
    expect(r.remaining).toBe(4);
  });

  it("counts a failed photo, keeps going, and reports not ok with the path hidden", async () => {
    const backup: Store = new Map();
    const { deps, logs } = fakeDeps(photos(6), backup, { failCopy: (p) => p.endsWith("/2.jpg") });
    const { summary, manifest } = await runBackup(deps);
    expect(summary).toMatchObject({ copied: 5, failed: 1, ok: false });
    expect(manifest.failed[0].error).not.toContain(HH);
    expect(logs.join("\n")).not.toContain(HH);
  });

  it("holds removals back on a bucket that reads as empty, and reports not ok", async () => {
    const backup: Store = new Map([[`owner-receipts/${HH}/r.jpg`, 5]]);
    const { deps } = fakeDeps([src("household-logs", `${HH}/a.jpg`)], backup);
    const { summary } = await runBackup(deps);
    expect(summary.ok).toBe(false);
    expect(summary.heldBack).toBe(1);
    expect(backup.has(`owner-receipts/${HH}/r.jpg`)).toBe(true);
  });

  it("a listing error stops the run (never treated as an empty bucket)", async () => {
    const backup: Store = new Map([[`household-logs/${HH}/a.jpg`, 5]]);
    const { deps } = fakeDeps([], backup);
    deps.listSource = async () => {
      throw new Error("Could not list household-logs: permission denied");
    };
    await expect(runBackup(deps)).rejects.toThrow(/Could not list/);
    expect(backup.size).toBe(1);
  });
});
