import { useEffect, useState } from "react";
import type { AnalysisRun } from "../shared/types";

export function AnalysisProgress({
  run,
  createdAt,
  compact = false,
}: {
  run: AnalysisRun;
  createdAt: string;
  compact?: boolean;
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
  return (
    <div
      className={"analysis-progress " + (compact ? "compact" : "")}
      aria-label={`${run.provider} 분석 진행 상태`}
    >
      <span
        className="progress-ring"
        role="progressbar"
        aria-label="분석 진행 중"
        aria-valuetext="완료 시간을 예측할 수 없는 작업입니다"
      />
      <div className="progress-text">
        <strong>
          {run.status === "queued"
            ? "실행 순서를 기다리고 있어요"
            : run.stage || "AI 응답을 기다리고 있어요"}
        </strong>
        <span className="muted">
          <span className="elapsed-time">
            {Math.floor(seconds / 60)}분{" "}
            {String(seconds % 60).padStart(2, "0")}초
          </span>
          {" · "}검색·원문 확인 {run.toolCount || 0}회
          {heartbeatAge !== null && heartbeatAge > 20
            ? ` · 상태 갱신 ${heartbeatAge}초 지연`
            : ""}
        </span>
      </div>
    </div>
  );
}
