import { runProvider, providerHealth } from "../server/providers";
import { commonPrompt } from "../server/skills";
const health = await providerHealth(true);
console.log(
  JSON.stringify(
    health.map((p) => ({
      id: p.id,
      available: p.available,
      authenticated: p.authenticated,
      version: p.version,
    })),
  ),
);
const prompt =
  commonPrompt +
  "\n연결 검증용 가상 자료입니다. 실제 투자 데이터가 아닙니다. 회사 TEST의 매출은 전년 100, 올해 120이며 통화 USD, 연간 기준입니다. evidence ID: test-evidence. 매출 증가율을 확인하고 자료 부족을 명시하세요. 가능한 한 짧게 응답하세요.";
const outcomes = await Promise.all(
  ["codex", "claude"].map(async (id) => {
    const start = Date.now();
    try {
      const result = await runProvider(
        id,
        id === "claude" ? "sonnet" : "",
        prompt,
        new AbortController().signal,
      );
      return {
        id,
        ok: true,
        fields: Object.keys(result),
        factCount: result.facts.length,
        elapsedSeconds: Math.round((Date.now() - start) / 1000),
      };
    } catch (e) {
      return { id, ok: false, error: (e as Error).message };
    }
  }),
);
console.log(JSON.stringify(outcomes));
if (outcomes.some((o) => !o.ok)) process.exitCode = 1;
