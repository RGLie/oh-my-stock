import { useEffect, useState } from "react";
import { ArrowRight, RefreshCw, Sparkles } from "lucide-react";
import type { ViewProps } from "./App";
import { Empty, date } from "./ui";
import { AnalysisProgress } from "./AnalysisProgress";
import { ResultPanel } from "./Advisor";

const statuses: Record<string, string> = {
  queued: "대기 중",
  running: "조사·분석 중",
  completed: "완료",
  partial: "일부 완료",
  failed: "확인 필요",
  cancelled: "취소됨",
  interrupted: "중단됨",
};
export function RebalanceView({ state, act, notify }: ViewProps) {
  const jobs = state.jobs.filter((j) => j.skill === "rebalance");
  const [jobId, setJobId] = useState<string | null>(jobs[0]?.id || null),
    [providers, setProviders] = useState<string[]>(
      state.providers.filter((p) => p.authenticated).map((p) => p.id),
    ),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [reading, setReading] = useState("compare");
  const job = state.jobs.find((j) => j.id === jobId) || jobs[0];
  useEffect(() => setReading("compare"), [jobId]);
  const running = job && ["queued", "running"].includes(job.status);
  const request = async () => {
    setBusy(true);
    try {
      const response = await act("/analyses", {
        skill: "rebalance",
        prompt: note.trim(),
        target: "",
        evidenceIds: [],
        providers,
        models: state.settings.models,
        efforts: state.settings.efforts || { codex: "high", claude: "high" },
        autoResearch: true,
        force: true,
      });
      setJobId(response.id);
      notify(
        response.cached
          ? "같은 요청이 진행 중이에요."
          : "AI가 포트폴리오를 조사하고 리밸런싱을 제안할게요.",
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">AI SUGGESTS. YOU DECIDE.</div>
          <h1>AI 리밸런싱 제안</h1>
          <p>
            AI가 내 포트폴리오와 최신 자료를 살펴보고 종목별로 유지·확대·축소를
            제안합니다. 실행은 언제나 내 판단이에요.
          </p>
        </div>
      </div>
      <section className="card rebalance-request">
        <div className="command-caption">
          <span className="sparkle-box">
            <Sparkles size={22} />
          </span>
          <div>
            <h2>지금 포트폴리오, 어떻게 조정하면 좋을까요?</h2>
            <p>
              보유 {state.holdings.length}개 종목의 비중과 최근 실적·시장 자료를
              함께 봅니다.
            </p>
          </div>
        </div>
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="선택 사항 · 함께 고려할 점 (예: 3개월 내 일부 현금화 예정, 반도체 비중은 줄이고 싶음)"
          aria-label="리밸런싱 요청 메모"
        />
        <div className="rebalance-actions">
          <div className="provider-toggle" aria-label="분석할 AI">
            {(["codex", "claude"] as const).map((id) => {
              const p = state.providers.find((x) => x.id === id);
              return (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={providers.includes(id)}
                    disabled={!p?.authenticated}
                    onChange={(e) =>
                      setProviders(
                        e.target.checked
                          ? [...providers, id]
                          : providers.filter((x) => x !== id),
                      )
                    }
                  />
                  <span className={"provider-mark " + id}>
                    {id === "codex" ? "O" : "✳"}
                  </span>
                  {id === "codex" ? "OpenAI" : "Claude"}
                  {!p?.authenticated && <small> · 로그인 필요</small>}
                </label>
              );
            })}
          </div>
          <button
            className="btn primary"
            disabled={busy || !providers.length || !state.holdings.length}
            onClick={request}
          >
            <RefreshCw size={17} className={running ? "spin" : ""} />
            {busy ? "요청 중" : running ? "진행 중 · 새로 요청" : "AI 제안 받기"}
          </button>
        </div>
        <p className="hint">
          모델·추론 강도는 AI 투자 파트너에서 마지막으로 사용한 설정을 따릅니다.
          제안은 검토용이며 주문 수량·시점을 정하지 않습니다.
        </p>
      </section>
      {!state.holdings.length && (
        <section className="card">
          <Empty
            title="먼저 보유 종목을 불러오세요"
            body="토스 동기화 또는 종목 추가 후 AI 제안을 받을 수 있어요."
          />
        </section>
      )}
      {job && running && (
        <section className="card active-analysis">
          <div className="card-top">
            <h3>포트폴리오를 조사하고 있어요</h3>
            <button
              className="text-btn"
              onClick={() =>
                act("/analyses/" + job.id + "/cancel").catch((e) =>
                  notify(e.message),
                )
              }
            >
              분석 취소
            </button>
          </div>
          {job.runs
            .filter((r) => ["queued", "running"].includes(r.status))
            .map((r) => (
              <div key={r.provider}>
                <strong>{r.provider === "codex" ? "OpenAI" : "Claude"}</strong>
                <AnalysisProgress run={r} createdAt={job.createdAt} compact />
              </div>
            ))}
        </section>
      )}
      <div className="section-heading">
        <div>
          <h2>제안 내용</h2>
          <span className="muted">
            종목별 제안을 먼저 보고, 근거와 리스크를 펼쳐보세요.
          </span>
        </div>
        {jobs.length > 0 && (
          <select
            aria-label="이전 제안 선택"
            value={job?.id || ""}
            onChange={(e) => setJobId(e.target.value)}
          >
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} · {date(j.createdAt)}
              </option>
            ))}
          </select>
        )}
      </div>
      {!job ? (
        <section className="card">
          <Empty
            title="아직 받은 제안이 없어요"
            body="AI 제안 받기를 누르면 두 AI가 각자 조사한 리밸런싱 방향을 비교해 볼 수 있어요."
          />
        </section>
      ) : (
        <>
          <div className="report-toolbar">
            <div className="analysis-meta">
              <span className={"status-pill " + job.status}>
                {statuses[job.status]}
              </span>
              <span>
                {job.title} · {date(job.createdAt)}
              </span>
              {job.prompt && <span className="muted">메모: {job.prompt}</span>}
            </div>
            <div className="filter-tabs">
              {[
                ["compare", "나란히 보기"],
                ...job.runs.map((r) => [
                  r.provider,
                  r.provider === "codex" ? "OpenAI" : "Claude",
                ]),
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={reading === id ? "selected" : ""}
                  onClick={() => setReading(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div
            className={
              "comparison-grid " + (reading !== "compare" ? "reading-mode" : "")
            }
          >
            {job.runs
              .filter((r) => reading === "compare" || r.provider === reading)
              .map((r) => (
                <ResultPanel
                  key={r.provider}
                  run={r}
                  job={job}
                  onRetry={async () => {
                    try {
                      const result = await act(
                        "/analyses/" + job.id + "/retry",
                        { provider: r.provider },
                      );
                      setJobId(result.id);
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                />
              ))}
          </div>
          <div className="report-bottom">
            <p>
              두 AI의 제안이 다르면 근거의 차이를 먼저 확인하세요. 최종 결정과
              주문은 직접 진행합니다.
            </p>
            <span className="muted">
              상세 프롬프트와 기록은 AI 실행 기록에서 볼 수 있어요
              <ArrowRight size={14} />
            </span>
          </div>
        </>
      )}
    </>
  );
}
