import { useEffect, useState } from "react";
import {
  Sparkles,
  RefreshCw,
  FileText,
  Globe2,
  BarChart3,
  ArrowLeftRight,
  PieChart,
  Search,
  Settings2,
  ArrowUpRight,
  Check,
  ChevronDown,
  Play,
  X,
  BookOpen,
  ArrowRight,
  Pencil,
  Save,
} from "lucide-react";
import type { AnalysisJob, AnalysisRun } from "../shared/types";
import type { ViewProps } from "./App";
import { Empty, LinkOut, date, Modal } from "./ui";
import { AnalysisProgress } from "./AnalysisProgress";
import { DailyBriefContent } from "./DailyBrief";
import { HeadlinesContent, RebalanceContent } from "./Structured";
import { ReportText } from "./ReportText";

// Jobs owned by other screens (dashboard headlines, rebalancing tab) stay out of the advisor's report list.
const advisorJob = (job: AnalysisJob) =>
  !["headlines", "rebalance"].includes(job.skill);

const sections = [
  {
    id: "news",
    title: "뉴스 분석",
    sub: "보유 기업의 최근 변화",
    icon: FileText,
  },
  {
    id: "earnings",
    title: "실적·기업 분석",
    sub: "사업과 실적을 깊이 읽기",
    icon: BarChart3,
  },
  {
    id: "macro",
    title: "매크로 분석",
    sub: "경제 흐름과 내 투자",
    icon: Globe2,
  },
  {
    id: "indicators",
    title: "지표 분석",
    sub: "물가·고용·금리의 변화",
    icon: PieChart,
  },
  {
    id: "fx",
    title: "환율 분석",
    sub: "달러 흐름과 원화 자산",
    icon: ArrowLeftRight,
  },
  {
    id: "allocation",
    title: "포트폴리오 점검",
    sub: "비중과 집중도 확인",
    icon: Settings2,
  },
  {
    id: "sector",
    title: "섹터 탐색",
    sub: "기회와 가치 함정 살펴보기",
    icon: Search,
  },
];
const statuses: Record<string, string> = {
  queued: "대기 중",
  running: "조사·분석 중",
  completed: "완료",
  partial: "일부 완료",
  failed: "확인 필요",
  cancelled: "취소됨",
  interrupted: "중단됨",
};
const effortNames: Record<string, string> = {
  low: "빠르게",
  medium: "균형",
  high: "깊게",
  xhigh: "더 깊게",
  max: "최대",
  ultra: "최고 강도",
};
const readable = (value: string) =>
  value
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "");

export function AdvisorView({
  state,
  act,
  notify,
  onResearch,
  onSettings,
  onHistory,
}: ViewProps & {
  onResearch: () => void;
  onSettings: () => void;
  onHistory: (id: string) => void;
}) {
  const [skill, setSkill] = useState("earnings"),
    [target, setTarget] = useState(""),
    [prompt, setPrompt] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [auto, setAuto] = useState(true);
  const [providers, setProviders] = useState(["codex", "claude"]),
    [models, setModels] = useState(state.settings.models),
    [efforts, setEfforts] = useState(
      state.settings.efforts || { codex: "high", claude: "high" },
    );
  const [researchId, setResearchId] = useState<string | null>(
      state.jobs.find((j) => j.skill !== "daily" && advisorJob(j))?.id ||
        null,
    ),
    [dailyId, setDailyId] = useState<string | null>(
      state.jobs.find((j) => j.skill === "daily")?.id || null,
    ),
    [mode, setMode] = useState("research"),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false),
    [template, setTemplate] = useState(""),
    [parentJobId, setParentJobId] = useState<string | undefined>();
  const [reading, setReading] = useState("compare");
  const daily = mode === "daily";
  const activeSkill = daily ? "daily" : skill;
  const jobId = daily ? dailyId : researchId;
  const setJobId = daily ? setDailyId : setResearchId;
  const jobs = state.jobs.filter(
    (j) => advisorJob(j) && (j.skill === "daily") === daily,
  );
  const job = state.jobs.find((j) => j.id === jobId);
  useEffect(() => setReading("compare"), [jobId]);
  const run = async (type = activeSkill, force = true) => {
    setBusy(true);
    try {
      const response = await act("/analyses", {
        skill: type,
        target: type === "daily" ? "" : target,
        prompt:
          type === "daily"
            ? "오늘과 가까운 미국장 일정, 주요 지수와 실적 발표를 확인하고 내 포트폴리오에 미치는 영향을 한국어로 브리핑해 줘."
            : prompt,
        evidenceIds: type === "daily" ? [] : selected,
        providers,
        models,
        efforts,
        autoResearch: type === "daily" || auto,
        force,
        parentJobId: type === "daily" ? undefined : parentJobId,
      });
      if (type !== "daily") setSkill(type);
      setJobId(response.id);
      notify(
        response.cached
          ? "같은 요청이 진행 중이에요."
          : auto
            ? "최신 자료 조사와 분석을 시작했어요."
            : "선택한 자료로 분석을 시작했어요.",
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const updateModel = (id: "codex" | "claude", value: string) => {
    setModels({ ...models, [id]: value });
    const available = state.providers.find((p) => p.id === id)?.modelEfforts?.[
      value
    ];
    if (available && !available.includes(efforts[id]))
      setEfforts({
        ...efforts,
        [id]: available.includes("high") ? "high" : available[0],
      });
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR INVESTMENT RESEARCH TEAM</div>
          <h1>AI 투자 파트너</h1>
          <p>
            궁금한 것을 물어보세요. 최신 자료부터 한국어 분석까지 함께
            준비할게요.
          </p>
        </div>
        <button className="btn" onClick={onSettings}>
          <Settings2 size={16} />
          연결 설정
        </button>
      </div>
      <div className="workspace-tabs" aria-label="AI 파트너 모드">
        <button
          className={!daily ? "selected" : ""}
          aria-pressed={!daily}
          onClick={() => setMode("research")}
        >
          질문·분석
        </button>
        <button
          className={daily ? "selected" : ""}
          aria-pressed={daily}
          onClick={() => setMode("daily")}
        >
          데일리 브리프
        </button>
      </div>
      {job && ["queued", "running"].includes(job.status) && (
        <section className="card active-analysis">
          <div className="card-top">
            <h3>
              {daily
                ? "오늘의 브리핑을 준비하고 있어요"
                : "요청한 분석을 진행하고 있어요"}
            </h3>
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
                <AnalysisProgress run={r} createdAt={job.createdAt} />
              </div>
            ))}
        </section>
      )}
      {daily ? (
        <section className="card daily-hero">
          <div>
            <div className="eyebrow">DAILY BRIEF · KST</div>
            <h2>오늘의 시장과 내 포트폴리오</h2>
            <p>
              주요 지수, 경제 일정, 실적 발표를 확인하고
              <br />
              오늘 살펴볼 순서를 한국어로 정리해 드려요.
            </p>
            <small>한국시간 기준 오늘 · 앞으로 72시간의 주요 일정</small>
          </div>
          <button
            className="btn primary"
            disabled={busy || !providers.length}
            onClick={() => run("daily")}
          >
            <RefreshCw size={17} />
            {busy ? "요청 중" : "오늘 브리핑 새로고침"}
          </button>
        </section>
      ) : (
        <>
          <section className="card research-command">
            {parentJobId && (
              <div className="followup-label">
                <span>이전 분석에 이어서 질문하고 있어요</span>
                <button
                  onClick={() => setParentJobId(undefined)}
                  aria-label="후속 질문 해제"
                >
                  <X size={16} />
                </button>
              </div>
            )}
            <div className="command-caption">
              <span className="sparkle-box">
                <Sparkles size={22} />
              </span>
              <div>
                <h2>오늘은 무엇을 살펴볼까요?</h2>
                <p>예: 어도비 최신 실적과 기업 가치를 분석해 줘.</p>
              </div>
              <span className="auto-label">
                <span className="status-dot" />
                {auto ? "자동 조사" : "선택 자료 분석"}
              </span>
            </div>
            <div className="command-input">
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.nativeEvent.isComposing &&
                    !busy &&
                    providers.length
                  )
                    void run();
                }}
                placeholder="기업명이나 궁금한 내용을 편하게 입력하세요"
                aria-label="AI에게 질문"
              />
              <button
                className="btn primary"
                disabled={busy || !providers.length}
                onClick={() => run()}
              >
                <Sparkles size={17} />
                {busy
                  ? "요청 중"
                  : auto
                    ? "최신 자료로 분석"
                    : "선택 자료로 분석"}
              </button>
            </div>
            <div className="command-options">
              <label>
                분석 대상
                <select
                  aria-label="분석 대상"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">질문 내용 · 전체 포트폴리오</option>
                  {state.holdings.map((h) => (
                    <option key={h.id} value={h.symbol}>
                      {h.name} ({h.symbol})
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={auto}
                  onChange={(e) => setAuto(e.target.checked)}
                />
                AI가 웹에서 최신 자료 찾기
              </label>
            </div>
          </section>
          <div className="agent-grid">
            {sections.map((s) => {
              const recent = state.jobs.find(
                (j) => j.skill === s.id && (!target || j.target === target),
              );
              return (
                <div
                  className={"agent-tile " + (skill === s.id ? "selected" : "")}
                  key={s.id}
                >
                  <button
                    className="agent-select"
                    onClick={() => setSkill(s.id)}
                  >
                    <s.icon size={21} />
                    <strong>{s.title}</strong>
                    <span>{s.sub}</span>
                    <small>
                      {recent
                        ? `${statuses[recent.status]} · ${date(recent.createdAt)}`
                        : "아직 분석 전"}
                    </small>
                  </button>
                  <button
                    className="agent-refresh"
                    aria-label={`${s.title} 최신 분석`}
                    onClick={() => run(s.id)}
                    disabled={busy || !providers.length}
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
      <section className="card model-settings">
        <div className="card-top">
          <h3>함께 분석할 AI</h3>
          <button
            className="text-btn"
            onClick={() => {
              setTemplate(state.templates?.[activeSkill] || "");
              setEditing(true);
            }}
          >
            <Pencil size={14} />
            {daily
              ? "데일리 브리프"
              : sections.find((s) => s.id === skill)?.title}{" "}
            분석 기준 편집
          </button>
        </div>
        <div className="model-grid">
          {(["codex", "claude"] as const).map((id) => {
            const provider = state.providers.find((p) => p.id === id),
              available =
                provider?.modelEfforts?.[models[id]] ||
                (id === "codex"
                  ? ["low", "medium", "high", "xhigh", "max"]
                  : ["low", "medium", "high"]);
            return (
              <div className="model-choice" key={id}>
                <label className="model-choice-title">
                  <input
                    type="checkbox"
                    checked={providers.includes(id)}
                    onChange={(e) =>
                      setProviders(
                        e.target.checked
                          ? [...providers, id]
                          : providers.filter((p) => p !== id),
                      )
                    }
                  />
                  <span className={"provider-mark " + id}>
                    {id === "codex" ? "O" : "✳"}
                  </span>
                  <strong>{id === "codex" ? "OpenAI" : "Claude"}</strong>
                  <small>
                    {provider?.authenticated ? "연결됨" : "연결 확인 필요"}
                  </small>
                </label>
                <div className="model-choice-fields">
                  <label>
                    모델
                    <input
                      list={"advisor-models-" + id}
                      aria-label={`${id} 모델`}
                      value={models[id]}
                      onChange={(e) => updateModel(id, e.target.value)}
                      placeholder="CLI 기본 모델"
                    />
                    <datalist id={"advisor-models-" + id}>
                      {provider?.models.map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  </label>
                  <label>
                    추론 강도
                    <select
                      aria-label={`${id} 추론 강도`}
                      value={efforts[id]}
                      onChange={(e) =>
                        setEfforts({ ...efforts, [id]: e.target.value })
                      }
                    >
                      {available.map((e) => (
                        <option key={e} value={e}>
                          {effortNames[e] || e} · {e}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
        <p className="hint">
          높은 추론 강도는 더 많은 시간과 사용량이 들 수 있어요. 웹 검색에는
          공개 기업명과 주제만 사용하며, 보고서는 한국어로 정리합니다.
        </p>
      </section>
      {!daily && (
        <details className="optional-sources">
          <summary>
            <FileText size={16} />
            내가 가진 자료도 함께 보기 <span>{selected.length}개 선택</span>
          </summary>
          <div className="card">
            <div className="card-top">
              <p className="muted">
                선택 사항이에요. 자동 조사는 자료를 추가하지 않아도 시작할 수
                있어요.
              </p>
              <button className="text-btn" onClick={onResearch}>
                원문 추가
                <ArrowRight size={14} />
              </button>
            </div>
            <div className="evidence-select">
              {state.evidence.length ? (
                state.evidence.slice(0, 30).map((e) => (
                  <label className="evidence-check" key={e.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(e.id)}
                      disabled={
                        !selected.includes(e.id) && selected.length >= 20
                      }
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...selected, e.id]
                            : selected.filter((id) => id !== e.id),
                        )
                      }
                    />
                    <span>
                      {e.title}
                      <small>
                        {e.coverage === "headline" ? "제목·링크" : "원문 자료"}{" "}
                        · {date(e.retrievedAt)}
                      </small>
                    </span>
                  </label>
                ))
              ) : (
                <p className="muted">추가한 원문이 아직 없어요.</p>
              )}
            </div>
          </div>
        </details>
      )}
      <div className="section-heading">
        <div>
          <h2>{daily ? "오늘의 브리핑" : "분석 보고서"}</h2>
          <span className="muted">
            핵심부터 읽고, 궁금한 근거를 펼쳐보세요.
          </span>
        </div>
        {jobs.length > 0 && (
          <select
            aria-label="이전 분석 선택"
            value={jobId || ""}
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
            title={
              daily
                ? "오늘의 브리핑을 받아보세요"
                : "질문 하나면 시작할 수 있어요"
            }
            body={
              daily
                ? "새로고침 한 번으로 최신 시장과 보유 종목의 주요 일정을 함께 살펴봅니다."
                : "위에서 궁금한 내용을 입력하거나, 분석 카드의 새로고침을 눌러보세요."
            }
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
              {["queued", "running"].includes(job.status) && (
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
              )}
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
          {job.autoResearch && (
            <p className="comparison-note">
              같은 포트폴리오를 기준으로 각 AI가 독립적으로 조사했습니다. 추가로
              찾은 자료는 서로 다를 수 있어요.
            </p>
          )}
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
            <p>두 AI의 의견 일치보다 근거와 가정의 차이를 확인하세요.</p>
            <button className="btn" onClick={() => onHistory(job.id)}>
              프롬프트·상세 기록
            </button>
            {!daily && (
              <button
                className="btn"
                onClick={() => {
                  setParentJobId(job.id);
                  setTarget(job.target || "");
                  setSkill(job.skill);
                  setSelected(
                    job.evidenceIds.filter((id) =>
                      state.evidence.some((e) => e.id === id),
                    ),
                  );
                  setPrompt("");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  notify("이전 분석을 참고하는 후속 질문을 입력해 주세요.");
                }}
              >
                이 분석에 이어서 질문
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </>
      )}
      {editing && (
        <Modal
          title={`${daily ? "데일리 브리프" : sections.find((s) => s.id === skill)?.title} 분석 기준`}
          onClose={() => setEditing(false)}
          wide
        >
          <div className="form">
            <p className="hint">
              새로고침할 때마다 적용되는 조사·분석 절차입니다. 변경 내용은 다음
              분석부터 사용돼요.
            </p>
            <textarea
              rows={13}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              aria-label="분석 기준 프롬프트"
            />
            <div className="form-actions">
              <button className="btn" onClick={() => setEditing(false)}>
                취소
              </button>
              <button
                className="btn primary"
                onClick={async () => {
                  try {
                    await act(
                      "/templates/" + activeSkill,
                      { prompt: template },
                      "PUT",
                    );
                    setEditing(false);
                    notify("분석 기준을 저장했어요.");
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                <Save size={16} />
                분석 기준 저장
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
export function ResultPanel({
  run,
  job,
  onRetry,
}: {
  run: AnalysisRun;
  job: AnalysisJob;
  onRetry: () => void;
}) {
  const r = run.result;
  return (
    <section className="card result-card">
      <div className="result-head">
        <span className={"provider-mark " + run.provider}>
          {run.provider === "codex" ? "O" : "✳"}
        </span>
        <div>
          <h3>
            {run.provider === "codex" ? "OpenAI의 분석" : "Claude의 분석"}
          </h3>
          <small>
            {run.actualModel || run.model || "CLI 기본 모델"} ·{" "}
            {effortNames[run.effort || ""] || run.effort || "기본 강도"}
          </small>
        </div>
        <span className={"status-pill " + run.status}>
          {statuses[run.status]}
        </span>
      </div>
      {["running", "queued"].includes(run.status) ? (
        <AnalysisProgress run={run} createdAt={job.createdAt} />
      ) : run.error ? (
        <Empty
          title="분석을 완료하지 못했어요"
          body={run.error}
          action={
            <button className="btn" onClick={onRetry}>
              이 AI만 다시 분석
            </button>
          }
        />
      ) : r ? (
        <div className="report-content">
          <div className="report-lead">
            <span className="report-kicker">핵심 판단</span>
            <h2>{readable(r.headline || r.summary.split(". ")[0])}</h2>
            <ReportText text={readable(r.summary)} />
          </div>
          <DailyBriefContent result={r} job={job} />
          <RebalanceContent result={r} job={job} />
          <HeadlinesContent result={r} job={job} />
          {(r.highlights?.length || 0) > 0 && (
            <ul className="report-highlights">
              {r.highlights!.map((h, i) => (
                <li key={i}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <ReportText text={readable(h)} />
                </li>
              ))}
            </ul>
          )}
          {(r.metrics?.length || 0) > 0 && (
            <div className="metrics-grid">
              {r.metrics!.map((m, i) => (
                <div className="metric-card" key={i}>
                  <span>{m.label}</span>
                  <strong>{m.value}</strong>
                  <small>{readable(m.context)}</small>
                  <div className="metric-source">
                    {m.evidenceIds.map((id) => {
                      const source =
                        r.sources?.find((s) => s.id === id) ||
                        job.evidence.find((e) => e.id === id);
                      return source ? (
                        <LinkOut key={id} url={source.url}>
                          출처
                        </LinkOut>
                      ) : id === "portfolio-snapshot" ? (
                        <small key={id}>내 포트폴리오 기준</small>
                      ) : null;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="impact-section">
            <h3>내 포트폴리오에 미치는 영향</h3>
            <ul>
              {r.impacts.map((p, i) => (
                <li key={i}>
                  <ReportText text={readable(p)} />
                </li>
              ))}
            </ul>
          </div>
          {[
            ["검토할 행동", r.actions],
            ["반대 관점과 리스크", r.counterarguments],
            ["다시 확인할 조건", r.reviewConditions],
            ["아직 확인하지 못한 것", r.unknowns],
          ].map(([title, items]) => (
            <details
              className="report-section"
              key={title as string}
              open={title === "검토할 행동"}
            >
              <summary>
                {title as string}
                <span>{(items as string[]).length}</span>
              </summary>
              <ul>
                {(items as string[]).map((p, i) => (
                  <li key={i}>
                    <ReportText text={readable(p)} />
                  </li>
                ))}
              </ul>
            </details>
          ))}
          <details className="report-section">
            <summary>
              근거와 출처<span>{r.sources?.length || job.evidence.length}</span>
            </summary>
            <div className="report-sources">
              {r.sources?.map((s) => (
                <div key={s.id}>
                  <LinkOut url={s.url}>{s.title}</LinkOut>
                  <small>
                    {s.publishedAt || "발표일 미확인"} ·{" "}
                    {s.coverage === "full"
                      ? "AI가 본문 확인"
                      : "검색 요약 범위"}
                  </small>
                </div>
              ))}
              {!r.sources?.length &&
                job.evidence.map((e) => (
                  <div key={e.id}>
                    <LinkOut url={e.url}>{e.title}</LinkOut>
                  </div>
                ))}
            </div>
            <p className="hint">
              출처와 본문 확인 범위는 AI가 보고한 내용입니다. 인용 구조 검증이
              사실 검증을 대신하지 않습니다.
            </p>
            {r.facts.map((f, i) => (
              <div className="fact" key={i}>
                <p>{readable(f.statement)}</p>
                {f.evidenceIds.map((id) => {
                  const s =
                    r.sources?.find((s) => s.id === id) ||
                    job.evidence.find((e) => e.id === id);
                  return s ? (
                    <LinkOut key={id} url={s.url}>
                      {s.title}
                    </LinkOut>
                  ) : null;
                })}
              </div>
            ))}
          </details>
          {run.validation.length > 0 && (
            <div className="note-box">{run.validation.join(" ")}</div>
          )}
        </div>
      ) : null}
    </section>
  );
}
