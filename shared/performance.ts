import type { Snapshot } from "./types";

export type SeriesPoint = { x: string; y: number; note?: string };
export type SeriesView = "total" | "stock" | "index";

const signedUsd = (value: string) => {
  const n = Number(value);
  return (
    (n > 0 ? "+" : "−") +
    "$" +
    Math.abs(n).toLocaleString("ko-KR", { maximumFractionDigits: 2 })
  );
};
// Text shown on a chart marker: every flow recorded between the previous snapshot and this one.
export const flowNote = (s: Snapshot) =>
  s.flows?.length
    ? s.flows.map((f) => `${f.label} ${signedUsd(f.usd)}`).join(" · ")
    : undefined;

// Chronological snapshots → chart points for one view.
// total: observed valuation including cash (deposits and edits show as steps, marked).
// stock: holdings only, unaffected by cash edits (only snapshots that recorded the split).
// index: chain-linked performance starting at 100 that removes external flows, so deposits,
//        withdrawals, cash edits and buys/sells do not register as gains or losses.
export function series(
  snapshots: Snapshot[],
  view: SeriesView,
  currency: "KRW" | "USD",
): SeriesPoint[] {
  if (view === "index") return performanceIndex(snapshots);
  const points: SeriesPoint[] = [];
  for (const s of snapshots) {
    if (!s.complete) continue;
    let y: number | null = null;
    if (view === "total") {
      const v = currency === "KRW" ? s.krw : s.usd;
      y = v === null ? null : Number(v);
    } else if (s.stockUsd != null) {
      if (currency === "USD") y = Number(s.stockUsd);
      else if (s.fxRate) y = Number(s.stockUsd) * Number(s.fxRate);
    }
    if (y === null || !Number.isFinite(y)) continue;
    points.push({ x: s.at, y, note: flowNote(s) });
  }
  return points;
}

export function performanceIndex(snapshots: Snapshot[]): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  let index = 100,
    previousUsd: number | null = null,
    pendingFlow = 0;
  for (const s of snapshots) {
    // Only snapshots that measured flows can take part; older records would show deposits as returns.
    if (s.flowUsd === undefined) continue;
    pendingFlow += Number(s.flowUsd) || 0;
    if (!s.complete || s.usd === null) continue;
    const usd = Number(s.usd);
    if (previousUsd !== null) {
      // Flows are valued at end-of-period prices (modified Dietz with end-dated flows).
      const organic = usd - pendingFlow;
      if (previousUsd > 0 && organic > 0) index *= organic / previousUsd;
    }
    points.push({
      x: s.at,
      y: Math.round(index * 100) / 100,
      note: flowNote(s),
    });
    previousUsd = usd;
    pendingFlow = 0;
  }
  return points;
}
