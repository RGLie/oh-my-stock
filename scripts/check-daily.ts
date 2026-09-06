import { writeFileSync } from "node:fs";
import { runProvider } from "../server/providers";
import { commonPrompt, skillTemplates } from "../server/skills";
import { briefWindow } from "../server/brief";
import type { ProviderProgress } from "../shared/types";

// Public market connectivity check: no .env, user holdings or investment profile.
const window = briefWindow();
const prompt = `${commonPrompt}\n${skillTemplates.daily.prompt}\n${JSON.stringify({ snapshot: { briefWindow: window, holdings: [], profile: { goal: "공개 시장 정보의 연결 검증" } } })}\n연결 검증용입니다. 실제 웹 검색 2~4회 범위에서 확인 가능한 미국 주요 지수 1개와 앞으로 72시간 안의 공개 일정 최대 2개만 한국어로 정리하세요. 찾지 못한 수치와 일정은 만들지 말고 unknowns에 남기세요. 포트폴리오 데이터는 없으므로 개인 조언은 하지 마세요.`;
const outcomes = await Promise.all(
  ["codex", "claude"].map(async (provider) => {
    const start = Date.now();
    let progress: ProviderProgress = { stage: "", toolCount: 0 };
    let updates = 0,
      answerSaved = false,
      dispatched = false;
    const phases = new Set<string>();
    try {
      const result = await runProvider(
        provider,
        provider === "claude" ? "sonnet" : "",
        prompt,
        new AbortController().signal,
        {
          autoResearch: true,
          effort: "medium",
          onDispatched: () => {
            dispatched = true;
          },
          onAnswer: (a) => {
            answerSaved = a.length > 0;
          },
          onProgress: (p) => {
            progress = p;
            updates++;
            if (p.phase) phases.add(p.phase);
          },
        },
      );
      const ids = new Set(result.sources?.map((s) => s.id));
      const ok =
        dispatched &&
        answerSaved &&
        progress.toolCount > 0 &&
        result.dailyBrief?.date === window.date &&
        Boolean(result.sources?.length) &&
        [...result.dailyBrief.indices, ...result.dailyBrief.events].every(
          (x) =>
            x.evidenceIds.length && x.evidenceIds.every((id) => ids.has(id)),
        );
      const summary = {
        provider,
        ok,
        toolCount: progress.toolCount,
        updates,
        phases: [...phases],
        model: progress.actualModel,
        sourceCount: result.sources?.length,
        date: result.dailyBrief?.date,
        seconds: Math.round((Date.now() - start) / 1000),
      };
      console.log(JSON.stringify(summary));
      return { ...summary, result };
    } catch (e) {
      const outcome = { provider, ok: false, error: (e as Error).message };
      console.log(JSON.stringify(outcome));
      return outcome;
    }
  }),
);
writeFileSync(".runtime/daily-check.json", JSON.stringify(outcomes, null, 2));
if (outcomes.some((o) => !o.ok)) process.exitCode = 1;
