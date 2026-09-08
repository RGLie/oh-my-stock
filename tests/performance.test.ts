import { test } from "node:test";
import assert from "node:assert/strict";
import { performanceIndex, series } from "../shared/performance";
import type { Snapshot } from "../shared/types";

const snap = (
  at: string,
  usd: number | null,
  extra: Partial<Snapshot> = {},
): Snapshot => ({
  id: at,
  at,
  usd: usd === null ? null : usd.toFixed(8),
  krw: usd === null ? null : (usd * 1300).toFixed(0),
  complete: usd !== null,
  composition: "c",
  ...extra,
});
test("performance index ignores deposits, cash edits and trades but keeps price moves", () => {
  const history = [
    // Legacy record without flow data: excluded from the index, still on the total chart.
    snap("2026-01-01T00:00:00Z", 1000),
    snap("2026-01-02T00:00:00Z", 1000, {
      flowUsd: "0",
      stockUsd: "1000",
      cashUsd: "0",
    }),
    // Price +10%
    snap("2026-01-03T00:00:00Z", 1100, {
      flowUsd: "0",
      stockUsd: "1100",
      cashUsd: "0",
    }),
    // Deposit 500 recorded as cash; no price move.
    snap("2026-01-04T00:00:00Z", 1600, {
      flowUsd: "500",
      stockUsd: "1100",
      cashUsd: "500",
      flows: [{ label: "현금 변경", usd: "500" }],
    }),
    // Bought 500 of stock with that cash and adjusted cash: net flow 0, price flat.
    snap("2026-01-05T00:00:00Z", 1600, {
      flowUsd: "0",
      stockUsd: "1600",
      cashUsd: "0",
      flows: [
        { label: "TEST 수량 +5", usd: "500" },
        { label: "현금 변경", usd: "-500" },
      ],
    }),
    // Incomplete snapshot in between carries a flow that must still be counted later.
    snap("2026-01-06T00:00:00Z", null, {
      flowUsd: "100",
      stockUsd: null,
      cashUsd: "100",
    }),
    // Price -10% on 1600 → 1440, plus the 100 deposit → 1540.
    snap("2026-01-07T00:00:00Z", 1540, {
      flowUsd: "0",
      stockUsd: "1440",
      cashUsd: "100",
    }),
  ];
  const index = performanceIndex(history);
  assert.deepEqual(
    index.map((p) => p.y),
    [100, 110, 110, 110, 99],
  );
  assert.equal(index[2].note, "현금 변경 +$500");
  assert.match(index[3].note!, /TEST 수량 \+5 \+\$500 · 현금 변경 −\$500/);
  const total = series(history, "total", "USD");
  assert.equal(total.length, 6);
  assert.equal(total[0].y, 1000);
  // Holdings alone: the deposit on 01-04 is invisible, the purchase on 01-05 shows, the price drop shows.
  assert.deepEqual(
    series(history, "stock", "USD").map((p) => p.y),
    [1000, 1100, 1100, 1600, 1440],
  );
  // Without a recorded rate the KRW stock view has nothing to show for these records.
  assert.equal(series(history, "stock", "KRW").length, 0);
});
test("stock view converts with the snapshot rate and skips records without the split", () => {
  const history = [
    snap("2026-01-01T00:00:00Z", 1000),
    snap("2026-01-02T00:00:00Z", 1500, {
      flowUsd: "0",
      stockUsd: "1000",
      cashUsd: "500",
      fxRate: "1400",
    }),
  ];
  assert.deepEqual(
    series(history, "stock", "KRW").map((p) => p.y),
    [1400000],
  );
  assert.deepEqual(
    series(history, "stock", "USD").map((p) => p.y),
    [1000],
  );
  assert.equal(series(history, "total", "KRW").length, 2);
});
