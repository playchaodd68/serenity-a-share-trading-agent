import { describe, expect, it } from "vitest";
import {
  buildFeishuCards,
  colorizeFeishuTokens,
  normalizeMarkdownStructure,
} from "../src/feishu/markdown-card.js";
import { replyFeishuText } from "../src/feishu/feishu.js";

describe("normalizeMarkdownStructure", () => {
  it("lifts the leading H1 into the title and converts sub-headings to bold", () => {
    const { title, body } = normalizeMarkdownStructure("# 中际旭创 300308\n\n## 产业逻辑\n正文一行");
    expect(title).toBe("中际旭创 300308");
    expect(body).not.toContain("# ");
    expect(body).toContain("**产业逻辑**");
  });

  it("converts GFM pipe tables to an aligned code block (tables do not render in Feishu cards)", () => {
    const md = "证据如下：\n\n| 层级 | 结论 |\n| --- | --- |\n| P0 | 直接 |\n| P1 | 佐证 |";
    const { body } = normalizeMarkdownStructure(md);
    expect(body).toContain("```");
    expect(body).not.toContain("| --- |");
    expect(body).toContain("层级");
    expect(body).toContain("结论");
  });

  it("preserves list and divider markup", () => {
    const { body } = normalizeMarkdownStructure("- 第一\n- 第二\n\n---\n\n收尾");
    expect(body).toContain("- 第一");
    expect(body).toContain("---");
  });

  it("does not treat a bare --- rule after a pipe line as a table separator", () => {
    const { body } = normalizeMarkdownStructure("| 行情提示 |\n---\n后续说明");
    expect(body).not.toContain("```");
    expect(body).toContain("| 行情提示 |");
    expect(body).toContain("---");
  });
});

describe("colorizeFeishuTokens", () => {
  it("colors PASS/FAIL inline and tiers as badges", () => {
    const out = colorizeFeishuTokens("评测 PASS，红线 FAIL；证据 P0 与 P1、P2。");
    expect(out).toContain("<font color='green'>PASS</font>");
    expect(out).toContain("<font color='red'>FAIL</font>");
    expect(out).toContain("<text_tag color='red'>P0</text_tag>");
    expect(out).toContain("<text_tag color='orange'>P1</text_tag>");
    expect(out).toContain("<text_tag color='blue'>P2</text_tag>");
  });

  it("never recolors tokens inside code spans or fences", () => {
    const out = colorizeFeishuTokens("行内 `P0` 与\n```\nP0 FAIL\n```\n");
    expect(out).toContain("`P0`");
    expect(out).toContain("```\nP0 FAIL\n```");
    expect(out).not.toContain("`<text_tag");
  });
});

describe("buildFeishuCards", () => {
  it("returns a single interactive card with a markdown element and valid header template", () => {
    const cards = buildFeishuCards("# 标题\n\n正文 PASS");
    expect(cards).toHaveLength(1);
    expect(cards[0].header.title).toEqual({ tag: "plain_text", content: "标题" });
    expect(["blue", "wathet", "turquoise", "green", "yellow", "orange", "red", "carmine", "violet", "purple", "indigo", "grey", "default"]).toContain(cards[0].header.template);
    expect(cards[0].elements[0].tag).toBe("markdown");
    expect(cards[0].elements[0].content).toContain("<font color='green'>PASS</font>");
  });

  it("splits long content into numbered cards", () => {
    const long = Array.from({ length: 320 }, (_, index) => `第 ${index} 行内容，足够长以触发分片处理。`).join("\n");
    const cards = buildFeishuCards(long, { title: "长报告" });
    expect(cards.length).toBeGreaterThan(1);
    expect(cards[0].header.title.content).toContain("[1/");
  });

  it("strips markdown from a caller-supplied title before placing it in the plain_text header", () => {
    const cards = buildFeishuCards("正文内容", { title: "**粗体标题**" });
    expect(cards[0].header.title.content).toBe("粗体标题");
  });

  it("returns no cards for empty input so callers can skip sending", () => {
    expect(buildFeishuCards("   ")).toEqual([]);
  });
});

describe("replyFeishuText card rendering", () => {
  it("replies with an interactive card whose content is the stringified card", async () => {
    const calls: Array<{ url: string; body: any }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ url: String(url), body });
      if (String(url).includes("/auth/v3/tenant_access_token/internal")) {
        return new Response(JSON.stringify({ code: 0, tenant_access_token: "tok", expire: 7200 }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: 0, msg: "ok" }), { status: 200 });
    }) as typeof fetch;
    try {
      await replyFeishuText({ appId: "app", appSecret: "secret", messageId: "om_1", text: "# 标题\n\n结论 PASS" });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const reply = calls.find((call) => call.url.includes("/im/v1/messages/om_1/reply"));
    expect(reply?.body.msg_type).toBe("interactive");
    const card = JSON.parse(reply!.body.content);
    expect(card.elements[0].tag).toBe("markdown");
    expect(card.header.title.content).toBe("标题");
  });

  it("falls back to plain text when the card send is rejected", async () => {
    const calls: Array<{ url: string; body: any }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ url: String(url), body });
      if (String(url).includes("/auth/v3/tenant_access_token/internal")) {
        return new Response(JSON.stringify({ code: 0, tenant_access_token: "tok", expire: 7200 }), { status: 200 });
      }
      if (body.msg_type === "interactive") {
        return new Response(JSON.stringify({ code: 230020, msg: "card too large" }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: 0, msg: "ok" }), { status: 200 });
    }) as typeof fetch;
    try {
      await replyFeishuText({ appId: "app", appSecret: "secret", messageId: "om_2", text: "结论与风险说明" });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const replies = calls.filter((call) => call.url.includes("/im/v1/messages/om_2/reply"));
    expect(replies.some((call) => call.body.msg_type === "interactive")).toBe(true);
    const textReply = replies.find((call) => call.body.msg_type === "text");
    expect(textReply).toBeTruthy();
    expect(JSON.parse(textReply!.body.content).text).toContain("结论");
  });

  it("delivers later chunks as text when a mid-stream card is rejected, without dropping content", async () => {
    const calls: Array<{ url: string; body: any }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ url: String(url), body });
      if (String(url).includes("/auth/v3/tenant_access_token/internal")) {
        return new Response(JSON.stringify({ code: 0, tenant_access_token: "tok", expire: 7200 }), { status: 200 });
      }
      // Reject interactive cards sent to the chat endpoint (the 2nd+ chunks), accept everything else.
      if (body.msg_type === "interactive" && String(url).includes("receive_id_type=chat_id")) {
        return new Response(JSON.stringify({ code: 230020, msg: "card rejected" }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: 0, msg: "ok" }), { status: 200 });
    }) as typeof fetch;
    const long = Array.from({ length: 320 }, (_, i) => `第 ${i} 行研究结论内容，足够长以触发分片处理。`).join("\n");
    try {
      await replyFeishuText({ appId: "app", appSecret: "secret", messageId: "om_3", chatId: "oc_3", text: long });
    } finally {
      globalThis.fetch = originalFetch;
    }

    // First chunk via reply endpoint as a card; rejected chat card falls back to a chat text message.
    const firstCard = calls.find((c) => c.url.includes("/im/v1/messages/om_3/reply") && c.body.msg_type === "interactive");
    expect(firstCard).toBeTruthy();
    const chatTexts = calls.filter((c) => c.url.includes("receive_id_type=chat_id") && c.body.msg_type === "text");
    expect(chatTexts.length).toBeGreaterThan(0);
    expect(JSON.parse(chatTexts[0].body.content).text).toContain("[2/");
  });
});
