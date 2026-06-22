import http from "node:http";
import { toSimplifiedChinese } from "../utils/chinese.js";
import { buildFeishuReply, type FeishuCard } from "./markdown-card.js";
import { formatFeishuTextChunks } from "./text-utils.js";

export { formatFeishuTextChunks, splitFeishuText } from "./text-utils.js";

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
}

export interface FeishuWebhookRelayOptions {
  token?: string;
  onPayload: (payload: unknown) => Promise<void> | void;
}

export interface FeishuServerLogger {
  info: (message: string) => void;
  error: (message: string) => void;
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

type FeishuProactiveReceiveIdType = "chat_id" | "open_id" | "union_id" | "user_id" | "email";

async function postFeishuText(token: string, receiveIdType: FeishuProactiveReceiveIdType, receiveId: string, text: string): Promise<void> {
  const normalizedText = toSimplifiedChinese(text);
  const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      receive_id: receiveId,
      msg_type: "text",
      content: JSON.stringify({ text: normalizedText }),
    }),
  });
  if (!response.ok) throw new Error(`Feishu send failed: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { code?: number; msg?: string };
  if (body.code !== 0) throw new Error(`Feishu send error: ${body.code} ${body.msg ?? ""}`.trim());
}

async function postFeishuChatText(token: string, chatId: string, text: string): Promise<void> {
  await postFeishuText(token, "chat_id", chatId, text);
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
  return String(payload?.event?.message?.content ? JSON.parse(payload.event.message.content).text ?? "" : payload?.text ?? "").trim();
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
  try {
    const content = JSON.parse(message?.content ?? "{}");
    text = String(content?.text ?? "");
    mentionedBot = /<at\b[^>]*>.*?<\/at>/i.test(text);
  } catch {
    text = "";
  }
  text = text.replace(/<at[^>]*>.*?<\/at>/g, "").replace(/^@\S+\s+/, "").trim();
  if (!text) return undefined;
  return { messageId, sessionId, chatId, chatType: message?.chat_type, senderOpenId, mentionedBot, text };
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
        text: "Supported commands: /ask <question>, /reset, /screen, /research-refresh, /ffd-health, /ffd <query>, /ffd-industry <query>, /ffd-research <keyword>, /ffd-news <keyword>, /ffd-smoke, /ffd-signal <mode> <query>, /ffd-auto-rules, /reports-convert, /reports-review, /reports-accept <id>, /reports-accept --force <id>, /reports-accept-quality, /reports-reject <id>, /archive-obsidian, /watchlist, /calibration, /evals, /latest, /why <code>, /sources, /methodology, /doctor, /harness",
      },
    };
  }
  const result = await handler(rest.join(" "));
  return { status: 200, body: { text: toSimplifiedChinese(result) } };
}

async function getTenantAccessToken(appId: string, appSecret: string): Promise<string> {
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

async function postFeishuReplyText(token: string, messageId: string, text: string): Promise<void> {
  const normalizedText = toSimplifiedChinese(text);
  const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      msg_type: "text",
      content: JSON.stringify({ text: normalizedText }),
    }),
  });
  if (!response.ok) throw new Error(`Feishu reply failed: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { code?: number; msg?: string };
  if (body.code !== 0) throw new Error(`Feishu reply error: ${body.code} ${body.msg ?? ""}`.trim());
}

async function postFeishuReplyCard(token: string, messageId: string, card: FeishuCard): Promise<void> {
  const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ msg_type: "interactive", content: JSON.stringify(card) }),
  });
  if (!response.ok) throw new Error(`Feishu reply card failed: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { code?: number; msg?: string };
  if (body.code !== 0) throw new Error(`Feishu reply card error: ${body.code} ${body.msg ?? ""}`.trim());
}

async function postFeishuChatCard(token: string, chatId: string, card: FeishuCard): Promise<void> {
  const response = await fetch("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ receive_id: chatId, msg_type: "interactive", content: JSON.stringify(card) }),
  });
  if (!response.ok) throw new Error(`Feishu chat card failed: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { code?: number; msg?: string };
  if (body.code !== 0) throw new Error(`Feishu chat card error: ${body.code} ${body.msg ?? ""}`.trim());
}

/**
 * Reply to a Feishu message. Renders the answer as an interactive card (so Markdown structure,
 * lists, dividers, and colored evidence tiers display cleanly) and falls back to plain text if
 * the card cannot be built or sent (e.g. oversized body or API rejection).
 */
export async function replyFeishuText(options: {
  appId?: string;
  appSecret?: string;
  messageId: string;
  chatId?: string;
  text: string;
  title?: string;
}): Promise<void> {
  if (!options.appId || !options.appSecret) {
    throw new Error("FEISHU_APP_ID and FEISHU_APP_SECRET are required to reply to Feishu messages.");
  }
  const token = await getTenantAccessToken(options.appId, options.appSecret);
  const normalized = toSimplifiedChinese(options.text);
  if (!normalized.trim()) return;

  const { cards, textChunks } = buildFeishuReply(normalized, { title: options.title });
  // Deliver each chunk as a card when possible; on a card build/size/send failure switch that chunk
  // (and the rest) to plain text so content is never dropped or duplicated.
  let cardMode = true;
  for (const [index, textChunk] of textChunks.entries()) {
    const chatId = index === 0 ? undefined : options.chatId;
    const card = cards[index];
    if (cardMode && card) {
      try {
        if (chatId) await postFeishuChatCard(token, chatId, card);
        else await postFeishuReplyCard(token, options.messageId, card);
        continue;
      } catch {
        cardMode = false;
      }
    }
    const payload = textChunks.length > 1 ? `[${index + 1}/${textChunks.length}]\n${textChunk}` : textChunk;
    if (chatId) await postFeishuChatText(token, chatId, payload);
    else await postFeishuReplyText(token, options.messageId, payload);
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
  logger?: FeishuServerLogger;
}): http.Server {
  const logger = options.logger ?? console;
  const messageQueues = new Map<string, Promise<void>>();

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
        logger.info(`Feishu reply started: messageId=${message.messageId} length=${text.length}`);
        await replyFeishuText({
          appId: options.appId,
          appSecret: options.appSecret,
          messageId: message.messageId,
          chatId: message.chatId,
          text,
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
