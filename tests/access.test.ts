import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { request as httpRequest } from "node:http";
import { accessGuard, remoteAccessFromEnv } from "../server/access";

test("remote mode requires a complete private HTTPS origin and an owner identity", () => {
  assert.equal(remoteAccessFromEnv({}), null);
  for (const env of [
    { OMS_REMOTE_ORIGIN: "https://oms.example.ts.net" },
    { OMS_REMOTE_USER: "owner@example.com" },
    {
      OMS_REMOTE_ORIGIN: "http://oms.example.ts.net",
      OMS_REMOTE_USER: "owner",
    },
    {
      OMS_REMOTE_ORIGIN: "https://public.example.com",
      OMS_REMOTE_USER: "owner",
    },
    {
      OMS_REMOTE_ORIGIN: "https://oms.example.ts.net/path",
      OMS_REMOTE_USER: "owner",
    },
    {
      OMS_REMOTE_ORIGIN: "https://oms.example.ts.net:444",
      OMS_REMOTE_USER: "owner",
    },
  ])
    assert.throws(() => remoteAccessFromEnv(env));
  assert.deepEqual(
    remoteAccessFromEnv({
      OMS_REMOTE_ORIGIN: "https://oms.example.ts.net/",
      OMS_REMOTE_USER: "Owner@example.com",
    }),
    { origin: "https://oms.example.ts.net", login: "owner@example.com" },
  );
});

test("VPN owner is required for reads and writes even when Serve rewrites Host to localhost", async () => {
  const app = express();
  app.use(
    accessGuard("test-csrf", {
      origin: "https://oms.example.ts.net",
      login: "owner@example.com",
    }),
  );
  app.all("/{*path}", (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const own = {
    "Tailscale-User-Login": "owner@example.com",
    Host: "oms.example.ts.net",
  };
  // Node fetch normalizes Host. A raw HTTP client is needed to exercise proxy hosts.
  const send = (
    path: string,
    headers: Record<string, string> = {},
    method = "GET",
  ) =>
    new Promise<number>((resolve, reject) => {
      const req = httpRequest(base + path, { headers, method }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode!));
      });
      req.on("error", reject);
      req.end();
    });
  try {
    assert.equal(await send("/api/state"), 403);
    assert.equal(
      await send("/api/state", {
        ...own,
        "Tailscale-User-Login": "someone@example.com",
      }),
      403,
    );
    assert.equal(await send("/api/history", own), 200);
    assert.equal(
      await send("/api/history", {
        "Tailscale-User-Login": "owner@example.com",
      }),
      200,
    );
    assert.equal(
      await send("/api/state", { ...own, Host: "attacker.example.com" }),
      403,
    );
    assert.equal(
      await send(
        "/api/analyses",
        { ...own, Origin: "https://oms.example.ts.net" },
        "POST",
      ),
      403,
    );
    assert.equal(
      await send(
        "/api/analyses",
        { ...own, Origin: "https://evil.example", "X-OMS-Token": "test-csrf" },
        "POST",
      ),
      403,
    );
    assert.equal(
      await send(
        "/api/analyses",
        {
          ...own,
          Origin: "https://oms.example.ts.net",
          "X-OMS-Token": "test-csrf",
        },
        "POST",
      ),
      200,
    );
    assert.equal(
      await send("/index.html", { Host: "oms.example.ts.net" }),
      403,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("a forged identity cannot bypass a non-loopback peer check", () => {
  let status = 200,
    next = false;
  const req = {
    headers: { host: "oms.example.ts.net" },
    socket: { remoteAddress: "100.64.0.2" },
    get: (name: string) =>
      name === "Tailscale-User-Login" ? "owner@example.com" : undefined,
  };
  const res = {
    setHeader: () => {},
    status: (s: number) => {
      status = s;
      return res;
    },
    json: () => {},
  };
  accessGuard("csrf", {
    origin: "https://oms.example.ts.net",
    login: "owner@example.com",
  })(req as any, res as any, () => {
    next = true;
  });
  assert.equal(status, 403);
  assert.equal(next, false);
});
