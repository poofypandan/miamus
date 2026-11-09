import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Phase 161 (R10): saves wait on the phone until they reach the server, a
// weak signal counts as well as "offline", and nothing is saved twice.

const memory = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (key: string) => structuredClone(memory.get(key)),
  set: async (key: string, value: unknown) => void memory.set(key, structuredClone(value)),
  update: async (key: string, change: (old: unknown) => unknown) =>
    void memory.set(key, structuredClone(change(structuredClone(memory.get(key))))),
}));

const provider = {
  createLogsBatch: vi.fn(),
  createFoodItem: vi.fn(),
  materialiseChoreOccurrence: vi.fn(),
  updateHouseholdTaskStatus: vi.fn(),
};
vi.mock("@/lib/data", () => ({ dataProvider: provider }));

vi.mock("@/lib/photo-queue", () => {
  class PhotoNotUploadedError extends Error {
    constructor(readonly reason: "pending" | "failed") {
      super(reason);
      this.name = "PhotoNotUploadedError";
    }
  }
  return { PhotoNotUploadedError, ensureUploaded: vi.fn(async () => undefined) };
});

let household = "house-a";
vi.mock("@/lib/tenant", () => ({ getActiveHouseholdId: () => household }));

const queue = await import("@/lib/offline-queue");
const photos = (await import("@/lib/photo-queue")) as unknown as {
  ensureUploaded: ReturnType<typeof vi.fn>;
  PhotoNotUploadedError: new (reason: "pending" | "failed") => Error;
};
const { outboxView, overlay, pendingChoreRowId } = await import("@/lib/outbox-view");
const { isTableWrite } = await import("@/lib/supabase/write-timeout");

const NO_ANSWER = { message: "TypeError: Failed to fetch", details: "", hint: "", code: "" };
const LOST_REPLY = { code: "23505", message: 'duplicate key value violates unique constraint "task_logs_pkey"' };

function logJob(entity = "dog-1", photo: string | null = null): import("@/lib/offline-queue").OutboxJob {
  return {
    kind: "logs",
    payload: {
      entries: [{ schedule_id: "s1", entity_id: entity }],
      module: "pet",
      photo_url: photo,
      completed_at: "2026-11-09T01:00:00.000Z",
      staff_id: "staff-1",
    },
    ids: [`id-${entity}`],
  };
}

function choreJob(): import("@/lib/offline-queue").ChoreFinishJob {
  return {
    kind: "chore",
    templateId: "tpl-1",
    date: "2026-11-09",
    rowId: null,
    assignedTo: "staff-1",
    before: "https://x/before.jpg",
    after: "https://x/after.jpg",
    completedBy: "staff-1",
    completedAt: "2026-11-09T02:00:00.000Z",
    title: "Sapu teras",
  };
}

async function stored() {
  return queue.getOfflineQueue();
}

beforeEach(() => {
  memory.clear();
  household = "house-a";
  (globalThis as { indexedDB?: unknown }).indexedDB = {};
  for (const fn of Object.values(provider)) fn.mockReset();
  photos.ensureUploaded.mockReset();
  photos.ensureUploaded.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("telling failures apart", () => {
  it.each([
    ["no answer (PostgREST's shape)", NO_ANSWER, true],
    ["fetch rejecting", new TypeError("Failed to fetch"), true],
    ["our write timeout", Object.assign(new Error("The save timed out"), { name: "TimeoutError" }), true],
    ["a gateway briefly down", { message: "upstream", code: "", status: 503 }, true],
    ["a proxy's HTML error page", { message: "<html>Bad gateway</html>" }, true],
    ["a token not renewed yet", { code: "PGRST301", message: "JWT expired" }, true],
    ["a photo still on the phone", new photos.PhotoNotUploadedError("pending"), true],
    ["a photo storage refused", new photos.PhotoNotUploadedError("failed"), false],
    ["a permission refusal", { code: "42501", message: "chore_owner_only", status: 403 }, false],
    ["a check constraint", { code: "23514", message: "food_needs_name_or_photo", status: 400 }, false],
    ["staff removed from the house", { code: "P0001", message: "staff_archived", status: 400 }, false],
    ["a database error", { code: "XX000", message: "internal", status: 500 }, false],
    ["our own thrown error", new Error("Chore was not updated"), false],
  ])("%s → retry: %s", (_label, err, expected) => {
    expect(queue.isRetryable(err)).toBe(expected);
  });

  it("reads only the primary key's refusal as 'already saved'", () => {
    expect(queue.isAlreadySaved(LOST_REPLY)).toBe(true);
    expect(queue.isAlreadySaved({ code: "23505", message: 'violates unique constraint "household_tasks_parent_due_key"' })).toBe(false);
    expect(queue.isAlreadySaved({ code: "23514", message: "task_logs_pkey" })).toBe(false);
    expect(queue.isAlreadySaved(null)).toBe(false);
  });

  it("waits 5, 10, 20, 40 seconds, then every minute", () => {
    expect([0, 1, 2, 3, 4, 10].map(queue.retryDelayMs)).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);
  });
});

describe("items queued before Phase 161", () => {
  it("are read as log jobs with no ids", () => {
    const legacy = { id: "q1", table: "task_logs", payload: { entries: [{ entity_id: "d" }], module: "pet" }, timestamp: 5 };
    expect(queue.normalizeQueueItem(legacy)).toEqual({
      id: "q1",
      job: { kind: "logs", payload: legacy.payload },
      householdId: null,
      timestamp: 5,
    });
    expect(queue.normalizeQueueItem({ id: 3 })).toBeNull();
    expect(queue.normalizeQueueItem("junk")).toBeNull();
  });

  it("are sent like any other", async () => {
    memory.set("b11-sync-queue", [
      { id: "q1", table: "task_logs", payload: { entries: [{ entity_id: "d" }], module: "pet" }, timestamp: 5 },
    ]);
    provider.createLogsBatch.mockResolvedValue([{ id: "server-1" }]);
    const report = await queue.drainOutbox();
    expect(report.sent).toHaveLength(1);
    expect(provider.createLogsBatch).toHaveBeenCalledWith(expect.objectContaining({ ids: undefined }));
    expect(await stored()).toEqual([]);
  });
});

describe("submitJob", () => {
  it("sends, and the save leaves the phone once answered", async () => {
    provider.createLogsBatch.mockResolvedValue([{ id: "id-dog-1" }]);
    const seen: unknown[] = [];
    const outcome = await queue.submitJob(logJob(), (result) => seen.push(result));
    expect(outcome.status).toBe("sent");
    expect(seen).toEqual([{ kind: "logs", logs: [{ id: "id-dog-1" }] }]);
    expect(provider.createLogsBatch).toHaveBeenCalledWith(expect.objectContaining({ ids: ["id-dog-1"] }));
    expect(await stored()).toEqual([]);
  });

  it("keeps it on the phone when the request gets no answer, though the phone says it is online", async () => {
    provider.createLogsBatch.mockRejectedValue(NO_ANSWER);
    const outcome = await queue.submitJob(logJob());
    expect(outcome.status).toBe("waiting");
    const left = await stored();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ householdId: "house-a", job: { kind: "logs", ids: ["id-dog-1"] } });
  });

  it("throws a refusal and drops the save (retrying 'no' only gets 'no')", async () => {
    provider.createLogsBatch.mockRejectedValue({ code: "42501", message: "denied", status: 403 });
    await expect(queue.submitJob(logJob())).rejects.toMatchObject({ code: "42501" });
    expect(await stored()).toEqual([]);
  });

  it("stops the spinner after UI_WAIT_MS and keeps trying behind it", async () => {
    vi.useFakeTimers();
    let land!: (logs: unknown[]) => void;
    provider.createLogsBatch.mockReturnValue(new Promise((resolve) => (land = resolve)));
    const pending = queue.submitJob(logJob());
    await vi.advanceTimersByTimeAsync(queue.UI_WAIT_MS + 1);
    await expect(pending).resolves.toEqual({ status: "waiting" });
    expect(await stored()).toHaveLength(1);
    const kicked = vi.fn();
    const stop = queue.onNewWaiting(kicked);
    land([{ id: "id-dog-1" }]);
    await vi.advanceTimersByTimeAsync(0);
    // Landed late: the next drain confirms it (resending the same id).
    expect(kicked).toHaveBeenCalled();
    stop();
  });

  it("sends directly when the phone has nowhere to keep it", async () => {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
    provider.createLogsBatch.mockRejectedValue(NO_ANSWER);
    await expect(queue.submitJob(logJob())).rejects.toBe(NO_ANSWER);
  });
});

describe("queue writes", () => {
  it("never lose a save added while a sent one is being removed", async () => {
    provider.createLogsBatch.mockRejectedValue(NO_ANSWER);
    await queue.submitJob(logJob("dog-1"));
    const [first] = await stored();
    await Promise.all([queue.clearFromQueue(first.id), queue.submitJob(logJob("dog-2"))]);
    expect((await stored()).map((i) => i.job)).toEqual([logJob("dog-2")]);
  });
});

describe("drainOutbox", () => {
  async function queueUp(...jobs: import("@/lib/offline-queue").OutboxJob[]) {
    provider.createLogsBatch.mockRejectedValue(NO_ANSWER);
    provider.createFoodItem.mockRejectedValue(NO_ANSWER);
    provider.updateHouseholdTaskStatus.mockRejectedValue(NO_ANSWER);
    provider.materialiseChoreOccurrence.mockRejectedValue(NO_ANSWER);
    for (const job of jobs) await queue.submitJob(job);
    for (const fn of Object.values(provider)) fn.mockReset();
  }

  it("treats a lost reply as saved: the retry is refused by the primary key, and nothing is saved twice", async () => {
    await queueUp(logJob());
    provider.createLogsBatch.mockRejectedValue(LOST_REPLY);
    const report = await queue.drainOutbox();
    expect(report.sent).toHaveLength(1);
    expect(report.refused).toEqual([]);
    expect(await stored()).toEqual([]);
  });

  it("stops at the first save that gets no answer and keeps the rest", async () => {
    await queueUp(logJob("dog-1"), logJob("dog-2"));
    provider.createLogsBatch.mockRejectedValue(NO_ANSWER);
    const report = await queue.drainOutbox();
    expect(provider.createLogsBatch).toHaveBeenCalledTimes(1);
    expect(report.waiting).toBe(2);
    expect(await stored()).toHaveLength(2);
  });

  it("drops and reports a save the server refuses, and sends the next", async () => {
    await queueUp(logJob("dog-1"), logJob("dog-2"));
    provider.createLogsBatch
      .mockRejectedValueOnce({ code: "P0001", message: "staff_archived", status: 400 })
      .mockResolvedValueOnce([{ id: "id-dog-2" }]);
    const report = await queue.drainOutbox();
    expect(report.refused.map((i) => i.job)).toEqual([logJob("dog-1")]);
    expect(report.sent.map((i) => i.job)).toEqual([logJob("dog-2")]);
    expect(await stored()).toEqual([]);
  });

  it("reloads the screen before the sent saves leave the queue", async () => {
    await queueUp(logJob());
    provider.createLogsBatch.mockResolvedValue([{ id: "id-dog-1" }]);
    let duringReload: unknown[] = [];
    await queue.drainOutbox(async () => {
      duringReload = await stored();
    });
    expect(duringReload).toHaveLength(1);
    expect(await stored()).toEqual([]);
  });

  it("keeps sent saves in the queue (and on screen) when the reload after sending fails", async () => {
    await queueUp(logJob());
    provider.createLogsBatch.mockResolvedValue([{ id: "id-dog-1" }]);
    const failed = await queue.drainOutbox(async () => {
      throw NO_ANSWER;
    });
    expect(failed.confirmed).toBe(false);
    expect(await stored()).toHaveLength(1);
    // The next pass resends the same id, is told "already saved", and clears it.
    provider.createLogsBatch.mockRejectedValue(LOST_REPLY);
    const next = await queue.drainOutbox(async () => undefined);
    expect(next.confirmed).toBe(true);
    expect(await stored()).toEqual([]);
  });

  it("leaves saves for another household alone", async () => {
    await queueUp(logJob());
    household = "house-b";
    const report = await queue.drainOutbox();
    expect(provider.createLogsBatch).not.toHaveBeenCalled();
    expect(report.sent).toEqual([]);
    expect(await stored()).toHaveLength(1);
  });

  it("holds a chore until both photos are in storage, then writes the day and completes it", async () => {
    await queueUp(choreJob());
    photos.ensureUploaded.mockRejectedValueOnce(new photos.PhotoNotUploadedError("pending"));
    await queue.drainOutbox();
    expect(provider.materialiseChoreOccurrence).not.toHaveBeenCalled();
    expect(await stored()).toHaveLength(1);

    provider.materialiseChoreOccurrence.mockResolvedValue({ id: "row-9" });
    provider.updateHouseholdTaskStatus.mockResolvedValue({ id: "row-9", status: "completed" });
    const report = await queue.drainOutbox();
    expect(report.sent).toHaveLength(1);
    expect(provider.materialiseChoreOccurrence).toHaveBeenCalledWith("tpl-1", "2026-11-09", "staff-1");
    expect(provider.updateHouseholdTaskStatus).toHaveBeenCalledWith("row-9", "completed", {
      before_photo_url: "https://x/before.jpg",
      after_photo_url: "https://x/after.jpg",
      photo_url: "https://x/after.jpg",
      completed_by: "staff-1",
      // When it was finished, not when the signal came back.
      completed_at: "2026-11-09T02:00:00.000Z",
    });
  });

  it("drops a chore whose photo storage refused, so the draft asks for a retake", async () => {
    await queueUp(choreJob());
    photos.ensureUploaded.mockRejectedValue(new photos.PhotoNotUploadedError("failed"));
    const report = await queue.drainOutbox();
    expect(report.refused).toHaveLength(1);
    expect(provider.updateHouseholdTaskStatus).not.toHaveBeenCalled();
  });

  it("sends a log without a photo storage refused: the work still counts", async () => {
    await queueUp(logJob("dog-1", "https://x/broken.jpg"));
    photos.ensureUploaded.mockRejectedValue(new photos.PhotoNotUploadedError("failed"));
    provider.createLogsBatch.mockResolvedValue([{ id: "id-dog-1" }]);
    await queue.drainOutbox();
    expect(provider.createLogsBatch).toHaveBeenCalledWith(expect.objectContaining({ photo_url: null }));
  });

  it("sends food with the id made on the phone, and a lost reply counts as saved", async () => {
    const input = {
      name: "Rendang",
      photo_url: null,
      kept_in: "fridge" as const,
      expires_on: null,
      expiry_unknown: true,
      source: null,
      from_whom: null,
      return_container: false,
      notes: null,
    };
    await queueUp({ kind: "food", id: "food-1", input, addedBy: "staff-1" });
    provider.createFoodItem.mockRejectedValue({ code: "23505", message: 'violates unique constraint "food_items_pkey"' });
    const report = await queue.drainOutbox();
    expect(provider.createFoodItem).toHaveBeenCalledWith({ ...input, id: "food-1" }, "staff-1");
    expect(report.sent).toHaveLength(1);
  });
});

describe("what the screen shows while saves wait", () => {
  const template = {
    id: "tpl-1",
    household_id: "house-a",
    title: "Sapu teras",
    notes: null,
    category: "cleaning",
    assigned_to: "staff-1",
    due_date: "2026-11-01",
    due_time: null,
    status: "pending",
    completed_by: null,
    completed_at: null,
    photo_url: null,
    created_at: "2026-11-01T00:00:00Z",
    recurrence: "daily",
  } as unknown as import("@/types/database").HouseholdTask;

  function item(job: import("@/lib/offline-queue").OutboxJob, id = "q1"): import("@/lib/offline-queue").OfflineQueueItem {
    return { id, job, householdId: "house-a", timestamp: Date.parse("2026-11-09T01:00:00Z") };
  }

  it("shows waiting logs under the ids they will have on the server", () => {
    const view = outboxView([item(logJob())], "house-a", []);
    expect(view.logs).toEqual([
      expect.objectContaining({ id: "id-dog-1", entity_id: "dog-1", staff_id: "staff-1", sub_type: "complete" }),
    ]);
    expect([...view.pendingIds]).toEqual(["id-dog-1"]);
    // Once the server's copy has it, it is not drawn twice.
    const server = [{ id: "id-dog-1", entity_id: "dog-1" }, { id: "other" }];
    expect(overlay(server as never[], view.logs).map((l) => l.id)).toEqual(["id-dog-1", "other"]);
  });

  it("draws a finished chore on a day that has no row yet", () => {
    const view = outboxView([item(choreJob())], "house-a", [template]);
    expect(view.tasks).toEqual([
      expect.objectContaining({
        id: pendingChoreRowId("q1"),
        parent_task_id: "tpl-1",
        due_date: "2026-11-09",
        status: "completed",
        recurrence: "none",
        before_photo_url: "https://x/before.jpg",
      }),
    ]);
  });

  it("marks the day's own row when it exists", () => {
    const day = { ...template, id: "row-9", parent_task_id: "tpl-1", due_date: "2026-11-09", recurrence: "none" };
    const view = outboxView([item(choreJob())], "house-a", [template, day as never]);
    expect(view.tasks).toEqual([expect.objectContaining({ id: "row-9", status: "completed" })]);
    expect(view.pendingIds.has("row-9")).toBe(true);
  });

  it("ignores another household's saves", () => {
    const other = { ...item(logJob()), householdId: "house-b" };
    expect(outboxView([other], "house-a", []).logs).toEqual([]);
  });
});

describe("the write timeout", () => {
  it.each([
    ["POST", "http://s.test/rest/v1/task_logs?select=*", true],
    ["PATCH", "http://s.test/rest/v1/household_tasks?id=eq.1", true],
    ["GET", "http://s.test/rest/v1/task_logs", false],
    ["POST", "http://s.test/rest/v1/rpc/organise_rooms", false],
    ["POST", "http://s.test/storage/v1/object/household-logs/a.jpg", false],
    ["POST", "http://s.test/auth/v1/token", false],
  ])("%s %s → %s", (method, url, expected) => {
    expect(isTableWrite(url, method)).toBe(expected);
  });
});
