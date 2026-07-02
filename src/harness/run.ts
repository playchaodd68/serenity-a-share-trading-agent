import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { createTradingAgentTools, TRADING_AGENT_SYSTEM_PROMPT } from "../agent/trading-agent.js";
import { handleFeishuCallback } from "../feishu/feishu.js";
import { initializeKnowledgebase } from "../rag/obsidian.js";
import { renderScreenReport } from "../report.js";
import { runAnswerSafetyEvals, runSycophancyPromptEvals } from "../research/evals.js";
import { updateWatchlistFromRun } from "../research/watchlist.js";
import { screenCandidates } from "../screener.js";
import { SEED_SOURCES } from "../sources/seed.js";
import { methodologySummary } from "../methodology.js";
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
  checks.push(check("structured evidence extracted", (run.candidates[0]?.trace.structuredEvidence?.length ?? 0) > 0, "evidence present"));
  checks.push(check("supply-chain graph generated", (run.candidates[0]?.trace.graph?.edges.length ?? 0) > 0, "graph edges present"));
  const watchlist = updateWatchlistFromRun(run);
  checks.push(check("watchlist lifecycle updated", watchlist.length === run.candidates.length && watchlist.every((entry) => entry.nextReviewAt), `entries=${watchlist.length}`));
  const screenReport = renderScreenReport(run);
  checks.push(
    check(
      "research report includes industry logic and evidence sections",
      screenReport.includes("Industry Logic & Trend") && screenReport.includes("Evidence Highlights") && screenReport.includes("Supply Chain Graph"),
      "report sections present",
    ),
  );
  const safetyEvals = runAnswerSafetyEvals(TRADING_AGENT_SYSTEM_PROMPT);
  checks.push(check("answer safety evals pass", safetyEvals.every((item) => item.passed), `${safetyEvals.filter((item) => item.passed).length}/${safetyEvals.length}`));
  const sycophancyEvals = runSycophancyPromptEvals(TRADING_AGENT_SYSTEM_PROMPT);
  checks.push(
    check("sycophancy prompt evals pass", sycophancyEvals.every((item) => item.passed), `${sycophancyEvals.filter((item) => item.passed).length}/${sycophancyEvals.length}`),
  );
  checks.push(
    check(
      "screen emits forced hot-theme downgrade slot",
      (run.hotThemeDowngrades?.length ?? 0) > 0 && renderScreenReport(run).includes("热门降级（强制输出槽）"),
      `themes=${run.hotThemeDowngrades?.length ?? 0}`,
    ),
  );
  checks.push(
    check(
      "two-sided crowding policy active",
      run.candidates.every((candidate) => candidate.trace.components.some((component) => component.name === "hype-crowding-penalty")) &&
        TRADING_AGENT_SYSTEM_PROMPT.includes("two-sided") &&
        !TRADING_AGENT_SYSTEM_PROMPT.includes("not as an automatic crowding penalty"),
      "methodology hype component + prompt",
    ),
  );
  checks.push(
    check(
      "confidence ceiling trace present",
      run.candidates.every((candidate) => candidate.trace.confidenceCeiling != null),
      "rating constraints wired",
    ),
  );
  const agentToolNames = createTradingAgentTools().map((tool) => tool.name.toLowerCase());
  checks.push(
    check(
      "position firewall: agent exposes no holdings tool",
      agentToolNames.every((name) => !name.includes("portfolio") && !name.includes("holding") && !name.includes("position")),
      `tools=${agentToolNames.length}`,
    ),
  );
  checks.push(
    check(
      "serenity-reply source registered",
      SEED_SOURCES.some((source) => source.id === "SERENITY-REPLY-DISTILLATION-20260530" && source.tier === "P1" && source.sourceType === "repo"),
      "distillation source is P1 repo input",
    ),
  );
  checks.push(
    check(
      "methodology distillation boundaries present",
      methodologySummary().includes("推理出处分层") && methodologySummary().includes("趋势优先产业排序框架") && methodologySummary().includes("不得以第一人称扮演 Serenity"),
      "trend-first reasoning provenance and non-impersonation documented",
    ),
  );
  checks.push(
    check(
      "agent prompt forbids impersonation",
      TRADING_AGENT_SYSTEM_PROMPT.includes("do not impersonate Serenity") &&
        TRADING_AGENT_SYSTEM_PROMPT.includes("lead with era-level industry trends") &&
        TRADING_AGENT_SYSTEM_PROMPT.includes("never tell the user to paste an FFD API Key") &&
        TRADING_AGENT_SYSTEM_PROMPT.includes("refuse leverage"),
      "prompt keeps industry trend framework as the lead",
    ),
  );

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "serenity-kb-"));
  const kb = await initializeKnowledgebase(SEED_SOURCES.slice(0, 3), tempRoot);
  checks.push(check("obsidian folders created", kb.directories.length >= 12, kb.root));
  checks.push(check("methodology note written", kb.files.some((file) => file.includes("Serenity产业链瓶颈方法论")), "methodology file exists"));
  checks.push(check("wiki governance note written", kb.files.some((file) => file.includes("Wiki维护与证据治理")), "governance file exists"));
  checks.push(check("ffd signal and accepted folders created", kb.directories.some((dir) => dir.includes("reports/FFD/Accepted")) && kb.directories.some((dir) => dir.includes("signals/ffd")), "ffd wiki folders exist"));

  const rejected = await handleFeishuCallback({ token: "bad", text: "/sources" }, "expected", {});
  checks.push(check("feishu rejects invalid token", rejected.status === 401, `status=${rejected.status}`));
  const accepted = await handleFeishuCallback({ token: "expected", text: "/sources" }, "expected", {
    "/sources": () => "ok",
  });
  checks.push(check("feishu routes command", accepted.body.text === "ok", JSON.stringify(accepted.body)));

  const ok = checks.every((item) => item.ok);
  return { ok, checks };
}
