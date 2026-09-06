import { test } from "node:test";
import assert from "node:assert/strict";
import { valuePortfolio, simulate } from "../server/finance";
import type { Holding } from "../shared/types";
const h = (data: Partial<Holding> = {}): Holding => ({
  id: "a",
  symbol: "TEST",
  name: "Test",
  currency: "USD",
  quantity: "10",
  averageCost: "100",
  price: "120",
  priceAt: new Date().toISOString(),
  source: "manual",
  account: "manual",
  sector: "미분류",
  assetType: "STOCK",
  thesis: "",
  targetWeight: null,
  updatedAt: new Date().toISOString(),
  ...data,
});
test("fractional shares are valued with exact decimals", () => {
  const s = valuePortfolio(
    [h({ quantity: "0.3", price: "0.2", averageCost: "0.1" })],
    "0",
    "0",
    null,
    false,
  );
  assert.equal(s.usd, "0.06000000");
  assert.equal(s.pnlUsd, "0.03000000");
  assert.equal(s.returnPct, "100.0000");
});
test("cash increases assets but never holding profit", () => {
  const s = valuePortfolio([h()], "500", "0", "1300", true);
  assert.equal(s.usd, "1700.00000000");
  assert.equal(s.pnlUsd, "200.00000000");
  assert.equal(s.returnPct, "20.0000");
  assert.equal(s.krw, "2210000");
});
test("unconfirmed cash is excluded from the stock-only headline", () => {
  const s = valuePortfolio([h()], "500", "100000", null, false);
  assert.equal(s.usd, "1200.00000000");
  assert.equal(s.complete, true);
});
test("missing quote makes total unknown rather than zero", () => {
  const s = valuePortfolio([h({ price: null })], "0", "0", "1300", true);
  assert.equal(s.complete, false);
  assert.equal(s.usd, null);
  assert.equal(s.holdings[0].pnl, null);
});
test("missing FX only invalidates a portfolio needing conversion", () => {
  assert.equal(
    valuePortfolio([h()], "0", "0", null, false).usd,
    "1200.00000000",
  );
  assert.equal(
    valuePortfolio([h({ currency: "KRW" })], "0", "0", null, false).usd,
    null,
  );
});
test("mixed currency holdings and cash use one rate consistently", () => {
  const s = valuePortfolio(
    [
      h(),
      h({
        id: "b",
        currency: "KRW",
        quantity: "2",
        price: "13000",
        averageCost: "6500",
      }),
    ],
    "100",
    "130000",
    "1300",
    true,
  );
  assert.equal(s.usd, "1420.00000000");
  assert.equal(s.pnlUsd, "210.00000000");
});
test("zero cost does not fabricate a percentage", () =>
  assert.equal(
    valuePortfolio([h({ averageCost: "0" })], "0", "0", null, false).returnPct,
    null,
  ));
test("unconfirmed cash blocks actionable allocation simulation", () => {
  const s = valuePortfolio([h()], "0", "0", "1300", false);
  assert.throws(
    () =>
      simulate(
        s,
        [{ id: "a", weight: "100" }],
        "100",
        "contribute",
        "0",
        "100",
      ),
    /현금 잔고/,
  );
});
test("contribution allocation scales buys to available cash", () => {
  const s = valuePortfolio(
    [h(), h({ id: "b", symbol: "B", quantity: "1" })],
    "0",
    "0",
    "1300",
    true,
  );
  const out = simulate(
    s,
    [
      { id: "a", weight: "50" },
      { id: "b", weight: "50" },
    ],
    "100",
    "contribute",
    "0",
    "100",
  );
  assert.equal(out.scaled, true);
  assert.equal(out.rows[0].delta, "0.00");
  assert.equal(out.rows[1].delta, "100.00");
  assert.equal(out.cashAfter, "0.00");
});
test("targets respect cash floor, max position and uniqueness", () => {
  const s = valuePortfolio([h()], "300", "0", "1300", true);
  assert.throws(() =>
    simulate(s, [{ id: "a", weight: "95" }], "0", "rebalance", "10", "100"),
  );
  assert.throws(() =>
    simulate(s, [{ id: "a", weight: "80" }], "0", "rebalance", "0", "60"),
  );
  assert.throws(() =>
    simulate(
      s,
      [
        { id: "a", weight: "20" },
        { id: "a", weight: "20" },
      ],
      "0",
      "rebalance",
      "0",
      "100",
    ),
  );
});
test("simulation uses original values and FX instead of rounded portfolio weights", () => {
  const s = valuePortfolio(
    [
      h({ quantity: "1", price: "1234567.89123456", averageCost: "1" }),
      h({
        id: "b",
        symbol: "B",
        currency: "KRW",
        quantity: "0.12345678",
        price: "152431",
        averageCost: "1",
      }),
    ],
    "0",
    "10.50",
    "1387.12345678",
    true,
  );
  const out = simulate(
    s,
    [{ id: "b", weight: "0" }],
    "0",
    "rebalance",
    "0",
    "100",
  );
  // Suggested amounts truncate to cents so a sale never exceeds the holding value.
  assert.equal(out.rows[0].delta, "-13.56");
  assert.equal(s.fxRate, "1387.12345678");
});
test("cent rounding across several buys never spends more than available cash", () => {
  const s = valuePortfolio(
    Array.from({ length: 6 }, (_, i) =>
      h({ id: String(i), quantity: "1", price: "1", averageCost: "1" }),
    ),
    "0",
    "0",
    null,
    true,
  );
  const out = simulate(
    s,
    s.holdings.map((h) => ({ id: h.id, weight: "16.66666666" })),
    "1",
    "contribute",
    "0",
    "100",
  );
  assert.equal(out.cashAfter, "0.04");
  assert(out.rows.every((row) => row.delta === "0.16"));
});
