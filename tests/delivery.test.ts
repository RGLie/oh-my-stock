import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app";
import { Store } from "../server/store";
import { TossClient } from "../server/toss";
import { briefWindow } from "../server/brief";
import { setupDelivery, kstClock } from "../server/delivery";
import {
  dailyBriefEmail,
  dailyBriefTelegram,
  portfolioTelegram,
  splitTelegram,
} from "../server/format";
import { mailConfigFromEnv, type MailMessage } from "../server/mail";
import { TelegramBot, telegramConfigFromEnv } from "../server/telegram";
import type {
  AnalysisJob,
  AnalysisResult,
  AnalysisRun,
  Holding,
} from "../shared/types";

const TOKEN = "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";
const briefResult = (date: string, provider: string): AnalysisResult => ({
  summary: `${provider} 요약 <b>태그</b>`,
  headline: "오늘의 핵심",
  highlights: [],
  metrics: [],
  sources: [
    {
      id: "s1",
      title: "CME 휴장 안내 & 일정",
      url: "https://example.com/calendar?a=1&b=2",
      publishedAt: date,
      coverage: "snippet",
    },
  ],
  facts: [],
  impacts: ["보유 종목 영향 설명"],
  actions: ["장 시작 전 확인"],
  counterarguments: [],
  reviewConditions: [],
  unknowns: [],
  dailyBrief: {
    date,
    marketStatus: "미국장 정규장 마감, 다음 거래일은 내일",
    indices: [
      {
        name: "S&P 500",
        value: "6,500.12",
        change: "+0.4%",
        asOf: "종가",
        reason: "금리 하락 기대로 상승",
        previousChange: "+0.1%",
        previousReason: "고용 지표 소화",
        evidenceIds: ["s1"],
      },
    ],
    events: [
      {
        title: "CPI 발표",
        scheduledAt: date + "T21:30:00+09:00",
        timing: "한국시간 21:30",
        category: "economic",
        status: "confirmed",
        symbols: [],
        portfolioImpact: "금리 민감 종목 변동",
        evidenceIds: ["s1"],
      },
      {
        title: "실적 발표",
        scheduledAt: null,
        timing: "장 마감 후 (미국 동부)",
        category: "earnings",
        status: "tentative",
        symbols: ["TEST"],
        portfolioImpact: "",
        evidenceIds: ["s1"],
      },
    ],
    priorities: ["CPI 확인", "실적 확인"],
    news: [
      {
        title: "연준 인사가 금리 인하를 언급 <b>원문</b>",
        summary: "공개 발언에서 인하 조건을 설명했다.",
        whyItMatters: "성장주 할인율에 영향을 준다.",
        evidenceIds: ["s1"],
      },
    ],
    companies: [
      {
        name: "검증기업",
        symbol: "TEST",
        previousMove: "종가 -1.2%",
        previousReason: "실적 가이던스 하향",
        currentMove: "프리마켓 +0.5%",
        currentReason: "금리 하락 기대",
        evidenceIds: ["s1"],
      },
    ],
    sectors: [
      {
        name: "반도체",
        move: "+1.8%",
        reason: "대형 칩 수요 보도로 상승",
        evidenceIds: ["s1"],
      },
    ],
  },
});
const holding = (): Holding => ({
  id: "manual:TEST",
  symbol: "TEST",
  name: "검증",
  currency: "USD",
  quantity: "2",
  averageCost: "100",
  price: "110",
  priceAt: new Date().toISOString(),
  source: "manual",
  account: "",
  sector: "미분류",
  assetType: "STOCK",
  thesis: "",
  targetWeight: null,
  updatedAt: new Date().toISOString(),
});

// A fake Bot API: records every sendMessage and lets the test queue getUpdates results.
function fakeTelegram() {
  const sent: { chat: string; text: string }[] = [];
  const updates: unknown[][] = [];
  const fetchImpl = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const method = String(url).split("/").pop();
    const body = JSON.parse(String(init?.body || "{}"));
    const reply = (result: unknown) =>
      new Response(JSON.stringify({ ok: true, result }), { status: 200 });
    if (method === "getMe") return reply({ username: "oms_test_bot" });
    if (method === "sendMessage") {
      if (/BROKEN/.test(body.text) && body.parse_mode)
        return new Response(
          JSON.stringify({
            ok: false,
            description: "Bad Request: can't parse entities",
          }),
          { status: 400 },
        );
      sent.push({ chat: String(body.chat_id), text: body.text });
      return reply({ message_id: sent.length });
    }
    if (method === "getUpdates") {
      const next = updates.shift();
      if (next) return reply(next);
      // Long poll: wait until the caller aborts, like the real API does with an empty queue.
      await new Promise<void>((resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
        setTimeout(resolve, 200);
      });
      return reply([]);
    }
    throw new Error("unexpected method " + method);
  }) as typeof fetch;
  return { sent, updates, fetchImpl };
}
function fakeMailer() {
  const messages: MailMessage[] = [];
  return {
    messages,
    async send(message: MailMessage) {
      messages.push(message);
    },
  };
}
async function harness(options: {
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
  mailer?: ReturnType<typeof fakeMailer> | null;
  fail?: boolean;
}) {
  const store = new Store(":memory:");
  const telegram = fakeTelegram();
  const calls: { provider: string; prompt: string }[] = [];
  const runtime = createApp(store, new TossClient(), false, {
    async run(provider, _model, prompt) {
      calls.push({ provider, prompt });
      await new Promise((r) => setTimeout(r, 5));
      if (options.fail) throw new Error("CLI 로그인이 필요합니다");
      // Answer for the brief window the server actually asked about, like a real run would.
      const date =
        /"briefWindow":\{"date":"(\d{4}-\d{2}-\d{2})"/.exec(prompt)?.[1] ||
        briefWindow().date;
      return briefResult(date, provider);
    },
    health: async () => [],
  });
  store.put("holdings", "manual:TEST", holding());
  const mailer = options.mailer === undefined ? fakeMailer() : options.mailer;
  const delivery = setupDelivery(runtime, {
    env: options.env || { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: "777" },
    now: options.now,
    mailer,
    telegramFetch: telegram.fetchImpl,
    log: () => {},
  });
  const server = runtime.app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const initial = await (await fetch(base + "/api/state")).json();
  return {
    store,
    runtime,
    delivery,
    telegram,
    mailer,
    calls,
    state: () => fetch(base + "/api/state").then((r) => r.json()),
    send(path: string, body: unknown, method = "POST") {
      return fetch(base + "/api" + path, {
        method,
        headers: {
          "content-type": "application/json",
          "x-oms-token": initial.csrf,
        },
        body: JSON.stringify(body),
      });
    },
    async settle() {
      for (let i = 0; i < 200; i++) {
        await new Promise((r) => setTimeout(r, 10));
        if (!runtime.activeJobs().length && !delivery.status().running) return;
      }
      throw new Error("delivery did not settle");
    },
    async close() {
      await delivery.stop();
      runtime.close();
      await new Promise<void>((r) => server.close(() => r()));
      store.close();
    },
  };
}
// Jobs use the server's real Korean date, so the fake clock is anchored to today and shifted by days.
const today = briefWindow().date;
const plusDays = (date: string, days: number) =>
  new Date(Date.parse(date + "T00:00:00Z") + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
const at = (date: string, time: string) => new Date(`${date}T${time}+09:00`);
const tuesday0700 = () => at(today, "07:00:30");

test("brief formatting escapes HTML, splits long messages and renders e-mail sections", () => {
  const date = "2026-09-15";
  const window = briefWindow(date + "T09:00:00+09:00");
  const run: AnalysisRun = {
    provider: "codex",
    model: "gpt-test",
    status: "completed",
    result: briefResult(date, "codex"),
    error: null,
    startedAt: null,
    finishedAt: null,
    validation: ["웹 검색 실행 또는 출처를 확인하지 못했습니다."],
  };
  const job = {
    id: "j1",
    title: `${date} 데일리 브리프`,
    skill: "daily",
    briefWindow: window,
    createdAt: date + "T00:00:00.000Z",
    runs: [run],
    evidence: [],
  } as unknown as AnalysisJob;
  const text = dailyBriefTelegram(job, run);
  assert.match(text, /codex 요약 &lt;b&gt;태그&lt;\/b&gt;/);
  assert.match(text, /S&amp;P 500/);
  assert.match(text, /금리 하락 기대로 상승/);
  assert.match(text, /전일 \+0\.1% · 고용 지표 소화/);
  assert.match(text, /href="https:\/\/example.com\/calendar\?a=1&amp;b=2"/);
  assert.match(text, /오늘 확인할 일정[\s\S]*CPI 발표/);
  assert.match(text, /다가오는 일정[\s\S]*실적 발표 \(TEST\) <i>잠정<\/i>/);
  assert.match(text, /1\. CPI 확인/);
  assert.match(
    text,
    /메인 뉴스[\s\S]*연준 인사가 금리 인하를 언급 &lt;b&gt;원문&lt;\/b&gt;/,
  );
  assert.match(
    text,
    /주요 기업 · 주가 변동[\s\S]*전일 종가 -1\.2% — 실적 가이던스 하향/,
  );
  assert.match(text, /섹터 동향[\s\S]*반도체[\s\S]*\+1\.8%/);
  assert.match(text, /⚠ 웹 검색 실행/);
  const chunks = splitTelegram(
    "가".repeat(5000) + "\n" + "나".repeat(3000),
    3900,
  );
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((c) => c.length <= 3900));
  assert.equal(chunks.join("").replace(/\n/g, "").length, 8000);
  const mail = dailyBriefEmail(job, false);
  assert.equal(mail.subject, "[OMS] 2026-09-15 데일리 브리프");
  assert.match(mail.html, /<h1[^>]*>2026-09-15/);
  assert.match(mail.html, /OpenAI · gpt-test/);
  assert.match(mail.html, /6,500\.12/);
  assert.match(mail.html, /메인 뉴스/);
  assert.match(mail.html, /주요 기업 · 주가 변동/);
  assert.match(mail.html, /섹터 동향/);
  assert.match(mail.html, /전일<\/span> 종가 -1\.2%/);
  assert.match(mail.html, /금액을 포함하지 않았어요/);
  assert.match(
    mail.text,
    /CME 휴장 안내 & 일정 \(https:\/\/example.com\/calendar\?a=1&b=2\)/,
  );
  // The AI's literal text comes back unchanged; only the markup we added is removed.
  assert.match(mail.text, /codex 요약 <b>태그<\/b>/);
  assert.doesNotMatch(mail.text, /<a href|<i>/);
  const summary = {
    usd: "220",
    krw: "300000",
    costUsd: "200",
    pnlUsd: "20",
    returnPct: "10",
    complete: true,
    cashKnown: false,
    cashUsd: "0",
    cashKrw: "0",
    holdings: [
      {
        ...holding(),
        value: "220",
        cost: "200",
        pnl: "20",
        returnPct: "10",
        weight: "100",
        stale: false,
      },
    ],
  };
  assert.match(portfolioTelegram(summary, null, true), /US\$220\.00|\$220\.00/);
  assert.doesNotMatch(portfolioTelegram(summary, null, false), /220/);
  assert.match(portfolioTelegram(summary, null, false), /\+10\.00%/);
});

test("environment validation for Telegram and SMTP", () => {
  assert.equal(telegramConfigFromEnv({}), null);
  assert.throws(
    () => telegramConfigFromEnv({ TELEGRAM_BOT_TOKEN: "bad" }),
    /형식/,
  );
  assert.throws(
    () =>
      telegramConfigFromEnv({
        TELEGRAM_BOT_TOKEN: TOKEN,
        TELEGRAM_CHAT_ID: "me",
      }),
    /숫자/,
  );
  assert.deepEqual(telegramConfigFromEnv({ TELEGRAM_BOT_TOKEN: TOKEN }), {
    token: TOKEN,
    chatId: "",
  });
  assert.equal(mailConfigFromEnv({}), null);
  assert.throws(() => mailConfigFromEnv({ SMTP_USER: "a@b.c" }), /SMTP_PASS/);
  const gmail = mailConfigFromEnv({
    SMTP_USER: "me@gmail.com",
    SMTP_PASS: "app-pass",
  });
  assert.deepEqual(gmail, {
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    user: "me@gmail.com",
    pass: "app-pass",
    from: "Oh My Stock <me@gmail.com>",
    defaultTo: "me@gmail.com",
  });
  assert.equal(
    mailConfigFromEnv({
      SMTP_USER: "u",
      SMTP_PASS: "p",
      SMTP_HOST: "smtp.naver.com",
      SMTP_PORT: "587",
    })!.secure,
    false,
  );
  assert.equal(kstClock(new Date("2026-09-13T15:00:00Z")).date, "2026-09-14");
  assert.equal(kstClock(new Date("2026-09-13T15:00:00Z")).minutes, 0);
  assert.equal(kstClock(new Date("2026-09-12T23:00:00Z")).weekend, true);
});

test("bot answers only the configured chat, tells an unconfigured owner their chat id, and recovers from bad markup", async () => {
  const telegram = fakeTelegram();
  telegram.updates.push([
    {
      update_id: 1,
      message: { text: "/help", chat: { id: 999, type: "private" } },
    },
    {
      update_id: 2,
      message: {
        text: "/help",
        chat: { id: 777, type: "private" },
        from: { username: "me" },
      },
    },
  ]);
  const seen: string[] = [];
  const bot = new TelegramBot(
    { token: TOKEN, chatId: "777" },
    async (m) => {
      seen.push(m.chatId + ":" + m.text);
    },
    telegram.fetchImpl,
    () => {},
  );
  bot.start();
  for (let i = 0; i < 100 && !seen.length; i++)
    await new Promise((r) => setTimeout(r, 5));
  await bot.stop();
  assert.deepEqual(seen, ["777:/help"]);
  assert.equal(telegram.sent.length, 0);
  await bot.send("<b>ok</b> BROKEN <i>");
  assert.deepEqual(telegram.sent, [{ chat: "777", text: "ok BROKEN " }]);

  const setup = fakeTelegram();
  setup.updates.push([
    {
      update_id: 5,
      message: { text: "hi", chat: { id: 4242, type: "private" } },
    },
    {
      update_id: 6,
      message: { text: "hi again", chat: { id: 4242, type: "private" } },
    },
  ]);
  const unconfigured = new TelegramBot(
    { token: TOKEN, chatId: "" },
    async () => assert.fail("must not handle before a chat id is configured"),
    setup.fetchImpl,
    () => {},
  );
  unconfigured.start();
  for (let i = 0; i < 100 && !setup.sent.length; i++)
    await new Promise((r) => setTimeout(r, 5));
  await unconfigured.stop();
  assert.equal(setup.sent.length, 1);
  assert.match(setup.sent[0].text, /4242/);
  assert.match(setup.sent[0].text, /TELEGRAM_CHAT_ID/);
});

test("Telegram commands: help, portfolio, status, brief creation and a free question", async () => {
  const h = await harness({ now: tuesday0700 });
  try {
    await h.delivery.handleMessage({
      chatId: "777",
      text: "/help",
      from: "me",
    });
    assert.match(h.telegram.sent.at(-1)!.text, /\/brief/);
    await h.delivery.handleMessage({
      chatId: "777",
      text: "/portfolio",
      from: "me",
    });
    assert.match(h.telegram.sent.at(-1)!.text, /TEST.*비중 100\.0%/);
    await h.delivery.handleMessage({
      chatId: "777",
      text: "/status",
      from: "me",
    });
    assert.match(h.telegram.sent.at(-1)!.text, /예약 브리프: 꺼짐/);
    await h.delivery.handleMessage({
      chatId: "777",
      text: "/whatever",
      from: "me",
    });
    assert.match(h.telegram.sent.at(-1)!.text, /모르는 명령/);

    await h.delivery.handleMessage({
      chatId: "777",
      text: "/brief",
      from: "me",
    });
    assert.match(
      h.telegram.sent.at(-1)!.text,
      /만들고 있어요 \(OpenAI·Claude\)/,
    );
    await h.settle();
    await new Promise((r) => setTimeout(r, 20));
    const briefs = h.telegram.sent.filter((m) =>
      /데일리 브리프<\/b> · (OpenAI|Claude)/.test(m.text),
    );
    assert.equal(briefs.length, 2);
    assert.equal(
      h.calls.filter((c) => /데일리 브리프|briefWindow/.test(c.prompt)).length,
      2,
    );
    // The advisor's saved model preferences are not touched by bot-triggered jobs.
    assert.equal(h.runtime.settings().models.claude, "sonnet");
    // Asking again returns the saved brief without a new analysis.
    const before = h.calls.length;
    await h.delivery.handleMessage({
      chatId: "777",
      text: "/brief",
      from: "me",
    });
    assert.equal(h.calls.length, before);
    assert.match(h.telegram.sent.at(-1)!.text, /데일리 브리프<\/b> · Claude/);

    await h.delivery.handleMessage({
      chatId: "777",
      text: "어도비 최근 실적 어때?",
      from: "me",
    });
    assert.match(h.telegram.sent.at(-1)!.text, /질문을 전달했어요/);
    await h.settle();
    await new Promise((r) => setTimeout(r, 20));
    const question = h.store
      .all<AnalysisJob>("jobs")
      .find((j) => j.skill === "news")!;
    assert.equal(question.prompt, "어도비 최근 실적 어때?");
    assert.ok(h.calls.some((c) => c.prompt.includes("어도비 최근 실적 어때?")));
    assert.match(
      h.telegram.sent.at(-1)!.text,
      /어도비 최근 실적 어때\?<\/b> · Claude/,
    );
    // Everything went to the owner only.
    assert.ok(h.telegram.sent.every((m) => m.chat === "777"));
  } finally {
    await h.close();
  }
});

test("scheduler runs once per Korean day inside the catch-up window and delivers to both channels", async () => {
  let clock = tuesday0700();
  const h = await harness({ now: () => clock });
  try {
    assert.equal(h.delivery.due(), false, "disabled by default");
    const res = await h.send(
      "/settings/delivery",
      {
        enabled: true,
        time: "07:00",
        days: "daily",
        telegram: true,
        email: true,
        emailTo: "me@example.com",
        providers: ["codex", "claude"],
        includeAmounts: true,
      },
      "PUT",
    );
    assert.equal(res.status, 200);
    assert.equal(h.delivery.due(), true);
    assert.equal(
      h.delivery.nextRunAt(),
      at(today, "07:00:00").toISOString(),
      "still today while it can be caught up",
    );
    h.delivery.tick();
    assert.equal(h.delivery.status().running, true);
    assert.equal(h.delivery.due(), false, "no second start while running");
    await h.settle();
    const state = await h.state();
    assert.equal(state.delivery.running, false);
    assert.equal(state.delivery.log.date, today);
    assert.match(state.delivery.log.telegram, /발송/);
    assert.match(state.delivery.log.email, /발송 → me@example.com/);
    assert.equal(state.delivery.log.error, null);
    assert.equal(h.mailer!.messages.length, 1);
    assert.equal(h.mailer!.messages[0].to, "me@example.com");
    assert.equal(h.mailer!.messages[0].subject, `[OMS] ${today} 데일리 브리프`);
    assert.match(h.mailer!.messages[0].html, /OpenAI/);
    assert.match(h.mailer!.messages[0].html, /Claude/);
    assert.match(h.telegram.sent[0].text, /데일리 브리프<\/b>가 도착했어요/);
    assert.equal(
      h.telegram.sent.filter((m) => /데일리 브리프<\/b> · /.test(m.text))
        .length,
      2,
    );
    // Same day: not again, next run is tomorrow 07:00 KST.
    clock = at(today, "08:30:00");
    assert.equal(h.delivery.due(), false);
    assert.equal(
      h.delivery.nextRunAt(),
      at(plusDays(today, 1), "07:00:00").toISOString(),
    );
    // Outside the two-hour catch-up window the slot is skipped for that day.
    clock = at(plusDays(today, 1), "09:30:00");
    assert.equal(h.delivery.due(), false);
    assert.equal(
      h.delivery.nextRunAt(),
      at(plusDays(today, 2), "07:00:00").toISOString(),
    );
    clock = at(plusDays(today, 1), "08:59:00");
    assert.equal(h.delivery.due(), true);
    // Weekday-only skips Saturday.
    await h.send(
      "/settings/delivery",
      {
        enabled: true,
        time: "07:00",
        days: "weekdays",
        telegram: true,
        email: false,
        emailTo: "",
        providers: ["codex"],
        includeAmounts: false,
      },
      "PUT",
    );
    clock = new Date("2026-09-19T07:10:00+09:00");
    assert.equal(h.delivery.due(), false);
    assert.equal(
      h.delivery.nextRunAt(),
      new Date("2026-09-21T07:00:00+09:00").toISOString(),
    );
    // Validation.
    const bad = await h.send(
      "/settings/delivery",
      {
        enabled: true,
        time: "7am",
        days: "daily",
        telegram: true,
        email: true,
        emailTo: "",
        providers: ["codex"],
        includeAmounts: true,
      },
      "PUT",
    );
    assert.equal(bad.status, 400);
    const badMail = await h.send(
      "/settings/delivery",
      {
        enabled: true,
        time: "07:00",
        days: "daily",
        telegram: true,
        email: true,
        emailTo: "not-an-email",
        providers: ["codex"],
        includeAmounts: true,
      },
      "PUT",
    );
    assert.equal(badMail.status, 400);
  } finally {
    await h.close();
  }
});

test("a failed scheduled brief is reported on Telegram and logged; test sends work through the API", async () => {
  const h = await harness({ now: tuesday0700, fail: true });
  try {
    await h.send(
      "/settings/delivery",
      {
        enabled: true,
        time: "07:00",
        days: "daily",
        telegram: true,
        email: true,
        emailTo: "me@example.com",
        providers: ["codex"],
        includeAmounts: true,
      },
      "PUT",
    );
    const run = await h.send("/delivery/run", {});
    assert.equal(run.status, 202);
    await h.settle();
    const log = h.delivery.status().log!;
    assert.match(
      log.error!,
      /브리프 생성 실패: OpenAI CLI 로그인이 필요합니다/,
    );
    assert.equal(log.email, "브리프 없음");
    assert.equal(h.mailer!.messages.length, 0);
    assert.ok(
      h.telegram.sent.some((m) =>
        /분석에 실패했어요[\s\S]*CLI 로그인이 필요합니다/.test(m.text),
      ),
    );
    // Manual runs are refused while one is in progress, and the same day is not re-run by the scheduler.
    assert.equal(h.delivery.due(), false);

    const tg = await h.send("/delivery/test", { channel: "telegram" });
    assert.equal(tg.status, 200);
    assert.match(h.telegram.sent.at(-1)!.text, /연결 확인/);
    const mail = await h.send("/delivery/test", { channel: "email" });
    assert.equal(mail.status, 200);
    assert.equal(h.mailer!.messages.at(-1)!.subject, "[OMS] 이메일 연결 확인");
    assert.equal(h.mailer!.messages.at(-1)!.to, "me@example.com");
    const state = await h.state();
    assert.equal(state.delivery.emailConfigured, true);
    assert.equal(state.delivery.telegramConfigured, true);
  } finally {
    await h.close();
  }
});

test("without Telegram or SMTP configuration the API explains what to set", async () => {
  const h = await harness({ env: {}, mailer: null });
  try {
    const state = await h.state();
    assert.equal(state.delivery.telegramConfigured, false);
    assert.equal(state.delivery.emailConfigured, false);
    const tg = await h.send("/delivery/test", { channel: "telegram" });
    assert.equal(tg.status, 400);
    assert.match((await tg.json()).error, /TELEGRAM_BOT_TOKEN/);
    const mail = await h.send("/delivery/test", { channel: "email" });
    assert.match((await mail.json()).error, /SMTP_USER/);
    // The HTTP analysis route still reports cached jobs the same way as before.
    const first = await h.send("/analyses", {
      skill: "allocation",
      providers: ["codex"],
      autoResearch: false,
    });
    assert.equal(first.status, 202);
    const second = await h.send("/analyses", {
      skill: "allocation",
      providers: ["codex"],
      autoResearch: false,
    });
    assert.equal(second.status, 200);
    assert.equal((await second.json()).cached, true);
    await h.settle();
  } finally {
    await h.close();
  }
});
