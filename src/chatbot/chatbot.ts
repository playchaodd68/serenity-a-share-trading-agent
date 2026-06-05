import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import type { Agent, AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";
import { createTradingAgent } from "../agent/trading-agent.js";
import { getConfig } from "../config.js";
import { toSimplifiedChinese } from "../utils/chinese.js";
import { readJsonFile, safeFilename, writeJsonFile } from "../utils/fs.js";

export const DEFAULT_CHAT_SESSION_ID = "default";
const CHAT_SESSION_DIR = "runs/chat-sessions";

export interface ToolExecutionTrace {
  toolCallId: string;
  toolName: string;
  args?: unknown;
  ok?: boolean;
}

export interface TradingChatSession {
  sessionId: string;
  agent: Agent;
  metadata: {
    modelProvider: string;
    modelName: string;
    toolNames: string[];
    base: string;
  };
}

export interface TradingChatCallbacks {
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
  onToolStart?: (trace: ToolExecutionTrace) => void;
  onToolEnd?: (trace: ToolExecutionTrace) => void;
}

export interface TradingChatTurnResult {
  sessionId: string;
  reply: string;
  modelProvider: string;
  modelName: string;
  toolExecutions: ToolExecutionTrace[];
  usage?: Usage;
  errorMessage?: string;
}

interface PersistedChatSession {
  sessionId: string;
  updatedAt: string;
  metadata: TradingChatSession["metadata"];
  messages: AgentMessage[];
}

export function normalizeChatSessionId(inputSessionId?: string): string {
  const cleaned = safeFilename((inputSessionId ?? DEFAULT_CHAT_SESSION_ID).trim() || DEFAULT_CHAT_SESSION_ID);
  return cleaned || DEFAULT_CHAT_SESSION_ID;
}

function sessionFilePath(sessionId: string): string {
  return path.join(CHAT_SESSION_DIR, `${normalizeChatSessionId(sessionId)}.json`);
}

export function extractAssistantText(message: AgentMessage | undefined): string {
  if (!message || message.role !== "assistant") return "";
  const text = message.content
    .filter((item): item is { type: "text"; text: string } => item.type === "text")
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n\n");
  return toSimplifiedChinese(text || message.errorMessage || "");
}

function simplifyAssistantMessage(message: AgentMessage): void {
  if (message.role !== "assistant") return;
  for (const item of message.content) {
    if (item.type === "text") item.text = toSimplifiedChinese(item.text);
  }
  if (message.errorMessage) message.errorMessage = toSimplifiedChinese(message.errorMessage);
}

function findLastAssistantMessage(messages: AgentMessage[]): AssistantMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") return message;
  }
  return undefined;
}

async function loadPersistedMessages(sessionId: string): Promise<AgentMessage[]> {
  const persisted = await readJsonFile<PersistedChatSession | undefined>(sessionFilePath(sessionId), undefined);
  return Array.isArray(persisted?.messages) ? persisted.messages : [];
}

export async function saveChatSession(session: TradingChatSession): Promise<void> {
  const payload: PersistedChatSession = {
    sessionId: session.sessionId,
    updatedAt: new Date().toISOString(),
    metadata: session.metadata,
    messages: session.agent.state.messages,
  };
  await writeJsonFile(sessionFilePath(session.sessionId), payload);
}

export async function createTradingChatSession(inputSessionId = DEFAULT_CHAT_SESSION_ID): Promise<TradingChatSession> {
  const sessionId = normalizeChatSessionId(inputSessionId);
  const { agent, metadata } = createTradingAgent();
  agent.sessionId = sessionId;
  agent.state.messages = await loadPersistedMessages(sessionId);
  return { sessionId, agent, metadata };
}

export async function promptTradingChatSession(
  session: TradingChatSession,
  message: string,
  callbacks: TradingChatCallbacks = {},
): Promise<TradingChatTurnResult> {
  const text = message.trim();
  if (!text) throw new Error("Message is empty.");

  const toolExecutions = new Map<string, ToolExecutionTrace>();
  let lastAssistant: AgentMessage | undefined;

  const unsubscribe = session.agent.subscribe(async (event: AgentEvent) => {
    if (event.type === "message_update") {
      const inner = event.assistantMessageEvent;
      if (inner.type === "text_delta") callbacks.onTextDelta?.(toSimplifiedChinese(inner.delta));
      if (inner.type === "thinking_delta") callbacks.onThinkingDelta?.(inner.delta);
      return;
    }

    if (event.type === "message_end" && event.message.role === "assistant") {
      simplifyAssistantMessage(event.message);
      lastAssistant = event.message;
      return;
    }

    if (event.type === "tool_execution_start") {
      const trace: ToolExecutionTrace = {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
      };
      toolExecutions.set(event.toolCallId, trace);
      callbacks.onToolStart?.(trace);
      return;
    }

    if (event.type === "tool_execution_end") {
      const trace: ToolExecutionTrace = {
        ...(toolExecutions.get(event.toolCallId) ?? {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
        }),
        ok: !event.isError,
      };
      toolExecutions.set(event.toolCallId, trace);
      callbacks.onToolEnd?.(trace);
    }
  });

  let promptError: unknown;
  try {
    await session.agent.prompt(text);
  } catch (error) {
    promptError = error;
  } finally {
    unsubscribe();
    await saveChatSession(session);
  }
  if (promptError) throw promptError;

  const assistant = lastAssistant ?? findLastAssistantMessage(session.agent.state.messages);

  return {
    sessionId: session.sessionId,
    reply: extractAssistantText(assistant),
    modelProvider: session.metadata.modelProvider,
    modelName: session.metadata.modelName,
    toolExecutions: Array.from(toolExecutions.values()),
    usage: assistant?.role === "assistant" ? assistant.usage : undefined,
    errorMessage: assistant?.role === "assistant" ? assistant.errorMessage : undefined,
  };
}

function parseChatArgs(args: string[]): { sessionId: string; port?: number } {
  let sessionId = DEFAULT_CHAT_SESSION_ID;
  let port: number | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--session" && args[index + 1]) {
      sessionId = args[index + 1];
      index += 1;
    } else if (arg === "--port" && args[index + 1]) {
      const parsed = Number(args[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) port = parsed;
      index += 1;
    }
  }
  return { sessionId, port };
}

export function renderChatHelp(): string {
  return [
    "Commands:",
    "  /exit       close the local chat",
    "  /reset      clear the current Pi agent transcript",
    "  /metadata   show model and tool metadata",
    "",
    "Ask in natural language, for example:",
    "  用 Serenity 方法论解释今天候选池里最应该先研究哪三家公司",
  ].join("\n");
}

export async function runInteractiveChat(args = process.argv.slice(3)): Promise<void> {
  const parsed = parseChatArgs(args);
  const session = await createTradingChatSession(parsed.sessionId);
  const rl = createInterface({ input, output });

  output.write(`Serenity A-share Pi chatbot (${session.metadata.modelProvider}/${session.metadata.modelName})\n`);
  output.write(`Session: ${session.sessionId} -> ${sessionFilePath(session.sessionId)}\n`);
  output.write(`${renderChatHelp()}\n\n`);

  try {
    while (true) {
      let line: string;
      try {
        line = (await rl.question("you> ")).trim();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ERR_USE_AFTER_CLOSE") break;
        throw error;
      }
      if (!line) continue;
      if (line === "/exit" || line === "/quit") break;
      if (line === "/help") {
        output.write(`${renderChatHelp()}\n`);
        continue;
      }
      if (line === "/metadata") {
        output.write(`${JSON.stringify(session.metadata, null, 2)}\n`);
        continue;
      }
      if (line === "/reset") {
        session.agent.reset();
        await saveChatSession(session);
        output.write("Session transcript cleared.\n");
        continue;
      }

      output.write("assistant> ");
      let streamedText = false;
      try {
        const result = await promptTradingChatSession(session, line, {
          onTextDelta: (delta) => {
            streamedText = true;
            output.write(delta);
          },
          onToolStart: (trace) => {
            output.write(`\n[tool:start] ${trace.toolName}\n`);
          },
          onToolEnd: (trace) => {
            output.write(`[tool:${trace.ok ? "ok" : "error"}] ${trace.toolName}\nassistant> `);
          },
        });
        if (!streamedText && result.reply) output.write(result.reply);
        if (result.errorMessage) output.write(`\n[error] ${result.errorMessage}`);
        output.write("\n\n");
      } catch (error) {
        output.write(`\n[chat:error] ${error instanceof Error ? error.message : String(error)}\n\n`);
      }
    }
  } finally {
    rl.close();
  }
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (Buffer.concat(chunks).byteLength > 2_000_000) throw new Error("Request body is too large.");
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(JSON.stringify(body, null, 2));
}

function sendHtml(response: ServerResponse): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Serenity A-share Pi Chatbot</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; grid-template-rows: auto 1fr auto; background: #f7f8fa; color: #171717; }
    header { padding: 14px 18px; border-bottom: 1px solid #d8dde6; background: #ffffff; display: flex; justify-content: space-between; gap: 12px; }
    main { padding: 18px; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
    form { display: grid; grid-template-columns: 1fr auto; gap: 10px; padding: 14px 18px; border-top: 1px solid #d8dde6; background: #ffffff; }
    textarea { min-height: 54px; resize: vertical; padding: 10px; border: 1px solid #b8c0cc; border-radius: 6px; font: inherit; }
    button { padding: 0 18px; border: 1px solid #1b4d89; border-radius: 6px; background: #1b4d89; color: #fff; font: inherit; }
    .message { max-width: 980px; white-space: pre-wrap; line-height: 1.55; padding: 11px 13px; border: 1px solid #d8dde6; border-radius: 6px; background: #fff; }
    .user { align-self: flex-end; background: #e7f0fb; }
    .assistant { align-self: flex-start; }
    .meta { color: #586170; font-size: 13px; }
    @media (prefers-color-scheme: dark) {
      body { background: #111417; color: #f2f4f7; }
      header, form, .message { background: #181d23; border-color: #313944; }
      textarea { background: #101418; color: #f2f4f7; border-color: #3d4652; }
      .user { background: #18304d; }
    }
  </style>
</head>
<body>
  <header>
    <strong>Serenity A-share Pi Chatbot</strong>
    <span class="meta" id="health">checking...</span>
  </header>
  <main id="messages"></main>
  <form id="form">
    <textarea id="message" placeholder="输入你的 A 股产业研究问题"></textarea>
    <button type="submit">Send</button>
  </form>
  <script>
    const messages = document.getElementById("messages");
    const health = document.getElementById("health");
    const form = document.getElementById("form");
    const input = document.getElementById("message");
    const sessionId = localStorage.getItem("serenity-chat-session") || "browser";
    localStorage.setItem("serenity-chat-session", sessionId);
    function add(role, text) {
      const node = document.createElement("div");
      node.className = "message " + role;
      node.textContent = text;
      messages.appendChild(node);
      messages.scrollTop = messages.scrollHeight;
      return node;
    }
    fetch("/health").then((r) => r.json()).then((data) => {
      health.textContent = data.modelProvider + "/" + data.modelName + " · " + sessionId;
    }).catch(() => { health.textContent = "offline"; });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = input.value.trim();
      if (!message) return;
      input.value = "";
      add("user", message);
      const pending = add("assistant", "thinking...");
      try {
        const response = await fetch("/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, message }),
        });
        const data = await response.json();
        pending.textContent = data.reply || data.error || "(empty reply)";
      } catch (error) {
        pending.textContent = String(error);
      }
    });
  </script>
</body>
</html>`);
}

export async function startChatHttpServer(args = process.argv.slice(3)): Promise<http.Server> {
  const config = getConfig();
  const parsed = parseChatArgs(args);
  const port = parsed.port ?? config.chatPort;
  const sessions = new Map<string, TradingChatSession>();

  async function getSession(inputSessionId?: string): Promise<TradingChatSession> {
    const sessionId = normalizeChatSessionId(inputSessionId);
    const existing = sessions.get(sessionId);
    if (existing) return existing;
    const session = await createTradingChatSession(sessionId);
    sessions.set(sessionId, session);
    return session;
  }

  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === "OPTIONS") {
        sendJson(response, 204, {});
        return;
      }

      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (request.method === "GET" && url.pathname === "/") {
        sendHtml(response);
        return;
      }

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, {
          ok: true,
          modelProvider: config.modelProvider,
          modelName: config.modelName,
          sessions: sessions.size,
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/chat") {
        const body = await readJsonBody<{ message?: string; sessionId?: string }>(request);
        const session = await getSession(body.sessionId);
        const result = await promptTradingChatSession(session, body.message ?? "");
        sendJson(response, 200, result);
        return;
      }

      if (request.method === "POST" && url.pathname === "/reset") {
        const body = await readJsonBody<{ sessionId?: string }>(request);
        const session = await getSession(body.sessionId);
        session.agent.reset();
        await saveChatSession(session);
        sendJson(response, 200, { ok: true, sessionId: session.sessionId });
        return;
      }

      sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("already processing") ? 409 : 500;
      sendJson(response, status, { error: message });
    }
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  console.log(`Serenity chatbot server listening on http://localhost:${port}`);
  return server;
}
