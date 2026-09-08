import { useState } from "react";
import { AlertTriangle, Newspaper, RefreshCw, Settings2 } from "lucide-react";
import type { ViewProps } from "./App";
import type { HeadlineSettings } from "../shared/types";
import { date } from "./ui";
import { AnalysisProgress } from "./AnalysisProgress";
import { HeadlinesContent } from "./Structured";

const providerIds = ["codex", "claude"] as const;
type ProviderId = (typeof providerIds)[number];
const providerNames: Record<ProviderId, string> = {
  codex: "OpenAI",
  claude: "Claude",
};
const fallbackSettings: HeadlineSettings = {
  provider: "codex",
  models: { codex: "", claude: "sonnet" },
};
// The dashboard brief is a quick scan, not a deep analysis: the lowest effort the model supports.
const effortOrder = ["low", "medium", "high", "xhigh", "max", "ultra"];

export function HeadlinesCard({
  state,
  act,
  notify,
  onDetail,
}: ViewProps & { onDetail: (id: string) => void }) {
  const saved = state.settings.headlines || fallbackSettings;
  const authenticated = state.providers
    .filter((p) => p.authenticated)
    .map((p) => p.id);
  const [choice, setChoice] = useState<ProviderId>(saved.provider);
  const [models, setModels] = useState(saved.models);
  const [showModels, setShowModels] = useState(false);
  const [busy, setBusy] = useState(false);
  // Derived on every render: when the login check finishes late, a provider that turned out to be
  // signed out is never requested. Only an authenticated AI can be selected.
  const provider: ProviderId = authenticated.includes(choice)
    ? choice
    : authenticated[0] || choice;
  const job = state.jobs.find((j) => j.skill === "headlines");
  const run = job?.runs[0];
  const running = job && ["queued", "running"].includes(job.status);
  const result = run?.status === "completed" ? run.result : null;
  const effortFor = (id: ProviderId) => {
    const supported = state.providers.find((p) => p.id === id)?.modelEfforts?.[
      models[id]
    ];
    return supported?.length
      ? effortOrder.find((e) => supported.includes(e)) || supported[0]
      : "low";
  };
  const save = async (next: HeadlineSettings) => {
    try {
      await act("/settings/headlines", next, "PUT");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const pick = (id: ProviderId) => {
    setChoice(id);
    void save({ provider: id, models });
  };
  const refresh = async () => {
    setBusy(true);
    try {
      const response = await act("/analyses", {
        skill: "headlines",
        prompt: "",
        target: "",
        evidenceIds: [],
        providers: [provider],
        models,
        efforts: { codex: effortFor("codex"), claude: effortFor("claude") },
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
  const usedModel = run?.actualModel || run?.model;
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
              {job && run
                ? `${date(job.createdAt)} 조사 · ${
                    providerNames[run.provider as ProviderId] || run.provider
                  }${usedModel ? " · " + usedModel : ""} · 빠른 추론`
                : "AI가 웹에서 세계 시장·매크로·정책 뉴스를 골라 정리해요"}
            </small>
          </div>
        </div>
        <div className="headlines-actions">
          <div className="segmented" aria-label="조사할 AI">
            {providerIds.map((id) => (
              <button
                key={id}
                className={provider === id ? "selected" : ""}
                aria-pressed={provider === id}
                disabled={!authenticated.includes(id)}
                title={
                  authenticated.includes(id)
                    ? undefined
                    : "설정에서 로그인을 완료하면 선택할 수 있어요"
                }
                onClick={() => pick(id)}
              >
                {providerNames[id]}
              </button>
            ))}
          </div>
          <button
            className={"icon-btn " + (showModels ? "active" : "")}
            aria-label="뉴스 조사 모델 설정"
            aria-expanded={showModels}
            onClick={() => setShowModels(!showModels)}
          >
            <Settings2 size={17} />
          </button>
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
      {showModels && (
        <div className="headlines-models">
          {providerIds.map((id) => {
            const info = state.providers.find((p) => p.id === id);
            return (
              <label key={id}>
                <span>
                  <span className={"provider-mark " + id}>
                    {id === "codex" ? "O" : "✳"}
                  </span>
                  {providerNames[id]} 모델
                </span>
                <input
                  list={"headline-models-" + id}
                  aria-label={`${providerNames[id]} 뉴스 조사 모델`}
                  value={models[id]}
                  placeholder="비워두면 CLI 기본 모델"
                  pattern="[a-zA-Z0-9._:/-]*"
                  onChange={(e) =>
                    setModels({ ...models, [id]: e.target.value.trim() })
                  }
                  onBlur={() => {
                    if (models[id] !== saved.models[id])
                      void save({ provider: choice, models });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      (e.target as HTMLInputElement).blur();
                  }}
                />
                <datalist id={"headline-models-" + id}>
                  {info?.models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </label>
            );
          })}
          <p className="hint">
            이 카드 전용 설정이에요. AI 투자 파트너의 모델·강도 설정과 따로
            저장되며, 추론 강도는 항상 모델이 지원하는 가장 낮은 단계로
            실행합니다.
          </p>
        </div>
      )}
      {running && run ? (
        <AnalysisProgress run={run} createdAt={job.createdAt} compact />
      ) : result?.headlines?.length ? (
        <>
          {run!.validation.length > 0 && (
            <div className="headlines-warning" role="status">
              <AlertTriangle size={16} />
              <span>
                {[...new Set(run!.validation)].join(" ")} 아래 뉴스는 실제 웹
                검색으로 확인되지 않았을 수 있으니 출처를 직접 확인하세요.
              </span>
            </div>
          )}
          {result.headline && (
            <p className="headlines-lead">{result.headline}</p>
          )}
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
          <button onClick={refresh} disabled={busy || !authenticated.length}>
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
