import { XMLParser } from "fast-xml-parser";
import { createHash, randomUUID } from "node:crypto";
import type { Evidence } from "../shared/types";
export const hash = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export async function collectNews(
  symbols: string[],
  category: string,
  customQuery = "",
): Promise<Evidence[]> {
  const query =
    customQuery ||
    (category === "macro"
      ? "미국 연준 금리 물가 고용 경제"
      : category === "index"
        ? "미국 증시 S&P500 나스닥"
        : category === "sector"
          ? "미국 주식 섹터 실적 밸류에이션"
          : symbols.length
            ? symbols.slice(0, 8).join(" OR ") + " 주식 실적"
            : "미국 주식 실적");
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query + " when:7d");
  url.searchParams.set("hl", "ko");
  url.searchParams.set("gl", "KR");
  url.searchParams.set("ceid", "KR:ko");
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok)
    throw new Error("뉴스를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  const xml = await response.text();
  if (xml.length > 2_000_000) throw new Error("뉴스 응답이 너무 큽니다.");
  const parsed = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
  }).parse(xml);
  const items = parsed.rss?.channel?.item;
  const list = Array.isArray(items) ? items : items ? [items] : [];
  return list.slice(0, 24).map((item: any) => {
    const title = String(item.title || "제목 없음");
    const link = String(item.link || "");
    const published = new Date(String(item.pubDate));
    return {
      id: randomUUID(),
      title,
      url: /^https:\/\//.test(link) ? link : "",
      body: title,
      category,
      symbols: symbols.filter((s) =>
        new RegExp(
          `\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
          "i",
        ).test(title),
      ),
      publishedAt: Number.isNaN(published.getTime())
        ? null
        : published.toISOString(),
      retrievedAt: new Date().toISOString(),
      coverage: "headline" as const,
      hash: hash(title + link),
    };
  });
}
