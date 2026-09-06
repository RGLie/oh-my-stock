import "dotenv/config";
import express from "express";
import { resolve } from "node:path";
import { createApp } from "./app";
const runtime = createApp();
const production = process.argv.includes("--production");
if (production) {
  runtime.app.use(express.static(resolve("dist")));
  runtime.app.get("/{*path}", (_req, res) =>
    res.sendFile(resolve("dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  runtime.app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 4310);
const server = runtime.app.listen(port, "127.0.0.1", () => {
  console.log(`Oh My Stock: http://127.0.0.1:${port}`);
  void runtime.initialize();
});
server.on("error", (e) => {
  console.error(e.message);
  runtime.close();
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    runtime.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
