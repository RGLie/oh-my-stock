import type {
  AnalysisJob,
  AnalysisResult,
  AnalysisRun,
  Summary,
} from "../shared/types";

// Text renderers shared by the Telegram bot and the e-mail sender. They read saved results only and
// never change them; both channels show the same numbers the web report shows.

export const providerName = (id: string) =>
  id === "codex" ? "OpenAI" : id === "claude" ? "Claude" : id;

export const esc = (value: string) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export const kstTime = (value: string, withDate = true) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    ...(withDate ? { month: "numeric", day: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const sourceOf = (result: AnalysisResult, job: AnalysisJob, id: string) =>
  result.sources?.find((s) => s.id === id) ||
  job.evidence.find((e) => e.id === id);

const linkList = (
  result: AnalysisResult,
  job: AnalysisJob,
  ids: string[],
  limit = 2,
) =>
  ids
    .map((id) => sourceOf(result, job, id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s?.url))
    .slice(0, limit)
    .map((s) => `<a href="${esc(s.url)}">${esc(s.title || "출처")}</a>`)
    .join(" · ");

function splitEvents(job: AnalysisJob, result: AnalysisResult) {
  const events = result.dailyBrief?.events || [];
  const today = events.filter(
    (e) =>
      e.scheduledAt &&
      job.briefWindow &&
      Date.parse(e.scheduledAt) >= Date.parse(job.briefWindow.dayStartAt) &&
      Date.parse(e.scheduledAt) < Date.parse(job.briefWindow.dayEndAt),
  );
  return { today, upcoming: events.filter((e) => !today.includes(e)) };
}

function indexDetail(i: {
  reason?: string;
  previousChange?: string;
  previousReason?: string;
}) {
  const lines: string[] = [];
  if (i.reason) lines.push(i.reason);
  if (i.previousChange || i.previousReason)
    lines.push(
      `전일 ${[i.previousChange, i.previousReason].filter(Boolean).join(" · ")}`,
    );
  return lines;
}

function sourcesLine(
  result: AnalysisResult,
  job: AnalysisJob,
  ids: string[],
  limit = 2,
) {
  const links = linkList(result, job, ids, limit);
  return links ? `\n  ${links}` : "";
}

// Telegram HTML (only <b>, <i>, <a> are used). The caller splits long output.
export function dailyBriefTelegram(job: AnalysisJob, run: AnalysisRun) {
  const result = run.result;
  const brief = result?.dailyBrief;
  if (!result || !brief) return "";
  const lines: string[] = [];
  lines.push(
    `<b>📅 ${esc(brief.date)} 데일리 브리프</b> · ${esc(providerName(run.provider))}`,
  );
  if (result.headline) lines.push(`<b>${esc(result.headline)}</b>`);
  if (brief.marketStatus) lines.push(esc(brief.marketStatus));
  if (result.summary) lines.push("", esc(result.summary));
  if (brief.indices.length) {
    lines.push("", "<b>📊 시장 한눈에</b>");
    for (const i of brief.indices) {
      lines.push(
        `• ${esc(i.name)} <b>${esc(i.value)}</b> (${esc(i.change)})${
          i.asOf ? ` <i>${esc(i.asOf)}</i>` : ""
        }`,
      );
      for (const detail of indexDetail(i)) lines.push(`  ${esc(detail)}`);
    }
  }
  if (brief.news?.length) {
    lines.push("", "<b>📰 메인 뉴스</b>");
    for (const n of brief.news)
      lines.push(
        `• <b>${esc(n.title)}</b>\n  ${esc(n.summary)}${
          n.whyItMatters ? `\n  → ${esc(n.whyItMatters)}` : ""
        }${sourcesLine(result, job, n.evidenceIds, 1)}`,
      );
  }
  if (brief.companies?.length) {
    lines.push("", "<b>🏢 주요 기업 · 주가 변동</b>");
    for (const c of brief.companies)
      lines.push(
        `• <b>${esc(c.name)}</b>${c.symbol ? ` (${esc(c.symbol)})` : ""}\n  전일 ${esc(
          c.previousMove,
        )} — ${esc(c.previousReason)}\n  현재 ${esc(c.currentMove)} — ${esc(
          c.currentReason,
        )}${sourcesLine(result, job, c.evidenceIds, 1)}`,
      );
  }
  if (brief.sectors?.length) {
    lines.push("", "<b>🏭 섹터 동향</b>");
    for (const s of brief.sectors)
      lines.push(
        `• <b>${esc(s.name)}</b> ${esc(s.move)}\n  ${esc(s.reason)}${sourcesLine(
          result,
          job,
          s.evidenceIds,
          1,
        )}`,
      );
  }
  const { today, upcoming } = splitEvents(job, result);
  const eventLine = (e: (typeof today)[number]) =>
    `• <b>${e.scheduledAt ? esc(kstTime(e.scheduledAt)) : "시각 미확인"}</b> ${esc(
      e.title,
    )}${e.symbols.length ? ` (${esc(e.symbols.join(", "))})` : ""}${
      e.status === "tentative" ? " <i>잠정</i>" : ""
    }\n  ${esc(e.timing)}${e.portfolioImpact ? `\n  → ${esc(e.portfolioImpact)}` : ""}`;
  lines.push("", "<b>🗓 오늘 확인할 일정</b>");
  lines.push(
    ...(today.length ? today.map(eventLine) : ["확인된 일정이 없어요."]),
  );
  if (upcoming.length)
    lines.push("", "<b>⏭ 다가오는 일정</b>", ...upcoming.map(eventLine));
  if (brief.priorities.length) {
    lines.push("", "<b>✅ 오늘의 확인 순서</b>");
    brief.priorities.forEach((p, i) => lines.push(`${i + 1}. ${esc(p)}`));
  }
  if (result.impacts.length) {
    lines.push("", "<b>💼 포트폴리오 영향</b>");
    result.impacts.forEach((p) => lines.push(`• ${esc(p)}`));
  }
  if (result.actions.length) {
    lines.push("", "<b>🎯 오늘 확인할 행동</b>");
    result.actions.forEach((p) => lines.push(`• ${esc(p)}`));
  }
  if (result.unknowns.length) {
    lines.push("", "<b>❔ 확인하지 못한 것</b>");
    result.unknowns.slice(0, 5).forEach((p) => lines.push(`• ${esc(p)}`));
  }
  const sources = (result.sources || []).slice(0, 8);
  if (sources.length) {
    lines.push("", "<b>🔗 출처</b>");
    sources.forEach((s) =>
      lines.push(`• <a href="${esc(s.url)}">${esc(s.title || s.url)}</a>`),
    );
  }
  if (run.validation.length)
    lines.push("", `<i>⚠ ${esc(run.validation.join(" "))}</i>`);
  return lines.join("\n");
}

// Generic analysis report (news, earnings, macro, headlines, ...) for Telegram.
export function reportTelegram(job: AnalysisJob, run: AnalysisRun) {
  const result = run.result;
  if (!result) return "";
  const lines: string[] = [];
  lines.push(
    `<b>🧭 ${esc(job.title)}</b> · ${esc(providerName(run.provider))}${
      run.actualModel || run.model
        ? ` (${esc(run.actualModel || run.model)})`
        : ""
    }`,
  );
  if (result.headline) lines.push(`<b>${esc(result.headline)}</b>`);
  if (result.summary) lines.push("", esc(result.summary));
  if (result.headlines?.length) {
    lines.push("", "<b>📰 주요 뉴스</b>");
    const mark = { high: "🔴", medium: "🟠", low: "⚪" } as const;
    for (const h of result.headlines)
      lines.push(
        `${mark[h.importance || "low"]} <b>${esc(h.title)}</b>\n  ${esc(
          h.summary,
        )}${h.portfolioRelevance ? `\n  → ${esc(h.portfolioRelevance)}` : ""}${
          linkList(result, job, h.evidenceIds, 1)
            ? `\n  ${linkList(result, job, h.evidenceIds, 1)}`
            : ""
        }`,
      );
  }
  if (result.highlights?.length) {
    lines.push("", "<b>✨ 핵심</b>");
    result.highlights.forEach((p) => lines.push(`• ${esc(p)}`));
  }
  if (result.metrics?.length) {
    lines.push("", "<b>📊 주요 수치</b>");
    result.metrics
      .slice(0, 8)
      .forEach((m) =>
        lines.push(
          `• ${esc(m.label)}: <b>${esc(m.value)}</b>${m.context ? ` — ${esc(m.context)}` : ""}`,
        ),
      );
  }
  if (result.rebalance) {
    lines.push("", "<b>⚖️ 리밸런싱 제안</b>", esc(result.rebalance.stance));
    const label = {
      keep: "유지",
      add: "확대",
      trim: "축소",
      exit: "정리",
      new: "신규",
    } as const;
    for (const p of result.rebalance.proposals)
      lines.push(
        `• ${esc(p.symbol)} <b>${label[p.action]}</b>${
          p.currentWeight || p.proposedWeight
            ? ` ${esc(p.currentWeight || "?")} → ${esc(p.proposedWeight || "유지")}`
            : ""
        }\n  ${esc(p.rationale)}`,
      );
    if (result.rebalance.cashNote) lines.push(esc(result.rebalance.cashNote));
  }
  if (result.facts.length && !result.headlines?.length) {
    lines.push("", "<b>📌 확인한 사실</b>");
    result.facts
      .slice(0, 8)
      .forEach((f) => lines.push(`• ${esc(f.statement)}`));
  }
  if (result.impacts.length) {
    lines.push("", "<b>💼 포트폴리오 영향</b>");
    result.impacts.forEach((p) => lines.push(`• ${esc(p)}`));
  }
  if (result.counterarguments.length) {
    lines.push("", "<b>🔄 반대 근거</b>");
    result.counterarguments
      .slice(0, 5)
      .forEach((p) => lines.push(`• ${esc(p)}`));
  }
  if (result.actions.length) {
    lines.push("", "<b>🎯 행동</b>");
    result.actions.forEach((p) => lines.push(`• ${esc(p)}`));
  }
  if (result.reviewConditions.length) {
    lines.push("", "<b>🔁 재검토 조건</b>");
    result.reviewConditions
      .slice(0, 5)
      .forEach((p) => lines.push(`• ${esc(p)}`));
  }
  if (result.unknowns.length) {
    lines.push("", "<b>❔ 확인하지 못한 것</b>");
    result.unknowns.slice(0, 5).forEach((p) => lines.push(`• ${esc(p)}`));
  }
  const sources = (result.sources || []).slice(0, 8);
  if (sources.length) {
    lines.push("", "<b>🔗 출처</b>");
    sources.forEach((s) =>
      lines.push(`• <a href="${esc(s.url)}">${esc(s.title || s.url)}</a>`),
    );
  }
  if (run.validation.length)
    lines.push("", `<i>⚠ ${esc(run.validation.join(" "))}</i>`);
  return lines.join("\n");
}

export function runTelegram(job: AnalysisJob, run: AnalysisRun) {
  return job.skill === "daily" && run.result?.dailyBrief
    ? dailyBriefTelegram(job, run)
    : reportTelegram(job, run);
}

const money = (value: string | null, currency: "USD" | "KRW") =>
  value === null
    ? "—"
    : new Intl.NumberFormat("ko-KR", {
        style: "currency",
        currency,
        maximumFractionDigits: currency === "USD" ? 2 : 0,
      }).format(Number(value));
const pct = (value: string | null) =>
  value === null
    ? "—"
    : `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}%`;

export function portfolioTelegram(
  summary: Summary,
  fx: { rate: string; at: string } | null,
  includeAmounts: boolean,
) {
  const lines: string[] = ["<b>💼 포트폴리오</b>"];
  if (includeAmounts) {
    lines.push(
      `총자산 <b>${esc(money(summary.usd, "USD"))}</b>${
        summary.krw ? ` · ${esc(money(summary.krw, "KRW"))}` : ""
      }${summary.complete ? "" : " <i>(일부 시세 없음)</i>"}`,
    );
    lines.push(
      `평가손익 <b>${esc(money(summary.pnlUsd, "USD"))}</b> (${esc(pct(summary.returnPct))})`,
    );
    if (summary.cashKnown)
      lines.push(
        `현금 ${esc(money(summary.cashUsd, "USD"))} · ${esc(money(summary.cashKrw, "KRW"))}`,
      );
  } else lines.push(`평가 수익률 <b>${esc(pct(summary.returnPct))}</b>`);
  if (fx)
    lines.push(
      `USD/KRW ${esc(Number(fx.rate).toFixed(2))} (${esc(kstTime(fx.at))})`,
    );
  const holdings = [...summary.holdings].sort(
    (a, b) => Number(b.weight ?? 0) - Number(a.weight ?? 0),
  );
  if (holdings.length) {
    lines.push("", "<b>보유 종목</b>");
    for (const h of holdings)
      lines.push(
        `• <b>${esc(h.symbol)}</b> ${esc(h.name)} · 비중 ${
          h.weight === null ? "—" : esc(Number(h.weight).toFixed(1)) + "%"
        } · ${esc(pct(h.returnPct))}${
          includeAmounts ? ` · ${esc(money(h.value, h.currency))}` : ""
        }${h.stale ? " <i>(시세 오래됨)</i>" : ""}`,
      );
  } else lines.push("보유 종목이 없어요.");
  return lines.join("\n");
}

// Telegram accepts 4096 characters per message; split on blank lines, then lines, keeping tags intact.
export function splitTelegram(text: string, max = 3900): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let current = "";
  const push = (piece: string) => {
    if ((current + "\n" + piece).length > max && current) {
      parts.push(current);
      current = piece;
    } else current = current ? current + "\n" + piece : piece;
  };
  for (const paragraph of text.split("\n")) {
    if (paragraph.length > max) {
      for (let i = 0; i < paragraph.length; i += max)
        push(paragraph.slice(i, i + max));
    } else push(paragraph);
  }
  if (current) parts.push(current);
  return parts;
}

// E-mail HTML: one section per completed AI. Inline styles only; mail clients ignore stylesheets.
export function dailyBriefEmail(job: AnalysisJob, includeAmounts: boolean) {
  const runs = job.runs.filter((r) => r.status === "completed" && r.result);
  const date = job.briefWindow?.date || job.createdAt.slice(0, 10);
  const subject = `[OMS] ${date} 데일리 브리프${
    runs.length ? "" : " · 생성 실패"
  }`;
  const h = (n: number, text: string) =>
    `<h${n} style="margin:20px 0 8px;font-size:${n === 2 ? 18 : 15}px;color:#111">${esc(text)}</h${n}>`;
  const p = (text: string) =>
    `<p style="margin:0 0 10px;line-height:1.6;color:#222">${esc(text)}</p>`;
  const ul = (items: string[]) =>
    items.length
      ? `<ul style="margin:0 0 10px 18px;padding:0;line-height:1.6;color:#222">${items
          .map((i) => `<li>${i}</li>`)
          .join("")}</ul>`
      : "";
  const sections = runs.map((run) => {
    const result = run.result!;
    const brief = result.dailyBrief;
    const { today, upcoming } = splitEvents(job, result);
    const eventRows = (events: typeof today) =>
      events.length
        ? `<table style="border-collapse:collapse;width:100%;margin:0 0 10px">${events
            .map(
              (e) => `<tr>
  <td style="vertical-align:top;padding:6px 8px 6px 0;white-space:nowrap;color:#444;font-size:13px">${
    e.scheduledAt ? esc(kstTime(e.scheduledAt)) : "시각 미확인"
  }${e.status === "tentative" ? "<br><span style='color:#a66'>잠정</span>" : ""}</td>
  <td style="vertical-align:top;padding:6px 0;border-bottom:1px solid #eee">
    <strong>${esc(e.title)}</strong>${e.symbols.length ? ` <span style="color:#666">(${esc(e.symbols.join(", "))})</span>` : ""}<br>
    <span style="color:#555;font-size:13px">${esc(e.timing)}</span>
    ${e.portfolioImpact ? `<div style="margin-top:4px;color:#222">${esc(e.portfolioImpact)}</div>` : ""}
    ${
      linkList(result, job, e.evidenceIds)
        ? `<div style="font-size:12px;margin-top:2px">${linkList(result, job, e.evidenceIds)}</div>`
        : ""
    }
  </td></tr>`,
            )
            .join("")}</table>`
        : p("확인된 일정이 없어요.");
    return `<section style="margin:0 0 32px;padding:0 0 16px;border-bottom:2px solid #eee">
  <div style="font-size:12px;letter-spacing:.08em;color:#777;text-transform:uppercase">${esc(providerName(run.provider))}${run.actualModel || run.model ? ` · ${esc(run.actualModel || run.model)}` : ""}</div>
  ${result.headline ? `<h2 style="margin:6px 0 10px;font-size:20px;color:#111">${esc(result.headline)}</h2>` : ""}
  ${brief?.marketStatus ? p(brief.marketStatus) : ""}
  ${result.summary ? p(result.summary) : ""}
  ${
    brief?.indices.length
      ? h(3, "시장 한눈에") +
        `<table style="border-collapse:collapse;margin:0 0 10px;width:100%">${brief.indices
          .map((i) => {
            const detail = indexDetail(i)
              .map(
                (d) =>
                  `<div style="margin-top:4px;color:#444;font-size:13px;line-height:1.55">${esc(d)}</div>`,
              )
              .join("");
            return `<tr>
  <td style="padding:8px 12px 8px 0;border-bottom:1px solid #eee;vertical-align:top;color:#333">${esc(i.name)}</td>
  <td style="padding:8px 12px 8px 0;border-bottom:1px solid #eee;vertical-align:top"><strong>${esc(i.value)}</strong></td>
  <td style="padding:8px 12px 8px 0;border-bottom:1px solid #eee;vertical-align:top;color:${/^-/.test(i.change) ? "#b33" : "#187"}">${esc(i.change)}</td>
  <td style="padding:8px 0;border-bottom:1px solid #eee;vertical-align:top;color:#555;font-size:13px">${esc(i.asOf)}${detail}</td></tr>`;
          })
          .join("")}</table>`
      : ""
  }
  ${
    brief?.news?.length
      ? h(3, "메인 뉴스") +
        `<div style="margin:0 0 10px">${brief.news
          .map(
            (n) => `<div style="padding:8px 0;border-bottom:1px solid #eee">
  <strong>${esc(n.title)}</strong>
  <div style="margin-top:4px;line-height:1.6;color:#222">${esc(n.summary)}</div>
  ${n.whyItMatters ? `<div style="margin-top:4px;color:#333">→ ${esc(n.whyItMatters)}</div>` : ""}
  ${
    linkList(result, job, n.evidenceIds, 1)
      ? `<div style="font-size:12px;margin-top:2px">${linkList(result, job, n.evidenceIds, 1)}</div>`
      : ""
  }
</div>`,
          )
          .join("")}</div>`
      : ""
  }
  ${
    brief?.companies?.length
      ? h(3, "주요 기업 · 주가 변동") +
        `<div style="margin:0 0 10px">${brief.companies
          .map(
            (c) => `<div style="padding:10px 0;border-bottom:1px solid #eee">
  <strong>${esc(c.name)}</strong>${c.symbol ? ` <span style="color:#666">(${esc(c.symbol)})</span>` : ""}
  <div style="margin-top:6px;font-size:13px;line-height:1.6;color:#222"><span style="color:#777">전일</span> ${esc(c.previousMove)} — ${esc(c.previousReason)}</div>
  <div style="font-size:13px;line-height:1.6;color:#222"><span style="color:#777">현재</span> ${esc(c.currentMove)} — ${esc(c.currentReason)}</div>
  ${
    linkList(result, job, c.evidenceIds, 1)
      ? `<div style="font-size:12px;margin-top:2px">${linkList(result, job, c.evidenceIds, 1)}</div>`
      : ""
  }
</div>`,
          )
          .join("")}</div>`
      : ""
  }
  ${
    brief?.sectors?.length
      ? h(3, "섹터 동향") +
        `<table style="border-collapse:collapse;width:100%;margin:0 0 10px">${brief.sectors
          .map(
            (s) => `<tr>
  <td style="vertical-align:top;padding:8px 12px 8px 0;border-bottom:1px solid #eee;white-space:nowrap"><strong>${esc(s.name)}</strong><div style="color:${/^-/.test(s.move) ? "#b33" : "#187"};font-size:13px">${esc(s.move)}</div></td>
  <td style="vertical-align:top;padding:8px 0;border-bottom:1px solid #eee;line-height:1.6;color:#222">${esc(s.reason)}${
    linkList(result, job, s.evidenceIds, 1)
      ? `<div style="font-size:12px;margin-top:2px">${linkList(result, job, s.evidenceIds, 1)}</div>`
      : ""
  }</td></tr>`,
          )
          .join("")}</table>`
      : ""
  }
  ${h(3, "오늘 확인할 일정")}${eventRows(today)}
  ${upcoming.length ? h(3, "다가오는 일정 · 시각 미확정 포함") + eventRows(upcoming) : ""}
  ${
    brief?.priorities.length
      ? h(3, "오늘의 확인 순서") +
        `<ol style="margin:0 0 10px 18px;padding:0;line-height:1.6;color:#222">${brief.priorities
          .map((x) => `<li>${esc(x)}</li>`)
          .join("")}</ol>`
      : ""
  }
  ${result.impacts.length ? h(3, "포트폴리오 영향") + ul(result.impacts.map(esc)) : ""}
  ${result.actions.length ? h(3, "오늘 확인할 행동") + ul(result.actions.map(esc)) : ""}
  ${result.unknowns.length ? h(3, "확인하지 못한 것") + ul(result.unknowns.map(esc)) : ""}
  ${
    result.sources?.length
      ? h(3, "출처") +
        ul(
          result.sources
            .slice(0, 12)
            .map(
              (s) =>
                `<a href="${esc(s.url)}" style="color:#1a56db">${esc(s.title || s.url)}</a>${
                  s.publishedAt
                    ? ` <span style="color:#888;font-size:12px">${esc(s.publishedAt)}</span>`
                    : ""
                }`,
            ),
        )
      : ""
  }
  ${run.validation.length ? `<p style="margin:10px 0 0;color:#a60;font-size:13px">⚠ ${esc(run.validation.join(" "))}</p>` : ""}
</section>`;
  });
  const failures = job.runs
    .filter((r) => r.status !== "completed")
    .map((r) => `${providerName(r.provider)}: ${r.error || r.status}`);
  const html = `<!doctype html><html lang="ko"><body style="margin:0;padding:24px;background:#f6f6f4;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif">
<div style="max-width:680px;margin:0 auto;background:#fff;border-radius:12px;padding:28px 28px 20px;box-shadow:0 1px 3px rgba(0,0,0,.06)">
  <div style="font-size:12px;letter-spacing:.1em;color:#888">OH MY STOCK · 데일리 브리프</div>
  <h1 style="margin:6px 0 18px;font-size:24px;color:#111">${esc(date)} <span style="font-weight:400;color:#666;font-size:15px">한국시간</span></h1>
  ${sections.join("") || p("완료된 브리핑이 없어요.")}
  ${failures.length ? `<p style="color:#a33;font-size:13px">생성 실패: ${esc(failures.join(" / "))}</p>` : ""}
  <p style="margin:16px 0 0;color:#999;font-size:12px;line-height:1.5">AI가 공개 자료를 조사해 작성한 참고용 브리핑입니다. 투자 판단과 주문은 직접 확인한 뒤 결정하세요.${
    includeAmounts ? "" : " 이 메일에는 포트폴리오 금액을 포함하지 않았어요."
  }</p>
</div></body></html>`;
  const text = job.runs
    .filter((r) => r.status === "completed")
    .map((r) =>
      dailyBriefTelegram(job, r)
        .replace(/<a href="([^"]+)">([^<]*)<\/a>/g, "$2 ($1)")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">"),
    )
    .join("\n\n" + "─".repeat(30) + "\n\n");
  return { subject, html, text: text || "완료된 브리핑이 없어요." };
}
