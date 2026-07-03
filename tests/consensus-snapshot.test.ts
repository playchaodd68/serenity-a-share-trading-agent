import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  archiveConsensusSnapshots,
  collectConsensusSnapshots,
  f10SecurityCode,
  mapConsensusSnapshot,
  type ConsensusSnapshot,
} from "../src/research/consensus-snapshot.js";

// Trimmed live fixture captured via curl on 2026-07-03 from
// https://emweb.securities.eastmoney.com/PC_HSF10/ProfitForecast/PageAjax?code=SZ300750
// (real values; jgyc/ycmx per-org rows dropped, yctj_list/pjtj kept)。
const COVERED_FIXTURE = {
  pjtj: [
    { DATE_TYPE_CODE: 1, DATE_TYPE: "1月内", COMPRE_RATING: null, RATING_ORG_NUM: null, RATING_BUY_NUM: null },
    { DATE_TYPE_CODE: 3, DATE_TYPE: "3月内", COMPRE_RATING: "买入", RATING_ORG_NUM: 21, RATING_BUY_NUM: 18 },
    { DATE_TYPE_CODE: 5, DATE_TYPE: "1年内", COMPRE_RATING: "买入", RATING_ORG_NUM: 42, RATING_BUY_NUM: 35 },
  ],
  jgyc: [],
  yctj_chart: [],
  yctj_list: [
    { SECURITY_CODE: "300750", SECURITY_NAME_ABBR: "宁德时代", YEAR: 2025, YEAR_MARK: "A", EPS: 15.605597630206, EPS_COUNT: null, PARENT_NETPROFIT: 72201282000, PARENT_NETPROFIT_COUNT: null },
    { SECURITY_CODE: "300750", SECURITY_NAME_ABBR: "宁德时代", YEAR: 2026, YEAR_MARK: "E", EPS: 20.73535483871, EPS_COUNT: 31, PARENT_NETPROFIT: 94856487096.7742, PARENT_NETPROFIT_COUNT: 31 },
    { SECURITY_CODE: "300750", SECURITY_NAME_ABBR: "宁德时代", YEAR: 2027, YEAR_MARK: "E", EPS: 25.629387096774, EPS_COUNT: 31, PARENT_NETPROFIT: 117163669677.419, PARENT_NETPROFIT_COUNT: 31 },
    { SECURITY_CODE: "300750", SECURITY_NAME_ABBR: "宁德时代", YEAR: 2028, YEAR_MARK: "E", EPS: 30.830466666667, EPS_COUNT: 30, PARENT_NETPROFIT: 140923057666.667, PARENT_NETPROFIT_COUNT: 30 },
  ],
  ycmx: [],
};

// 无分析师覆盖的真实形态（恒久退 002808）：pjtj 为空、yctj 只有 A 行 —— 缺失态而非错误。
const UNCOVERED_FIXTURE = {
  pjtj: [],
  jgyc: [],
  yctj_chart: [],
  yctj_list: [{ SECURITY_CODE: "002808", SECURITY_NAME_ABBR: "恒久退", YEAR: 2025, YEAR_MARK: "A", EPS: -0.151806630841, EPS_COUNT: null, PARENT_NETPROFIT: -40805622.37, PARENT_NETPROFIT_COUNT: null }],
  ycmx: [],
};

describe("f10SecurityCode", () => {
  it("prefixes SH/SZ/BJ by code range", () => {
    expect(f10SecurityCode("603618")).toBe("SH603618");
    expect(f10SecurityCode("300750")).toBe("SZ300750");
    expect(f10SecurityCode("000001")).toBe("SZ000001");
    expect(f10SecurityCode("830799")).toBe("BJ830799");
    expect(f10SecurityCode("920099")).toBe("BJ920099");
  });
});

describe("mapConsensusSnapshot", () => {
  it("maps the covered fixture into FY1/FY2 consensus with rating context", () => {
    const snapshot = mapConsensusSnapshot("300750", COVERED_FIXTURE, "2026-07-03");
    expect(snapshot.status).toBe("ok");
    expect(snapshot.code).toBe("300750");
    expect(snapshot.name).toBe("宁德时代");
    expect(snapshot.asOf).toBe("2026-07-03");
    expect(snapshot.fy1Year).toBe(2026);
    expect(snapshot.fy2Year).toBe(2027);
    expect(snapshot.consensusNetProfitFY1).toBeCloseTo(94856487096.7742, 3);
    expect(snapshot.consensusNetProfitFY2).toBeCloseTo(117163669677.419, 3);
    expect(snapshot.consensusEpsFY1).toBeCloseTo(20.73535483871, 9);
    expect(snapshot.analystCount).toBe(31);
    // 评级取 3月内 窗口，对齐提案 §2b-6 的 ≤90 天时效硬过滤。
    expect(snapshot.rating).toBe("买入");
    expect(snapshot.ratingOrgCount3m).toBe(21);
  });

  it("returns the uncovered (缺失) state for stocks without analyst coverage", () => {
    const snapshot = mapConsensusSnapshot("002808", UNCOVERED_FIXTURE, "2026-07-03");
    expect(snapshot.status).toBe("uncovered");
    expect(snapshot.name).toBe("恒久退");
    expect(snapshot.analystCount).toBeNull();
    expect(snapshot.consensusNetProfitFY1).toBeNull();
    expect(snapshot.consensusNetProfitFY2).toBeNull();
    expect(snapshot.consensusEpsFY1).toBeNull();
    expect(snapshot.rating).toBeNull();
  });

  it("throws on the invalid-code payload (verified live: status -1)", () => {
    expect(() => mapConsensusSnapshot("999999", { status: -1, message: "股票代码不合法" }, "2026-07-03")).toThrow(/股票代码不合法|status/);
  });
});

describe("collectConsensusSnapshots", () => {
  const okSnapshot = (code: string): ConsensusSnapshot => mapConsensusSnapshot(code, COVERED_FIXTURE, "2026-07-03");

  it("records per-code failures as status=failed without breaking the chain", async () => {
    const snapshots = await collectConsensusSnapshots(
      ["300750", "999999", "002808"],
      async (code) => {
        if (code === "999999") throw new Error("股票代码不合法");
        return code === "002808" ? mapConsensusSnapshot(code, UNCOVERED_FIXTURE, "2026-07-03") : okSnapshot(code);
      },
      { batchGapMs: 0, asOf: "2026-07-03" },
    );
    expect(snapshots.map((snapshot) => `${snapshot.code}:${snapshot.status}`)).toEqual(["300750:ok", "999999:failed", "002808:uncovered"]);
    expect(snapshots[1].error).toContain("股票代码不合法");
    expect(snapshots[1].consensusNetProfitFY1).toBeNull();
  });

  it("dedupes codes and caps concurrency at 4", async () => {
    let active = 0;
    let maxActive = 0;
    const codes = Array.from({ length: 10 }, (_, index) => String(600000 + index));
    const snapshots = await collectConsensusSnapshots(
      [...codes, ...codes],
      async (code) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return okSnapshot(code);
      },
      { batchGapMs: 0 },
    );
    expect(snapshots).toHaveLength(10);
    expect(maxActive).toBeLessThanOrEqual(4);
  });
});

describe("archiveConsensusSnapshots", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes <dir>/<YYYY-MM-DD>.json with snapshots and counts", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "consensus-snap-"));
    const fetchSnapshots = vi.fn(async (codes: string[]) =>
      codes.map((code) => mapConsensusSnapshot(code, code === "002808" ? UNCOVERED_FIXTURE : COVERED_FIXTURE, "2026-07-03")),
    );
    const result = await archiveConsensusSnapshots(["300750", "002808"], dir, { now: new Date("2026-07-03T09:00:00+08:00"), fetchSnapshots });
    expect(result.skipped).toBe(false);
    expect(result.date).toBe("2026-07-03");
    expect(result.counts).toEqual({ ok: 1, uncovered: 1, failed: 0 });
    const raw = JSON.parse(await fs.readFile(result.path, "utf8")) as { asOf: string; snapshots: ConsensusSnapshot[] };
    expect(raw.asOf).toBe("2026-07-03");
    expect(raw.snapshots).toHaveLength(2);
    expect(raw.snapshots[0].code).toBe("300750");
  });

  it("is idempotent per day: skips (and does not fetch) when the file already exists", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "consensus-snap-"));
    const fetchSnapshots = vi.fn(async (codes: string[]) => codes.map((code) => mapConsensusSnapshot(code, COVERED_FIXTURE, "2026-07-03")));
    const now = new Date("2026-07-03T09:00:00+08:00");
    const first = await archiveConsensusSnapshots(["300750"], dir, { now, fetchSnapshots });
    expect(first.skipped).toBe(false);
    const second = await archiveConsensusSnapshots(["300750"], dir, { now, fetchSnapshots });
    expect(second.skipped).toBe(true);
    expect(second.path).toBe(first.path);
    expect(fetchSnapshots).toHaveBeenCalledTimes(1);
  });
});
