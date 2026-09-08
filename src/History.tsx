import { useEffect, useState } from "react";
import {
  Download,
  Save,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { AnalysisJob, AnalysisTrace, HistoryItem } from "../shared/types";
import type { ViewProps } from "./App";
import { ResultPanel } from "./Advisor";
import { Empty, Loading, date } from "./ui";

const names: Record<string, string> = {
  daily: "데일리 브리프",
  news: "뉴스",
  earnings: "실적·기업",
  macro: "매크로",
  indicators: "지표",
  fx: "환율",
  allocation: "포트폴리오",
  sector: "섹터",
  rebalance: "리밸런싱 제안",
  headlines: "주요 뉴스",
};
const statusNames: Record<string, string> = {
  queued: "대기",
  running: "진행 중",
  completed: "완료",
  partial: "일부 완료",
  failed: "실패",
  cancelled: "취소",
  interrupted: "중단",
};
type Library = {
  commonInstructions: string;
  outputSchema: unknown;
  templates: {
    id: string;
    name: string;
    prompt: string;
    defaultPrompt: string;
    overridden: boolean;
  }[];
};
async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch("/api" + path, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "기록을 불러오지 못했어요.");
  return data;
}

export function HistoryView({
  state,
  act,
  notify,
  initialId,
  onAdvisor,
}: ViewProps & { initialId: string | null; onAdvisor: () => void }) {
  const [tab, setTab] = useState("history"),
    [query, setQuery] = useState(""),
    [skill, setSkill] = useState(""),
    [status, setStatus] = useState(""),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0);
  const [listing, setListing] = useState<{
      items: HistoryItem[];
      total: number;
    } | null>(null),
    [selected, setSelected] = useState<string | null>(initialId),
    [detail, setDetail] = useState<{
      job: AnalysisJob;
      traces: AnalysisTrace[];
    } | null>(null),
    [provider, setProvider] = useState("codex"),
    [error, setError] = useState("");
  const [library, setLibrary] = useState<Library | null>(null),
    [templateId, setTemplateId] = useState("daily"),
    [draft, setDraft] = useState(""),
    [saving, setSaving] = useState(false);
  const active = state.jobs.some((j) =>
    ["queued", "running"].includes(j.status),
  );
  // Only refresh immutable history when a job changes, not on every dashboard tick.
  const jobsKey = state.jobs.map((j) => j.id + ":" + j.status).join("|");
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    const params = new URLSearchParams({
      q: query,
      skill,
      status,
      offset: String(offset),
      limit: "20",
    });
    void read<{ items: HistoryItem[]; total: number }>(
      "/history?" + params,
      controller.signal,
    )
      .then((value) => {
        setListing(value);
        setSelected((id) => id || value.items[0]?.id || null);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [query, skill, status, offset, revision, jobsKey]);
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    setDetail(null);
    const update = () =>
      read<{ job: AnalysisJob; traces: AnalysisTrace[] }>(
        "/history/" + selected,
        controller.signal,
      )
        .then((value) => {
          setDetail(value);
          setProvider((p) =>
            value.job.runs.some((r) => r.provider === p)
              ? p
              : value.job.runs[0]?.provider || "codex",
          );
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    void update();
    const timer = active ? setInterval(update, 3000) : undefined;
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [selected, revision, jobsKey, active]);
  useEffect(() => {
    if (tab !== "library") return;
    const controller = new AbortController();
    void read<Library>("/prompts", controller.signal)
      .then(setLibrary)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [tab, revision]);
  useEffect(() => {
    setDraft(library?.templates.find((t) => t.id === templateId)?.prompt || "");
  }, [library, templateId]);
  const trace = detail?.traces.find((t) => t.provider === provider),
    run = detail?.job.runs.find((r) => r.provider === provider);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR RESEARCH ARCHIVE</div>
          <h1>AI 실행 기록</h1>
          <p>무엇을 물었고, 어떤 기준으로 답했는지 한곳에서 확인하세요.</p>
        </div>
        <button className="btn" onClick={() => setRevision((r) => r + 1)}>
          <RefreshCw size={16} />
          기록 새로고침
        </button>
      </div>
      <div className="workspace-tabs" aria-label="실행 기록 메뉴">
        {[
          ["history", "상세 히스토리"],
          ["library", "프롬프트 라이브러리"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={tab === id}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <div className="inline-alert" role="alert">
          {error}
        </div>
      )}
      {tab === "history" ? (
        <>
          <div className="history-filters">
            <label className="history-search">
              <Search size={17} />
              <input
                aria-label="실행 기록 검색"
                maxLength={200}
                value={query}
                placeholder="질문·제목·종목 검색"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(null);
                  setOffset(0);
                }}
              />
            </label>
            <select
              aria-label="분석 종류 필터"
              value={skill}
              onChange={(e) => {
                setSkill(e.target.value);
                setSelected(null);
                setOffset(0);
              }}
            >
              <option value="">모든 분석</option>
              {Object.entries(names).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="실행 상태 필터"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setSelected(null);
                setOffset(0);
              }}
            >
              <option value="">모든 상태</option>
              {Object.entries(statusNames).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="history-layout">
            <aside className="card history-list">
              <div className="card-top">
                <h3>분석 기록</h3>
                <small>{listing?.total || 0}건</small>
              </div>
              {!listing ? (
                <Loading />
              ) : listing.items.length ? (
                listing.items.map((item) => (
                  <button
                    key={item.id}
                    className={
                      "history-item " + (selected === item.id ? "selected" : "")
                    }
                    onClick={() => setSelected(item.id)}
                  >
                    <span>
                      <b>{names[item.skill] || item.skill}</b>
                      <small>{statusNames[item.status] || item.status}</small>
                    </span>
                    <strong>{item.prompt || item.title}</strong>
                    <small>{date(item.createdAt)}</small>
                    <small>
                      {item.runs
                        .map((r) =>
                          r.provider === "codex" ? "OpenAI" : "Claude",
                        )
                        .join(" · ")}
                    </small>
                  </button>
                ))
              ) : (
                <Empty
                  title="해당 기록이 없어요"
                  body="분석을 실행하면 질문과 답변이 자동으로 저장돼요."
                />
              )}
              <div className="history-pagination">
                <button
                  className="icon-btn"
                  aria-label="이전 기록 페이지"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 20))}
                >
                  <ChevronLeft size={17} />
                </button>
                <small>
                  {Math.floor(offset / 20) + 1} /{" "}
                  {Math.max(1, Math.ceil((listing?.total || 0) / 20))}
                </small>
                <button
                  className="icon-btn"
                  aria-label="다음 기록 페이지"
                  disabled={offset + 20 >= (listing?.total || 0)}
                  onClick={() => setOffset(offset + 20)}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </aside>
            <div className="history-detail">
              {!detail ? (
                selected ? (
                  <Loading />
                ) : (
                  <section className="card">
                    <Empty
                      title="첫 분석을 시작해 보세요"
                      body="질문부터 최종 답변까지 기록합니다."
                      action={
                        <button className="btn primary" onClick={onAdvisor}>
                          AI 투자 파트너 열기
                        </button>
                      }
                    />
                  </section>
                )
              ) : (
                <>
                  <section className="card">
                    <div className="card-top">
                      <span className="report-kicker">
                        {names[detail.job.skill]} · {date(detail.job.createdAt)}
                      </span>
                      <a
                        className="text-btn"
                        href={`/api/history/${detail.job.id}/export`}
                        download
                      >
                        <Download size={15} />
                        JSON 저장
                      </a>
                    </div>
                    <h2>{detail.job.title}</h2>
                    <p className="history-question">
                      {detail.job.prompt || "질문 없이 분석 기준으로 실행"}
                    </p>
                    <div className="filter-tabs">
                      {detail.job.runs.map((r) => (
                        <button
                          key={r.provider}
                          className={provider === r.provider ? "selected" : ""}
                          onClick={() => setProvider(r.provider)}
                        >
                          {r.provider === "codex" ? "OpenAI" : "Claude"} ·{" "}
                          {statusNames[r.status]}
                        </button>
                      ))}
                    </div>
                    <p className="hint">
                      {run?.actualModel || run?.model || "CLI 기본 모델"} · 추론
                      강도 {run?.effort || "기본"} ·{" "}
                      {detail.job.autoResearch
                        ? "자동 웹 조사"
                        : "선택한 자료 분석"}
                    </p>
                    {detail.job.parentJobId && (
                      <button
                        className="text-btn"
                        onClick={() => setSelected(detail.job.parentJobId!)}
                      >
                        이전 분석 기록 열기
                      </button>
                    )}
                  </section>
                  {trace ? (
                    <section className="card trace-card">
                      <h3>실행 당시 입력과 응답</h3>
                      <p className="hint">
                        이 앱이 CLI에 전달한 입력과 최종 답변입니다. 모델의 내부
                        사고 과정은 저장하지 않습니다.
                      </p>
                      <details className="report-section" open>
                        <summary>
                          실제 전송 프롬프트
                          <span>
                            {trace.dispatchedAt
                              ? "CLI 전달됨"
                              : "전달 확인 없음"}
                          </span>
                        </summary>
                        <pre className="trace-text">{trace.request.prompt}</pre>
                      </details>
                      <details className="report-section">
                        <summary>공통 지침</summary>
                        <pre className="trace-text">
                          {trace.request.commonInstructions}
                        </pre>
                      </details>
                      <details className="report-section">
                        <summary>분석 기준 프롬프트</summary>
                        <pre className="trace-text">
                          {trace.request.template}
                        </pre>
                      </details>
                      <details className="report-section">
                        <summary>당시 포트폴리오·투자 설정·자료</summary>
                        <pre className="trace-text">
                          {JSON.stringify(
                            {
                              snapshot: trace.request.snapshot,
                              evidence: trace.request.evidence,
                            },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                      <details className="report-section">
                        <summary>최종 답변 원문</summary>
                        {trace.responseText ? (
                          <pre className="trace-text">{trace.responseText}</pre>
                        ) : (
                          <p className="muted">
                            아직 저장된 최종 답변이 없어요.
                          </p>
                        )}
                      </details>
                      <details className="report-section">
                        <summary>
                          실행 타임라인<span>{trace.events.length}개</span>
                        </summary>
                        <ol className="trace-events">
                          {trace.events.map((e, i) => (
                            <li key={i}>
                              <time>{date(e.at)}</time>
                              <span>{e.message}</span>
                            </li>
                          ))}
                        </ol>
                        {trace.droppedEvents > 0 && (
                          <p className="hint">
                            표시 한도를 넘어선 활동 {trace.droppedEvents}개는
                            생략됐어요.
                          </p>
                        )}
                      </details>
                      <details className="report-section">
                        <summary>응답 형식</summary>
                        <pre className="trace-text">
                          {JSON.stringify(trace.request.outputSchema, null, 2)}
                        </pre>
                      </details>
                      {trace.error && (
                        <p className="inline-alert">{trace.error}</p>
                      )}
                    </section>
                  ) : (
                    <section className="card">
                      <p className="note-box">
                        이 기록은 상세 저장 기능이 추가되기 전 실행되었습니다.
                        당시 전송문은 저장되어 있지 않으며, 아래에 보존된 분석
                        결과만 표시합니다.
                      </p>
                    </section>
                  )}
                  {run && (
                    <ResultPanel
                      run={run}
                      job={detail.job}
                      onRetry={async () => {
                        try {
                          const next = await act(
                            `/analyses/${detail.job.id}/retry`,
                            { provider },
                          );
                          setSelected(next.id);
                        } catch (e) {
                          notify((e as Error).message);
                        }
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </>
      ) : !library ? (
        <Loading />
      ) : (
        <section className="card prompt-library">
          <div className="card-top">
            <h3>현재 분석 기준</h3>
            <select
              aria-label="프롬프트 종류"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              {library.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {names[t.id] || t.name}
                </option>
              ))}
            </select>
          </div>
          <p className="hint">
            저장한 내용은 다음 분석에 적용됩니다. 과거 실행 기록의 프롬프트는
            바뀌지 않아요.
          </p>
          <label>
            분석 기준 프롬프트
            <textarea
              rows={17}
              minLength={20}
              maxLength={12000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <div className="form-actions">
            <button
              className="btn"
              onClick={() =>
                setDraft(
                  library.templates.find((t) => t.id === templateId)
                    ?.defaultPrompt || "",
                )
              }
            >
              기본 기준 불러오기
            </button>
            <button
              className="btn primary"
              disabled={saving || draft.trim().length < 20}
              onClick={async () => {
                setSaving(true);
                try {
                  await act(
                    "/templates/" + templateId,
                    { prompt: draft },
                    "PUT",
                  );
                  notify("분석 기준을 저장했어요.");
                  setRevision((r) => r + 1);
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Save size={16} />
              분석 기준 저장
            </button>
          </div>
          <details className="report-section">
            <summary>모든 AI에 적용되는 공통 지침</summary>
            <pre className="trace-text">{library.commonInstructions}</pre>
          </details>
          <details className="report-section">
            <summary>공통 응답 형식</summary>
            <pre className="trace-text">
              {JSON.stringify(library.outputSchema, null, 2)}
            </pre>
          </details>
        </section>
      )}
    </>
  );
}
