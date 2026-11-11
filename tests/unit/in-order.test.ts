// lib/in-order (Phase 170 PR A, Codex on PR #93): one phone's writes to one
// item reach the server in the order they were made, however many are in
// flight; a failure doesn't block the rest; only the newest answer counts.

import { describe, expect, it } from "vitest";
import { createInOrder } from "@/lib/in-order";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("writes in order", () => {
  it("sends each write only after the one before it settles, even when the earlier one is slower", async () => {
    const queue = createInOrder();
    const server: string[] = [];
    const slow = queue.run("rice", async () => {
      await wait(30);
      server.push("+0.5 (first batch)");
    });
    const slower = queue.run("rice", async () => {
      await wait(20);
      server.push("+0.5 (second batch)");
    });
    const out = queue.run("rice", async () => {
      server.push("Out");
    });
    await Promise.all([slow, slower, out]);
    expect(server).toEqual(["+0.5 (first batch)", "+0.5 (second batch)", "Out"]);
  });

  it("says only the newest write's answer is the one to show", async () => {
    const queue = createInOrder();
    const first = queue.run("rice", async () => 2.5);
    const second = queue.run("rice", async () => 3);
    const out = queue.run("rice", async () => 0);
    expect(await first).toEqual({ value: 2.5, latest: false });
    expect(await second).toEqual({ value: 3, latest: false });
    expect(await out).toEqual({ value: 0, latest: true });
  });

  it("keeps going after a failed write, and passes the failure to its caller", async () => {
    const queue = createInOrder();
    const server: string[] = [];
    const failed = queue.run("rice", async () => {
      throw new Error("no signal");
    });
    const next = queue.run("rice", async () => {
      server.push("Out");
      return "ok";
    });
    await expect(failed).rejects.toThrow("no signal");
    expect(await next).toEqual({ value: "ok", latest: true });
    expect(server).toEqual(["Out"]);
  });

  it("never makes one item wait for another", async () => {
    const queue = createInOrder();
    const server: string[] = [];
    const rice = queue.run("rice", async () => {
      await wait(30);
      server.push("rice");
    });
    const eggs = queue.run("eggs", async () => {
      server.push("eggs");
    });
    await Promise.all([rice, eggs]);
    expect(server).toEqual(["eggs", "rice"]);
  });
});
