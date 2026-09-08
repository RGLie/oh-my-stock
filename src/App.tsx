import { useCallback, useEffect, useRef, useState } from "react";
import { HistoryView } from "./History";
import { HeadlinesCard } from "./Headlines";
import {
  LayoutDashboard,
  Wallet,
  Sparkles,
  Newspaper,
  SlidersHorizontal,
  BookOpen,
  Settings,
  TrendingUp,
  Plus,
  RefreshCw,
  ArrowRight,
  ChevronRight,
  ArrowUpRight,
  Check,
  Menu,
  X,
  CircleHelp,
  CircleDollarSign,
  History,
} from "lucide-react";
import type { AppState, Holding } from "../shared/types";
import { series, type SeriesView } from "../shared/performance";
import { Chart, Empty, Loading, Modal, date, fmt, pct, tone } from "./ui";
import {
  PortfolioView,
  AdvisorView,
  ResearchView,
  RebalanceView,
  JournalView,
  SettingsView,
  HoldingForm,
  StockDetail,
} from "./views";
const navigation = [
  { id: "dashboard", name: "대시보드", icon: LayoutDashboard },
  { id: "portfolio", name: "내 포트폴리오", icon: Wallet },
  { id: "advisor", name: "AI 투자 파트너", icon: Sparkles },
  { id: "history", name: "AI 실행 기록", icon: History },
  { id: "research", name: "리서치 노트", icon: Newspaper },
  { id: "rebalance", name: "AI 리밸런싱 제안", icon: SlidersHorizontal },
  { id: "journal", name: "투자 기록", icon: BookOpen },
];
// Three readings of the same snapshot history; the raw records are never rewritten.
const chartViews: Record<
  SeriesView,
  { name: string; legend: string; caption: string; empty: string }
> = {
  total: {
    name: "총자산",
    legend: "기록 이후 평가자산",
    caption: "입출금·보유 변경 포함 · 변경 시점은 점으로 표시",
    empty: "오늘부터 실제 평가자산을 기록합니다",
  },
  stock: {
    name: "주식만",
    legend: "보유 주식 평가액",
    caption: "현금 제외 · 현금 입력을 바꿔도 움직이지 않아요",
    empty: "현금과 주식을 나눠 기록한 시점부터 표시돼요",
  },
  index: {
    name: "성과 지수",
    legend: "성과 지수 · 시작 100",
    caption: "입금·출금·현금 수정·매수·매도 영향을 제외한 시세 변화",
    empty: "입출금을 구분해 기록한 시점부터 표시돼요",
  },
};
export type ViewProps = {
  state: AppState;
  act: (path: string, body?: unknown, method?: string) => Promise<any>;
  reload: () => Promise<void>;
  notify: (message: string) => void;
};
export default function App() {
  const [state, setState] = useState<AppState | null>(null),
    [page, setPage] = useState("dashboard"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [holding, setHolding] = useState<Holding | "new" | null>(null),
    [stock, setStock] = useState<Holding | null>(null),
    [currency, setCurrency] = useState<"KRW" | "USD">("KRW"),
    [chartView, setChartView] = useState<SeriesView>("total"),
    [menu, setMenu] = useState(false);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const latestRequest = useRef(0);
  const reload = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const res = await fetch("/api/state", {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error("로컬 서버에 연결하지 못했습니다.");
      const next = await res.json();
      if (request === latestRequest.current) {
        setState(next);
        setError("");
      }
    } catch (e) {
      if (request === latestRequest.current)
        setError(
          "서버 상태를 갱신하지 못했어요. 연결을 확인하는 동안 마지막 정보를 표시합니다.",
        );
      throw e;
    }
  }, []);
  const active =
    state?.jobs.some((j) => ["queued", "running"].includes(j.status)) || false;
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (!document.hidden) await reload();
      } catch {
      } finally {
        if (!stopped) timer = setTimeout(poll, active ? 1500 : 5000);
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [reload, active]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  const act = async (path: string, body?: unknown, method = "POST") => {
    const res = await fetch("/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-OMS-Token": state?.csrf || "",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "요청 처리에 실패했습니다.");
    await reload();
    return data;
  };
  const sync = async () => {
    setBusy(true);
    try {
      await act("/toss/sync");
      setNotice("보유 종목을 최신 상태로 불러왔어요.");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const navigate = (id: string) => {
    setPage(id);
    setMenu(false);
    window.scrollTo({ top: 0 });
  };
  const refreshPrices = async () => {
    setBusy(true);
    try {
      await act("/prices/refresh");
      setNotice("시세와 환율을 갱신했어요.");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const props = state ? { state, act, reload, notify: setNotice } : null;
  return (
    <div className="app">
      <aside className={"sidebar " + (menu ? "expanded" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("dashboard");
          }}
        >
          <span className="brand-icon">
            <TrendingUp size={24} strokeWidth={3} />
          </span>
          <span>
            oh my stock<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">MY INVESTMENT SPACE</div>
        <nav aria-label="주 메뉴">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={"nav-item " + (page === item.id ? "active" : "")}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={20} />
              {item.name}
              {item.id === "advisor" && <span className="new-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="private-card">
            <span className="status-dot" />
            <span>
              나만의 투자 공간<small>나의 투자 판단을 차곡차곡</small>
            </span>
          </div>
          <button
            className={"nav-item " + (page === "settings" ? "active" : "")}
            onClick={() => navigate("settings")}
          >
            <Settings size={20} />
            설정 및 연결
          </button>
          <div className="profile">
            <div className="avatar">나</div>
            <div>
              나의 투자 계정<small>Personal workspace</small>
            </div>
            <Check size={15} />
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-backdrop"
          aria-label="메뉴 닫기"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            aria-label="메뉴 열기"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
          <div className="breadcrumb">
            나의 투자 공간
            <ChevronRight size={14} />
            <strong>
              {navigation.find((n) => n.id === page)?.name || "설정 및 연결"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="local-badge">
              <span className="status-dot" />
              개인용
            </span>
            <button
              className="help-btn"
              aria-label="설정 및 도움말"
              onClick={() => navigate("settings")}
            >
              <CircleHelp size={20} />
            </button>
            <div className="avatar small">나</div>
          </div>
        </header>
        <main id="main-content">
          {!state ? (
            error ? (
              <Empty
                title="서버 연결을 확인해 주세요"
                body={error}
                action={
                  <button
                    className="btn primary"
                    onClick={() => reload().catch((e) => setError(e.message))}
                  >
                    다시 연결
                  </button>
                }
              />
            ) : (
              <Loading />
            )
          ) : (
            <>
              {error && (
                <div className="inline-alert" role="alert">
                  {error}
                  <button onClick={() => reload().catch(() => {})}>
                    다시 연결
                  </button>
                </div>
              )}
              {page === "dashboard" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">MY PORTFOLIO</div>
                      <h1>내 투자를 한눈에</h1>
                      <p>자산의 흐름을 확인하고, 다음 판단을 준비하세요.</p>
                      <p className="quote-status">
                        {state.stream?.status === "live"
                          ? "실시간 시세 구독 연결됨"
                          : state.stream?.status === "partial"
                            ? "일부 시세 구독 연결됨"
                            : "시세 연결 대기"}{" "}
                        ·{" "}
                        {state.stream?.lastMessage
                          ? "최근 체결 수신 " + date(state.stream.lastMessage)
                          : "거래가 없으면 마지막 시세가 표시돼요"}
                      </p>
                    </div>
                    <div className="button-group">
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={refreshPrices}
                      >
                        <RefreshCw size={16} />
                        시세 새로고침
                      </button>
                      <button className="btn" disabled={busy} onClick={sync}>
                        <RefreshCw size={16} className={busy ? "spin" : ""} />
                        {busy ? "불러오는 중" : "토스 동기화"}
                      </button>
                    </div>
                  </div>
                  {state.connection.status === "error" && (
                    <div className="inline-alert">
                      {state.connection.message}
                      <button onClick={() => navigate("settings")}>
                        연결 설정
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                  <HeadlinesCard
                    {...props!}
                    onDetail={(id) => {
                      setHistoryId(id);
                      navigate("history");
                    }}
                    onSettings={() => navigate("settings")}
                  />
                  <div className="dashboard-grid">
                    <section className="card asset-card">
                      <div className="card-top">
                        <span className="label">
                          {state.summary.cashKnown
                            ? "내 총자산"
                            : "보유 주식 평가액"}
                        </span>
                        <div className="segmented" aria-label="표시 통화">
                          {(["KRW", "USD"] as const).map((c) => (
                            <button
                              className={currency === c ? "selected" : ""}
                              key={c}
                              onClick={() => setCurrency(c)}
                            >
                              {c === "KRW" ? "원화" : "달러"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="asset-number">
                        {fmt(
                          currency === "KRW"
                            ? state.summary.krw
                            : state.summary.usd,
                          currency,
                        )}
                        <span>{currency === "KRW" ? "KRW" : "USD"}</span>
                      </div>
                      <div className="asset-return">
                        <span className={tone(state.summary.pnlUsd)}>
                          {fmt(state.summary.pnlUsd)}{" "}
                          <span className="return-pill">
                            {pct(state.summary.returnPct)}
                          </span>
                        </span>
                        <span className="muted">
                          보유분 평가손익 · USD 기준
                        </span>
                      </div>
                      <div className="chart-view">
                        <div className="segmented" aria-label="차트 보기">
                          {(Object.keys(chartViews) as SeriesView[]).map(
                            (v) => (
                              <button
                                key={v}
                                className={chartView === v ? "selected" : ""}
                                aria-pressed={chartView === v}
                                onClick={() => setChartView(v)}
                              >
                                {chartViews[v].name}
                              </button>
                            ),
                          )}
                        </div>
                        <small>{chartViews[chartView].caption}</small>
                      </div>
                      <div className="asset-chart">
                        <Chart
                          points={series(state.snapshots, chartView, currency)}
                          label={chartViews[chartView].legend + " 추이"}
                          empty={{
                            title: "자산 기록이 쌓이면 변화가 보여요",
                            body: chartViews[chartView].empty,
                          }}
                          format={(v) =>
                            chartView === "index"
                              ? v.toFixed(2)
                              : fmt(v, currency)
                          }
                        />
                      </div>
                      <div className="asset-footer">
                        <span>
                          <span className="legend-dot" />
                          {chartViews[chartView].legend}
                        </span>
                        <span>
                          {chartView === "index"
                            ? "시세 변화만 · 통화 무관"
                            : chartView === "stock"
                              ? "현금 제외"
                              : "입출금·보유 변경 포함"}
                        </span>
                      </div>
                    </section>
                    <div className="dashboard-side">
                      <section className="card compact-card">
                        <div className="card-top">
                          <span className="label">투자 현황</span>
                          <Wallet size={18} className="muted" />
                        </div>
                        <div className="stat-pair">
                          <span>보유 종목</span>
                          <strong>
                            {state.holdings.length}
                            <small>개</small>
                          </strong>
                        </div>
                        <div className="stat-pair">
                          <span>
                            매입 금액 <small>USD 환산</small>
                          </span>
                          <b>{fmt(state.summary.costUsd)}</b>
                        </div>
                        <div className="stat-pair">
                          <span>
                            현금 <small>직접 확인</small>
                          </span>
                          <button
                            className="text-btn"
                            onClick={() => navigate("settings")}
                          >
                            {state.settings.cashKnown
                              ? fmt(state.settings.cashUsd)
                              : "잔고 입력"}
                            <ChevronRight size={14} />
                          </button>
                        </div>
                        <div className="divider" />
                        <div className="stat-pair">
                          <span>USD / KRW</span>
                          <b>
                            {state.fx
                              ? Number(state.fx.rate).toLocaleString("ko-KR") +
                                "원"
                              : "—"}
                          </b>
                        </div>
                        <small className="muted">
                          {state.fx
                            ? "매매기준율 · " + date(state.fx.at)
                            : "시세 갱신 후 표시돼요"}
                        </small>
                      </section>
                      <section className="partner-card">
                        <div className="sparkle-box">
                          <Sparkles size={21} />
                        </div>
                        <h3>다른 관점, 더 깊은 판단</h3>
                        <p>
                          각자 조사한 두 AI의
                          <br />
                          의견과 근거를 비교해 보세요.
                        </p>
                        <button onClick={() => navigate("advisor")}>
                          AI 파트너에게 물어보기
                          <ArrowRight size={17} />
                        </button>
                      </section>
                    </div>
                  </div>
                  <div className="section-heading">
                    <div>
                      <h2>
                        내가 보유한 종목{" "}
                        <span className="count">{state.holdings.length}</span>
                      </h2>
                      <span className="muted">
                        {state.connection.lastSync
                          ? "최근 동기화 " + date(state.connection.lastSync)
                          : "직접 추가하거나 토스에서 불러오세요"}
                      </span>
                    </div>
                    <button className="btn" onClick={() => setHolding("new")}>
                      <Plus size={16} />
                      종목 추가
                    </button>
                  </div>
                  <section className="card table-card">
                    <HoldingsTable
                      state={state}
                      onEdit={setHolding}
                      onStock={setStock}
                    />
                  </section>
                  <div className="bottom-grid">
                    <section className="card">
                      <div className="card-top">
                        <h3>포트폴리오 구성</h3>
                        <span className="muted">평가액 기준</span>
                      </div>
                      {state.holdings.length ? (
                        <Allocation state={state} />
                      ) : (
                        <Empty
                          title="어떤 자산을 담고 있나요?"
                          body="종목을 추가하면 비중을 보여드려요."
                        />
                      )}
                    </section>
                    <section className="card">
                      <div className="card-top">
                        <h3>최근 투자 기록</h3>
                        <button
                          className="text-btn"
                          onClick={() => navigate("journal")}
                        >
                          전체 보기
                          <ChevronRight size={15} />
                        </button>
                      </div>
                      {state.journal.length ? (
                        state.journal.slice(0, 3).map((j) => (
                          <div className="journal-preview" key={j.id}>
                            <span className="note-icon">
                              <BookOpen size={18} />
                            </span>
                            <div>
                              <strong>{j.title}</strong>
                              <p>{j.body.slice(0, 75)}</p>
                              <small>{date(j.createdAt)}</small>
                            </div>
                          </div>
                        ))
                      ) : (
                        <Empty
                          title="판단의 이유를 남겨보세요"
                          body="다음 투자에서 꺼내 볼 나만의 기준이 됩니다."
                          action={
                            <button
                              className="text-btn"
                              onClick={() => navigate("journal")}
                            >
                              첫 기록 남기기
                              <ArrowRight size={15} />
                            </button>
                          }
                        />
                      )}
                    </section>
                  </div>
                </>
              )}
              {page === "portfolio" && (
                <PortfolioView
                  {...props!}
                  onAdd={() => setHolding("new")}
                  onEdit={setHolding}
                  onStock={setStock}
                  onSync={sync}
                  busy={busy}
                />
              )}
              {page === "advisor" && (
                <AdvisorView
                  {...props!}
                  onResearch={() => navigate("research")}
                  onSettings={() => navigate("settings")}
                  onHistory={(id) => {
                    setHistoryId(id);
                    navigate("history");
                  }}
                />
              )}
              {page === "history" && (
                <HistoryView
                  {...props!}
                  initialId={historyId}
                  onAdvisor={() => navigate("advisor")}
                />
              )}
              {page === "research" && <ResearchView {...props!} />}
              {page === "rebalance" && <RebalanceView {...props!} />}
              {page === "journal" && <JournalView {...props!} />}
              {page === "settings" && <SettingsView {...props!} />}
            </>
          )}
        </main>
        <footer className="page-footer">
          <span>oh my stock.</span>
          <span>나의 기준으로, 더 나은 투자.</span>
        </footer>
      </div>
      {notice && (
        <div role="status" className="toast">
          <Check size={18} />
          {notice}
          <button onClick={() => setNotice("")} aria-label="알림 닫기">
            <X size={16} />
          </button>
        </div>
      )}
      {holding && state && (
        <Modal
          title={holding === "new" ? "보유 종목 추가" : "보유 종목 편집"}
          onClose={() => setHolding(null)}
        >
          <HoldingForm
            {...props!}
            holding={holding === "new" ? null : holding}
            onClose={() => setHolding(null)}
          />
        </Modal>
      )}
      {stock && (
        <Modal
          title={stock.name + " · " + stock.symbol}
          onClose={() => setStock(null)}
          wide
        >
          <StockDetail holding={stock} />
        </Modal>
      )}
    </div>
  );
}
export function HoldingsTable({
  state,
  onEdit,
  onStock,
}: {
  state: AppState;
  onEdit: (h: Holding) => void;
  onStock: (h: Holding) => void;
}) {
  const [sort, setSort] = useState("value");
  const rows = [...state.summary.holdings].sort((a, b) =>
    sort === "name"
      ? a.symbol.localeCompare(b.symbol)
      : sort === "value"
        ? Number(b.weight || 0) - Number(a.weight || 0)
        : Number(b.returnPct || 0) - Number(a.returnPct || 0),
  );
  return !rows.length ? (
    <Empty
      title="첫 포트폴리오를 연결해 보세요"
      body="토스 동기화로 보유 종목을 불러오거나, 직접 입력할 수 있어요."
    />
  ) : (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>
              <button onClick={() => setSort("name")}>종목</button>
            </th>
            <th>현재가</th>
            <th>보유 수량</th>
            <th>
              <button onClick={() => setSort("value")}>평가금액 ↓</button>
            </th>
            <th>
              <button onClick={() => setSort("returnPct")}>평가손익</button>
            </th>
            <th>비중</th>
            <th>
              <span className="sr-only">편집</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h, i) => (
            <tr key={h.id}>
              <td>
                <button className="stock-button" onClick={() => onStock(h)}>
                  <span className={"stock-avatar color-" + (i % 6)}>
                    {h.symbol.slice(0, 2)}
                  </span>
                  <span>
                    <strong>{h.name}</strong>
                    <small>
                      {h.symbol} <span className="dot-sep">·</span>{" "}
                      {h.source === "toss" ? "토스증권" : "직접 입력"}
                      {h.assetType === "ETF" ? " · ETF" : ""}
                    </small>
                  </span>
                </button>
              </td>
              <td>
                <strong>{fmt(h.price, h.currency)}</strong>
                <small>{h.priceAt ? date(h.priceAt) : "시세 미조회"}</small>
              </td>
              <td>
                {Number(h.quantity).toLocaleString("ko-KR", {
                  maximumFractionDigits: 6,
                })}
                <small>평균 {fmt(h.averageCost, h.currency)}</small>
              </td>
              <td>
                <strong>{fmt(h.value, h.currency)}</strong>
              </td>
              <td className={tone(h.pnl)}>
                <strong>{fmt(h.pnl, h.currency)}</strong>
                <small>{pct(h.returnPct)}</small>
              </td>
              <td>{h.weight ? Number(h.weight).toFixed(1) + "%" : "—"}</td>
              <td>
                <button
                  className="edit-btn"
                  onClick={() => onEdit(h)}
                  aria-label={`${h.symbol} 편집`}
                >
                  편집
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Allocation({ state }: { state: AppState }) {
  const sorted = [...state.summary.holdings].sort(
    (a, b) => Number(b.weight) - Number(a.weight),
  );
  return (
    <div className="allocation">
      <div className="allocation-bar">
        {sorted.map((h, i) => (
          <div
            className={"allocation-segment color-" + (i % 6)}
            key={h.id}
            style={{ width: (Number(h.weight) || 0) + "%" }}
            title={`${h.symbol} ${h.weight}%`}
          />
        ))}
      </div>
      {sorted.slice(0, 5).map((h, i) => (
        <div className="allocation-row" key={h.id}>
          <span>
            <i className={"legend-dot color-" + (i % 6)} />
            {h.symbol}
          </span>
          <span>{h.weight ? Number(h.weight).toFixed(1) + "%" : "—"}</span>
        </div>
      ))}
      {state.summary.cashKnown && (
        <div className="allocation-row muted">
          <span>현금 및 기타 보유분</span>
          <CircleDollarSign size={17} />
        </div>
      )}
    </div>
  );
}
