import { describe, expect, it } from "vitest";
import {
  createFeishuServer,
  extractFeishuMessageEvent,
  formatFeishuTextChunks,
  handleFeishuCallback,
  sendFeishuOpenIdText,
  sendFeishuTextByReceiveId,
  splitFeishuText,
} from "../src/feishu/feishu.js";

describe("Feishu callbacks", () => {
  it("accepts FFD report relay payloads with tokenized path", async () => {
    const received: unknown[] = [];
    const server = createFeishuServer({
      port: 0,
      commands: {},
      ffdReportRelay: {
        token: "relay-token",
        onPayload: (payload) => {
          received.push(payload);
        },
      },
    });
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("test server did not bind to a TCP port");
      const response = await fetch(`http://127.0.0.1:${address.port}/ffd-report-relay/relay-token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ msg_type: "text", content: { text: "new report" } }),
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ code: 0, StatusCode: 0 });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(received).toEqual([{ msg_type: "text", content: { text: "new report" } }]);
    } finally {
      server.close();
    }
  });

  it("handles challenge", async () => {
    await expect(handleFeishuCallback({ challenge: "abc" }, "token", {})).resolves.toEqual({
      status: 200,
      body: { challenge: "abc" },
    });
  });

  it("rejects invalid token", async () => {
    const result = await handleFeishuCallback({ token: "bad", text: "/sources" }, "good", {});
    expect(result.status).toBe(401);
  });

  it("extracts Feishu message receive events", () => {
    const event = extractFeishuMessageEvent({
      header: { event_type: "im.message.receive_v1", token: "token" },
      event: {
        sender: { sender_id: { open_id: "ou_x" } },
        message: {
          message_id: "om_x",
          chat_id: "oc_x",
          chat_type: "group",
          content: JSON.stringify({ text: '<at user_id="bot">Agent</at> /ask hello' }),
        },
      },
    });

    expect(event).toEqual({
      messageId: "om_x",
      sessionId: "oc_x",
      chatId: "oc_x",
      chatType: "group",
      senderOpenId: "ou_x",
      mentionedBot: true,
      text: "/ask hello",
    });
  });

  it("does not reply when group messages are ignored by the handler", async () => {
    const calls: any[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ code: 0, msg: "ok" }), { status: 200 });
    }) as typeof fetch;
    const server = createFeishuServer({
      port: 0,
      appId: "app",
      appSecret: "secret",
      commands: {},
      onMessage: () => undefined,
    });
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("test server did not bind to a TCP port");
      const response = await originalFetch(`http://127.0.0.1:${address.port}/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          header: { event_type: "im.message.receive_v1", token: "token" },
          event: {
            sender: { sender_id: { open_id: "ou_x" } },
            message: {
              message_id: "om_x",
              chat_id: "oc_x",
              chat_type: "group",
              content: JSON.stringify({ text: "普通群消息" }),
            },
          },
        }),
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(calls.filter((call) => String(call.url).includes("/im/v1/messages/om_x/reply"))).toHaveLength(0);
    } finally {
      server.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("splits long outgoing text without dropping content or adding truncation hints", () => {
    const text = `${"a".repeat(80)}\n\n${"b".repeat(80)}\n${"c".repeat(80)}`;
    const chunks = splitFeishuText(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(text);

    const formatted = formatFeishuTextChunks(text, 120);
    expect(formatted.join("\n")).not.toContain("已截断");
    expect(formatted[0]).toMatch(/^\[1\/\d+\]\n/);
  });

  it("sends proactive private messages by open_id", async () => {
    const calls: any[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("/auth/v3/tenant_access_token/internal")) {
        return new Response(JSON.stringify({ code: 0, tenant_access_token: "token", expire: 7200 }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: 0, msg: "ok" }), { status: 200 });
    }) as typeof fetch;
    try {
      await sendFeishuOpenIdText({ appId: "app", appSecret: "secret", openId: "ou_x", text: "hello" });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const messageCall = calls.find((call) => String(call.url).includes("/im/v1/messages"));
    expect(messageCall.url).toContain("receive_id_type=open_id");
    expect(JSON.parse(String(messageCall.init.body)).receive_id).toBe("ou_x");
  });

  it("normalizes outgoing Feishu message text to Simplified Chinese", async () => {
    const calls: any[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("/auth/v3/tenant_access_token/internal")) {
        return new Response(JSON.stringify({ code: 0, tenant_access_token: "token-cn", expire: 7200 }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: 0, msg: "ok" }), { status: 200 });
    }) as typeof fetch;
    try {
      await sendFeishuOpenIdText({
        appId: "app-cn",
        appSecret: "secret",
        openId: "ou_x",
        text: "產業邏輯與資金發酵，臺灣軟體資訊後續驗證。",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const messageCall = calls.find((call) => String(call.url).includes("/im/v1/messages"));
    const body = JSON.parse(String(messageCall.init.body));
    expect(JSON.parse(body.content).text).toBe("产业逻辑与资金发酵，台湾软件信息后续验证。");
  });

  it("keeps tenant token caches isolated by app id", async () => {
    const calls: any[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("/auth/v3/tenant_access_token/internal")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { app_id?: string };
        return new Response(JSON.stringify({ code: 0, tenant_access_token: `token-${body.app_id}`, expire: 7200 }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: 0, msg: "ok" }), { status: 200 });
    }) as typeof fetch;
    try {
      await sendFeishuOpenIdText({ appId: "app-a", appSecret: "secret-a", openId: "ou_x", text: "hello" });
      await sendFeishuOpenIdText({ appId: "app-b", appSecret: "secret-b", openId: "ou_x", text: "hello" });
      await sendFeishuOpenIdText({ appId: "app-a", appSecret: "secret-a", openId: "ou_x", text: "hello again" });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const tokenCalls = calls.filter((call) => String(call.url).includes("/auth/v3/tenant_access_token/internal"));
    expect(tokenCalls).toHaveLength(2);
    expect(JSON.parse(String(tokenCalls[0].init.body)).app_id).toBe("app-a");
    expect(JSON.parse(String(tokenCalls[1].init.body)).app_id).toBe("app-b");
  });

  it("sends proactive private messages by union_id", async () => {
    const calls: any[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("/auth/v3/tenant_access_token/internal")) {
        return new Response(JSON.stringify({ code: 0, tenant_access_token: "token-union", expire: 7200 }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: 0, msg: "ok" }), { status: 200 });
    }) as typeof fetch;
    try {
      await sendFeishuTextByReceiveId({ appId: "union-app", appSecret: "secret", receiveIdType: "union_id", receiveId: "on_x", text: "hello" });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const messageCall = calls.find((call) => String(call.url).includes("/im/v1/messages"));
    expect(messageCall.url).toContain("receive_id_type=union_id");
    expect(JSON.parse(String(messageCall.init.body)).receive_id).toBe("on_x");
  });
});
