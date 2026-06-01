import { describe, expect, it } from "vitest";
import { extractFeishuMessageEvent, handleFeishuCallback } from "../src/feishu/feishu.js";

describe("Feishu callbacks", () => {
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
          content: JSON.stringify({ text: '<at user_id="bot">Agent</at> /ask hello' }),
        },
      },
    });

    expect(event).toEqual({ messageId: "om_x", sessionId: "oc_x", text: "/ask hello" });
  });
});
