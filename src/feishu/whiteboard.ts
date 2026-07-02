import { spawn } from "node:child_process";
import { toSimplifiedChinese } from "../utils/chinese.js";

export type FeishuWhiteboardIdentity = "user" | "bot";

export interface FeishuWhiteboardUpdateOptions {
  whiteboardToken: string;
  mermaid: string;
  as?: FeishuWhiteboardIdentity;
  overwrite?: boolean;
  larkCliBin?: string;
  profile?: string;
  timeoutMs?: number;
}

export interface FeishuWhiteboardUpdateResult {
  stdout: string;
  stderr: string;
  as: FeishuWhiteboardIdentity;
  overwrite: boolean;
}

const MERMAID_START_RE =
  /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|requirementDiagram)\b/im;

function clipOutput(value: string, limit = 2000): string {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function redactToken(value: string, token: string): string {
  return token ? value.split(token).join("[REDACTED_WHITEBOARD_TOKEN]") : value;
}

function normalizeMermaid(value: string): string {
  return value.replace(/^\uFEFF/, "").trim();
}

export function extractMermaidCode(text: string): string {
  const normalized = text.trim();
  const fenced = normalized.match(/```(?:mermaid|mmd)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return normalizeMermaid(fenced[1]);

  const start = normalized.search(MERMAID_START_RE);
  if (start >= 0) return normalizeMermaid(normalized.slice(start));
  return "";
}

export function buildTradingWhiteboardPrompt(input: string): string {
  return [
    "你正在为飞书白板生成 Mermaid 视觉草图。这个请求只用于显式的 /board 命令，不要套用普通投研回答模板。",
    "请把用户内容组织为适合白板阅读的结构图：优先使用 flowchart TD；如果更适合时间顺序，可用 timeline；如果是知识结构，可用 mindmap。",
    "要求：只输出一个 Mermaid 代码块；节点文字使用简体中文短句；层级清晰；避免长段落、Markdown 表格、脚注、免责声明和投资建议话术。",
    `用户内容：\n${input.trim()}`,
  ].join("\n\n");
}

export function renderFeishuWhiteboardHelp(configured: boolean): string {
  return [
    "Usage: /board <topic-or-mermaid>",
    "",
    "Examples:",
    "/board 比较半导体设备、先进封装、AI服务器产业链的景气驱动",
    "/board ```mermaid\nflowchart TD\n  A[产业链] --> B[上游材料]\n```",
    "",
    configured
      ? "Current whiteboard output: FEISHU_WHITEBOARD_TOKEN is configured; the agent will write the generated Mermaid to that board."
      : "Current whiteboard output: FEISHU_WHITEBOARD_TOKEN is not configured; the agent will return a Mermaid preview only.",
  ].join("\n");
}

export function renderFeishuWhiteboardPreview(mermaid: string, reason?: string): string {
  return [
    reason,
    "Generated Feishu whiteboard Mermaid preview:",
    "",
    "```mermaid",
    mermaid.trim(),
    "```",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function runWithStdin(command: string, args: string[], input: string, timeoutMs: number): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let settled = false;
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      stderr += `\nTimed out after ${timeoutMs}ms.`;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

export async function updateFeishuWhiteboardMermaid(options: FeishuWhiteboardUpdateOptions): Promise<FeishuWhiteboardUpdateResult> {
  const mermaid = extractMermaidCode(options.mermaid);
  if (!mermaid) throw new Error("No Mermaid diagram found for Feishu whiteboard update.");

  const as = options.as ?? "user";
  const overwrite = options.overwrite ?? false;
  const args = [
    "whiteboard",
    "+update",
    "--whiteboard-token",
    options.whiteboardToken,
    "--input_format",
    "mermaid",
    "--source",
    "-",
    "--as",
    as,
  ];
  if (overwrite) args.push("--overwrite");
  if (options.profile) args.push("--profile", options.profile);

  const result = await runWithStdin(options.larkCliBin || "lark-cli", args, toSimplifiedChinese(mermaid), options.timeoutMs ?? 120_000);
  if (result.code !== 0) {
    const detail = [clipOutput(redactToken(result.stderr.trim(), options.whiteboardToken)), clipOutput(redactToken(result.stdout.trim(), options.whiteboardToken))]
      .filter(Boolean)
      .join("\n");
    throw new Error(`lark-cli whiteboard update failed: code=${result.code ?? "null"} signal=${result.signal ?? "null"}${detail ? `\n${detail}` : ""}`);
  }

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    as,
    overwrite,
  };
}
