import type {
  AnalysisJob,
  AnalysisResult,
  HeadlineCategory,
  RebalanceAction,
} from "../shared/types";
import { LinkOut } from "./ui";
import { ReportText } from "./ReportText";

export const actionNames: Record<RebalanceAction, string> = {
  keep: "유지",
  add: "비중 확대",
  trim: "비중 축소",
  exit: "정리 검토",
  new: "신규 검토",
};
export const headlineCategories: Record<HeadlineCategory, string> = {
  market: "시장",
  macro: "매크로",
  geopolitics: "지정학",
  policy: "정책",
  company: "기업",
  other: "기타",
};
const weight = (v: string | null) => {
  if (v === null || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(1) + "%" : v;
};
export function sourceOf(
  result: AnalysisResult,
  job: AnalysisJob,
  ids: string[],
) {
  for (const id of ids) {
    if (id === "portfolio-snapshot") continue;
    const source =
      result.sources?.find((s) => s.id === id) ||
      job.evidence.find((s) => s.id === id);
    if (source) return source;
  }
  return null;
}

export function RebalanceContent({
  result,
  job,
}: {
  result: AnalysisResult;
  job: AnalysisJob;
}) {
  const plan = result.rebalance;
  if (!plan) return null;
  const sourceLinks = (ids: string[]) =>
    ids
      .filter((id) => id !== "portfolio-snapshot")
      .map((id) => {
        const source =
          result.sources?.find((s) => s.id === id) ||
          job.evidence.find((s) => s.id === id);
        return source ? (
          <LinkOut key={id} url={source.url}>
            출처
          </LinkOut>
        ) : null;
      });
  return (
    <div className="rebalance-content">
      <div className="brief-market">
        <span className="report-kicker">전체 판단</span>
        <ReportText text={plan.stance} />
      </div>
      <div className="table-scroll">
        <table className="rebalance-table">
          <thead>
            <tr>
              <th>종목</th>
              <th>현재 비중</th>
              <th>제안 비중</th>
              <th>제안</th>
              <th>이유</th>
            </tr>
          </thead>
          <tbody>
            {plan.proposals.map((p, i) => (
              <tr key={i}>
                <td>
                  <strong>{p.symbol}</strong>
                  <small>{p.name}</small>
                </td>
                <td>{weight(p.currentWeight)}</td>
                <td>{weight(p.proposedWeight)}</td>
                <td>
                  <span className={"action-pill " + p.action}>
                    {actionNames[p.action] || p.action}
                  </span>
                </td>
                <td className="rationale">
                  <ReportText text={p.rationale} />
                  <div className="metric-source">
                    {sourceLinks(p.evidenceIds)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {plan.cashNote && (
        <div className="note-box">
          <strong>현금</strong> · {plan.cashNote}
        </div>
      )}
      {plan.risks.length > 0 && (
        <section className="brief-priorities">
          <h3>이 제안이 틀릴 수 있는 조건</h3>
          <ol>
            {plan.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

export function HeadlinesContent({
  result,
  job,
}: {
  result: AnalysisResult;
  job: AnalysisJob;
}) {
  const items = result.headlines;
  if (!items?.length) return null;
  return (
    <ol className="headline-list">
      {items.map((h, i) => {
        const source = sourceOf(result, job, h.evidenceIds);
        return (
          <li key={i} className="headline-item">
            <div className="headline-meta">
              <span className={"category-tag " + h.category}>
                {headlineCategories[h.category] || h.category}
              </span>
              {h.publishedAt && (
                <small>
                  {new Date(h.publishedAt).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </small>
              )}
            </div>
            <div className="headline-body">
              {source ? (
                <LinkOut url={source.url}>{h.title}</LinkOut>
              ) : (
                <strong>{h.title}</strong>
              )}
              <p>{h.summary}</p>
              {h.portfolioRelevance && (
                <small className="headline-relevance">
                  내 포트폴리오 · {h.portfolioRelevance}
                </small>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
