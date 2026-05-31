import http from "node:http";

export interface FeishuCommandResult {
  status: number;
  body: Record<string, unknown>;
}

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

export async function handleFeishuCallback(
  payload: any,
  expectedToken: string | undefined,
  commands: Record<string, (arg: string) => Promise<string> | string>,
): Promise<FeishuCommandResult> {
  if (payload?.challenge) return { status: 200, body: { challenge: payload.challenge } };
  if (expectedToken && payload?.token !== expectedToken) return { status: 401, body: { error: "invalid token" } };

  const text = extractFeishuText(payload);
  const [command = "", ...rest] = text.split(/\s+/);
  const handler = commands[command.toLowerCase()];
  if (!handler) {
    return { status: 200, body: { text: "Supported commands: /screen, /latest, /why <code>, /sources, /methodology, /doctor, /harness" } };
  }
  const result = await handler(rest.join(" "));
  return { status: 200, body: { text: result } };
}

export function createFeishuServer(options: {
  port: number;
  token?: string;
  commands: Record<string, (arg: string) => Promise<string> | string>;
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
