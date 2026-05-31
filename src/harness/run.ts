import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { handleFeishuCallback } from "../feishu/feishu.js";
import { initializeKnowledgebase } from "../rag/obsidian.js";
import { screenCandidates } from "../screener.js";
import { SEED_SOURCES } from "../sources/seed.js";
import type { AShareStock } from "../types.js";

const MOCK_STOCKS: AShareStock[] = [
  {
    code: "300308",
    name: "中际旭创",
    latestPrice: 120,
    pctChange: 2.1,
    totalMarketCap: 130_000_000_000,
    floatMarketCap: 120_000_000_000,
    pe: 42,
    turnover: 3.2,
    mainNetInflow: 10_000_000,
    industry: "通信设备",
    region: "山东板块",
    concept: "CPO 光模块 硅光 AI算力",
  },
  {
    code: "600000",
    name: "浦发银行",
    latestPrice: 9,
    pctChange: 0.1,
    totalMarketCap: 260_000_000_000,
    floatMarketCap: 260_000_000_000,
    pe: 6,
    turnover: 0.2,
    mainNetInflow: -1_000_000,
    industry: "银行",
    region: "上海板块",
    concept: "金融",
  },
  {
    code: "688072",
    name: "拓荆科技",
    latestPrice: 180,
    pctChange: 3.4,
    totalMarketCap: 48_000_000_000,
    floatMarketCap: 22_000_000_000,
    pe: 75,
    turnover: 4.1,
    mainNetInflow: 8_000_000,
    industry: "半导体设备",
    region: "辽宁板块",
    concept: "半导体 刻蚀 薄膜 先进封装 国产替代",
  },
];

export interface HarnessResult {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
}

function check(name: string, ok: boolean, detail: string): HarnessResult["checks"][number] {
  return { name, ok, detail };
}

export async function runHarness(): Promise<HarnessResult> {
  const checks: HarnessResult["checks"] = [];
  const run = await screenCandidates(SEED_SOURCES, { maxRows: MOCK_STOCKS.length, topN: 5, stocks: MOCK_STOCKS });
  checks.push(check("screens relevant stocks", run.candidates.length === 2, `candidates=${run.candidates.length}`));
  checks.push(check("ranks optical/semiconductor above bank", run.candidates.every((candidate) => candidate.stock.code !== "600000"), "bank excluded"));
  checks.push(check("trace has coverage gaps", run.candidates[0]?.trace.coverageGaps.length > 0, "coverage gaps present"));

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "serenity-kb-"));
  const kb = await initializeKnowledgebase(SEED_SOURCES.slice(0, 3), tempRoot);
  checks.push(check("obsidian folders created", kb.directories.length >= 7, kb.root));
  checks.push(check("methodology note written", kb.files.some((file) => file.includes("Serenity产业链瓶颈方法论")), "methodology file exists"));

  const rejected = await handleFeishuCallback({ token: "bad", text: "/sources" }, "expected", {});
  checks.push(check("feishu rejects invalid token", rejected.status === 401, `status=${rejected.status}`));
  const accepted = await handleFeishuCallback({ token: "expected", text: "/sources" }, "expected", {
    "/sources": () => "ok",
  });
  checks.push(check("feishu routes command", accepted.body.text === "ok", JSON.stringify(accepted.body)));

  const ok = checks.every((item) => item.ok);
  return { ok, checks };
}
