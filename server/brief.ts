import type { BriefWindow } from "../shared/types";
export function briefWindow(at = new Date().toISOString()): BriefWindow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(at));
  const value = (type: string) => parts.find((p) => p.type === type)!.value;
  const date = `${value("year")}-${value("month")}-${value("day")}`;
  const start = new Date(date + "T00:00:00+09:00");
  return {
    date,
    timezone: "Asia/Seoul",
    asOf: at,
    dayStartAt: start.toISOString(),
    dayEndAt: new Date(start.getTime() + 86_400_000).toISOString(),
    lookaheadEndAt: new Date(
      new Date(at).getTime() + 72 * 3_600_000,
    ).toISOString(),
  };
}
