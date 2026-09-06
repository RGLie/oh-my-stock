import express from "express";
import { readFileSync, existsSync } from "node:fs";
import { createApp } from "../server/app";
import { Store } from "../server/store";
import { TossClient } from "../server/toss";
import { briefWindow } from "../server/brief";
import type {
  AnalysisJob,
  AnalysisResult,
  Holding,
  Provider,
} from "../shared/types";
// In-memory browser fixture; never loads .env, the real database, or provider accounts.
const store = new Store(":memory:");
const at = new Date().toISOString();
for (const [id, name, quantity, price, averageCost, sector] of [
  ["TEST", "브라우저 테스트 기업", "10", "120", "100", "기술"],
  ["DEMO", "검증용 ETF", "5", "80", "90", "ETF"],
])
  store.put("holdings", id, {
    id,
    symbol: id,
    name,
    currency: "USD",
    quantity,
    price,
    averageCost,
    sector,
    priceAt: at,
    updatedAt: at,
    assetType: id === "DEMO" ? "ETF" : "STOCK",
    account: "manual",
    source: "manual",
    thesis: "브라우저 검증용 가상 데이터",
    targetWeight: id === "TEST" ? "60" : "30",
  } satisfies Holding);
store.put("meta", "fx", { rate: "1300", at });
store.put("meta", "settings", {
  cashUsd: "400",
  cashKrw: "0",
  cashKnown: true,
  models: { codex: "gpt-5.4-mini", claude: "sonnet" },
  accountSeq: "",
});
for (let i = 0; i < 8; i++)
  store.put("snapshots", "qa-" + i, {
    id: "qa-" + i,
    at: new Date(Date.now() - (7 - i) * 86_400_000).toISOString(),
    usd: String(1900 + i * 14.285714),
    krw: String((1900 + i * 14.285714) * 1300),
    complete: true,
    composition: "qa",
  });
const check = existsSync(".runtime/research-check.json")
  ? JSON.parse(readFileSync(".runtime/research-check.json", "utf8"))
  : ["codex", "claude"].map((provider) => ({
      provider,
      actualModel: "QA fixture",
      toolCount: 0,
      result: {
        headline: "저장된 보고서를 읽는 화면입니다",
        summary:
          "실제 투자 분석이 아닌 화면 검증용 데이터입니다. 최신 정보와 과거 자료의 시각을 구분하고, 같은 숫자라도 기간과 단위를 함께 확인합니다. 확인된 사실과 해석을 분리해 읽으면 각 모델이 어떤 가정에서 판단했는지 살펴볼 수 있습니다. 포트폴리오의 구성과 투자 기간, 목표와 위험 감내 수준도 함께 확인합니다. 내용을 생략하지 않고 문장을 적절한 간격으로 나누어 긴 보고서도 편하게 읽을 수 있도록 검증합니다.",
        highlights: ["본문·보조 설명의 구분과 문단 간격을 검증합니다."],
        metrics: [],
        facts: [],
        impacts: ["가상 포트폴리오 검증입니다."],
        actions: ["출처의 날짜와 단위를 확인합니다."],
        counterarguments: [],
        reviewConditions: [],
        unknowns: ["실제 금융 정보가 아닙니다."],
        sources: [],
      },
    }));
const job: AnalysisJob = {
  id: "qa-public-research",
  title: "Adobe 공개 웹 검색 검증 · 개인 포트폴리오 없음",
  skill: "earnings",
  prompt: "Adobe 공개 실적 검색 검증",
  status: "completed",
  createdAt: at,
  snapshotId: "qa",
  evidenceIds: [],
  evidence: [],
  snapshot: { test: true },
  runs: check.map((r: any) => ({
    provider: r.provider,
    model: r.actualModel || "CLI 기본 모델",
    actualModel: r.actualModel,
    effort: "medium",
    toolCount: r.toolCount,
    status: "completed",
    result: r.result,
    error: null,
    startedAt: at,
    finishedAt: at,
    validation: [],
  })),
  inputHash: "qa",
  autoResearch: true,
};
store.put("jobs", job.id, job);
const health: Provider[] = (["codex", "claude"] as const).map<Provider>(
  (id) => ({
    id,
    name: id,
    available: true,
    authenticated: true,
    version: "QA fixture",
    message: "검증 전용",
    models:
      id === "codex" ? ["gpt-5.4-mini", "gpt-6-astra"] : ["sonnet", "opus"],
    modelEfforts: (id === "codex"
      ? {
          "gpt-5.4-mini": ["low", "medium", "high", "xhigh"],
          "gpt-6-astra": ["low", "medium", "high", "xhigh", "max", "ultra"],
        }
      : {
          sonnet: ["low", "medium", "high"],
          opus: ["low", "medium", "high", "xhigh", "max"],
        }) as Record<string, string[]>,
  }),
);
const toss = new TossClient();
toss.configured = false;
toss.get = async (path: string) => {
  if (path === "/api/v1/candles")
    return {
      candles: Array.from({ length: 10 }, (_, i) => ({
        timestamp: new Date(Date.now() - (9 - i) * 86_400_000).toISOString(),
        closePrice: String(110 + i),
      })),
    } as any;
  throw new Error("검증 서버는 토스 네트워크를 사용하지 않습니다.");
};
const runtime = createApp(store, toss, false, {
  health: async () => health,
  run: async (provider, _model, _prompt, signal, options) => {
    options?.onDispatched?.();
    options?.onProgress?.({
      stage: "검증용 진행 상태",
      phase: "researching",
      toolCount: 1,
      actualModel: "QA mock",
      event: {
        at: new Date().toISOString(),
        kind: "web",
        message: "검증용 자료 조사를 시작했어요",
      },
    });
    await new Promise<void>((done, reject) => {
      const heartbeat = setInterval(
        () =>
          options?.onProgress?.({
            stage: "검증용 진행 상태",
            phase: "researching",
            toolCount: 1,
            lastEventAt: new Date().toISOString(),
          }),
        1000,
      );
      const cleanup = () => {
        clearTimeout(timer);
        clearInterval(heartbeat);
        signal.removeEventListener("abort", abort);
      };
      const abort = () => {
        cleanup();
        reject(new Error("검증 분석 취소"));
      };
      const timer = setTimeout(() => {
        cleanup();
        done();
      }, 60000);
      signal.addEventListener("abort", abort, { once: true });
    });
    const window = briefWindow();
    const result: AnalysisResult = {
      dailyBrief: _prompt.includes('"briefWindow":')
        ? {
            date: window.date,
            marketStatus: "검증용 휴장 상태 · 실제 시세가 아닙니다.",
            indices: [
              {
                name: "검증용 S&P 500",
                value: "6,000.00",
                change: "+0.20%",
                asOf: "전 거래일 종가 · 가상 데이터",
                evidenceIds: ["qa-source"],
              },
            ],
            events: [
              {
                title: "오늘의 가상 경제 발표",
                scheduledAt: window.dayStartAt,
                timing: "한국시간 · UI 검증용 일정",
                category: "economic",
                status: "confirmed",
                symbols: [],
                portfolioImpact:
                  "성장주 평가에 미치는 경로를 확인합니다. 실제 일정이 아닙니다.",
                evidenceIds: ["qa-source"],
              },
              {
                title: "다음 거래일의 가상 실적 발표",
                scheduledAt: window.dayEndAt,
                timing:
                  "실적 발표와 콘퍼런스콜 시각을 구분합니다. 검증용입니다.",
                category: "earnings",
                status: "tentative",
                symbols: ["TEST"],
                portfolioImpact: "보유 기업의 실적 기대 변화를 확인합니다.",
                evidenceIds: ["qa-source"],
              },
            ],
            priorities: ["시세 기준 시각 확인", "보유 종목의 발표 일정 확인"],
          }
        : null,
      summary:
        "자동 조사 흐름의 브라우저 검증을 완료했습니다. 실제 금융 분석이 아닌 검증용 응답입니다.",
      headline: "새로고침으로 조사와 정리가 이어져요",
      highlights: ["한국어 결과", "모델별 독립 결과"],
      metrics: [
        {
          label: "검증 단계",
          value: "3단계",
          context: "검색·분석·표시",
          evidenceIds: ["qa-source"],
        },
      ],
      facts: [
        { statement: provider + " 검증 결과", evidenceIds: ["qa-source"] },
      ],
      impacts: ["가상 포트폴리오로만 검증합니다."],
      actions: ["검증 결과 확인"],
      counterarguments: ["실제 금융 자료가 아닙니다."],
      reviewConditions: ["브라우저 동작 검증"],
      unknowns: [],
      sources: [
        {
          id: "qa-source",
          title: "브라우저 검증용 출처",
          url: "https://example.com",
          publishedAt: "",
          coverage: "snippet",
        },
      ],
    };
    options?.onAnswer?.(JSON.stringify(result, null, 2));
    return result;
  },
});
runtime.app.use((_req, res, next) => {
  res.setHeader("X-OMS-QA", "memory-only");
  next();
});
runtime.app.use(express.static("dist"));
runtime.app.get("/{*path}", (_req, res) =>
  res.sendFile("index.html", { root: "dist" }),
);
const server = runtime.app.listen(4311, "127.0.0.1", async () => {
  const state = await (await fetch("http://127.0.0.1:4311/api/state")).json();
  await fetch("http://127.0.0.1:4311/api/connections/check", {
    method: "POST",
    headers: { "x-oms-token": state.csrf },
  });
  console.log("OMS isolated QA: http://127.0.0.1:4311");
});
process.on("SIGINT", () => {
  runtime.close();
  server.close(() => process.exit(0));
});
