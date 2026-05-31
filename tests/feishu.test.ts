import { describe, expect, it } from "vitest";
import { handleFeishuCallback } from "../src/feishu/feishu.js";

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
});
