import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, ArrowUpRight, Inbox, LoaderCircle } from "lucide-react";
export const fmt = (v: string | number | null | undefined, currency = "USD") =>
  v == null
    ? "—"
    : new Intl.NumberFormat("ko-KR", {
        style: "currency",
        currency,
        maximumFractionDigits: currency === "KRW" ? 0 : 2,
      }).format(Number(v));
export const pct = (v: string | number | null | undefined) =>
  v == null ? "—" : `${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(2)}%`;
export const date = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleString("ko-KR", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "아직 기록 없음";
export const tone = (v: string | number | null | undefined) =>
  v == null
    ? "muted"
    : Number(v) > 0
      ? "positive"
      : Number(v) < 0
        ? "negative"
        : "muted";
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={25} />
      </span>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" />
      불러오는 중이에요
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="닫기">
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Chart({
  points,
  color = "#3182f6",
  height = 220,
  label,
}: {
  points: { x: string; y: number }[];
  color?: string;
  height?: number;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useRef("g" + Math.random().toString(36).slice(2));
  if (points.length < 2)
    return (
      <div className="chart-empty" style={{ height }}>
        <div className="chart-empty-line" />
        <p>자산 기록이 쌓이면 변화가 보여요</p>
        <span>오늘부터 실제 평가자산을 기록합니다</span>
      </div>
    );
  const min = Math.min(...points.map((p) => p.y)),
    max = Math.max(...points.map((p) => p.y)),
    span = max - min || Math.max(max * 0.03, 1),
    bottom = min - span * 0.15,
    top = max + span * 0.15;
  const y = (v: number) =>
      height - 25 - ((v - bottom) / (top - bottom)) * (height - 45),
    x = (i: number) => 8 + (i / (points.length - 1)) * 984;
  const path = points
      .map((p, i) => `${i ? "L" : "M"}${x(i)} ${y(p.y)}`)
      .join(" "),
    area = path + ` L992 ${height - 8} L8 ${height - 8} Z`;
  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 1000 ${height}`}
        role="img"
        aria-label={label}
        preserveAspectRatio="none"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(
            Math.max(
              0,
              Math.min(
                points.length - 1,
                Math.round(
                  ((e.clientX - r.left) / r.width) * (points.length - 1),
                ),
              ),
            ),
          );
        }}
      >
        <defs>
          <linearGradient id={id.current} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity=".14" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.55, 0.85].map((n) => (
          <line
            key={n}
            x1="0"
            x2="1000"
            y1={height * n}
            y2={height * n}
            stroke="#eef1f5"
            strokeDasharray="3 5"
          />
        ))}
        <path d={area} fill={`url(#${id.current})`} />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        {hover !== null && points[hover] && (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1="10"
              y2={height}
              stroke="#c2c9d3"
            />
            <circle cx={x(hover)} cy={y(points[hover].y)} r="5" fill={color} />
          </>
        )}
      </svg>
      {hover !== null && points[hover] && (
        <div className="chart-tooltip">
          {date(points[hover].x)} ·{" "}
          {points[hover].y.toLocaleString("ko-KR", {
            maximumFractionDigits: 2,
          })}
        </div>
      )}
      <div className="chart-dates">
        <span>{date(points[0].x)}</span>
        <span>{date(points.at(-1)!.x)}</span>
      </div>
    </div>
  );
}
export function LinkOut({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
}) {
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="source-link">
      {children}
      <ArrowUpRight size={15} />
    </a>
  ) : (
    <span>{children}</span>
  );
}
