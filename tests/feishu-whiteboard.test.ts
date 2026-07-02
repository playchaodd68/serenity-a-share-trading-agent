import { describe, expect, it } from "vitest";
import {
  buildTradingWhiteboardPrompt,
  extractMermaidCode,
  renderFeishuWhiteboardHelp,
  renderFeishuWhiteboardPreview,
} from "../src/feishu/whiteboard.js";

describe("Feishu whiteboard helpers", () => {
  it("extracts fenced Mermaid diagrams", () => {
    const code = extractMermaidCode([
      "Here is a draft:",
      "```mermaid",
      "flowchart TD",
      "  A[產業鏈] --> B[瓶頸]",
      "```",
    ].join("\n"));

    expect(code).toBe("flowchart TD\n  A[產業鏈] --> B[瓶頸]");
  });

  it("extracts plain Mermaid diagrams from mixed text", () => {
    const code = extractMermaidCode("说明\n\nflowchart LR\n  A[上游] --> B[中游]");
    expect(code).toBe("flowchart LR\n  A[上游] --> B[中游]");
  });

  it("builds a dedicated whiteboard prompt without changing normal answer templates", () => {
    const prompt = buildTradingWhiteboardPrompt("比较 AI 服务器和先进封装产业链");
    expect(prompt).toContain("显式的 /board 命令");
    expect(prompt).toContain("只输出一个 Mermaid 代码块");
    expect(prompt).toContain("比较 AI 服务器和先进封装产业链");
  });

  it("renders help and preview responses for unconfigured whiteboard output", () => {
    expect(renderFeishuWhiteboardHelp(false)).toContain("FEISHU_WHITEBOARD_TOKEN is not configured");

    const preview = renderFeishuWhiteboardPreview("flowchart TD\n  A --> B", "preview only");
    expect(preview).toContain("preview only");
    expect(preview).toContain("```mermaid\nflowchart TD\n  A --> B\n```");
  });
});
