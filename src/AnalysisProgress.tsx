import { useEffect, useState } from "react";
import type { AnalysisRun } from "../shared/types";

export function AnalysisProgress({
  run,
  createdAt,
}: {
  run: AnalysisRun;
  createdAt: string;
}) {
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(
    0,
    Math.floor((clock - Date.parse(run.startedAt || createdAt)) / 1000),
  );
  const heartbeatAge = run.heartbeatAt
    ? Math.max(0, Math.floor((clock - Date.parse(run.heartbeatAt)) / 1000))
    : null;
  const phase =
    run.status === "queued"
      ? -1
      : ["connecting", "researching", "composing", "validating"].indexOf(
          run.phase || "connecting",
        );
  return (
    <div
      className="analysis-progress"
      aria-label={`${run.provider} 분석 진행 상태`}
    >
      <div className="progress-caption">
        <strong>
          {run.status === "queued"
            ? "실행 순서를 기다리고 있어요"
            : run.stage || "AI 응답을 기다리고 있어요"}
        </strong>
        <span className="elapsed-time">
          {Math.floor(seconds / 60)}분 {String(seconds % 60).padStart(2, "0")}초
          경과
        </span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="분석 진행 중"
        aria-valuetext="완료 시간을 예측할 수 없는 작업입니다"
      >
        <span />
      </div>
      <div className="progress-steps">
        {["AI 연결", "자료 조사", "답변 작성", "결과 확인"].map((label, i) => (
          <span key={label} className={phase === i ? "current" : ""}>
            {label}
          </span>
        ))}
      </div>
      <div className="progress-caption muted">
        <span>검색·원문 확인 {run.toolCount || 0}회</span>
        <span>
          {heartbeatAge === null
            ? "실행 준비 중"
            : heartbeatAge > 20
              ? `상태 갱신이 ${heartbeatAge}초 지연되고 있어요`
              : `로컬 실행 상태 확인 ${heartbeatAge}초 전`}
        </span>
      </div>
      <p className="hint">
        AI의 응답이 없는 동안에도 경과 시간은 갱신됩니다. 조사 범위와 추론
        강도에 따라 수 분이 걸릴 수 있어요.
      </p>
    </div>
  );
}
