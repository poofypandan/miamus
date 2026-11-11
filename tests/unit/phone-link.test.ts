import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Pre-launch audit L4 and Codex on PR #92: the queue's "still linked?" check,
// bounded so a stalled request can never hold up the save queue.

const fake = {
  session: { access_token: "t" } as object | null,
  answer: null as null | (() => Promise<{ data: unknown; error: unknown }>),
  signal: null as AbortSignal | null,
  sessionHangs: false,
};

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () =>
        fake.sessionHangs ? new Promise(() => {}) : Promise.resolve({ data: { session: fake.session } }),
    },
    rpc: () => ({
      abortSignal: (signal: AbortSignal) => {
        fake.signal = signal;
        return fake.answer!();
      },
    }),
  },
}));

const { phoneLinkState, LINK_CHECK_MS } = await import("@/lib/phone-link");

beforeEach(() => {
  fake.session = { access_token: "t" };
  fake.signal = null;
  fake.sessionHangs = false;
  fake.answer = async () => ({ data: ["house-a"], error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("phoneLinkState", () => {
  it("is linked when the sign-in still reaches the household", async () => {
    expect(await phoneLinkState("house-a")).toBe("linked");
  });

  it("is unlinked when the sign-in no longer reaches it", async () => {
    fake.answer = async () => ({ data: ["house-b"], error: null });
    expect(await phoneLinkState("house-a")).toBe("unlinked");
  });

  it("is unlinked when the phone has no sign-in at all", async () => {
    fake.session = null;
    expect(await phoneLinkState("house-a")).toBe("unlinked");
  });

  it("is unknown when the server answers with an error", async () => {
    fake.answer = async () => ({ data: null, error: { message: "JWT expired" } });
    expect(await phoneLinkState("house-a")).toBe("unknown");
  });

  it("gives up after its deadline as no answer, never unlinked, and aborts the request", async () => {
    vi.useFakeTimers();
    fake.answer = () => new Promise(() => {}); // a request that never answers
    const pending = phoneLinkState("house-a");
    await vi.advanceTimersByTimeAsync(LINK_CHECK_MS);
    expect(await pending).toBe("no_answer");
    expect(fake.signal?.aborted).toBe(true);
  });

  it("also gives up when renewing the sign-in itself stalls", async () => {
    vi.useFakeTimers();
    fake.sessionHangs = true;
    const pending = phoneLinkState("house-a");
    await vi.advanceTimersByTimeAsync(LINK_CHECK_MS);
    expect(await pending).toBe("no_answer");
  });

  it("reads a dropped connection as no answer, not as an unclear one", async () => {
    fake.answer = async () => ({ data: null, error: { message: "TypeError: Failed to fetch", code: "" } });
    expect(await phoneLinkState("house-a")).toBe("no_answer");
  });

  it("waits no longer than 8 seconds", () => {
    expect(LINK_CHECK_MS).toBe(8_000);
  });
});
