import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Address move (2026-11-10): on an old address the app sends what is waiting
// on the phone first, never discards it, and opens miamus.app only once the
// queue is empty or the person deliberately chooses to go anyway.
//
// sendBeforeMove runs here against the real drainOutbox, with the phone's
// storage and the server faked as in offline-queue.test.ts.

const memory = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (key: string) => structuredClone(memory.get(key)),
  set: async (key: string, value: unknown) => void memory.set(key, structuredClone(value)),
  update: async (key: string, change: (old: unknown) => unknown) => {
    memory.set(key, structuredClone(change(structuredClone(memory.get(key)))));
  },
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
    }
  }
  return { PhotoNotUploadedError, ensureUploaded: vi.fn(async () => undefined) };
});

let household = "house-a";
vi.mock("@/lib/tenant", () => ({ getActiveHouseholdId: () => household }));

const queue = await import("@/lib/offline-queue");
const { isOldHost, OLD_HOSTS, CANONICAL_ORIGIN } = await import("@/config/hosts");
const { countChoreDrafts, mayMove, movedUrl, sendBeforeMove, SendTally, stopPushForMove } = await import("@/lib/address-move");
type SendDeps = import("@/lib/address-move").SendDeps;

const NO_ANSWER = { message: "TypeError: Failed to fetch", details: "", hint: "", code: "" };
const REFUSED = { code: "42501", message: "permission denied", status: 403 };

function logItem(id: string, householdId: string | null = "house-a"): import("@/lib/offline-queue").OfflineQueueItem {
  return {
    id,
    householdId,
    timestamp: 1,
    job: {
      kind: "logs",
      payload: {
        entries: [{ schedule_id: "s1", entity_id: "dog-1" }],
        module: "pet",
        photo_url: null,
        completed_at: "2026-11-09T01:00:00.000Z",
        staff_id: "staff-1",
      },
      ids: [`row-${id}`],
    },
  };
}

async function seed(...items: import("@/lib/offline-queue").OfflineQueueItem[]) {
  for (const item of items) await queue.addToOutbox(item);
}

const ids = async () => (await queue.getOfflineQueue()).map((item) => item.id);

function deps(overrides: Partial<SendDeps> = {}): SendDeps {
  return {
    readQueue: queue.getOfflineQueue,
    drain: () => queue.drainOutbox(),
    online: () => true,
    signedOut: async () => false,
    ...overrides,
  };
}

beforeEach(() => {
  memory.clear();
  household = "house-a";
  (globalThis as { indexedDB?: unknown }).indexedDB = {};
  for (const fn of Object.values(provider)) fn.mockReset();
});

describe("the old addresses", () => {
  it("knows miamus.vercel.app, and nothing else on vercel.app", () => {
    expect(OLD_HOSTS).toContain("miamus.vercel.app");
    expect(isOldHost("miamus.vercel.app")).toBe(true);
    expect(isOldHost("MIAMUS.vercel.app")).toBe(true);
    // Preview deployments stay as they are.
    expect(isOldHost("miamus-git-main-poofy.vercel.app")).toBe(false);
    expect(isOldHost("miamus.app")).toBe(false);
    expect(isOldHost("localhost")).toBe(false);
    expect(isOldHost(undefined)).toBe(false);
    expect(CANONICAL_ORIGIN).toBe("https://miamus.app");
  });
});

describe("where on miamus.app to continue", () => {
  it("sends staff to the house-code screen, and puts nothing new in the link", () => {
    expect(movedUrl({ pathname: "/staff", search: "?view=stok" }, "staff")).toBe("https://miamus.app/join/code");
  });

  it("keeps an invite link as the admin sent it", () => {
    expect(movedUrl({ pathname: "/join/staff", search: "?token=abc" }, "visitor")).toBe(
      "https://miamus.app/join/staff?token=abc"
    );
    expect(movedUrl({ pathname: "/join/code", search: "" }, "staff")).toBe("https://miamus.app/join/code");
  });

  it("keeps an owner's page, and starts a half-finished sign-in over", () => {
    expect(movedUrl({ pathname: "/dashboard/chores", search: "?tab=rooms" }, "owner")).toBe(
      "https://miamus.app/dashboard/chores?tab=rooms"
    );
    expect(movedUrl({ pathname: "/auth/callback", search: "?code=secret" }, "owner")).toBe("https://miamus.app/");
    expect(movedUrl({ pathname: "/", search: "" }, "visitor")).toBe("https://miamus.app/");
  });
});

describe("sending before the move", () => {
  it("sends the queue first, then says it is empty", async () => {
    await seed(logItem("a"), logItem("b"), logItem("c"));
    provider.createLogsBatch.mockResolvedValue([]);
    const sending: number[] = [];

    const outcome = await sendBeforeMove(deps(), (n) => sending.push(n));

    expect(sending).toEqual([3]);
    expect(provider.createLogsBatch).toHaveBeenCalledTimes(3);
    expect(outcome).toEqual({ status: "empty", sent: 3, refused: 0 });
    expect(await ids()).toEqual([]);
    expect(mayMove(outcome, false)).toBe(true);
  });

  it("with no signal, tries nothing and keeps every save", async () => {
    await seed(logItem("a"), logItem("b"));

    const outcome = await sendBeforeMove(deps({ online: () => false }));

    expect(provider.createLogsBatch).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: "waiting", waiting: 2, sent: 0, refused: 0, reason: "offline" });
    expect(await ids()).toEqual(["a", "b"]);
    expect(mayMove(outcome, false)).toBe(false);
  });

  it("on a weak signal, keeps what got no answer, and the next try sends it", async () => {
    await seed(logItem("a"), logItem("b"));
    provider.createLogsBatch.mockResolvedValueOnce([]).mockRejectedValueOnce(NO_ANSWER);

    const first = await sendBeforeMove(deps());
    expect(first).toEqual({ status: "waiting", waiting: 1, sent: 1, refused: 0, reason: "no-answer" });
    expect(await ids()).toEqual(["b"]);
    expect(mayMove(first, false)).toBe(false);

    provider.createLogsBatch.mockResolvedValue([]);
    const again = await sendBeforeMove(deps());
    expect(again).toEqual({ status: "empty", sent: 1, refused: 0 });
    expect(await ids()).toEqual([]);
  });

  it("never removes a save itself, even when sending throws", async () => {
    await seed(logItem("a"));

    const outcome = await sendBeforeMove(deps({ drain: async () => Promise.reject(new Error("locks broke")) }));

    expect(outcome).toMatchObject({ status: "waiting", waiting: 1, reason: "error" });
    expect(await ids()).toEqual(["a"]);
  });

  it("says when the queue could not be read, rather than calling it empty", async () => {
    const outcome = await sendBeforeMove(deps({ readQueue: async () => Promise.reject(new Error("blocked")) }));
    expect(outcome).toEqual({ status: "waiting", waiting: null, sent: 0, refused: 0, reason: "error" });
    expect(mayMove(outcome, false)).toBe(false);
  });

  it("keeps saves for another household, and says whose they are", async () => {
    await seed(logItem("mine"), logItem("theirs", "house-b"));
    provider.createLogsBatch.mockResolvedValue([]);

    const outcome = await sendBeforeMove(deps());

    expect(outcome).toEqual({ status: "waiting", waiting: 1, sent: 1, refused: 0, reason: "other-household" });
    expect(await ids()).toEqual(["theirs"]);
  });

  it("does not try with no session on the old address", async () => {
    await seed(logItem("a"));

    const outcome = await sendBeforeMove(deps({ signedOut: async () => true }));

    expect(provider.createLogsBatch).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ status: "waiting", waiting: 1, reason: "signed-out" });
    expect(await ids()).toEqual(["a"]);
  });

  it("reports what the server refused, as every other screen does", async () => {
    await seed(logItem("a"));
    provider.createLogsBatch.mockRejectedValue(REFUSED);

    const outcome = await sendBeforeMove(deps());

    expect(outcome).toEqual({ status: "empty", sent: 0, refused: 1 });
  });

  it("stops waiting on a pass that hangs (a slow photo), keeps the saves, and offers the choices", async () => {
    await seed(logItem("a"), logItem("b"));
    let finish: () => void = () => {};
    const hanging = new Promise<import("@/lib/offline-queue").DrainReport>((resolve) => {
      finish = () => resolve({ sent: [], refused: [], waiting: 2, confirmed: true });
    });

    const outcome = await sendBeforeMove(deps({ drain: () => hanging, waitMs: 20 }));

    expect(outcome).toEqual({ status: "waiting", waiting: 2, sent: 0, refused: 0, reason: "no-answer" });
    expect(mayMove(outcome, false)).toBe(false);
    expect(mayMove(outcome, true)).toBe(true);
    expect(await ids()).toEqual(["a", "b"]);
    finish();
  });

  it("still reports what a slow pass had refused, after the screen stopped waiting on it", async () => {
    // Codex, PR #54: the pass outlives the screen's wait, then ends with a
    // refusal. drainOutbox removes the refused save, so the next look finds
    // an empty queue — and must still say a save was refused.
    await seed(logItem("a"));
    let refuse: () => void = () => {};
    provider.createLogsBatch.mockImplementation(
      () => new Promise((_, reject) => (refuse = () => reject(REFUSED)))
    );
    const tally = new SendTally();
    let pass: Promise<unknown> = Promise.resolve();
    const slow = deps({ tally, waitMs: 20, drain: () => (pass = queue.drainOutbox()) as never });

    const first = await sendBeforeMove(slow);
    expect(first).toMatchObject({ status: "waiting", waiting: 1, reason: "no-answer", refused: 0 });

    refuse();
    await pass;
    expect(await ids()).toEqual([]);

    const next = await sendBeforeMove(slow);
    expect(next).toEqual({ status: "empty", sent: 0, refused: 1 });
  });

  it("counts a pass once, however many tries waited on it", () => {
    const tally = new SendTally();
    const report = { sent: [logItem("a")], refused: [logItem("b")], waiting: 0, confirmed: true };
    tally.add(report);
    tally.add(report);
    expect({ sent: tally.sent, refused: tally.refused }).toEqual({ sent: 1, refused: 1 });
    // Sent but not yet confirmed: the next pass confirms them, and counts them then.
    tally.add({ sent: [logItem("c")], refused: [], waiting: 0, confirmed: false });
    expect(tally.sent).toBe(1);
  });

  it("with nothing waiting, sends nothing and may move at once", async () => {
    const sending: number[] = [];
    const outcome = await sendBeforeMove(deps(), (n) => sending.push(n));
    expect(sending).toEqual([]);
    expect(outcome).toEqual({ status: "empty", sent: 0, refused: 0 });
  });
});

describe("when the screen may open miamus.app", () => {
  it("only with nothing waiting, or after choosing to leave it behind", () => {
    const waiting = { status: "waiting", waiting: 2, sent: 0, refused: 0, reason: "offline" } as const;
    expect(mayMove(null, false)).toBe(false);
    expect(mayMove(waiting, false)).toBe(false);
    expect(mayMove(waiting, true)).toBe(true);
    expect(mayMove({ status: "empty", sent: 0, refused: 0 }, false)).toBe(true);
  });

  it("counts unfinished chores kept on the phone", () => {
    expect(countChoreDrafts(["miamus_chore_draft:h:t:2026-11-10", "miamus_tenant_id", "miamus_chore_draft:h:u:d"])).toBe(2);
  });
});

describe("turning push off at the move", () => {
  function fakePush(deleteRow: (endpoint: string) => Promise<void>) {
    const calls: string[] = [];
    return {
      calls,
      deps: {
        subscription: async () => ({
          endpoint: "https://push.example/abc",
          unsubscribe: async () => {
            calls.push("unsubscribe");
            return true;
          },
        }),
        deleteRow: async (endpoint: string) => {
          calls.push(`delete ${endpoint}`);
          return deleteRow(endpoint);
        },
        forget: () => calls.push("forget"),
        waitMs: 20,
      },
    };
  }

  it("unsubscribes this phone even when the server never answers", async () => {
    // Codex, PR #54: the move goes ahead after its wait; a browser still
    // subscribed here would keep getting notifications for the old address.
    const push = fakePush(() => new Promise(() => {}));
    await stopPushForMove(push.deps);
    expect(push.calls).toContain("unsubscribe");
    expect(push.calls).toContain("forget");
    expect(push.calls).toContain("delete https://push.example/abc");
  });

  it("unsubscribes this phone when the server refuses the delete", async () => {
    const push = fakePush(async () => Promise.reject(new Error("401")));
    await stopPushForMove(push.deps);
    expect(push.calls).toContain("unsubscribe");
  });

  it("does nothing more on a phone with no subscription", async () => {
    const push = fakePush(async () => undefined);
    await stopPushForMove({ ...push.deps, subscription: async () => null });
    expect(push.calls).toEqual(["forget"]);
  });
});

describe("the service worker on an old address", () => {
  // A worker that served pages from a cache could keep an old address on a
  // stale build, never showing the move screen. Ours only shows pushes.
  const sw = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

  it("never answers page requests or caches them", () => {
    expect(sw).not.toMatch(/addEventListener\(\s*["']fetch["']/);
    expect(sw).not.toMatch(/\bcaches\./);
  });

  it("takes over at once when it changes", () => {
    expect(sw).toMatch(/skipWaiting\(\)/);
    expect(sw).toMatch(/clients\.claim\(\)/);
  });
});
