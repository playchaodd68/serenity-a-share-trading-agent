import http from "node:http";
import { toSimplifiedChinese } from "../utils/chinese.js";

export interface FeishuCommandResult {
  status: number;
  body: Record<string, unknown>;
}

export interface FeishuMessageEvent {
  messageId: string;
  sessionId: string;
  chatId?: string;
  chatType?: string;
  senderOpenId?: string;
  mentionedBot: boolean;
  text: string;
  imageKeys?: string[];
}

export interface FeishuWebhookRelayOptions {
  token?: string;
  onPayload: (payload: unknown) => Promise<void> | void;
}

export interface FeishuServerLogger {
  info: (message: string) => void;
  error: (message: string) => void;
}

export type FeishuReplyRenderMode = "text" | "post" | "card";

export interface FeishuOutboundMessagePayload {
  msg_type: "text" | "post" | "interactive" | "image";
  content: string;
}

interface FeishuTokenCache {
  token: string;
  expiresAt: number;
}

const tenantTokenCacheByAppId = new Map<string, FeishuTokenCache>();

export async function sendFeishuMarkdown(webhookUrl: string, title: string, content: string): Promise<void> {
  const normalizedTitle = toSimplifiedChinese(title);
  const normalizedContent = toSimplifiedChinese(content);
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      msg_type: "interactive",
      card: {
        header: { title: { tag: "plain_text", content: normalizedTitle } },
        elements: [{ tag: "markdown", content: normalizedContent }],
      },
    }),
  });
  if (!response.ok) throw new Error(`Feishu webhook failed: ${response.status} ${await response.text()}`);
}

const FEISHU_TEXT_LIMIT = 3500;
// Interactive cards / rich posts render markdown natively and hold far more than a
// plain text message, so split much less aggressively and without the [i/n] prefix.
const FEISHU_CARD_TEXT_LIMIT = 6000;
const FEISHU_CHUNK_PREFIX_RESERVE = 40;
const FEISHU_MESSAGE_DEDUPE_TTL_MS = 10 * 60 * 1000;

export function normalizeFeishuReplyRenderMode(raw: string | undefined): FeishuReplyRenderMode {
  const value = (raw ?? "text").trim().toLowerCase();
  if (value === "post" || value === "card") return value;
  return "text";
}

export function splitFeishuText(text: string, limit = FEISHU_TEXT_LIMIT): string[] {
  if (!Number.isFinite(limit) || limit < 1) throw new Error("Feishu text chunk limit must be positive.");
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    if (text.length - start <= limit) {
      chunks.push(text.slice(start));
      break;
    }

    const windowEnd = start + limit;
    const minSoftCut = start + Math.floor(limit * 0.5);
    let cut = text.lastIndexOf("\n\n", windowEnd);
    if (cut <= minSoftCut) cut = text.lastIndexOf("\n", windowEnd);
    if (cut <= minSoftCut) {
      cut = windowEnd;
    } else if (text.startsWith("\n\n", cut) && cut + 2 <= windowEnd) {
      cut += 2;
    } else if (text.startsWith("\n", cut) && cut + 1 <= windowEnd) {
      cut += 1;
    }

    chunks.push(text.slice(start, cut));
    start = cut;
  }
  return chunks;
}

export function formatFeishuTextChunks(text: string, limit = FEISHU_TEXT_LIMIT): string[] {
  const chunkLimit = Math.max(1, limit - FEISHU_CHUNK_PREFIX_RESERVE);
  const chunks = splitFeishuText(text, chunkLimit);
  if (chunks.length <= 1) return chunks;
  return chunks.map((chunk, index) => `[${index + 1}/${chunks.length}]\n${chunk}`);
}

function flattenFeishuRichText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flattenFeishuRichText).filter(Boolean).join("");
  if (!value || typeof value !== "object") return "";
  const data = value as Record<string, unknown>;
  return [
    typeof data.text === "string" ? data.text : "",
    typeof data.href === "string" ? data.href : "",
    typeof data.user_name === "string" ? data.user_name : "",
    flattenFeishuRichText(data.content),
  ]
    .filter(Boolean)
    .join("");
}

function extractFeishuContentText(rawContent: unknown): string {
  if (rawContent == null) return "";
  if (typeof rawContent === "string") {
    const trimmed = rawContent.trim();
    if (!trimmed) return "";
    try {
      return extractFeishuContentText(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }

  if (!rawContent || typeof rawContent !== "object") return String(rawContent).trim();
  const content = rawContent as Record<string, unknown>;
  if (typeof content.text === "string") return content.text.trim();
  if (content.content != null) return flattenFeishuRichText(content.content).trim();
  if (content.post && typeof content.post === "object") return flattenFeishuRichText(content.post).trim();
  return "";
}

type FeishuProactiveReceiveIdType = "chat_id" | "open_id" | "union_id" | "user_id" | "email";

function buildFeishuPostContent(text: string, title = "Trading Agent"): string {
  return JSON.stringify({
    zh_cn: {
      title,
      content: [[{ tag: "md", text }]],
    },
  });
}

function buildFeishuCardContent(text: string, title = "📊 Serenity 交易研究"): string {
  return JSON.stringify({
    config: { wide_screen_mode: true },
    header: {
      template: "indigo",
      title: { tag: "plain_text", content: title },
    },
    elements: [{ tag: "markdown", content: text }],
  });
}

export function buildFeishuReplyPayload(text: string, renderMode: FeishuReplyRenderMode = "text", title = "📊 Serenity 交易研究"): FeishuOutboundMessagePayload {
  const normalizedText = toSimplifiedChinese(text);
  if (renderMode === "post") {
    return {
      msg_type: "post",
      content: buildFeishuPostContent(normalizedText, toSimplifiedChinese(title)),
    };
  }
  if (renderMode === "card") {
    return {
      msg_type: "interactive",
      content: buildFeishuCardContent(normalizedText, toSimplifiedChinese(title)),
    };
  }
  return {
    msg_type: "text",
    content: JSON.stringify({ text: normalizedText }),
  };
}

async function postFeishuMessage(
  token: string,
  receiveIdType: FeishuProactiveReceiveIdType,
  receiveId: string,
  payload: FeishuOutboundMessagePayload,
): Promise<void> {
  const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      receive_id: receiveId,
      msg_type: payload.msg_type,
      content: payload.content,
    }),
  });
  if (!response.ok) throw new Error(`Feishu send failed: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { code?: number; msg?: string };
  if (body.code !== 0) throw new Error(`Feishu send error: ${body.code} ${body.msg ?? ""}`.trim());
}

async function postFeishuText(token: string, receiveIdType: FeishuProactiveReceiveIdType, receiveId: string, text: string): Promise<void> {
  await postFeishuMessage(token, receiveIdType, receiveId, buildFeishuReplyPayload(text, "text"));
}

async function postFeishuChatText(token: string, chatId: string, text: string): Promise<void> {
  await postFeishuText(token, "chat_id", chatId, text);
}

export async function postFeishuChatMessage(token: string, chatId: string, payload: FeishuOutboundMessagePayload): Promise<void> {
  await postFeishuMessage(token, "chat_id", chatId, payload);
}

export async function sendFeishuChatText(options: { appId: string; appSecret: string; chatId: string; text: string }): Promise<void> {
  const token = await getTenantAccessToken(options.appId, options.appSecret);
  for (const chunk of formatFeishuTextChunks(toSimplifiedChinese(options.text))) {
    await postFeishuChatText(token, options.chatId, chunk);
  }
}

export async function sendFeishuOpenIdText(options: { appId: string; appSecret: string; openId: string; text: string }): Promise<void> {
  const token = await getTenantAccessToken(options.appId, options.appSecret);
  for (const chunk of formatFeishuTextChunks(toSimplifiedChinese(options.text))) {
    await postFeishuText(token, "open_id", options.openId, chunk);
  }
}

export async function sendFeishuTextByReceiveId(options: {
  appId: string;
  appSecret: string;
  receiveIdType: Exclude<FeishuProactiveReceiveIdType, "chat_id">;
  receiveId: string;
  text: string;
}): Promise<void> {
  const token = await getTenantAccessToken(options.appId, options.appSecret);
  for (const chunk of formatFeishuTextChunks(toSimplifiedChinese(options.text))) {
    await postFeishuText(token, options.receiveIdType, options.receiveId, chunk);
  }
}

export function extractFeishuText(payload: any): string {
  return extractFeishuContentText(payload?.event?.message?.content ?? payload?.text);
}

function extractFeishuImageKeys(content: unknown): string[] {
  const keys: string[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const obj = node as Record<string, unknown>;
    if (typeof obj.image_key === "string" && obj.image_key) keys.push(obj.image_key);
    if (Array.isArray(obj.image_keys)) {
      for (const k of obj.image_keys) if (typeof k === "string" && k) keys.push(k);
    }
    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") visit(value);
    }
  };
  visit(content);
  return [...new Set(keys)];
}

export function extractFeishuMessageEvent(payload: any): FeishuMessageEvent | undefined {
  if (payload?.header?.event_type !== "im.message.receive_v1") return undefined;
  const message = payload?.event?.message;
  const messageId = message?.message_id;
  const chatId = message?.chat_id;
  const senderOpenId = payload?.event?.sender?.sender_id?.open_id;
  const sessionId = chatId ?? senderOpenId ?? messageId;
  if (!messageId || !sessionId) return undefined;

  let text = "";
  let mentionedBot = false;
  let imageKeys: string[] = [];
  try {
    const content = JSON.parse(message?.content ?? "{}");
    text = extractFeishuContentText(content);
    imageKeys = extractFeishuImageKeys(content);
    mentionedBot = /<at\b[^>]*>.*?<\/at>/i.test(text);
  } catch {
    text = extractFeishuContentText(message?.content);
  }
  text = text.replace(/<at[^>]*>.*?<\/at>/g, "").replace(/^@\S+\s+/, "").trim();
  // 兼容把图片渲染成 "[Image: <key>]" 文本的来源(如 lark-cli 轮询):抽出 key 并剥离 token
  const bracketKeys = [...text.matchAll(/\[Image:\s*([^\]]+?)\s*\]/g)].map((m) => m[1].trim());
  if (bracketKeys.length > 0) {
    imageKeys = [...new Set([...imageKeys, ...bracketKeys])];
    text = text.replace(/\[Image:\s*[^\]]+\]/g, "").replace(/\s{2,}/g, " ").trim();
  }
  if (!text && imageKeys.length === 0) return undefined;
  return {
    messageId,
    sessionId,
    chatId,
    chatType: message?.chat_type,
    senderOpenId,
    mentionedBot,
    text,
    ...(imageKeys.length > 0 ? { imageKeys } : {}),
  };
}

function payloadToken(payload: any): string | undefined {
  return payload?.token ?? payload?.header?.token;
}

function redactLogText(text: string): string {
  return text
    .replace(/ffd-[A-Za-z0-9_-]+/g, "[REDACTED_FFD_KEY]")
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_API_KEY]");
}

export async function handleFeishuCallback(
  payload: any,
  expectedToken: string | undefined,
  commands: Record<string, (arg: string) => Promise<string> | string>,
): Promise<FeishuCommandResult> {
  if (expectedToken && payloadToken(payload) && payloadToken(payload) !== expectedToken) return { status: 401, body: { error: "invalid token" } };
  if (payload?.challenge) return { status: 200, body: { challenge: payload.challenge } };
  if (expectedToken && !payloadToken(payload) && payload?.text) return { status: 401, body: { error: "invalid token" } };

  const text = extractFeishuText(payload);
  const [command = "", ...rest] = text.split(/\s+/);
  const handler = commands[command.toLowerCase()];
  if (!handler) {
    return {
      status: 200,
      body: {
        text: "Supported commands: /ask <question>, /reset, /screen, /research-refresh, /ffd-health, /ffd <query>, /ffd-industry <query>, /ffd-research <keyword>, /ffd-news <keyword>, /ffd-smoke, /ffd-signal <mode> <query>, /ffd-auto-rules, /reports-convert, /reports-review, /reports-accept <id>, /reports-accept --force <id>, /reports-accept-quality, /reports-reject <id>, /archive-obsidian, /watchlist, /bear <code>, /portfolio-review, /calibration, /resolutions, /graveyard, /evals, /board <topic-or-mermaid>, /latest, /why <code>, /sources, /methodology, /doctor, /harness",
      },
    };
  }
  const result = await handler(rest.join(" "));
  return { status: 200, body: { text: toSimplifiedChinese(result) } };
}

export async function getTenantAccessToken(appId: string, appSecret: string): Promise<string> {
  const now = Date.now();
  const cached = tenantTokenCacheByAppId.get(appId);
  if (cached && cached.expiresAt > now + 60_000) return cached.token;
  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  if (!response.ok) throw new Error(`Feishu tenant token request failed: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { code?: number; msg?: string; tenant_access_token?: string; expire?: number };
  if (body.code !== 0 || !body.tenant_access_token) throw new Error(`Feishu tenant token error: ${body.code} ${body.msg ?? ""}`.trim());
  const cache = {
    token: body.tenant_access_token,
    expiresAt: now + Math.max(60, body.expire ?? 7200) * 1000,
  };
  tenantTokenCacheByAppId.set(appId, cache);
  return cache.token;
}

async function postFeishuReplyMessage(token: string, messageId: string, payload: FeishuOutboundMessagePayload): Promise<void> {
  const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Feishu reply failed: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { code?: number; msg?: string };
  if (body.code !== 0) throw new Error(`Feishu reply error: ${body.code} ${body.msg ?? ""}`.trim());
}

async function postFeishuReplyText(token: string, messageId: string, text: string): Promise<void> {
  await postFeishuReplyMessage(token, messageId, buildFeishuReplyPayload(text, "text"));
}

export async function replyFeishuText(options: {
  appId?: string;
  appSecret?: string;
  messageId: string;
  chatId?: string;
  text: string;
}): Promise<void> {
  await replyFeishuMessage({ ...options, renderMode: "text" });
}

export async function replyFeishuMessage(options: {
  appId?: string;
  appSecret?: string;
  messageId: string;
  chatId?: string;
  text: string;
  renderMode?: FeishuReplyRenderMode;
}): Promise<void> {
  if (!options.appId || !options.appSecret) {
    throw new Error("FEISHU_APP_ID and FEISHU_APP_SECRET are required to reply to Feishu messages.");
  }
  const token = await getTenantAccessToken(options.appId, options.appSecret);
  const renderMode = options.renderMode ?? "text";
  const normalizedText = toSimplifiedChinese(options.text);
  // Plain text needs the [i/n] prefix so split replies stay ordered; cards and posts
  // render as standalone rich blocks, so split larger and without the noisy prefix.
  const chunks =
    renderMode === "text"
      ? formatFeishuTextChunks(normalizedText)
      : splitFeishuText(normalizedText, FEISHU_CARD_TEXT_LIMIT);
  for (const [index, chunk] of chunks.entries()) {
    const payload = buildFeishuReplyPayload(chunk, renderMode);
    if (index === 0 || !options.chatId) {
      await postFeishuReplyMessage(token, options.messageId, payload);
    } else {
      await postFeishuChatMessage(token, options.chatId, payload);
    }
  }
}

export function createFeishuServer(options: {
  port: number;
  token?: string;
  appId?: string;
  appSecret?: string;
  commands: Record<string, (arg: string) => Promise<string> | string>;
  onMessage?: (message: FeishuMessageEvent) => Promise<string | undefined> | string | undefined;
  ffdReportRelay?: FeishuWebhookRelayOptions;
  dryRunReplies?: boolean;
  replyRenderMode?: FeishuReplyRenderMode;
  logger?: FeishuServerLogger;
}): http.Server {
  const logger = options.logger ?? console;
  const messageQueues = new Map<string, Promise<void>>();
  const recentMessageIds = new Map<string, number>();

  function shouldAcceptMessage(messageId: string): boolean {
    const now = Date.now();
    for (const [id, seenAt] of recentMessageIds) {
      if (now - seenAt > FEISHU_MESSAGE_DEDUPE_TTL_MS) recentMessageIds.delete(id);
    }
    if (recentMessageIds.has(messageId)) return false;
    recentMessageIds.set(messageId, now);
    return true;
  }

  function enqueueMessage(message: FeishuMessageEvent): void {
    const previous = messageQueues.get(message.sessionId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const text = toSimplifiedChinese(await options.onMessage?.(message) ?? "");
        if (!text) {
          logger.info(`Feishu message ignored by handler: messageId=${message.messageId}`);
          return;
        }
        if (options.dryRunReplies) {
          logger.info(`Feishu dry-run reply: messageId=${message.messageId} length=${text.length} text="${redactLogText(text).slice(0, 240)}"`);
          return;
        }
        logger.info(`Feishu reply started: messageId=${message.messageId} length=${text.length}`);
        await replyFeishuMessage({
          appId: options.appId,
          appSecret: options.appSecret,
          messageId: message.messageId,
          chatId: message.chatId,
          text,
          renderMode: options.replyRenderMode ?? "text",
        });
        logger.info(`Feishu reply sent: messageId=${message.messageId}`);
      })
      .catch((error) => logger.error(`Feishu message handling failed: ${error instanceof Error ? error.message : String(error)}`));

    messageQueues.set(message.sessionId, next);
    void next.finally(() => {
      if (messageQueues.get(message.sessionId) === next) messageQueues.delete(message.sessionId);
    });
  }

  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST") {
      response.writeHead(405).end("method not allowed");
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    try {
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      const relayPrefix = "/ffd-report-relay/";
      if (path.startsWith(relayPrefix)) {
        const suppliedToken = decodeURIComponent(path.slice(relayPrefix.length));
        if (!options.ffdReportRelay?.token || suppliedToken !== options.ffdReportRelay.token) {
          response.writeHead(401, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ code: 19001, msg: "invalid relay token", StatusCode: 19001, StatusMessage: "invalid relay token" }));
          return;
        }
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ code: 0, msg: "success", StatusCode: 0, StatusMessage: "success" }));
        void Promise.resolve(options.ffdReportRelay.onPayload(payload)).catch((error) =>
          console.error(`FFD report relay failed: ${error instanceof Error ? error.message : String(error)}`),
        );
        return;
      }
      if (options.token && payloadToken(payload) && payloadToken(payload) !== options.token) {
        response.writeHead(401, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "invalid token" }));
        return;
      }
      if (payload?.challenge) {
        logger.info("Feishu URL verification challenge received.");
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ challenge: payload.challenge }));
        return;
      }
      const message = extractFeishuMessageEvent(payload);
      if (message && options.onMessage) {
        if (!shouldAcceptMessage(message.messageId)) {
          logger.info(`Feishu duplicate message ignored: messageId=${message.messageId}`);
          response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ ok: true, duplicate: true }));
          return;
        }
        logger.info(
          `Feishu message received: messageId=${message.messageId} sessionId=${message.sessionId} chatType=${message.chatType ?? "unknown"} mentionedBot=${message.mentionedBot} text="${redactLogText(message.text).slice(0, 120)}"`,
        );
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true }));
        enqueueMessage(message);
        return;
      }
      if (payload?.header?.event_type) {
        logger.info(`Feishu event ignored: eventType=${String(payload.header.event_type)}`);
      }
      const result = await handleFeishuCallback(payload, options.token, options.commands);
      response.writeHead(result.status, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(result.body));
    } catch (error) {
      response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });
  server.listen(options.port);
  return server;
}
