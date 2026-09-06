import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app";
import { Store } from "../server/store";
import { TossClient } from "../server/toss";
import { parseResult, cliEnvironment } from "../server/providers";
import type { Holding } from "../shared/types";
test("store transaction rollback and backup preserve exact data", () => {
  const db = new Store(":memory:");
  db.put("test", "a", { quantity: "0.12345678" });
  assert.throws(() =>
    db.atomic(() => {
      db.put("test", "a", {});
      throw new Error("rollback");
    }),
  );
  assert.deepEqual(db.get("test", "a"), { quantity: "0.12345678" });
  assert.equal(db.export().records.length, 1);
  db.close();
});
test("API validates input, prevents cross-origin writes, handles CSV idempotently", async () => {
  const store = new Store(":memory:"),
    runtime = createApp(store, new TossClient(), false);
  const server = runtime.app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const state = await (await fetch(base + "/api/state")).json();
    const send = (path: string, body: any, extra = {}) =>
      fetch(base + path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-oms-token": state.csrf,
          ...extra,
        },
        body: JSON.stringify(body),
      });
    const row = {
      symbol: "TEST",
      name: "테스트",
      currency: "USD",
      quantity: "2",
      averageCost: "100",
    };
    assert.equal(
      (await send("/api/holdings", row, { origin: "https://evil.example" }))
        .status,
      403,
    );
    assert.equal(
      (await send("/api/holdings", { ...row, quantity: "-1" })).status,
      400,
    );
    assert.equal(
      (await send("/api/holdings", row, { "x-oms-token": "invalid" })).status,
      403,
    );
    assert.equal(
      (await (await send("/api/holdings/import", { rows: [row] })).json())
        .added,
      1,
    );
    assert.equal(
      (await (await send("/api/holdings/import", { rows: [row] })).json())
        .added,
      0,
    );
    const after = await (await fetch(base + "/api/state")).json();
    assert.equal(after.holdings.length, 1);
    assert.equal(after.summary.usd, null);
    const restored = new Store(":memory:");
    for (const row of store.export().records)
      restored.put(String(row.kind), String(row.id), row.value);
    assert.deepEqual(restored.all("holdings"), store.all("holdings"));
    restored.close();
  } finally {
    runtime.close();
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
  }
});
test("brokerage credentials never enter AI child environment", () => {
  process.env.TOSS_CLIENT_SECRET = "test-sentinel";
  assert.equal(cliEnvironment().TOSS_CLIENT_SECRET, undefined);
  delete process.env.TOSS_CLIENT_SECRET;
});
test("structured result parser accepts events and rejects malformed output", () => {
  const result = {
    summary: "검증",
    facts: [],
    impacts: [],
    counterarguments: [],
    actions: [],
    unknowns: ["자료 부족"],
    reviewConditions: [],
  };
  assert.deepEqual(
    parseResult(
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: JSON.stringify(result) },
      }),
      "codex",
    ),
    result,
  );
  assert.deepEqual(
    parseResult(JSON.stringify({ structured_output: result }), "claude"),
    result,
  );
  assert.throws(() => parseResult("not json", "codex"));
});
test("Toss client rejects all order paths before network access", async () => {
  const client = new TossClient(async () => {
    throw new Error("network must not run");
  });
  await assert.rejects(() => client.get("/api/v1/orders"), /허용되지 않은/);
});
test("a delayed quote response cannot overwrite a newer holding edit", async () => {
  const store = new Store(":memory:");
  const holding: Holding = {
    id: "race",
    symbol: "TEST",
    name: "검증",
    quantity: "1",
    averageCost: "100",
    price: "110",
    currency: "USD",
    priceAt: null,
    source: "manual",
    account: "manual",
    sector: "미분류",
    assetType: "STOCK",
    thesis: "old",
    targetWeight: null,
    updatedAt: new Date().toISOString(),
  };
  store.put("holdings", holding.id, holding);
  let release: (value: any) => void = () => {};
  const deferred = new Promise((resolve) => (release = resolve));
  const client = new TossClient();
  client.get = async (path: string) =>
    path === "/api/v1/prices"
      ? ((await deferred) as any)
      : ({ midRate: "1300", validFrom: new Date().toISOString() } as any);
  const runtime = createApp(store, client, false);
  try {
    const request = runtime.refreshPrices();
    store.put("holdings", holding.id, {
      ...holding,
      quantity: "2",
      thesis: "new",
    });
    release([
      {
        symbol: "TEST",
        currency: "USD",
        lastPrice: "120",
        timestamp: new Date().toISOString(),
      },
    ]);
    await request;
    assert.equal(store.get<Holding>("holdings", "race")?.quantity, "2");
    assert.equal(store.get<Holding>("holdings", "race")?.thesis, "new");
    assert.equal(store.get<Holding>("holdings", "race")?.price, "120");
  } finally {
    runtime.close();
    store.close();
  }
});
