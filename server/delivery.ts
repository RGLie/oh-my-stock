import type { createApp } from "./app";
import type { AnalysisJob, DeliveryStatus } from "../shared/types";
import { briefWindow } from "./brief";
import {
  dailyBriefEmail,
  esc,
  kstTime,
  portfolioTelegram,
  providerName,
  runTelegram,
} from "./format";
import { Mailer, mailConfigFromEnv, type MailSender } from "./mail";
import {
  TelegramBot,
  telegramConfigFromEnv,
  type IncomingMessage,
} from "./telegram";

type Runtime = ReturnType<typeof createApp>;
type Log = NonNullable<DeliveryStatus["log"]>;
const LOG_KEY = "delivery-log";
const effortOrder = ["low", "medium", "high", "xhigh", "max", "ultra"];

// Korean wall-clock pieces for the scheduler; the process may run in any timezone.
export function kstClock(at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(at);
  const v = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${v("year")}-${v("month")}-${v("day")}`,
    minutes: Number(v("hour")) * 60 + Number(v("minute")),
    weekend: ["Sat", "Sun"].includes(v("weekday")),
  };
}
const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
// A missed slot (server restart, long-running analyses) is still honoured within this window.
const CATCH_UP_MINUTES = 120;

export function setupDelivery(
  runtime: Runtime,
  options: {
    env?: NodeJS.ProcessEnv;
    now?: () => Date;
    mailer?: MailSender | null;
    telegramFetch?: typeof fetch;
    log?: (message: string) => void;
    tickMs?: number;
  } = {},
) {
  const env = options.env || process.env;
  const clock = options.now || (() => new Date());
  const report =
    options.log || ((m: string) => console.error("[delivery] " + m));
  const telegramConfig = telegramConfigFromEnv(env);
  const mailConfig = mailConfigFromEnv(env);
  const mailer: MailSender | null =
    options.mailer !== undefined
      ? options.mailer
      : mailConfig
        ? new Mailer(mailConfig)
        : null;
  const { store } = runtime;
  const delivery = () => runtime.settings().delivery!;
  let running = false;
  let ticker: ReturnType<typeof setInterval> | null = null;
  const sentToTelegram = new Set<string>();
  const readLog = () => store.get<Log>("meta", LOG_KEY) || null;
  const writeLog = (log: Log | null) => {
    if (log) store.put("meta", LOG_KEY, log);
    else store.delete("meta", LOG_KEY);
  };

  // ---- Telegram commands -------------------------------------------------------------------
  const help = [
    "<b>Oh My Stock 봇</b>",
    "/brief — 오늘 데일리 브리프 (없으면 새로 만들어요)",
    "/brief new — 브리프를 다시 조사해서 만들어요",
    "/news — 대시보드 주요 뉴스 (/news new 로 새로고침)",
    "/portfolio — 보유 종목과 평가 요약",
    "/status — AI 로그인·토스 연결·진행 중 작업·예약 상태",
    "/cancel — 진행 중인 분석 모두 취소",
    "그 외 문장을 보내면 AI 투자 파트너에게 질문으로 전달돼요. 조사에 보통 3~10분 걸리고, 끝나면 답장이 와요.",
  ].join("\n");
  const providersForChat = () => {
    const wanted = delivery().providers;
    const health = runtime.providers();
    // Only logged-in AIs are used; if health is unknown yet, trust the setting.
    const ready = wanted.filter((p) => {
      const info = health.find((x) => x.id === p);
      return !info || info.authenticated !== false;
    });
    return ready.length ? ready : wanted;
  };
  const lowestEffort = (provider: "codex" | "claude", model: string) => {
    const supported = runtime.providers().find((p) => p.id === provider)
      ?.modelEfforts?.[model];
    return (
      (supported?.length &&
        (effortOrder.find((e) => supported.includes(e)) || supported[0])) ||
      "low"
    );
  };
  const sendJobToTelegram = async (job: AnalysisJob, intro?: string) => {
    if (!bot) return;
    if (sentToTelegram.has(job.id)) return;
    sentToTelegram.add(job.id);
    const completed = job.runs.filter(
      (r) => r.status === "completed" && r.result,
    );
    if (intro) await bot.send(intro);
    for (const run of completed) await bot.send(runTelegram(job, run));
    const failed = job.runs.filter((r) => r.status !== "completed");
    if (failed.length)
      await bot.send(
        (completed.length
          ? "일부 AI는 실패했어요.\n"
          : "❌ 분석에 실패했어요.\n") +
          failed
            .map(
              (r) =>
                `• ${esc(providerName(r.provider))}: ${esc(r.error || r.status)}`,
            )
            .join("\n") +
          (completed.length
            ? ""
            : "\n\nCLI 로그인 상태(/status)와 모델 설정을 확인해 주세요."),
      );
  };
  const followJob = (id: string, intro?: string) => {
    void runtime
      .waitForJob(id)
      .then((job) => sendJobToTelegram(job, intro))
      .catch((e) => report(e instanceof Error ? e.message : String(e)));
  };
  const todayBrief = () => {
    const today = briefWindow(clock().toISOString()).date;
    return store
      .all<AnalysisJob>("jobs")
      .find(
        (j) =>
          j.skill === "daily" &&
          j.briefWindow?.date === today &&
          (["queued", "running"].includes(j.status) ||
            j.runs.some((r) => r.status === "completed")),
      );
  };
  const startBrief = (saveSettings = false) => {
    const s = runtime.settings();
    return runtime.startAnalysis(
      {
        skill: "daily",
        prompt: "",
        target: "",
        evidenceIds: [],
        autoResearch: true,
        providers: providersForChat(),
        models: s.models,
        efforts: runtime.efforts(),
        force: true,
      },
      { saveSettings },
    );
  };
  async function handleMessage(message: IncomingMessage): Promise<void> {
    if (!bot) return;
    const text = message.text;
    const [command, ...rest] = text.split(/\s+/);
    const arg = rest.join(" ").trim();
    const cmd = command.toLowerCase().replace(/@\w+$/, "");
    if (cmd === "/start" || cmd === "/help") return bot.send(help);
    if (cmd === "/brief") {
      const existing = arg !== "new" ? todayBrief() : undefined;
      if (existing && ["queued", "running"].includes(existing.status)) {
        await bot.send(
          "오늘 브리프를 이미 만들고 있어요. 완료되면 보내드릴게요.",
        );
        followJob(existing.id);
        return;
      }
      if (existing) {
        sentToTelegram.delete(existing.id);
        return sendJobToTelegram(existing);
      }
      const started = startBrief();
      await bot.send(
        started.cached
          ? "이미 브리프를 만들고 있어요. 완료되면 보내드릴게요."
          : `📅 오늘 데일리 브리프를 만들고 있어요 (${providersForChat()
              .map(providerName)
              .join("·")}). 보통 3~10분 걸려요.`,
      );
      followJob(started.id);
      return;
    }
    if (cmd === "/news") {
      const latest = store
        .all<AnalysisJob>("jobs")
        .find((j) => j.skill === "headlines");
      if (
        arg !== "new" &&
        latest &&
        latest.runs.some((r) => r.status === "completed")
      ) {
        sentToTelegram.delete(latest.id);
        await sendJobToTelegram(latest);
        await bot.send(
          `<i>${esc(kstTime(latest.createdAt))} 기준 뉴스예요. 새로 조사하려면 /news new</i>`,
        );
        return;
      }
      if (
        arg !== "new" &&
        latest &&
        ["queued", "running"].includes(latest.status)
      ) {
        await bot.send(
          "주요 뉴스를 이미 조사하고 있어요. 완료되면 보내드릴게요.",
        );
        followJob(latest.id);
        return;
      }
      const h = runtime.settings().headlines!;
      const started = runtime.startAnalysis({
        skill: "headlines",
        prompt: "",
        target: "",
        evidenceIds: [],
        autoResearch: true,
        providers: [h.provider],
        models: h.models,
        efforts: {
          codex: lowestEffort("codex", h.models.codex) as never,
          claude: lowestEffort("claude", h.models.claude) as never,
        },
        force: true,
      });
      await bot.send(
        started.cached
          ? "이미 뉴스를 조사하고 있어요. 완료되면 보내드릴게요."
          : `📰 ${providerName(h.provider)}가 주요 뉴스를 조사하고 있어요. 1~3분 정도 걸려요.`,
      );
      followJob(started.id);
      return;
    }
    if (cmd === "/portfolio")
      return bot.send(
        portfolioTelegram(
          runtime.summary(),
          runtime.fx(),
          delivery().includeAmounts,
        ),
      );
    if (cmd === "/status") return bot.send(statusText());
    if (cmd === "/cancel") {
      const count = runtime.cancelAll();
      return bot.send(
        count
          ? `진행 중인 분석 ${count}건을 취소했어요.`
          : "진행 중인 분석이 없어요.",
      );
    }
    if (cmd.startsWith("/") && cmd !== "/ask")
      return bot.send("모르는 명령이에요.\n\n" + help);
    const question = cmd === "/ask" ? arg : text;
    if (!question)
      return bot.send(
        "질문을 함께 보내 주세요. 예: /ask 어도비 최근 실적 어때?",
      );
    if (question.length > 4000)
      return bot.send("질문이 너무 길어요. 4000자 이내로 보내 주세요.");
    const s = runtime.settings();
    const started = runtime.startAnalysis(
      {
        skill: "news",
        prompt: question,
        target: "",
        evidenceIds: [],
        autoResearch: true,
        providers: providersForChat(),
        models: s.models,
        efforts: runtime.efforts(),
        force: true,
      },
      { saveSettings: false },
    );
    await bot.send(
      started.cached
        ? "같은 질문을 이미 조사하고 있어요. 완료되면 보내드릴게요."
        : `🔎 ${providersForChat().map(providerName).join("·")}에게 질문을 전달했어요. 웹 조사를 포함해 보통 3~10분 걸려요.`,
    );
    followJob(started.id);
  }
  function statusText() {
    const s = delivery();
    const log = readLog();
    const lines = ["<b>OMS 상태</b>"];
    for (const p of runtime.providers())
      lines.push(
        `• ${esc(p.name)}: ${p.authenticated ? "로그인됨" : p.available ? "로그인 필요" : "확인 필요"}${
          p.version ? ` (${esc(p.version)})` : ""
        }`,
      );
    if (!runtime.providers().length)
      lines.push("• AI 연결 상태를 아직 확인하지 못했어요.");
    const c = runtime.connection();
    lines.push(
      `• 토스: ${esc(c.status)}${c.lastSync ? ` · 마지막 동기화 ${esc(kstTime(c.lastSync))}` : ""}`,
    );
    const active = runtime.activeJobs();
    lines.push(
      active.length
        ? `• 진행 중: ${active.map((j) => esc(j.title)).join(", ")}`
        : "• 진행 중인 분석 없음",
    );
    lines.push(
      `• 예약 브리프: ${
        s.enabled
          ? `${s.days === "weekdays" ? "평일" : "매일"} ${esc(s.time)} (${
              [s.telegram && "텔레그램", s.email && "이메일"]
                .filter(Boolean)
                .join("·") || "채널 없음"
            })`
          : "꺼짐"
      }`,
    );
    const next = nextRunAt();
    if (s.enabled && next) lines.push(`• 다음 실행: ${esc(kstTime(next))}`);
    if (log)
      lines.push(
        `• 마지막 발송 (${esc(log.date)}): ${
          log.error
            ? "실패 · " + esc(log.error)
            : [
                log.telegram && "텔레그램 " + log.telegram,
                log.email && "이메일 " + log.email,
              ]
                .filter(Boolean)
                .map(String)
                .map(esc)
                .join(" · ") || (log.finishedAt ? "완료" : "진행 중")
        }`,
      );
    return lines.join("\n");
  }
  const bot: TelegramBot | null = telegramConfig
    ? new TelegramBot(
        telegramConfig,
        handleMessage,
        options.telegramFetch,
        report,
      )
    : null;

  // ---- Scheduler -------------------------------------------------------------------------------
  function nextRunAt(): string | null {
    const s = delivery();
    if (!s.enabled) return null;
    const log = readLog();
    const at = clock();
    for (let day = 0; day < 8; day++) {
      const probe = new Date(at.getTime() + day * 86_400_000);
      const k = kstClock(probe);
      if (s.days === "weekdays" && k.weekend) continue;
      if (log?.date === k.date) continue;
      // Today counts while the slot can still be caught up; once the window has passed the day is skipped.
      if (day === 0 && k.minutes >= toMinutes(s.time) + CATCH_UP_MINUTES)
        continue;
      return new Date(`${k.date}T${s.time}:00+09:00`).toISOString();
    }
    return null;
  }
  function due() {
    const s = delivery();
    if (!s.enabled || running) return false;
    const k = kstClock(clock());
    if (s.days === "weekdays" && k.weekend) return false;
    const start = toMinutes(s.time);
    if (k.minutes < start || k.minutes >= start + CATCH_UP_MINUTES)
      return false;
    return readLog()?.date !== k.date;
  }
  async function runBrief(trigger: "schedule" | "manual") {
    if (running) throw new Error("예약 브리프가 이미 진행 중이에요.");
    running = true;
    const previous = readLog();
    const k = kstClock(clock());
    const log: Log = {
      date: k.date,
      jobId: null,
      startedAt: clock().toISOString(),
      finishedAt: null,
      telegram: null,
      email: null,
      error: null,
    };
    writeLog(log);
    let started: { id: string; cached: boolean };
    try {
      started = startBrief();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      running = false;
      // Other analyses are using both slots: leave the day unmarked so the next tick retries.
      if (trigger === "schedule" && /동시에 진행 중인 분석/.test(message)) {
        writeLog(previous);
        return { id: "" };
      }
      log.error = message;
      log.finishedAt = clock().toISOString();
      writeLog(log);
      if (bot && trigger === "schedule")
        await bot
          .send(`❌ 예약 데일리 브리프를 시작하지 못했어요: ${esc(message)}`)
          .catch(() => {});
      throw e;
    }
    log.jobId = started.id;
    writeLog(log);
    void (async () => {
      try {
        const job = await runtime.waitForJob(started.id);
        await deliver(job, log);
      } catch (e) {
        log.error = e instanceof Error ? e.message : String(e);
      } finally {
        log.finishedAt = clock().toISOString();
        writeLog(log);
        running = false;
      }
    })();
    return { id: started.id };
  }
  async function deliver(job: AnalysisJob, log: Log) {
    const s = delivery();
    const completed = job.runs.filter(
      (r) => r.status === "completed" && r.result,
    );
    const errors: string[] = [];
    if (s.telegram && bot) {
      try {
        await sendJobToTelegram(
          job,
          completed.length
            ? `☀️ <b>${esc(job.briefWindow?.date || "")} 데일리 브리프</b>가 도착했어요.`
            : undefined,
        );
        log.telegram = kstTime(clock().toISOString(), false) + " 발송";
      } catch (e) {
        log.telegram = "실패";
        errors.push(
          "텔레그램: " + (e instanceof Error ? e.message : String(e)),
        );
      }
    } else if (s.telegram) log.telegram = "미설정";
    if (s.email && mailer) {
      const to = s.emailTo || mailConfig?.defaultTo || "";
      if (!to) {
        log.email = "받는 주소 없음";
      } else if (!completed.length) {
        log.email = "브리프 없음";
      } else {
        try {
          const message = dailyBriefEmail(job, s.includeAmounts);
          await mailer.send({ to, ...message });
          log.email = kstTime(clock().toISOString(), false) + " 발송 → " + to;
        } catch (e) {
          log.email = "실패";
          errors.push(
            "이메일: " + (e instanceof Error ? e.message : String(e)),
          );
        }
      }
    } else if (s.email) log.email = "미설정";
    if (!completed.length)
      errors.unshift(
        "브리프 생성 실패: " +
          job.runs
            .map((r) => `${providerName(r.provider)} ${r.error || r.status}`)
            .join(" / "),
      );
    if (!errors.length) return;
    log.error = errors.join(" · ");
    // The Telegram delivery above already explains a failed brief when it is enabled; otherwise
    // (or for a channel error) the owner still gets one notice so a silent morning is noticed.
    const alreadyTold = s.telegram && log.telegram?.endsWith("발송");
    const notice = errors.filter(
      (e) => !alreadyTold || !e.startsWith("브리프 생성 실패"),
    );
    if (bot && notice.length)
      await bot.send(`⚠ ${esc(notice.join(" · "))}`).catch(() => {});
  }
  function tick() {
    if (!due()) return;
    runBrief("schedule").catch((e) =>
      report(e instanceof Error ? e.message : String(e)),
    );
  }

  const handler = {
    status(): DeliveryStatus {
      return {
        telegramConfigured: Boolean(telegramConfig?.chatId),
        emailConfigured: Boolean(mailer),
        emailSender: mailConfig?.user || "",
        botRunning: Boolean(bot?.running && !bot.lastError),
        nextRunAt: nextRunAt(),
        running,
        log: readLog(),
      };
    },
    async test(channel: "telegram" | "email") {
      if (channel === "telegram") {
        if (!bot)
          throw new Error(
            ".env에 TELEGRAM_BOT_TOKEN을 설정하고 서버를 재시작해 주세요.",
          );
        if (!telegramConfig?.chatId)
          throw new Error(
            "봇에게 아무 메시지를 보내 chat ID를 받은 뒤 .env의 TELEGRAM_CHAT_ID에 넣어 주세요.",
          );
        await bot.send(
          `✅ OMS 텔레그램 연결 확인 · ${esc(kstTime(clock().toISOString()))}\n/help 를 보내면 명령을 볼 수 있어요.`,
        );
        return "텔레그램으로 확인 메시지를 보냈어요.";
      }
      if (!mailer)
        throw new Error(
          ".env에 SMTP_USER·SMTP_PASS를 설정하고 서버를 재시작해 주세요.",
        );
      const to = delivery().emailTo || mailConfig?.defaultTo || "";
      if (!to) throw new Error("받는 이메일 주소를 입력해 주세요.");
      const latest = store
        .all<AnalysisJob>("jobs")
        .find(
          (j) =>
            j.skill === "daily" && j.runs.some((r) => r.status === "completed"),
        );
      if (latest) {
        const message = dailyBriefEmail(latest, delivery().includeAmounts);
        await mailer.send({
          to,
          ...message,
          subject: message.subject + " (테스트)",
        });
        return `${to}로 최근 브리프(${latest.briefWindow?.date})를 테스트 발송했어요.`;
      }
      await mailer.send({
        to,
        subject: "[OMS] 이메일 연결 확인",
        text: "Oh My Stock 이메일 발송 설정이 정상이에요.",
        html: "<p>Oh My Stock 이메일 발송 설정이 정상이에요.</p>",
      });
      return `${to}로 확인 메일을 보냈어요.`;
    },
    runNow: () => runBrief("manual"),
    handleMessage,
    statusText,
    tick,
    due,
    nextRunAt,
    bot,
    async start() {
      runtime.setDelivery(handler);
      if (bot) {
        try {
          const name = await bot.verify();
          report(
            `텔레그램 봇 @${name} 연결, chat ID ${telegramConfig?.chatId || "(미설정 · 봇에게 메시지를 보내 확인)"}`,
          );
        } catch (e) {
          report(
            "텔레그램 봇 확인 실패: " +
              (e instanceof Error ? e.message : String(e)),
          );
        }
        bot.start();
      }
      if (mailConfig)
        report(`이메일 발송 준비: ${mailConfig.user} (${mailConfig.host})`);
      ticker = setInterval(tick, options.tickMs ?? 30_000);
      ticker.unref();
    },
    async stop() {
      if (ticker) clearInterval(ticker);
      ticker = null;
      await bot?.stop();
    },
  };
  runtime.setDelivery(handler);
  return handler;
}
