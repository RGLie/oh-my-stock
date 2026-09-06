import "dotenv/config";
import { TossClient } from "../server/toss";
const client = new TossClient();
try {
  const accounts = await client.get<any[]>("/api/v1/accounts");
  const fx = await client.get("/api/v1/exchange-rate", {
    baseCurrency: "USD",
    quoteCurrency: "KRW",
  });
  const quotes = await client.get<any[]>("/api/v1/prices", {
    symbols: "AAPL,VOO",
  });
  console.log(
    JSON.stringify({
      ok: true,
      accountCount: accounts.length,
      fxFields: Object.keys(fx),
      quoteCount: quotes.length,
      checkedAt: new Date().toISOString(),
    }),
  );
} catch (e) {
  console.log(
    JSON.stringify({
      ok: false,
      message: e instanceof Error ? e.message : "조회 실패",
    }),
  );
  process.exitCode = 1;
}
