import { describe, expect, it } from "vitest";
import { BILL_HISTORY_LIMIT, historyFor, isBill, lastAmount, lastTimeLine, paidLine, paidOn, paymentFor } from "@/lib/bill-payments";
import type { BillPayment } from "@/types/database";

// Bill payments (Phase 164 PR B, migrations/138).

let n = 0;
function payment(fields: Partial<BillPayment>): BillPayment {
  n += 1;
  return {
    id: `p${n}`,
    household_id: "h",
    task_id: `day${n}`,
    series_id: "pln",
    amount_idr: null,
    receipt_url: null,
    paid_at: "2026-11-01T03:00:00Z",
    created_by: null,
    updated_at: "2026-11-01T03:00:00Z",
    ...fields,
  };
}

describe("bill payments", () => {
  const oct = payment({ task_id: "oct", amount_idr: 412000, paid_at: "2026-10-18T03:00:00Z" });
  const sep = payment({ task_id: "sep", amount_idr: 398000, paid_at: "2026-09-19T03:00:00Z" });
  const nov = payment({ task_id: "nov", receipt_url: "x", paid_at: "2026-11-20T03:00:00Z" });
  const water = payment({ task_id: "w", series_id: "pdam", amount_idr: 186000, paid_at: "2026-11-21T03:00:00Z" });
  const all = [sep, water, oct, nov];

  it("knows a bill by its category", () => {
    expect(isBill({ category: "bill" })).toBe(true);
    expect(isBill({ category: "maintenance" })).toBe(false);
  });

  it("finds a paid day's payment", () => {
    expect(paymentFor(all, "oct")).toBe(oct);
    expect(paymentFor(all, "nope")).toBeNull();
    expect(paymentFor(all, null)).toBeNull();
  });

  it("lists a bill's history newest first, at most 12", () => {
    expect(historyFor(all, "pln")).toEqual([nov, oct, sep]);
    const many = Array.from({ length: 20 }, (_, i) =>
      payment({ amount_idr: i, paid_at: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z` })
    );
    expect(historyFor(many, "pln")).toHaveLength(BILL_HISTORY_LIMIT);
  });

  it("'last time' is the latest payment with an amount, not the day being paid", () => {
    expect(lastAmount(all, "pln")).toBe(412000);
    expect(lastAmount(all, "pln", "oct")).toBe(398000);
    expect(lastAmount(all, "electricity-none")).toBeNull();
  });

  it("reads in both languages", () => {
    expect(paidLine(oct, "en")).toBe("Paid · Rp412.000");
    expect(paidLine(oct, "id")).toBe("Sudah dibayar · Rp412.000");
    expect(paidLine(nov, "en")).toBe("Paid");
    expect(paidLine(null, "id")).toBe("Sudah dibayar");
    expect(lastTimeLine(412000, "en")).toBe("Last time Rp412.000");
    expect(lastTimeLine(412000, "id")).toBe("Terakhir Rp412.000");
    expect(lastTimeLine(null, "en")).toBeNull();
    expect(paidOn(oct, "id")).toBe("18 Okt");
  });
});
