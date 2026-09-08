import { useEffect, useState, type FormEvent } from "react";
import { InvestorProfileForm } from "./InvestorProfile";
import {
  Plus,
  RefreshCw,
  Upload,
  Download,
  Sparkles,
  ArrowRight,
  ExternalLink,
  FileText,
  Check,
  ArrowUpRight,
  LoaderCircle,
  X,
  Search,
  Save,
  SlidersHorizontal,
  BookOpen,
  Play,
  CircleHelp,
  AlertCircle,
} from "lucide-react";
import type { Holding, Evidence, AnalysisJob } from "../shared/types";
import { type ViewProps, HoldingsTable } from "./App";
import { fallbackHeadlineSettings } from "./Headlines";
import { Modal, Empty, Chart, Loading, LinkOut, date, fmt } from "./ui";
const skills = [
  { id: "news", title: "보유 종목 뉴스", sub: "내 자산에 어떤 영향이 있을까" },
  { id: "earnings", title: "실적 깊이 읽기", sub: "숫자 너머의 사업 변화" },
  { id: "macro", title: "시장·매크로", sub: "경제 흐름과 투자 연결하기" },
  { id: "allocation", title: "포트폴리오 점검", sub: "비중과 집중도 확인" },
  { id: "sector", title: "섹터 기회 탐색", sub: "저평가 가설과 반대 근거" },
];
const categories: Record<string, string> = {
  daily: "데일리 브리프",
  portfolio: "보유 종목",
  earnings: "실적 보고서",
  macro: "매크로",
  sector: "섹터",
  index: "지수",
  indicators: "지표",
  fx: "환율",
  allocation: "포트폴리오 점검",
  headlines: "주요 뉴스",
};
const statusNames: Record<string, string> = {
  queued: "대기 중",
  running: "분석 중",
  completed: "분석 완료",
  partial: "일부 완료",
  failed: "다시 확인",
  cancelled: "취소됨",
  interrupted: "중단됨",
};
function values(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return Object.fromEntries(new FormData(event.currentTarget)) as Record<
    string,
    string
  >;
}
function PageHeading({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
      {action}
    </div>
  );
}
export function HoldingForm({
  holding,
  onClose,
  act,
  notify,
  state,
}: ViewProps & { holding: Holding | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const locked = holding?.source === "toss";
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    const v = values(e);
    setBusy(true);
    try {
      await act(
        holding ? "/holdings/" + holding.id : "/holdings",
        {
          ...v,
          symbol: locked ? holding.symbol : v.symbol,
          name: locked ? holding.name : v.name,
          currency: locked ? holding.currency : v.currency,
          quantity: locked ? holding.quantity : v.quantity,
          averageCost: locked ? holding.averageCost : v.averageCost,
          assetType: locked ? holding.assetType : v.assetType,
          targetWeight: v.targetWeight || null,
        },
        holding ? "PATCH" : "POST",
      );
      notify("포트폴리오에 저장했어요.");
      onClose();
      if (state.connection.configured && !locked)
        void act("/prices/refresh").catch(() =>
          notify("종목을 저장했어요. 시세 새로고침으로 가격을 확인해 주세요."),
        );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="form">
      <p className="form-intro">
        {locked
          ? "토스 잔고는 동기화로 갱신돼요. 투자 근거와 목표 비중을 기록하세요."
          : "토스 외 계좌의 보유 종목도 함께 관리할 수 있어요."}
      </p>
      <div className="form-row">
        <label>
          티커
          <input
            name="symbol"
            placeholder="AAPL"
            defaultValue={holding?.symbol}
            required
            disabled={locked}
          />
        </label>
        <label>
          종목명
          <input
            name="name"
            placeholder="애플"
            defaultValue={holding?.name}
            required
            disabled={locked}
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          통화
          <select
            name="currency"
            defaultValue={holding?.currency || "USD"}
            disabled={locked}
          >
            <option>USD</option>
            <option>KRW</option>
          </select>
        </label>
        <label>
          유형
          <select
            name="assetType"
            defaultValue={holding?.assetType || "STOCK"}
            disabled={locked}
          >
            <option value="STOCK">주식</option>
            <option value="ETF">ETF</option>
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          보유 수량
          <input
            name="quantity"
            inputMode="decimal"
            defaultValue={holding?.quantity}
            placeholder="10"
            required
            disabled={locked}
          />
        </label>
        <label>
          평균 매입단가
          <input
            name="averageCost"
            inputMode="decimal"
            defaultValue={holding?.averageCost}
            placeholder="150.00"
            required
            disabled={locked}
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          섹터
          <input
            name="sector"
            defaultValue={holding?.sector || "미분류"}
            placeholder="정보기술"
          />
        </label>
        <label>
          목표 비중 (%)
          <input
            name="targetWeight"
            inputMode="decimal"
            defaultValue={holding?.targetWeight || ""}
            placeholder="선택 사항"
          />
        </label>
      </div>
      <label>
        이 종목을 보유하는 이유
        <textarea
          name="thesis"
          rows={4}
          defaultValue={holding?.thesis}
          placeholder="기대하는 변화, 확인할 지표, 판단을 바꿀 조건을 남겨보세요."
        />
      </label>
      {!locked && (
        <p className="hint">
          같은 토스 보유분을 다시 입력하면 중복 집계돼요. 다른 계좌의 보유분만
          추가해 주세요.
        </p>
      )}
      <div className="form-actions">
        {holding && !locked && (
          <button
            type="button"
            className="btn danger"
            onClick={async () => {
              if (!window.confirm("직접 입력한 보유 종목을 삭제할까요?"))
                return;
              try {
                await act("/holdings/" + holding.id, undefined, "DELETE");
                onClose();
                notify("종목을 삭제했어요.");
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            삭제
          </button>
        )}
        <button type="button" className="btn" onClick={onClose}>
          취소
        </button>
        <button className="btn primary" disabled={busy}>
          {busy ? "저장 중" : "저장하기"}
        </button>
      </div>
    </form>
  );
}

export function PortfolioView(
  props: ViewProps & {
    onAdd: () => void;
    onEdit: (h: Holding) => void;
    onStock: (h: Holding) => void;
    onSync: () => void;
    busy: boolean;
  },
) {
  const [importing, setImporting] = useState(false),
    [csv, setCsv] = useState(""),
    [rows, setRows] = useState<any[] | null>(null),
    [working, setWorking] = useState(false);
  const preview = () => {
    try {
      const lines = csv.trim().split(/\r?\n/);
      const header = lines
        .shift()!
        .split(",")
        .map((s) => s.trim());
      if (
        !["symbol", "name", "quantity", "averageCost"].every((k) =>
          header.includes(k),
        )
      )
        throw new Error("필수 열: symbol, name, quantity, averageCost");
      const parsed = lines.filter(Boolean).map((line) => {
        const cells = line.split(",").map((s) => s.trim());
        if (cells.length !== header.length)
          throw new Error(
            "열 수를 확인해 주세요. 쉼표가 들어간 필드는 현재 지원하지 않습니다.",
          );
        return {
          ...{
            currency: "USD",
            sector: "미분류",
            assetType: "STOCK",
            thesis: "",
            targetWeight: null,
          },
          ...Object.fromEntries(header.map((h, i) => [h, cells[i]])),
        };
      });
      setRows(parsed);
    } catch (e) {
      props.notify((e as Error).message);
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="MY HOLDINGS"
        title="내 포트폴리오"
        body="보유 자산과, 그 자산을 선택한 이유를 함께 관리하세요."
        action={
          <div className="button-group">
            <button className="btn" onClick={() => setImporting(true)}>
              <Upload size={16} />
              CSV 가져오기
            </button>
            <button className="btn primary" onClick={props.onAdd}>
              <Plus size={16} />
              종목 추가
            </button>
          </div>
        }
      />
      <div className="connection-banner">
        <div>
          <span className="toss-mark">t</span>
          <span>
            <strong>토스증권</strong>
            <small>{props.state.connection.message}</small>
          </span>
        </div>
        <button className="btn" onClick={props.onSync} disabled={props.busy}>
          <RefreshCw size={16} className={props.busy ? "spin" : ""} />
          보유 종목 불러오기
        </button>
      </div>
      <section className="card table-card">
        <HoldingsTable
          state={props.state}
          onEdit={props.onEdit}
          onStock={props.onStock}
        />
      </section>
      <div className="note-box">
        <CircleHelp size={19} />
        <p>
          토스 잔고와 직접 입력한 보유분을 합산합니다. 과거 거래 내역을 입력하지
          않은 자산은 현재 보유분 평가손익과 기록 이후 자산 추이만 표시해요.
        </p>
      </div>
      {importing && (
        <Modal
          title="CSV로 보유 종목 가져오기"
          onClose={() => setImporting(false)}
          wide
        >
          <div className="form">
            <p className="hint">
              아래 형식으로 붙여넣거나 CSV 파일을 선택하세요. 평균단가는 거래
              통화 기준입니다.
            </p>
            <code className="code-sample">
              symbol,name,quantity,averageCost,currency
              <br />
              AAPL,애플,10,150,USD
            </code>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setCsv(await file.text());
                  setRows(null);
                }
              }}
            />
            <textarea
              rows={6}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setRows(null);
              }}
              aria-label="CSV 내용"
              placeholder="CSV 내용을 붙여넣으세요"
            />
            {rows && (
              <div className="note-box">
                {rows.length}개 종목 · {rows.map((r) => r.symbol).join(", ")}
                <br />
                동일한 CSV 행은 다시 가져와도 중복 저장하지 않습니다.
              </div>
            )}
            <div className="form-actions">
              <button className="btn" onClick={preview}>
                미리보기
              </button>
              <button
                className="btn primary"
                disabled={!rows || working}
                onClick={async () => {
                  setWorking(true);
                  try {
                    const r = await props.act("/holdings/import", { rows });
                    props.notify(`${r.added}개 종목을 가져왔어요.`);
                    setImporting(false);
                  } catch (e) {
                    props.notify((e as Error).message);
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                가져오기
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export function StockDetail({ holding }: { holding: Holding }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/candles/" + encodeURIComponent(holding.symbol), {
      signal: controller.signal,
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        setData(body);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [holding.symbol]);
  return (
    <div className="stock-detail">
      <div className="detail-price">
        {fmt(holding.price, holding.currency)}
        <small>{date(holding.priceAt)} 기준</small>
      </div>
      {error ? (
        <div className="inline-alert">{error}</div>
      ) : !data ? (
        <Loading />
      ) : (
        <Chart
          points={[...(data.candles || [])]
            .reverse()
            .map((c: any) => ({ x: c.timestamp, y: Number(c.closePrice) }))}
          label={`${holding.symbol} 일별 수정 종가`}
        />
      )}
      <p className="hint">
        최근 최대 120거래일 · 수정 종가 · {holding.currency}
      </p>
      <div className="detail-thesis">
        <h3>나의 투자 근거</h3>
        <p>{holding.thesis || "보유 종목 편집에서 투자 근거를 남겨보세요."}</p>
      </div>
    </div>
  );
}

export { AdvisorView } from "./Advisor";

export function ResearchView({ state, act, notify }: ViewProps) {
  const [category, setCategory] = useState("all"),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [adding, setAdding] = useState(false),
    [active, setActive] = useState<Evidence | null>(null),
    [useHoldings, setUseHoldings] = useState(false);
  const list = state.evidence.filter(
    (e) =>
      (category === "all" || e.category === category) &&
      (!query ||
        e.title.toLowerCase().includes(query.toLowerCase()) ||
        e.symbols.some((s) => s.toLowerCase().includes(query.toLowerCase()))),
  );
  const refresh = async () => {
    setBusy(true);
    try {
      const r = await act("/research/refresh", {
        category: ["portfolio", "macro", "index", "sector"].includes(category)
          ? category
          : "portfolio",
        query,
        useHoldings,
      });
      notify(`새 뉴스 ${r.added}개를 가져왔어요.`);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="READ. CONNECT. UNDERSTAND."
        title="리서치 노트"
        body="AI가 찾은 한국어 출처와 뉴스, 직접 추가한 원문을 모아봅니다."
        action={
          <div className="button-group">
            <button className="btn" onClick={() => setAdding(true)}>
              <Plus size={16} />
              원문 추가
            </button>
            <button className="btn primary" disabled={busy} onClick={refresh}>
              <RefreshCw size={16} className={busy ? "spin" : ""} />
              {busy ? "뉴스 가져오는 중" : "최신 뉴스 가져오기"}
            </button>
          </div>
        }
      />
      <div className="research-language-note">
        <span>
          뉴스 검색은 한국어가 기본이에요. 검색어는 Google News에 전달됩니다.
        </span>
        <label>
          <input
            type="checkbox"
            checked={useHoldings}
            onChange={(e) => setUseHoldings(e.target.checked)}
          />
          보유 티커를 Google News 검색에 사용
        </label>
      </div>
      <div className="research-toolbar">
        <div className="filter-tabs">
          {Object.entries({ all: "전체", ...categories }).map(([id, label]) => (
            <button
              key={id}
              className={category === id ? "selected" : ""}
              onClick={() => setCategory(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="종목 또는 키워드"
            aria-label="자료 검색"
          />
        </label>
      </div>
      {!list.length ? (
        <section className="card">
          <Empty
            title="투자에 필요한 자료를 모아보세요"
            body="AI 투자 파트너에서 자동 조사를 시작하면 출처가 여기에 쌓여요. 한국어 뉴스 검색이나 원문 추가도 가능합니다."
            action={
              <button className="btn primary" onClick={refresh} disabled={busy}>
                최신 뉴스 가져오기
              </button>
            }
          />
        </section>
      ) : (
        <div className="research-grid">
          {list.map((e) => (
            <article key={e.id} className="card research-card">
              <div className="card-top">
                <span className="category-tag">
                  {categories[e.category] || e.category}
                </span>
                <span className="muted">
                  {date(e.publishedAt || e.retrievedAt)}
                </span>
              </div>
              <button className="article-title" onClick={() => setActive(e)}>
                {e.title}
              </button>
              <div className="article-excerpt">
                {e.coverage === "headline"
                  ? "뉴스 제목을 수집했어요. 자세한 사실 확인은 원문이 필요합니다."
                  : e.body.slice(0, 140)}
              </div>
              <div className="article-footer">
                <span>
                  {e.coverage === "headline"
                    ? "제목만 확보"
                    : "사용자 제공 원문"}
                </span>
                <LinkOut url={e.url}>원문 보기</LinkOut>
              </div>
            </article>
          ))}
        </div>
      )}
      {adding && (
        <Modal title="분석할 원문 추가" onClose={() => setAdding(false)} wide>
          <form
            className="form"
            onSubmit={async (e) => {
              const v = values(e);
              try {
                await act("/research", {
                  ...v,
                  symbols: v.symbols
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                });
                setAdding(false);
                notify("분석 자료를 저장했어요.");
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            <label>
              자료 제목
              <input
                name="title"
                placeholder="기업명 · 분기 실적 발표"
                required
                maxLength={300}
              />
            </label>
            <div className="form-row">
              <label>
                종류
                <select name="category">
                  {Object.entries(categories).map(([id, l]) => (
                    <option key={id} value={id}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                관련 종목
                <input name="symbols" placeholder="AAPL, MSFT" />
              </label>
            </div>
            <label>
              원문 주소 (선택)
              <input name="url" type="url" placeholder="https://..." />
            </label>
            <label>
              원문 내용
              <textarea
                name="body"
                rows={10}
                minLength={20}
                maxLength={100000}
                required
                placeholder="보고서 본문과 숫자의 단위, 보고 기간을 함께 붙여넣어 주세요."
              />
            </label>
            <p className="hint">
              현재는 텍스트 원문을 저장합니다. URL만으로 본문을 자동 수집하지
              않습니다.
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setAdding(false)}
              >
                취소
              </button>
              <button className="btn primary">원문 저장</button>
            </div>
          </form>
        </Modal>
      )}
      {active && (
        <Modal title={active.title} onClose={() => setActive(null)} wide>
          <div className="form">
            <LinkOut url={active.url}>원문 열기</LinkOut>
            <p className="source-body">{active.body}</p>
            <small className="muted">
              수집 {date(active.retrievedAt)} ·{" "}
              {active.coverage === "headline"
                ? "제목만 확보"
                : "사용자 제공 자료"}
            </small>
            <div className="form-actions">
              <button
                className="btn danger"
                onClick={async () => {
                  try {
                    await act("/research/" + active.id, undefined, "DELETE");
                    setActive(null);
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                자료 삭제
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export { RebalanceView } from "./Rebalance";

export function JournalView({ state, act, notify }: ViewProps) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="MY INVESTMENT JOURNAL"
        title="투자 기록"
        body="무엇을 결정했는지, 왜 그렇게 생각했는지 남겨두세요."
        action={
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Plus size={16} />
            기록 남기기
          </button>
        }
      />
      {!state.journal.length ? (
        <section className="card">
          <Empty
            title="생각이 쌓이면 나만의 기준이 돼요"
            body="매수와 매도뿐 아니라, 기다리기로 한 이유도 좋은 기록입니다."
            action={
              <button className="btn" onClick={() => setAdding(true)}>
                첫 기록 남기기
              </button>
            }
          />
        </section>
      ) : (
        <div className="journal-list">
          {state.journal.map((j) => (
            <article className="card journal-entry" key={j.id}>
              <div className="journal-date">
                {date(j.createdAt)}
                <span className="category-tag">{j.decision}</span>
              </div>
              <h2>{j.title}</h2>
              {j.symbol && <span className="ticker-chip">{j.symbol}</span>}
              <p>{j.body}</p>
              {j.reviewDate && (
                <small className="muted">다시 확인할 날 · {j.reviewDate}</small>
              )}
            </article>
          ))}
        </div>
      )}
      {adding && (
        <Modal title="나의 투자 판단 기록" onClose={() => setAdding(false)}>
          <form
            className="form"
            onSubmit={async (e) => {
              const v = values(e);
              try {
                await act("/journal", v);
                setAdding(false);
                notify("투자 기록을 남겼어요.");
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            <label>
              제목
              <input
                name="title"
                required
                placeholder="오늘의 판단을 한 문장으로"
              />
            </label>
            <div className="form-row">
              <label>
                관련 종목
                <input name="symbol" placeholder="선택 사항" />
              </label>
              <label>
                판단
                <select name="decision">
                  <option>관찰</option>
                  <option>유지</option>
                  <option>추가 조사</option>
                  <option>매수 검토</option>
                  <option>비중 축소 검토</option>
                </select>
              </label>
            </div>
            <label>
              판단과 이유
              <textarea
                name="body"
                rows={7}
                required
                placeholder="어떤 근거를 보았고, 어떤 조건에서 생각을 바꿀까요?"
              />
            </label>
            <label>
              다시 확인할 날<input type="date" name="reviewDate" />
            </label>
            <div className="form-actions">
              <button className="btn primary">기록 저장</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// Light jobs (the dashboard headlines) get their own cheaper AI and models, separate from the
// advisor's heavy analysis models saved above.
function QuickModelSettings({
  state,
  act,
  notify,
}: Pick<ViewProps, "state" | "act" | "notify">) {
  const saved = state.settings.headlines || fallbackHeadlineSettings;
  return (
    <section className="card">
      <h3>빠른 조사용 AI</h3>
      <p className="hint form-intro">
        대시보드의 <strong>꼭 알아야 할 주요 뉴스</strong>처럼 깊은 분석이 필요
        없는 작업에 쓰는 AI와 모델입니다. 위의 분석 모델과 따로 저장되며, 추론
        강도는 항상 모델이 지원하는 가장 낮은 단계로 실행해요. 가볍고 빠른
        모델을 골라 사용량을 아끼세요.
      </p>
      <form
        className="form"
        onSubmit={async (e) => {
          const v = values(e);
          try {
            await act(
              "/settings/headlines",
              {
                provider: v.provider,
                models: { codex: v.codex.trim(), claude: v.claude.trim() },
              },
              "PUT",
            );
            notify("빠른 조사용 AI 설정을 저장했어요.");
          } catch (e) {
            notify((e as Error).message);
          }
        }}
      >
        <fieldset className="quick-provider">
          <legend>기본으로 조사할 AI</legend>
          <div className="provider-options">
            {(["codex", "claude"] as const).map((id) => {
              const p = state.providers.find((x) => x.id === id);
              return (
                <label key={id}>
                  <input
                    type="radio"
                    name="provider"
                    value={id}
                    defaultChecked={saved.provider === id}
                  />
                  <span className={"provider-mark " + id}>
                    {id === "codex" ? "O" : "✳"}
                  </span>
                  {id === "codex" ? "OpenAI" : "Claude"}
                  <small>{p?.authenticated ? "로그인됨" : "로그인 필요"}</small>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="form-row">
          {(["codex", "claude"] as const).map((id) => (
            <label key={id}>
              {id === "codex" ? "OpenAI" : "Claude"} 빠른 조사 모델
              <input
                name={id}
                list={"quick-" + id + "-models"}
                defaultValue={saved.models[id]}
                placeholder="비워두면 CLI 기본 모델"
                pattern="[a-zA-Z0-9._:/-]*"
              />
              <datalist id={"quick-" + id + "-models"}>
                {state.providers
                  .find((p) => p.id === id)
                  ?.models.map((m) => (
                    <option key={m} value={m} />
                  ))}
              </datalist>
            </label>
          ))}
        </div>
        <p className="hint">
          OpenAI 목록은 로컬 Codex 모델 캐시에서 읽습니다. Claude는 sonnet·opus
          별칭 외에 haiku 같은 다른 별칭이나 정확한 모델 ID를 직접 입력할 수
          있어요. 지원하지 않는 모델은 실행 시 오류로 표시됩니다.
        </p>
        <button className="btn primary">
          <Save size={16} />
          빠른 조사용 설정 저장
        </button>
      </form>
    </section>
  );
}
export function SettingsView({ state, act, notify }: ViewProps) {
  const [checking, setChecking] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="MAKE IT YOURS"
        title="설정 및 연결"
        body="데이터 연결부터 투자 성향까지, 나에게 맞게 설정하세요."
      />
      <div className="settings-layout">
        <section className="card">
          <div className="card-top">
            <h3>연결 상태</h3>
            <button
              className="btn"
              disabled={checking}
              onClick={async () => {
                setChecking(true);
                try {
                  await act("/connections/check");
                  notify("AI 연결 상태를 확인했어요.");
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  setChecking(false);
                }
              }}
            >
              <RefreshCw size={15} className={checking ? "spin" : ""} />
              연결 확인
            </button>
          </div>
          <div className="integration-row">
            <span className="toss-mark">t</span>
            <div>
              <strong>토스증권 Open API</strong>
              <small>{state.connection.message}</small>
            </div>
            <span
              className={
                "status-pill " +
                (state.connection.status === "connected" ? "completed" : "")
              }
            >
              {state.connection.configured ? "키 설정됨" : "설정 필요"}
            </span>
          </div>
          {["codex", "claude"].map((id) => {
            const p = state.providers.find((p) => p.id === id);
            return (
              <div className="integration-row" key={id}>
                <span className={"provider-mark " + id}>
                  {id === "codex" ? "O" : "✳"}
                </span>
                <div>
                  <strong>
                    {id === "codex" ? "Codex CLI" : "Claude Code CLI"}
                  </strong>
                  <small>{p?.message || "연결 확인을 눌러 주세요."}</small>
                  {p?.version && <small>{p.version}</small>}
                </div>
                <span
                  className={
                    "status-pill " + (p?.authenticated ? "completed" : "")
                  }
                >
                  {p?.authenticated
                    ? "로그인됨"
                    : p?.available
                      ? "로그인 필요"
                      : "확인 필요"}
                </span>
              </div>
            );
          })}
          <p className="hint">
            AI 로그인은 OMS를 실행하는 PC 또는 서버에서 진행합니다. 로그인
            방법은 프로젝트 README에서 확인할 수 있어요. 분석을 시작하면
            포트폴리오와 선택한 자료가 해당 AI에 전달됩니다. 토스 인증정보와
            계좌번호는 분석에 포함하지 않습니다.
          </p>
        </section>
        <section className="card">
          <h3>자산과 분석 설정</h3>
          <form
            className="form"
            onSubmit={async (e) => {
              const v = values(e);
              try {
                await act(
                  "/settings",
                  {
                    cashUsd: v.cashUsd,
                    cashKrw: v.cashKrw,
                    cashKnown: v.cashKnown === "on",
                    accountSeq: v.accountSeq,
                    models: { codex: v.codex, claude: v.claude },
                  },
                  "PUT",
                );
                notify("설정을 저장했어요.");
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            <label>
              토스 계좌
              <select
                name="accountSeq"
                defaultValue={state.settings.accountSeq}
              >
                <option value="">단일 계좌 자동 선택</option>
                {state.connection.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-row">
              <label>
                달러 현금 (USD)
                <input
                  name="cashUsd"
                  defaultValue={state.settings.cashUsd}
                  inputMode="decimal"
                  required
                />
              </label>
              <label>
                원화 현금 (KRW)
                <input
                  name="cashKrw"
                  defaultValue={state.settings.cashKrw}
                  inputMode="decimal"
                  required
                />
              </label>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="cashKnown"
                defaultChecked={state.settings.cashKnown}
              />
              현금 잔고를 확인했어요
            </label>
            <p className="hint">
              보유 주식 API의 잔고와 현금은 별개입니다. 확인 전에는 주식
              평가액으로 표시해요.
            </p>
            <div className="divider" />
            {(["codex", "claude"] as const).map((id) => (
              <label key={id}>
                {id === "codex" ? "OpenAI" : "Claude"} 모델
                <input
                  name={id}
                  list={id + "-models"}
                  defaultValue={state.settings.models[id]}
                  placeholder="비워두면 CLI 기본 모델"
                  pattern="[a-zA-Z0-9._:/-]*"
                />
                <datalist id={id + "-models"}>
                  {state.providers
                    .find((p) => p.id === id)
                    ?.models.map((m) => (
                      <option key={m} value={m} />
                    ))}
                </datalist>
              </label>
            ))}
            <p className="hint">
              사용 중인 계정에서 지원하는 모델 ID를 선택하거나 입력하세요. API
              과금 경로로 자동 전환하지 않습니다.
            </p>
            <button className="btn primary">
              <Save size={16} />
              설정 저장
            </button>
          </form>
        </section>
        <QuickModelSettings state={state} act={act} notify={notify} />
        <InvestorProfileForm state={state} act={act} notify={notify} />
        <section className="card backup-card">
          <h3>내 데이터 보관</h3>
          <p>
            보유 자산, 자료, AI 분석과 투자 기록은 OMS를 실행하는 PC 또는 서버에
            저장됩니다. 백업에는 개인 투자 정보가 포함돼요.
          </p>
          <a className="btn" href="/api/export" download>
            <Download size={17} />
            데이터 백업 다운로드
          </a>
        </section>
      </div>
    </>
  );
}
