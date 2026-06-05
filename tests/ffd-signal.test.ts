import { describe, expect, it } from "vitest";
import { FFD_SIGNAL_MODES, renderFfdSignalArchive } from "../src/research/ffd-signal.js";

describe("FFD signal archive helpers", () => {
  it("defines durable signal modes for realtime and structured FFD outputs", () => {
    expect(FFD_SIGNAL_MODES).toContain("industry");
    expect(FFD_SIGNAL_MODES).toContain("money");
    expect(FFD_SIGNAL_MODES).toContain("quotes");
    expect(FFD_SIGNAL_MODES).toContain("announcements");
  });

  it("renders archive status and Obsidian path without hiding data-plane limitations", () => {
    const rendered = renderFfdSignalArchive({
      mode: "news",
      toolName: "ffd_news_search",
      query: "半导体",
      topic: "news-半导体",
      generatedAt: "2026-06-04T00:00:00.000Z",
      status: "api_key_disabled",
      reason: "FFD API key is disabled.",
      notePath: "/tmp/kb/signals/ffd/2026-06-04-news.md",
      text: "FFD_RESULT_STATUS: api_key_disabled",
    });

    expect(rendered).toContain("Archived FFD signal");
    expect(rendered).toContain("Status: api_key_disabled");
    expect(rendered).toContain("Obsidian:");
  });
});
