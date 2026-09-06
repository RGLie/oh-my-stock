import { useState } from "react";
import { Save, Target } from "lucide-react";
import type { ViewProps } from "./App";

export function InvestorProfileForm({
  state,
  act,
  notify,
}: Pick<ViewProps, "state" | "act" | "notify">) {
  const [profile, setProfile] = useState(state.profile);
  const [saving, setSaving] = useState(false);
  const update = (key: keyof typeof profile, value: string) =>
    setProfile((p) => ({ ...p, [key]: value }));
  return (
    <section className="card">
      <div className="card-top">
        <h3>
          <Target size={18} /> 나의 투자 성향과 목표
        </h3>
        <span className="muted">다음 AI 분석부터 반영</span>
      </div>
      <p className="hint">
        비워 둔 항목은 AI가 추측하지 않아요. 보유 종목·투자 원칙과 함께 조언의
        기준으로 사용합니다.
      </p>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await act("/profile", profile, "PUT");
            notify("투자 성향과 목표를 저장했어요.");
          } catch (error) {
            notify((error as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="profile-grid">
          <label>
            투자 성향
            <select
              value={profile.riskTolerance}
              onChange={(e) => update("riskTolerance", e.target.value)}
            >
              {[
                ["unspecified", "아직 정하지 않았어요"],
                ["conservative", "안정 추구"],
                ["balanced", "위험과 수익의 균형"],
                ["growth", "성장 추구"],
                ["aggressive", "높은 위험 감수"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            투자 경험
            <select
              value={profile.experience}
              onChange={(e) => update("experience", e.target.value)}
            >
              {[
                ["unspecified", "선택하지 않음"],
                ["beginner", "입문"],
                ["intermediate", "일부 경험 있음"],
                ["experienced", "경험이 풍부함"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            목표 자산 금액
            <input
              inputMode="decimal"
              value={profile.targetAmount}
              onChange={(e) => update("targetAmount", e.target.value)}
              placeholder="선택 사항"
            />
          </label>
          <label>
            목표 금액 통화
            <select
              value={profile.targetCurrency}
              onChange={(e) => update("targetCurrency", e.target.value)}
            >
              <option value="USD">달러 USD</option>
              <option value="KRW">원화 KRW</option>
            </select>
          </label>
          <label>
            목표 시점
            <input
              type="date"
              value={profile.targetDate}
              onChange={(e) => update("targetDate", e.target.value)}
            />
          </label>
          <label>
            감수 가능한 최대 하락률 (%)
            <input
              type="number"
              min="0"
              max="100"
              step="any"
              value={profile.maxDrawdown}
              onChange={(e) => update("maxDrawdown", e.target.value)}
              placeholder="예: 20"
            />
          </label>
        </div>
        <label>
          투자 목표
          <textarea
            rows={2}
            maxLength={3000}
            value={profile.goal}
            onChange={(e) => update("goal", e.target.value)}
            placeholder="예: 10년 뒤 은퇴 자금 마련, 미국 주식·ETF 중심의 장기 성장"
          />
        </label>
        <label>
          가까운 시일에 필요한 자금
          <textarea
            rows={2}
            maxLength={3000}
            value={profile.liquidityNeeds}
            onChange={(e) => update("liquidityNeeds", e.target.value)}
            placeholder="예: 2년 안에 주택 자금이 필요해요"
          />
        </label>
        <label>
          피하고 싶은 투자·추가 조건
          <textarea
            rows={2}
            maxLength={3000}
            value={profile.restrictions}
            onChange={(e) => update("restrictions", e.target.value)}
            placeholder="예: 레버리지 ETF 제외, 배당보다 총수익 우선"
          />
        </label>
        <p className="hint">
          최대 하락률은 조언의 참고 기준이며 실제 손실을 제한하거나 자동
          매매하지는 않습니다.
        </p>
        <div className="form-actions">
          <button className="btn primary" disabled={saving}>
            <Save size={16} />
            {saving ? "저장 중" : "투자 설정 저장"}
          </button>
        </div>
      </form>
    </section>
  );
}
