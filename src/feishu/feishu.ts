import http from "node:http";

export interface FeishuCommandResult {
  status: number;
  body: Record<string, unknown>;
}

export interface FeishuMessageEvent {
  messageId: string;
  sessionId: string;
  text: string;
}

interface FeishuTokenCache {
  token: string;
  expiresAt: number;
}

let tenantTokenCache: FeishuTokenCache | undefined;

export async function sendFeishuMarkdown(webhookUrl: string, title: string, content: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      msg_type: "interactive",
      card: {
        header: { title: { tag: "plain_text", content: title } },
        elements: [{ tag: "markdown", content }],
      },
    }),
  });
  if (!response.ok) throw new Error(`Feishu webhook failed: ${response.status} ${await response.text()}`);
}

export function extractFeishuText(payload: any): string {
  return String(payload?.event?.message?.content ? JSON.parse(payload.event.message.content).text ?? "" : payload?.text ?? "").trim();
}

export function extractFeishuMessageEvent(payload: any): FeishuMessageEvent | undefined {
  if (payload?.header?.event_type !== "im.message.receive_v1") return undefined;
  const message = payload?.event?.message;
  const messageId = message?.message_id;
  const sessionId = message?.chat_id ?? payload?.event?.sender?.sender_id?.open_id ?? messageId;
  if (!messageId || !sessionId) return undefined;

  let text = "";
  try {
    const content = JSON.parse(message?.content ?? "{}");
    text = String(content?.text ?? "");
  } catch {
    text = "";
  }
  text = text.replace(/<at[^>]*>.*?<\/at>/g, "").replace(/^@\S+\s+/, "").trim();
  if (!text) return undefined;
  return { messageId, sessionId, text };
}

function payloadToken(payload: any): string | undefined {
  return payload?.token ?? payload?.header?.token;
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
    return { status: 200, body: { text: "Supported commands: /ask <question>, /reset, /screen, /latest, /why <code>, /sources, /methodology, /doctor, /harness" } };
  }
  const result = await handler(rest.join(" "));
  return { status: 200, body: { text: result } };
}

async function getTenantAccessToken(appId: string, appSecret: string): Promise<string> {
  const now = Date.now();
  if (tenantTokenCache && tenantTokenCache.expiresAt > now + 60_000) return tenantTokenCache.token;
  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  if (!response.ok) throw new Error(`Feishu tenant token request failed: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { code?: number; msg?: string; tenant_access_token?: string; expire?: number };
  if (body.code !== 0 || !body.tenant_access_token) throw new Error(`Feishu tenant token error: ${body.code} ${body.msg ?? ""}`.trim());
  tenantTokenCache = {
    token: body.tenant_access_token,
    expiresAt: now + Math.max(60, body.expire ?? 7200) * 1000,
  };
  return tenantTokenCache.token;
}

function truncateFeishuText(text: string): string {
  const limit = 3500;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n[已截断：完整内容请查看本地 reports/ 或 Obsidian 知识库]`;
}

export async function replyFeishuText(options: {
  appId?: string;
  appSecret?: string;
  messageId: string;
  text: string;
}): Promise<void> {
  if (!options.appId || !options.appSecret) {
    throw new Error("FEISHU_APP_ID and FEISHU_APP_SECRET are required to reply to Feishu messages.");
  }
  const token = await getTenantAccessToken(options.appId, options.appSecret);
  const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(options.messageId)}/reply`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      msg_type: "text",
      content: JSON.stringify({ text: truncateFeishuText(options.text) }),
    }),
  });
  if (!response.ok) throw new Error(`Feishu reply failed: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { code?: number; msg?: string };
  if (body.code !== 0) throw new Error(`Feishu reply error: ${body.code} ${body.msg ?? ""}`.trim());
}

export function createFeishuServer(options: {
  port: number;
  token?: string;
  appId?: string;
  appSecret?: string;
  commands: Record<string, (arg: string) => Promise<string> | string>;
  onMessage?: (message: FeishuMessageEvent) => Promise<string> | string;
}): http.Server {
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST") {
      response.writeHead(405).end("method not allowed");
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    try {
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      if (options.token && payloadToken(payload) && payloadToken(payload) !== options.token) {
        response.writeHead(401, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "invalid token" }));
        return;
      }
      if (payload?.challenge) {
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ challenge: payload.challenge }));
        return;
      }
      const message = extractFeishuMessageEvent(payload);
      if (message && options.onMessage) {
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true }));
        void Promise.resolve(options.onMessage(message))
          .then((text) => replyFeishuText({ appId: options.appId, appSecret: options.appSecret, messageId: message.messageId, text }))
          .catch((error) => console.error(`Feishu message handling failed: ${error instanceof Error ? error.message : String(error)}`));
        return;
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
