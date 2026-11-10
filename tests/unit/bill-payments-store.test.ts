import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BillPayment } from "@/types/database";

// The shared copy of the household's payments (Codex, PR #65): a fresh read
// asked for during one under way runs after it; the household refresh reads
// only while something shows payments.

const list = vi.fn<() => Promise<BillPayment[]>>();
vi.mock("@/lib/data", () => ({
  dataProvider: {
    listBillPayments: () => list(),
    saveBillPayment: vi.fn(),
    deleteBillPayment: vi.fn(),
    uploadReceipt: vi.fn(),
    deleteReceipt: vi.fn(),
  },
}));

const row = (amount: number) => ({ id: "p", task_id: "t", series_id: "s", amount_idr: amount }) as BillPayment;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("bill payments store", () => {
  beforeEach(() => {
    vi.resetModules();
    list.mockReset();
  });

  it("a fresh read during one under way runs again after it", async () => {
    const store = await import("@/lib/bill-payments");
    const first = deferred<BillPayment[]>();
    list.mockReturnValueOnce(first.promise).mockResolvedValueOnce([row(420000)]);
    const seen: (number | null)[] = [];
    store.subscribeBillPayments((s) => seen.push(s.payments[0]?.amount_idr ?? null));

    const read = store.loadBillPayments();
    void store.loadBillPayments(true); // a save landed meanwhile
    first.resolve([row(418500)]); // the old read, from before the save
    await read;
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(seen.at(-1)).toBe(420000));
  });

  it("an ordinary read during one under way shares it", async () => {
    const store = await import("@/lib/bill-payments");
    list.mockResolvedValue([row(1)]);
    await Promise.all([store.loadBillPayments(), store.loadBillPayments()]);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("the household refresh reads only while something shows payments", async () => {
    const store = await import("@/lib/bill-payments");
    list.mockResolvedValue([]);
    store.refreshBillPayments();
    expect(list).not.toHaveBeenCalled();

    const stop = store.subscribeBillPayments(() => undefined);
    store.ensureBillPayments("h1");
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    store.refreshBillPayments();
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    stop();
    store.refreshBillPayments();
    expect(list).toHaveBeenCalledTimes(2);
  });
});
