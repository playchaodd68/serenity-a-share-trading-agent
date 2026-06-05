import { describe, expect, it } from "vitest";
import { renderFfdSmoke, type FfdSmokeRun } from "../src/research/ffd-smoke.js";

describe("FFD smoke renderer", () => {
  it("surfaces API-key disabled as an actionable data-plane failure", () => {
    const run: FfdSmokeRun = {
      generatedAt: "2026-06-04T00:00:00.000Z",
      ok: false,
      results: [
        {
          id: "news-search",
          label: "News data plane",
          toolName: "ffd_news_search",
          required: true,
          status: "api_key_disabled",
          ok: false,
          reason: "FFD API key is disabled.",
          preview: "API_KEY_DISABLED",
        },
      ],
    };

    const rendered = renderFfdSmoke(run);

    expect(rendered).toContain("needs attention");
    expect(rendered).toContain("api_key_disabled=1");
    expect(rendered).toContain("npm run ffd:set-key");
    expect(rendered).toContain("npm run ffd:smoke");
  });
});
