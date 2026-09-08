import { useState } from "react";
import { Newspaper, RefreshCw } from "lucide-react";
import type { ViewProps } from "./App";
import { date } from "./ui";
import { AnalysisProgress } from "./AnalysisProgress";
import { HeadlinesContent } from "./Structured";

// The dashboard brief is a quick scan, not a deep analysis: always low reasoning effort.
const quickEfforts = { codex: "low", claude: "low" } as const;

export function HeadlinesCard({
  state,
  act,
  notify,
  onDetail,
}: ViewProps & { onDetail: (id: string) => void }) {
  const authenticated = state.providers
    .filter((p) => p.authenticated)
    .map((p) => p.id);
  const [provider, setProvider] = useState<"codex" | "claude">(
    authenticated.includes("claude") ? "claude" : "codex",
  );
  const [busy, setBusy] = useState(false);
  const job = state.jobs.find((j) => j.skill === "headlines");
  const run = job?.runs[0];
  const running = job && ["queued", "running"].includes(job.status);
  const result = run?.status === "completed" ? run.result : null;
  const refresh = async () => {
    setBusy(true);
    try {
      const response = await act("/analyses", {
        skill: "headlines",
        prompt: "",
        target: "",
        evidenceIds: [],
        providers: [provider],
        models: state.settings.models,
        efforts: quickEfforts,
        autoResearch: true,
        force: true,
      });
      notify(
        response.cached
          ? "이미 뉴스를 조사하고 있어요."
          : "최신 주요 뉴스를 조사하고 있어요. 잠시 후 표시돼요.",
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card headlines-card">
      <div className="card-top">
        <div className="headlines-title">
          <span className="sparkle-box">
            <Newspaper size={19} />
          </span>
          <div>
            <h3>꼭 알아야 할 주요 뉴스</h3>
            <small className="muted">
              {job
                ? `${date(job.createdAt)} 조사 · ${
                    run?.provider === "codex" ? "OpenAI" : "Claude"
                  } · 빠른 추론`
                : "AI가 웹에서 세계 시장·매크로·정책 뉴스를 골라 정리해요"}
            </small>
          </div>
        </div>
        <div className="headlines-actions">
          <div className="segmented" aria-label="조사할 AI">
            {(["claude", "codex"] as const).map((id) => (
              <button
                key={id}
                className={provider === id ? "selected" : ""}
                disabled={!authenticated.includes(id)}
                onClick={() => setProvider(id)}
              >
                {id === "codex" ? "OpenAI" : "Claude"}
              </button>
            ))}
          </div>
          <button
            className="btn"
            disabled={busy || !authenticated.length}
            onClick={refresh}
          >
            <RefreshCw size={16} className={running ? "spin" : ""} />
            {running ? "조사 중" : "뉴스 새로고침"}
          </button>
        </div>
      </div>
      {running && run ? (
        <AnalysisProgress run={run} createdAt={job.createdAt} compact />
      ) : result?.headlines?.length ? (
        <>
          {result.headline && <p className="headlines-lead">{result.headline}</p>}
          <HeadlinesContent result={result} job={job!} />
          <div className="headlines-footer">
            <button className="text-btn" onClick={() => onDetail(job!.id)}>
              출처·프롬프트 기록 보기
            </button>
          </div>
        </>
      ) : job && run?.error ? (
        <div className="inline-alert">
          {run.error}
          <button onClick={refresh} disabled={busy}>
            다시 시도
          </button>
        </div>
      ) : (
        <p className="muted headlines-empty">
          {authenticated.length
            ? "뉴스 새로고침을 누르면 지금 알아야 할 뉴스 5~8개를 출처와 함께 정리해 드려요."
            : "설정에서 AI 로그인을 완료하면 사용할 수 있어요."}
        </p>
      )}
    </section>
  );
}
