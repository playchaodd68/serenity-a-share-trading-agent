import { describe, expect, it } from "vitest";
import { renderCronExample, renderDoctorReport, type DoctorReport } from "../src/operations.js";

describe("operations helpers", () => {
  it("renders doctor checks and cron examples", () => {
    const report: DoctorReport = {
      ok: true,
      generatedAt: "2026-06-01T00:00:00.000Z",
      checks: [{ name: "source-registry", ok: true, severity: "error", detail: "sources=1" }],
    };

    expect(renderDoctorReport(report)).toContain("Runtime doctor: ok");
    expect(renderCronExample()).toContain("npm run daily-run");
  });
});
