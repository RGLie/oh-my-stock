import type { AnalysisJob, AnalysisResult } from "../shared/types";
import { LinkOut } from "./ui";
import { ReportText } from "./ReportText";

export function DailyBriefContent({
  result,
  job,
}: {
  result: AnalysisResult;
  job: AnalysisJob;
}) {
  const brief = result.dailyBrief;
  if (!brief) return null;
  const sourceLinks = (ids: string[]) =>
    ids.map((id) => {
      const source =
        result.sources?.find((s) => s.id === id) ||
        job.evidence.find((s) => s.id === id);
      return source ? (
        <LinkOut key={id} url={source.url}>
          {source.title}
        </LinkOut>
      ) : null;
    });
  const kst = (value: string) =>
    new Date(value).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  const today = brief.events.filter(
    (e) =>
      e.scheduledAt &&
      job.briefWindow &&
      Date.parse(e.scheduledAt) >= Date.parse(job.briefWindow.dayStartAt) &&
      Date.parse(e.scheduledAt) < Date.parse(job.briefWindow.dayEndAt),
  );
  const upcoming = brief.events.filter((e) => !today.includes(e));
  return (
    <div className="daily-content">
      <div className="brief-market">
        <span className="report-kicker">{brief.date} · 한국시간</span>
        <ReportText text={brief.marketStatus} />
      </div>
      {brief.indices.length > 0 && (
        <>
          <h3>시장 한눈에</h3>
          <div className="brief-indices">
            {brief.indices.map((index, i) => (
              <div className="metric-card" key={i}>
                <span>{index.name}</span>
                <strong>{index.value}</strong>
                <b>{index.change}</b>
                <small>{index.asOf}</small>
                {index.reason ? (
                  <p className="brief-reason">{index.reason}</p>
                ) : null}
                {index.previousChange || index.previousReason ? (
                  <p className="brief-reason previous">
                    전일{" "}
                    {[index.previousChange, index.previousReason]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
                <div className="metric-source">
                  {sourceLinks(index.evidenceIds)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {brief.news && brief.news.length > 0 && (
        <section className="brief-list">
          <h3>메인 뉴스</h3>
          {brief.news.map((item, i) => (
            <article className="brief-item" key={i}>
              <h4>{item.title}</h4>
              <ReportText text={item.summary} />
              {item.whyItMatters ? (
                <p className="brief-why">{item.whyItMatters}</p>
              ) : null}
              <div className="metric-source">
                {sourceLinks(item.evidenceIds)}
              </div>
            </article>
          ))}
        </section>
      )}
      {brief.companies && brief.companies.length > 0 && (
        <section className="brief-list">
          <h3>주요 기업 · 주가 변동</h3>
          {brief.companies.map((company, i) => (
            <article className="brief-item" key={i}>
              <h4>
                {company.name}
                {company.symbol ? <small> {company.symbol}</small> : null}
              </h4>
              <dl className="brief-move">
                <div>
                  <dt>전일</dt>
                  <dd>
                    <strong>{company.previousMove}</strong>
                    <ReportText text={company.previousReason} />
                  </dd>
                </div>
                <div>
                  <dt>현재</dt>
                  <dd>
                    <strong>{company.currentMove}</strong>
                    <ReportText text={company.currentReason} />
                  </dd>
                </div>
              </dl>
              <div className="metric-source">
                {sourceLinks(company.evidenceIds)}
              </div>
            </article>
          ))}
        </section>
      )}
      {brief.sectors && brief.sectors.length > 0 && (
        <section className="brief-list">
          <h3>섹터 동향</h3>
          {brief.sectors.map((sector, i) => (
            <article className="brief-item brief-sector" key={i}>
              <div className="brief-sector-head">
                <h4>{sector.name}</h4>
                <b>{sector.move}</b>
              </div>
              <ReportText text={sector.reason} />
              <div className="metric-source">
                {sourceLinks(sector.evidenceIds)}
              </div>
            </article>
          ))}
        </section>
      )}
      {[
        { label: "오늘 확인할 일정", events: today },
        { label: "다가오는 일정 · 시각 미확정 포함", events: upcoming },
      ].map((group) => (
        <section className="brief-calendar" key={group.label}>
          <h3>{group.label}</h3>
          {group.events.length ? (
            group.events.map((event, i) => (
              <article className="brief-event" key={i}>
                <div className="brief-event-time">
                  <strong>
                    {event.scheduledAt ? kst(event.scheduledAt) : "시각 미확인"}
                  </strong>
                  <span>
                    {event.status === "confirmed"
                      ? "발표 일정 확인"
                      : "잠정 일정"}
                  </span>
                </div>
                <div>
                  <h4>{event.title}</h4>
                  <small>
                    {event.timing}
                    {event.symbols.length
                      ? ` · ${event.symbols.join(", ")}`
                      : ""}
                  </small>
                  <ReportText text={event.portfolioImpact} />
                  <div className="metric-source">
                    {sourceLinks(event.evidenceIds)}
                  </div>
                </div>
              </article>
            ))
          ) : (
            <p className="muted">
              확인된 일정이 없어요. 일정이 없다는 뜻은 아니므로 보고서의 미확인
              항목도 살펴보세요.
            </p>
          )}
        </section>
      ))}
      {brief.priorities.length > 0 && (
        <section className="brief-priorities">
          <h3>오늘의 확인 순서</h3>
          <ol>
            {brief.priorities.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
