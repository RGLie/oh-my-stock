import type { RequestHandler } from "express";

type RemoteAccess = { origin: string; login: string };
export function remoteAccessFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RemoteAccess | null {
  const rawOrigin = env.OMS_REMOTE_ORIGIN?.trim(),
    login = env.OMS_REMOTE_USER?.trim();
  if (!rawOrigin && !login) return null;
  if (!rawOrigin || !login)
    throw new Error(
      "원격 접속에는 OMS_REMOTE_ORIGIN과 OMS_REMOTE_USER를 모두 지정해야 합니다.",
    );
  const url = new URL(rawOrigin);
  if (
    url.protocol !== "https:" ||
    !/^([a-z0-9-]+\.)+ts\.net$/i.test(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    /[\r\n,]/.test(login)
  )
    throw new Error(
      "원격 주소는 Tailscale HTTPS 기본 주소, 사용자는 본인의 로그인 계정이어야 합니다.",
    );
  return { origin: url.origin, login: login.toLowerCase() };
}

export function accessGuard(
  csrf: string,
  remote: RemoteAccess | null,
): RequestHandler {
  return (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const rawHost = req.headers.host || "";
    let host: string;
    try {
      const parsed = new URL("http://" + rawHost);
      if (parsed.host.toLowerCase() !== rawHost.toLowerCase())
        throw new Error();
      host = parsed.hostname;
    } catch {
      res.status(403).json({ error: "허용되지 않은 접속 주소입니다." });
      return;
    }
    const localHost = ["127.0.0.1", "localhost", "[::1]"].includes(host);
    let allowedOrigin = `http://${rawHost}`;
    if (remote) {
      const peer = req.socket.remoteAddress;
      const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        peer || "",
      );
      // In remote mode there is no unauthenticated localhost bypass. Only Serve's
      // verified identity is accepted, even when the proxy rewrites Host to localhost.
      if (
        !loopback ||
        (!localHost && rawHost !== new URL(remote.origin).host) ||
        req.get("Tailscale-User-Login")?.trim().toLowerCase() !== remote.login
      ) {
        res
          .status(403)
          .json({ error: "허용된 개인 VPN 계정으로 접속해 주세요." });
        return;
      }
      allowedOrigin = remote.origin;
    } else if (!localHost) {
      res.status(403).json({ error: "로컬 접속만 허용합니다." });
      return;
    }
    const origin = req.get("Origin");
    if (origin && origin !== allowedOrigin) {
      res.status(403).json({ error: "허용되지 않은 요청 출처입니다." });
      return;
    }
    if (
      req.path.startsWith("/api") &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("X-OMS-Token") !== csrf
    ) {
      res
        .status(403)
        .json({ error: "화면을 새로고침하고 다시 시도해 주세요." });
      return;
    }
    next();
  };
}
