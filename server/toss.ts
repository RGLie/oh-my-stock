const BASE = "https://openapi.tossinvest.com";
export class TossError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(
      status === 403
        ? "토스 Open API의 허용 IP 설정을 확인해 주세요."
        : status === 401
          ? "토스 인증정보 또는 계정 권한을 확인해 주세요."
          : status === 429
            ? "토스 조회 한도에 도달했습니다. 잠시 후 다시 시도해 주세요."
            : `토스 연결에 실패했습니다 (${status}, ${code}).`,
    );
  }
}
export class TossClient {
  private token = "";
  private expires = 0;
  private issuing: Promise<string> | null = null;
  private lastRequest = 0;
  configured = Boolean(
    process.env.TOSS_CLIENT_ID && process.env.TOSS_CLIENT_SECRET,
  );
  constructor(private fetcher: typeof fetch = fetch) {}
  async accessToken(): Promise<string> {
    if (!this.configured)
      throw new Error(".env에 토스 인증정보를 설정해 주세요.");
    if (this.token && Date.now() < this.expires) return this.token;
    if (this.issuing) return this.issuing;
    this.issuing = (async () => {
      const response = await this.fetcher(`${BASE}/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: process.env.TOSS_CLIENT_ID!,
          client_secret: process.env.TOSS_CLIENT_SECRET!,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await response.json();
      if (!response.ok)
        throw new TossError(
          response.status,
          String(body.error || "authentication-failed")
            .replace(/[^a-zA-Z0-9_-]/g, "")
            .slice(0, 80),
        );
      if (!body.access_token || !Number.isFinite(Number(body.expires_in)))
        throw new Error("토스 토큰 응답 형식을 확인할 수 없습니다.");
      this.token = body.access_token;
      this.expires = Date.now() + (Number(body.expires_in) - 60) * 1000;
      return this.token;
    })();
    try {
      return await this.issuing;
    } finally {
      this.issuing = null;
    }
  }
  async get<T = any>(
    path: string,
    query: Record<string, string> = {},
    account?: string,
    retry = true,
  ): Promise<T> {
    // Intentionally a fixed allowlist: the application has no order mutation capability.
    if (
      ![
        "/api/v1/accounts",
        "/api/v1/holdings",
        "/api/v1/prices",
        "/api/v1/stocks",
        "/api/v1/exchange-rate",
        "/api/v1/candles",
        "/api/v1/market-indicators/prices",
      ].includes(path)
    )
      throw new Error("허용되지 않은 조회입니다.");
    const token = await this.accessToken();
    const delay = Math.max(0, this.lastRequest + 1100 - Date.now());
    this.lastRequest = Date.now() + delay;
    if (delay) await new Promise((r) => setTimeout(r, delay));
    const url = new URL(path, BASE);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const response = await this.fetcher(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(account ? { "X-Tossinvest-Account": account } : {}),
      },
      signal: AbortSignal.timeout(20000),
    });
    const body = await response.json();
    if (response.status === 401 && retry) {
      this.token = "";
      return this.get(path, query, account, false);
    }
    if (!response.ok)
      throw new TossError(
        response.status,
        String(body.error?.code || "request-failed")
          .replace(/[^a-zA-Z0-9_-]/g, "")
          .slice(0, 80),
      );
    if (body.result === undefined)
      throw new Error("토스 조회 결과 형식을 확인할 수 없습니다.");
    return body.result;
  }
}
