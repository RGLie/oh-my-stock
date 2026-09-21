import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  AnalysisResult,
  Provider,
  ProviderProgress,
} from "../shared/types";
import { outputSchema } from "./skills";
const exec = promisify(execFile);
const root = resolve(".");
const runtime = resolve(".runtime/analysis");
export function cliCommand(provider: string): {
  file: string;
  prefix: string[];
} {
  const custom =
    provider === "codex"
      ? process.env.CODEX_CLI_PATH
      : process.env.CLAUDE_CLI_PATH;
  if (custom) return { file: custom, prefix: [] };
  if (provider === "codex")
    return {
      file: process.execPath,
      prefix: [join(root, "node_modules/@openai/codex/bin/codex.js")],
    };
  return {
    file: join(
      root,
      process.platform === "win32"
        ? "node_modules/@anthropic-ai/claude-code/bin/claude.exe"
        : "node_modules/@anthropic-ai/claude-code/bin/claude",
    ),
    prefix: [],
  };
}
export function cliEnvironment() {
  // CLI authentication stays in the provider's credential store. Brokerage secrets never enter the child environment.
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    "PATH",
    "Path",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "SYSTEMROOT",
    "SystemRoot",
    "WINDIR",
    "USERNAME",
    "TEMP",
    "TMP",
    "COMSPEC",
    "HOME",
    "CODEX_HOME",
    "CLAUDE_CONFIG_DIR",
  ])
    if (process.env[key]) env[key] = process.env[key];
  env.NO_COLOR = "1";
  return env;
}
let cached: Provider[] = [];
let cacheAt = 0;
export async function providerHealth(force = false): Promise<Provider[]> {
  if (!force && Date.now() - cacheAt < 60000) return cached;
  const results = await Promise.all(
    ["codex", "claude"].map(async (id) => {
      const command = cliCommand(id);
      const p: Provider = {
        id: id as Provider["id"],
        name: id === "codex" ? "OpenAI · Codex" : "Anthropic · Claude",
        available: false,
        authenticated: null,
        version: null,
        message: "CLI 연결을 확인해 주세요.",
        models: id === "claude" ? ["sonnet", "opus"] : [],
        modelEfforts:
          id === "claude"
            ? {
                sonnet: ["low", "medium", "high"],
                opus: ["low", "medium", "high", "xhigh", "max"],
              }
            : {},
      };
      try {
        const version = await exec(
          command.file,
          [...command.prefix, "--version"],
          { timeout: 15000, windowsHide: true, env: cliEnvironment() },
        );
        p.available = true;
        p.version = version.stdout.trim().slice(0, 100);
        const status = await exec(
          command.file,
          [
            ...command.prefix,
            ...(id === "codex" ? ["login", "status"] : ["auth", "status"]),
          ],
          { timeout: 15000, windowsHide: true, env: cliEnvironment() },
        );
        if (id === "codex")
          p.authenticated = /logged in/i.test(status.stdout + status.stderr);
        else {
          try {
            p.authenticated = Boolean(JSON.parse(status.stdout).loggedIn);
          } catch {
            p.authenticated = null;
          }
        }
        p.message = p.authenticated
          ? "로그인 연결됨"
          : "CLI에서 로그인을 완료해 주세요.";
      } catch (e: any) {
        p.message = p.available
          ? "CLI에서 로그인을 완료해 주세요."
          : "CLI 실행 파일을 찾거나 실행하지 못했습니다.";
        if (p.available) p.authenticated = false;
      }
      if (id === "codex")
        try {
          const cache = JSON.parse(
            readFileSync(
              join(
                process.env.CODEX_HOME || join(homedir(), ".codex"),
                "models_cache.json",
              ),
              "utf8",
            ),
          );
          p.models = (cache.models || [])
            .filter(
              (m: any) => m.visibility === "list" || m.visibility === undefined,
            )
            .map((m: any) => m.slug)
            .filter((s: any) => typeof s === "string")
            .slice(0, 20);
          p.modelEfforts = Object.fromEntries(
            (cache.models || [])
              .filter((m: any) => p.models.includes(m.slug))
              .map((m: any) => [
                m.slug,
                (m.supported_reasoning_levels || []).map((e: any) => e.effort),
              ]),
          );
        } catch {}
      return p;
    }),
  );
  cached = results;
  cacheAt = Date.now();
  return results;
}
const resultSchema = z.object({
  dailyBrief: z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      marketStatus: z.string(),
      priorities: z.array(z.string()),
      indices: z.array(
        z.object({
          name: z.string(),
          value: z.string(),
          change: z.string(),
          asOf: z.string(),
          reason: z.string().optional(),
          previousChange: z.string().optional(),
          previousReason: z.string().optional(),
          evidenceIds: z.array(z.string()),
        }),
      ),
      events: z.array(
        z.object({
          title: z.string(),
          scheduledAt: z.string().datetime({ offset: true }).nullable(),
          timing: z.string(),
          category: z.enum(["economic", "earnings", "market", "other"]),
          status: z.enum(["confirmed", "tentative"]),
          symbols: z.array(z.string()),
          portfolioImpact: z.string(),
          evidenceIds: z.array(z.string()),
        }),
      ),
      news: z
        .array(
          z.object({
            title: z.string(),
            summary: z.string(),
            whyItMatters: z.string(),
            evidenceIds: z.array(z.string()),
          }),
        )
        .optional(),
      companies: z
        .array(
          z.object({
            name: z.string(),
            symbol: z.string(),
            previousMove: z.string(),
            previousReason: z.string(),
            currentMove: z.string(),
            currentReason: z.string(),
            evidenceIds: z.array(z.string()),
          }),
        )
        .optional(),
      sectors: z
        .array(
          z.object({
            name: z.string(),
            move: z.string(),
            reason: z.string(),
            evidenceIds: z.array(z.string()),
          }),
        )
        .optional(),
    })
    .nullable()
    .optional(),
  rebalance: z
    .object({
      stance: z.string(),
      cashNote: z.string(),
      risks: z.array(z.string()),
      proposals: z.array(
        z.object({
          symbol: z.string(),
          name: z.string(),
          action: z.enum(["keep", "add", "trim", "exit", "new"]),
          currentWeight: z.string().nullable(),
          proposedWeight: z.string().nullable(),
          // Optional so proposals saved before these fields existed still parse.
          conviction: z.enum(["high", "medium", "low"]).optional(),
          invalidation: z.string().optional(),
          rationale: z.string(),
          evidenceIds: z.array(z.string()),
        }),
      ),
    })
    .nullable()
    .optional(),
  headlines: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string(),
        category: z.enum([
          "market",
          "macro",
          "geopolitics",
          "policy",
          "company",
          "other",
        ]),
        // Optional so an answer without the label still renders; the UI simply omits the tag.
        importance: z.enum(["high", "medium", "low"]).optional(),
        publishedAt: z.string().nullable(),
        portfolioRelevance: z.string(),
        evidenceIds: z.array(z.string()),
      }),
    )
    .nullable()
    .optional(),
  summary: z.string(),
  facts: z.array(
    z.object({ statement: z.string(), evidenceIds: z.array(z.string()) }),
  ),
  impacts: z.array(z.string()),
  counterarguments: z.array(z.string()),
  actions: z.array(z.string()),
  unknowns: z.array(z.string()),
  reviewConditions: z.array(z.string()),
  headline: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  metrics: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        context: z.string(),
        evidenceIds: z.array(z.string()),
      }),
    )
    .optional(),
  sources: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        url: z
          .string()
          .url()
          .refine((s) => s.startsWith("https://")),
        publishedAt: z.string(),
        coverage: z.enum(["full", "snippet"]),
      }),
    )
    .optional(),
});
export function parseResult(
  output: string,
  provider: string,
  onAnswer?: (answer: string) => void,
): AnalysisResult {
  let candidate: unknown;
  if (provider === "claude") {
    const messages = output
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const envelope =
      [...messages].reverse().find((m: any) => m.type === "result") ||
      messages.at(-1);
    if (!envelope) throw new Error("Claude 응답을 읽지 못했습니다.");
    const answer =
      envelope.structured_output !== undefined
        ? JSON.stringify(envelope.structured_output, null, 2)
        : typeof envelope.result === "string"
          ? envelope.result
          : null;
    if (answer !== null) onAnswer?.(answer);
    if (envelope.is_error)
      throw new Error(
        "Claude 실행이 실패했습니다. CLI 로그인과 사용량을 확인해 주세요.",
      );
    candidate = envelope.structured_output ?? JSON.parse(envelope.result);
  } else {
    for (const line of output.split("\n")) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (
          event.type === "item.completed" &&
          event.item?.type === "agent_message"
        ) {
          candidate = undefined;
          onAnswer?.(event.item.text);
          candidate = JSON.parse(event.item.text);
        }
      } catch {}
    }
  }
  const parsed = resultSchema.safeParse(candidate);
  if (!parsed.success)
    throw new Error("AI 응답이 결과 형식과 맞지 않습니다. 다시 분석해 주세요.");
  return parsed.data;
}
// Only public execution states are retained. Reasoning text and raw tool payloads are excluded.
export function describeProviderEvent(event: any): {
  phase?: ProviderProgress["phase"];
  message?: string;
  kind?: string;
  toolIds: string[];
  model?: string;
} {
  const model = event.model || event.message?.model;
  const info = {
    toolIds: [] as string[],
    ...(typeof model === "string" ? { model } : {}),
  };
  if (
    event.item?.type === "web_search" &&
    ["item.started", "item.completed"].includes(event.type)
  )
    return {
      ...info,
      phase: "researching",
      kind: "web",
      message:
        event.type === "item.started"
          ? "웹 검색을 시작했어요"
          : "웹 검색 결과를 확인했어요",
      toolIds: event.item.id ? [String(event.item.id)] : [],
    };
  const tools = (event.message?.content || []).filter(
    (c: any) =>
      c.type === "tool_use" && ["WebSearch", "WebFetch"].includes(c.name),
  );
  if (tools.length)
    return {
      ...info,
      phase: "researching",
      kind: "web",
      message: tools.some((c: any) => c.name === "WebFetch")
        ? "출처 페이지를 확인하고 있어요"
        : "웹에서 관련 자료를 찾고 있어요",
      toolIds: tools.map((c: any) => c.id).filter(Boolean),
    };
  if (
    event.item?.type === "agent_message" ||
    (event.type === "assistant" &&
      (event.message?.content || []).some((c: any) => c.type === "text"))
  )
    return {
      ...info,
      phase: "composing",
      kind: "answer",
      message: "보고서 응답을 받고 있어요",
    };
  if (["turn.completed", "result"].includes(event.type))
    return {
      ...info,
      phase: "validating",
      kind: "validation",
      message: "응답 형식과 출처를 확인하고 있어요",
    };
  if (
    event.type === "thread.started" ||
    (event.type === "system" && event.subtype === "init")
  )
    return {
      ...info,
      phase: "connecting",
      kind: "connection",
      message: "AI 실행 세션이 연결됐어요",
    };
  return info;
}
export async function runProvider(
  provider: string,
  model: string,
  prompt: string,
  signal: AbortSignal,
  options: {
    autoResearch?: boolean;
    effort?: string;
    onProgress?: (progress: ProviderProgress) => void;
    onAnswer?: (answer: string) => void;
    onDispatched?: () => void;
  } = {},
): Promise<AnalysisResult> {
  if (!["codex", "claude"].includes(provider))
    throw new Error("지원하지 않는 AI입니다.");
  if (model && !/^[a-zA-Z0-9._:/-]{1,100}$/.test(model))
    throw new Error("모델 ID 형식을 확인해 주세요.");
  mkdirSync(runtime, { recursive: true });
  const schemaText = JSON.stringify(outputSchema);
  const schemaPath = join(
    runtime,
    "result-" +
      createHash("sha256").update(schemaText).digest("hex").slice(0, 16) +
      ".schema.json",
  );
  if (!existsSync(schemaPath)) writeFileSync(schemaPath, schemaText);
  const cmd = cliCommand(provider);
  const args =
    provider === "codex"
      ? [
          "exec",
          "--ignore-user-config",
          "--ephemeral",
          "--skip-git-repo-check",
          "--sandbox",
          "read-only",
          "--disable",
          "shell_tool",
          "-c",
          options.autoResearch ? 'web_search="live"' : 'web_search="disabled"',
          ...(options.effort
            ? ["-c", `model_reasoning_effort="${options.effort}"`]
            : []),
          "--json",
          "--output-schema",
          schemaPath,
          ...(model ? ["--model", model] : []),
          "-",
        ]
      : [
          "--safe-mode",
          "--restricted",
          "--strict-mcp-config",
          "--tools",
          options.autoResearch ? "WebSearch,WebFetch" : "",
          ...(options.autoResearch
            ? ["--allowedTools", "WebSearch,WebFetch"]
            : []),
          "--disable-slash-commands",
          "--permission-prompts",
          "none",
          "-p",
          "--no-session-persistence",
          "--output-format",
          "stream-json",
          "--verbose",
          "--json-schema",
          JSON.stringify(outputSchema),
          ...(model ? ["--model", model] : []),
          ...(options.effort ? ["--effort", options.effort] : []),
        ];
  return new Promise((resolveRun, reject) => {
    if (signal.aborted) {
      reject(new Error("분석을 취소했습니다."));
      return;
    }
    const child = spawn(cmd.file, [...cmd.prefix, ...args], {
      cwd: runtime,
      env: cliEnvironment(),
      shell: false,
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "",
      errorOutput = "",
      settled = false;
    let buffer = "";
    const seenTools = new Set<string>();
    let progress: ProviderProgress = {
      stage: "AI 실행을 준비하고 있어요",
      toolCount: 0,
      phase: "connecting",
    };
    const heartbeat = setInterval(
      () => options.onProgress?.({ ...progress }),
      5000,
    );
    heartbeat.unref();
    options.onProgress?.({ ...progress });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    const stop = () => {
      if (child.pid) {
        if (process.platform === "win32") {
          execFile(
            "taskkill",
            ["/PID", String(child.pid), "/T", "/F"],
            { windowsHide: true },
            () => {},
          );
        } else {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch {
            /* The process group may already have exited. */
          }
        }
      }
    };
    const finish = (error?: Error, result?: AnalysisResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(heartbeat);
      signal.removeEventListener("abort", abort);
      error ? reject(error) : resolveRun(result!);
    };
    const abort = () => {
      stop();
      finish(new Error("분석을 취소했습니다."));
    };
    const timer = setTimeout(
      () => {
        stop();
        finish(
          new Error(
            "분석 제한 시간을 초과했습니다. 범위를 줄여 다시 요청해 주세요.",
          ),
        );
      },
      options.autoResearch ? 600000 : 300000,
    );
    signal.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (data) => {
      output += data.toString();
      progress.lastEventAt = new Date().toISOString();
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines)
        try {
          const event = JSON.parse(line);
          const info = describeProviderEvent(event);
          for (const id of info.toolIds) seenTools.add(id);
          progress = {
            ...progress,
            toolCount: seenTools.size,
            ...(info.model ? { actualModel: info.model } : {}),
            ...(info.phase ? { phase: info.phase, stage: info.message! } : {}),
          };
          if (info.message)
            options.onProgress?.({
              ...progress,
              event: {
                at: new Date().toISOString(),
                kind: info.kind!,
                message: info.message,
              },
            });
        } catch {}
      if (output.length > 2_000_000) {
        stop();
        finish(new Error("분석 출력 크기 제한을 초과했습니다."));
      }
    });
    child.stderr.on("data", (data) => {
      errorOutput = (errorOutput + data.toString()).slice(-4000);
    });
    child.on("error", () =>
      finish(
        new Error(
          "AI CLI를 실행하지 못했습니다. 설정에서 연결을 확인해 주세요.",
        ),
      ),
    );
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        try {
          parseResult(output, provider, options.onAnswer);
        } catch {
          /* Keep a final error response when the CLI supplied one. */
        }
        const limit = /rate.limit|usage.limit|quota/i.test(
          errorOutput + output,
        );
        finish(
          new Error(
            limit
              ? "AI 사용량 한도에 도달했습니다."
              : "AI 실행이 실패했습니다. CLI 로그인·모델 권한을 확인해 주세요.",
          ),
        );
        return;
      }
      try {
        finish(undefined, parseResult(output, provider, options.onAnswer));
      } catch (e) {
        finish(e as Error);
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(prompt, () => {
      if (!settled) options.onDispatched?.();
    });
  });
}
