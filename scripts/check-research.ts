import { writeFileSync } from "node:fs";
import { runProvider } from "../server/providers";
import { commonPrompt } from "../server/skills";

// Only a public company question; never reads the user's portfolio or .env.
const prompt = `${commonPrompt}\n자율 조사 모드. 기준 시각: ${new Date().toISOString()}.
공개 기업 Adobe의 가장 최근에 발표된 분기 실적을 공식 IR 페이지에서 찾아라.
연결 검증이므로 2~4회 정도의 검색/페이지 열기로 한정하라. 분기 매출과 전년 대비 증가율만 확인하고 한국어로 짧게 설명하라.
사용자의 보유 데이터는 없으므로 개인 비중 조언은 하지 말라. 실제 확인한 공식 링크와 발표일을 sources에 넣어라.`;
const outcomes = await Promise.all(
  ["codex", "claude"].map(async (provider) => {
    const started = Date.now();
    let progress: { toolCount: number; actualModel?: string } = {
      toolCount: 0,
    };
    try {
      const result = await runProvider(
        provider,
        provider === "claude" ? "sonnet" : "",
        prompt,
        new AbortController().signal,
        {
          autoResearch: true,
          effort: "medium",
          onProgress: (p) => {
            progress = p;
          },
        },
      );
      const ok =
        progress.toolCount > 0 &&
        Boolean(result.sources?.length) &&
        /[가-힣]/.test(result.summary);
      console.log(
        JSON.stringify({
          provider,
          ok,
          toolCount: progress.toolCount,
          model: progress.actualModel,
          sourceCount: result.sources?.length,
          seconds: Math.round((Date.now() - started) / 1000),
        }),
      );
      return { provider, ok, ...progress, result };
    } catch (e) {
      const error = (e as Error).message;
      console.log(JSON.stringify({ provider, ok: false, error }));
      return { provider, ok: false, error };
    }
  }),
);
writeFileSync(
  ".runtime/research-check.json",
  JSON.stringify(outcomes, null, 2),
);
if (outcomes.some((o) => !o.ok)) process.exitCode = 1;
