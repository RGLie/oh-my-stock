import Decimal from "decimal.js";
import type { Holding, Summary, ValuedHolding } from "../shared/types";
export const D = (v: Decimal.Value) => new Decimal(v);
const money = (v: Decimal) => v.toFixed(8);
export function valuePortfolio(
  holdings: Holding[],
  cashUsd: string,
  cashKrw: string,
  fx: string | null,
  cashKnown: boolean,
  now = Date.now(),
): Summary {
  let complete = true,
    total = cashKnown ? D(cashUsd) : D(0),
    totalCost = D(0),
    pnl = D(0);
  const rate = fx && D(fx).gt(0) ? D(fx) : null;
  if (cashKnown && D(cashKrw).gt(0)) {
    if (rate) total = total.plus(D(cashKrw).div(rate));
    else complete = false;
  }
  const valued: ValuedHolding[] = holdings.map((h) => {
    const cost = D(h.quantity).mul(h.averageCost);
    const value = h.price === null ? null : D(h.quantity).mul(h.price);
    const profit = value?.minus(cost) ?? null;
    const conversion =
      h.currency === "USD" ? D(1) : rate ? D(1).div(rate) : null;
    if (value === null || !conversion) complete = false;
    else {
      total = total.plus(value.mul(conversion));
      totalCost = totalCost.plus(cost.mul(conversion));
      pnl = pnl.plus(profit!.mul(conversion));
    }
    return {
      ...h,
      cost: money(cost),
      value: value === null ? null : money(value),
      pnl: profit === null ? null : money(profit),
      returnPct:
        profit !== null && cost.gt(0)
          ? profit.div(cost).mul(100).toFixed(4)
          : null,
      weight: null,
      stale: !h.priceAt || now - Date.parse(h.priceAt) > 15 * 60_000,
    };
  });
  for (const h of valued)
    if (complete && h.value !== null && total.gt(0))
      h.weight = D(h.value)
        .mul(h.currency === "USD" ? 1 : D(1).div(rate!))
        .div(total)
        .mul(100)
        .toFixed(4);
  return {
    usd: complete ? money(total) : null,
    krw: complete && rate ? total.mul(rate).toFixed(0) : null,
    costUsd: complete ? money(totalCost) : null,
    pnlUsd: complete ? money(pnl) : null,
    returnPct:
      complete && totalCost.gt(0)
        ? pnl.div(totalCost).mul(100).toFixed(4)
        : null,
    complete,
    cashKnown,
    cashUsd,
    cashKrw,
    fxRate: rate?.toString() || null,
    holdings: valued,
  };
}
export function simulate(
  summary: Summary,
  targets: { id: string; weight: string }[],
  contribution: string,
  mode: "contribute" | "rebalance",
  cashFloor: string,
  maxPosition: string,
) {
  if (!summary.complete || summary.usd === null)
    throw new Error("시세와 환율을 먼저 갱신해 주세요.");
  if (!summary.cashKnown)
    throw new Error("현금 잔고를 확인한 뒤 시뮬레이션해 주세요.");
  const sum = targets.reduce((s, t) => s.plus(t.weight), D(0));
  if (sum.gt(D(100).minus(cashFloor)))
    throw new Error("목표 비중 합계와 최소 현금 비중을 확인해 주세요.");
  if (targets.some((t) => D(t.weight).gt(maxPosition)))
    throw new Error("종목 최대 비중을 초과한 목표가 있습니다.");
  if (new Set(targets.map((t) => t.id)).size !== targets.length)
    throw new Error("중복된 종목 목표입니다.");
  const after = D(summary.usd).plus(contribution),
    available = D(contribution)
      .plus(summary.cashUsd)
      .plus(
        D(summary.cashKrw).isZero()
          ? 0
          : D(summary.cashKrw).div(summary.fxRate!),
      );
  const desired = targets.map((t) => {
    const h = summary.holdings.find((h) => h.id === t.id);
    if (!h || h.value === null || h.weight === null)
      throw new Error("보유 종목을 확인해 주세요.");
    const current =
        h.currency === "USD" ? D(h.value) : D(h.value).div(summary.fxRate!),
      delta = after.mul(t.weight).div(100).minus(current);
    return {
      id: h.id,
      symbol: h.symbol,
      currentWeight: h.weight,
      targetWeight: t.weight,
      delta: mode === "contribute" ? Decimal.max(delta, 0) : delta,
    };
  });
  const spend = desired.reduce((s, r) => s.plus(r.delta), D(0));
  const budget = Decimal.max(available.minus(after.mul(cashFloor).div(100)), 0);
  const scale =
    mode === "contribute" && spend.gt(budget) && spend.gt(0)
      ? budget.div(spend)
      : D(1);
  const rows = desired.map((r) => ({
    ...r,
    delta: r.delta.mul(scale).toDecimalPlaces(2, Decimal.ROUND_DOWN).toFixed(2),
  }));
  const remaining = available.minus(
    rows.reduce((s, r) => s.plus(r.delta), D(0)),
  );
  if (remaining.lt(after.mul(cashFloor).div(100).minus("0.02")))
    throw new Error("현금 하한을 충족할 수 없는 목표입니다.");
  return {
    rows,
    cashAfter: remaining.toFixed(2),
    portfolioAfter: after.toFixed(2),
    scaled: scale.lt(1),
    assumptions: [
      "가격 변화·수수료·세금 미반영",
      "금액 기준 가상 배분이며 주문을 실행하지 않습니다.",
    ],
  };
}
