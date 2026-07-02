import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { getConfig } from "./config.js";
import { fetchCninfoAnnualReportSourcesForCandidates } from "./connectors/cninfo.js";
import { callFfdTool, renderFfdToolResultWithStatus } from "./connectors/ffd.js";
import { fetchTopicDiggPostSummaries, serenityPostsToSources } from "./connectors/serenity.js";
import { ingestLocalReportSources } from "./connectors/reports.js";
import { createFeishuServer, normalizeFeishuReplyRenderMode, replyFeishuMessage } from "./feishu/feishu.js";
import type { FeishuMessageEvent } from "./feishu/feishu.js";
import { downloadFeishuMessageImage, uploadFeishuImage, sendFeishuImageToChat, sendFeishuTextToChat } from "./feishu/media.js";
import { analyzeImagesWithVision, generateImage, downloadImageBytes, type AicodewithMultimodalConfig } from "./multimodal/aicodewith.js";
import { explainCandidate, findLatestRun, renderFeishuSummary, writeScreenReport } from "./report.js";
import { initializeKnowledgebase, syncKnowledgebaseSources } from "./rag/obsidian.js";
import { screenCandidates } from "./screener.js";
import { loadSourceRegistry, mergeSources, saveSourceRegistry, seedSourceRegistry } from "./sources/registry.js";
import { EASTMONEY_SOURCE } from "./connectors/eastmoney.js";
import { runHarness } from "./harness/run.js";
import { appendJsonl, readJsonFile, writeJsonFile } from "./utils/fs.js";
import { sendFeishuChatText, sendFeishuMarkdown, sendFeishuOpenIdText, sendFeishuTextByReceiveId } from "./feishu/feishu.js";
import {
  buildTradingWhiteboardPrompt,
  extractMermaidCode,
  renderFeishuWhiteboardHelp,
  renderFeishuWhiteboardPreview,
  updateFeishuWhiteboardMermaid,
} from "./feishu/whiteboard.js";
import { createTradingAgent, TRADING_AGENT_SYSTEM_PROMPT } from "./agent/trading-agent.js";
import { runInteractiveChat, startChatHttpServer } from "./chatbot/chatbot.js";
import { createHermesTradingFeishuRouter } from "./hermes/feishu-subagent.js";
import { methodologySummary } from "./methodology.js";
import { diagnoseRuntime, renderCronExample, renderDoctorReport } from "./operations.js";
import { buildCalibrationSnapshot, renderCalibrationSnapshot, writeCalibrationSnapshot } from "./research/calibration.js";
import {
  bearKillCriteria,
  loadBearCases,
  renderBearCase,
  runBearCasePass,
  saveBearCase,
} from "./research/debate/bear-case.js";
import { renderVerdict, synthesizeVerdict } from "./research/debate/verdict.js";
import { createDeepSeekClient } from "./research/debate/llm-client.js";
import { loadPortfolio, PORTFOLIO_PATH } from "./portfolio/portfolio.js";
import { buildPositionOverlay, renderPositionOverlay } from "./pipeline/position-overlay.js";
import { computeSycophancySlices, renderSycophancySlices } from "./research/sycophancy-slice.js";
import { hybridSearchReportLibrary, renderHybridResults } from "./research/library-hybrid.js";
import { buildEmbeddingIndex } from "./research/library-index.js";
import { createOllamaEmbeddingClient, isOllamaAvailable } from "./research/embeddings.js";
import { loadRetrievalEvalCases, renderRetrievalEval, runRetrievalEval } from "./research/library-eval.js";
import { rechunkFfdReports, renderFfdRechunkRun } from "./research/report-library.js";
import { loadDecisionLog, pendingEntriesFromRun, resolveDecisionEntries, saveDecisionLog, summarizeDecisionLog } from "./research/decision-log.js";
import { createRng, initialArms, pickNextTheme, updateArm, type ThemeArmState } from "./research/direction-bandit.js";
import { DEFAULT_THEMES } from "./methodology.js";
import { evaluateCompleteness, renderCompleteness } from "./validation/completeness-gate.js";
import { renderAnswerSafetyEvals, renderSycophancyEvals, runAnswerSafetyEvals, runSycophancyPromptEvals } from "./research/evals.js";
import { archiveFfdSignal, FFD_SIGNAL_MODES, renderFfdSignalArchive, type FfdSignalMode } from "./research/ffd-signal.js";
import { renderFfdSmoke, runFfdSmoke } from "./research/ffd-smoke.js";
import { organizeFfdObsidianKnowledgebase, renderFfdObsidianOrganizationRun } from "./research/ffd-obsidian-organizer.js";
import { renderQuantBacktestReport, runQuantBacktest, type QuantBacktestOptions, type QuantBacktestSnapshot } from "./quant/backtest.js";
import {
  adaptScreenRunsToBacktestInput,
  buildQuantBacktestInputFile,
  loadHistoricalPriceBarsFromPath,
  loadScreenRunsFromDirectory,
  renderQuantHistoryAdapterReport,
  type QuantHistoryAdapterOptions,
} from "./quant/history-adapter.js";
import {
  acceptFfdReport,
  enhanceFfdReports,
  listFfdReportManifests,
  processFfdReportLibrary,
  qualityForManifest,
  rejectFfdReport,
  renderFfdReportReview,
  type FfdReportLibraryRun,
} from "./research/report-library.js";
import { renderFfdAutoDownloadGuide } from "./research/ffd-auto-download.js";
import { loadWatchlist, renderWatchlistSummary, saveWatchlist, updateWatchlistFromRun } from "./research/watchlist.js";
import { evaluateKillCriteria } from "./research/kill-criteria.js";
import {
  attachGraveyardOutcomes,
  buryBelowBar,
  buryDowngraded,
  buryKilled,
  combinedBaseRate,
  loadGraveyard,
  mergeGraveyard,
  renderGraveyardSummary,
  saveGraveyard,
  summarizeGraveyard,
} from "./research/graveyard.js";
import { evidenceHasCandidateP0 } from "./research/evidence.js";
import { buildResolutionCalibration, loadResolutions, renderResolutionCalibration, resolveCandidates, saveResolutions } from "./research/resolution.js";
import { buildResolutionInputsFromWatchlist, createFfdPriceReturnProvider } from "./research/resolution-provider.js";
import type { Candidate, GraveyardEntry, ScreenRun, WatchlistEntry } from "./types.js";

async function ingestSerenity() {
  const config = getConfig();
  const seeded = await seedSourceRegistry();
  let warning: string | undefined;
  let posts: Awaited<ReturnType<typeof fetchTopicDiggPostSummaries>>;
  try {
    posts = await fetchTopicDiggPostSummaries();
    await writeJsonFile("data/serenity-posts.json", posts);
  } catch (error) {
    warning = `Serenity mirror fetch failed; using cached post summaries. Reason: ${error instanceof Error ? error.message : String(error)}`;
    console.warn(warning);
    posts = await readJsonFile<Awaited<ReturnType<typeof fetchTopicDiggPostSummaries>>>("data/serenity-posts.json", []);
  }
  const reportSources = await ingestLocalReportSources(config.reportInbox);
  const merged = mergeSources(seeded, [...serenityPostsToSources(posts), ...reportSources, EASTMONEY_SOURCE]);
  await saveSourceRegistry(merged);
  await appendJsonl("runs/ingest.jsonl", { type: "ingest-serenity", at: new Date().toISOString(), sources: merged.length, posts: posts.length, warning });
  console.log(`Registered ${merged.length} sources; captured ${posts.length} accessible Serenity post summaries.`);
}

async function initObsidian() {
  const sources = await seedSourceRegistry();
  const result = await initializeKnowledgebase(sources);
  await appendJsonl("runs/obsidian.jsonl", { type: "init-obsidian", at: new Date().toISOString(), root: result.root, files: result.files.length });
  console.log(`Initialized Obsidian knowledgebase: ${result.root}`);
}

async function writeResearchArtifacts(run: ScreenRun, watchlist: WatchlistEntry[]) {
  const evidencePath = path.resolve("data/evidence", `${run.runId}.json`);
  const graphPath = path.resolve("data/graphs", `${run.runId}.json`);
  await writeJsonFile(
    evidencePath,
    run.candidates.map((candidate) => ({
      code: candidate.stock.code,
      name: candidate.stock.name,
      evidence: candidate.trace.structuredEvidence ?? [],
      nextActions: candidate.trace.nextActions ?? [],
    })),
  );
  await writeJsonFile(
    graphPath,
    run.candidates.map((candidate) => ({
      code: candidate.stock.code,
      name: candidate.stock.name,
      graph: candidate.trace.graph,
    })),
  );
  return { evidencePath, graphPath, watchlistPath: path.resolve("data/watchlist.json"), watchlistCount: watchlist.length };
}

async function notifyFeishu(title: string, content: string): Promise<boolean> {
  // Notification is best-effort: a delivery failure must never crash the research
  // pipeline (artifacts are already written by the time this runs). Each channel is
  // tried in priority order and failures fall through with a loud warning.
  const config = getConfig();
  if (config.feishuWebhookUrl) {
    try {
      await sendFeishuMarkdown(config.feishuWebhookUrl, title, content);
      return true;
    } catch (error) {
      console.warn(`Feishu webhook notify failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (config.feishuAppId && config.feishuAppSecret && config.feishuNotifyOpenId) {
    try {
      await sendFeishuOpenIdText({
        appId: config.feishuAppId,
        appSecret: config.feishuAppSecret,
        openId: config.feishuNotifyOpenId,
        text: `${title}\n\n${content}`,
      });
      return true;
    } catch (error) {
      console.warn(`Feishu open-id notify failed (check FEISHU_NOTIFY_OPEN_ID belongs to FEISHU_APP_ID): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (config.feishuAppId && config.feishuAppSecret && config.feishuNotifyChatId) {
    try {
      await sendFeishuChatText({
        appId: config.feishuAppId,
        appSecret: config.feishuAppSecret,
        chatId: config.feishuNotifyChatId,
        text: `${title}\n\n${content}`,
      });
      return true;
    } catch (error) {
      console.warn(`Feishu chat notify failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return false;
}

async function notifyFeishuReport(title: string, content: string): Promise<boolean> {
  const config = getConfig();
  const receiveId = config.feishuReportNotifyReceiveId ?? config.feishuReportNotifyOpenId;
  const receiveIdType = config.feishuReportNotifyReceiveId ? config.feishuReportNotifyReceiveIdType : "open_id";
  if (config.feishuReportAppId && config.feishuReportAppSecret && receiveId) {
    await sendFeishuTextByReceiveId({
      appId: config.feishuReportAppId,
      appSecret: config.feishuReportAppSecret,
      receiveId,
      receiveIdType,
      text: `${title}\n\n${content}`,
    });
    return true;
  }
  return false;
}

function renderFfdWebhookPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return String(payload ?? "");
  const data = payload as Record<string, any>;
  if (data.msg_type === "text" && data.content?.text) return String(data.content.text);
  if (data.msg_type === "interactive" && data.card) {
    const header = data.card?.header?.title?.content;
    const elements = Array.isArray(data.card?.elements)
      ? data.card.elements
          .map((element: any) => element?.content ?? element?.text?.content ?? element?.fields?.map((field: any) => field?.text?.content).join("\n"))
          .filter(Boolean)
      : [];
    return [header, ...elements].filter(Boolean).join("\n\n");
  }
  if (data.msg_type === "post" && data.content?.post) {
    const locale = data.content.post.zh_cn ?? data.content.post.en_us ?? Object.values(data.content.post)[0];
    const title = locale?.title;
    const lines = Array.isArray(locale?.content)
      ? locale.content
          .flat()
          .map((part: any) => part?.text ?? part?.href ?? part?.user_name)
          .filter(Boolean)
      : [];
    return [title, ...lines].filter(Boolean).join("\n");
  }
  return JSON.stringify(payload, null, 2).slice(0, 12000);
}

async function runFfdHealth(): Promise<string> {
  const result = await callFfdTool("ffd_health", {});
  return renderFfdToolResultWithStatus(result);
}

async function runFfdNaturalQuery(query: string): Promise<string> {
  if (!query.trim()) return "Usage: /ffd <query>";
  const result = await callFfdTool("ffd_nl_query", { query, format: "markdown" });
  return renderFfdToolResultWithStatus(result);
}

async function runFfdIndustrySignal(query: string): Promise<string> {
  if (!query.trim()) return "Usage: /ffd-industry <industry-or-question>";
  const result = await callFfdTool("ffd_industry_signal", { query, market: "stock", format: "markdown" });
  return renderFfdToolResultWithStatus(result);
}

async function runFfdResearchSearch(query: string): Promise<string> {
  if (!query.trim()) return "Usage: /ffd-research <keyword>";
  const result = await callFfdTool("ffd_research_search", { q: query, format: "markdown" });
  return renderFfdToolResultWithStatus(result);
}

async function runFfdNewsSearch(query: string): Promise<string> {
  if (!query.trim()) return "Usage: /ffd-news <keyword>";
  const result = await callFfdTool("ffd_news_search", { q: query, format: "markdown" });
  return renderFfdToolResultWithStatus(result);
}

async function runFfdSmokeCommand(): Promise<string> {
  const run = await runFfdSmoke();
  await writeJsonFile("runs/ffd-smoke-latest.json", run);
  await appendJsonl("runs/ffd-smoke.jsonl", { type: "ffd-smoke", at: run.generatedAt, ok: run.ok, statuses: run.results.map((item) => ({ id: item.id, status: item.status, ok: item.ok })) });
  return renderFfdSmoke(run);
}

async function archiveFfdSignalCommand(input: string): Promise<string> {
  const [modeRaw = "", ...rest] = input.trim().split(/\s+/);
  const query = rest.join(" ").trim();
  if (!modeRaw || !query) return `Usage: /ffd-signal <${FFD_SIGNAL_MODES.join("|")}> <query>`;
  if (!FFD_SIGNAL_MODES.includes(modeRaw as FfdSignalMode)) return `Unsupported mode: ${modeRaw}. Use one of: ${FFD_SIGNAL_MODES.join(", ")}`;
  const result = await archiveFfdSignal({ mode: modeRaw as FfdSignalMode, query });
  await appendJsonl("runs/ffd-signal.jsonl", {
    type: "ffd-signal",
    at: result.generatedAt,
    mode: result.mode,
    toolName: result.toolName,
    query: result.query,
    status: result.status,
    notePath: result.notePath,
  });
  return renderFfdSignalArchive(result);
}

async function setFfdApiKeyCommand(): Promise<string> {
  const apiKey = process.env.FFD_API_KEY?.trim();
  if (!apiKey) {
    return "Usage: FFD_API_KEY='<new key>' npm run ffd:set-key\nThe key is read from the environment and is never printed.";
  }
  if (!/^ffd-[A-Za-z0-9_-]+$/.test(apiKey)) {
    return "Refusing to write FFD_API_KEY because it does not look like an FFD API key.";
  }
  const configPath = path.join(os.homedir(), ".ffd", "mcp-config.json");
  const existing = await readJsonFile<any>(configPath, {});
  const ffdServer = existing?.mcpServers?.ffd ?? {
    command: "python3",
    args: [path.join(os.homedir(), ".ffd", "ffd_mcp_server.py")],
    env: { FFD_API_BASE: "https://ffd.findesk.cn/api" },
  };
  const updated = {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers ?? {}),
      ffd: {
        ...ffdServer,
        env: {
          ...(ffdServer.env ?? {}),
          FFD_API_BASE: ffdServer.env?.FFD_API_BASE ?? "https://ffd.findesk.cn/api",
          FFD_API_KEY: apiKey,
        },
      },
    },
  };
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await writeJsonFile(configPath, updated);
  return `Updated ${configPath} with a redacted FFD API key. Run npm run doctor to verify ffd-data-plane.`;
}

function renderFfdReportLibraryRun(run: FfdReportLibraryRun): string {
  return [
    "FFD report conversion completed.",
    `Raw dir: ${run.rawDir}`,
    `Processed dir: ${run.processedDir}`,
    run.obsidianRoot ? `Obsidian root: ${run.obsidianRoot}` : undefined,
    `Processed: ${run.processed.length}`,
    `Skipped: ${run.skipped.length}`,
    run.warnings.length > 0 ? `Warnings:\n${run.warnings.map((warning) => `- ${warning}`).join("\n")}` : undefined,
    "",
    renderFfdReportReview(run.processed.length > 0 ? run.processed : run.skipped, 8),
  ]
    .filter((line): line is string => line != null)
    .join("\n");
}

function renderFfdReportEnhanceRun(run: FfdReportLibraryRun): string {
  return [
    "FFD report high-quality enhancement completed.",
    `Raw dir: ${run.rawDir}`,
    `Processed dir: ${run.processedDir}`,
    run.obsidianRoot ? `Obsidian root: ${run.obsidianRoot}` : undefined,
    `Enhanced: ${run.processed.length}`,
    `Skipped: ${run.skipped.length}`,
    run.warnings.length > 0 ? `Warnings:\n${run.warnings.map((warning) => `- ${warning}`).join("\n")}` : undefined,
    "",
    renderFfdReportReview(run.processed.length > 0 ? run.processed : run.skipped, 8),
  ]
    .filter((line): line is string => line != null)
    .join("\n");
}


// Event-driven embedding refresh: whenever the accepted corpus changes (conversion or
// acceptance), incrementally refresh the vector index if Ollama is up. Best-effort —
// retrieval degrades to lexical-only when the index is stale or missing, never fails.
async function refreshLibraryEmbeddingsBestEffort(context: string): Promise<void> {
  try {
    if (!(await isOllamaAvailable())) {
      console.warn(`library embedding refresh skipped (${context}): Ollama not running; retrieval stays lexical until npm run library:embed.`);
      return;
    }
    const stats = await buildEmbeddingIndex(createOllamaEmbeddingClient());
    console.log(`library embeddings refreshed (${context}): +${stats.embedded} embedded, ${stats.reused} reused, ${stats.pruned} pruned.`);
  } catch (error) {
    console.warn(`library embedding refresh failed (${context}): ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function convertFfdReports(): Promise<string> {
  const result = await processFfdReportLibrary();
  await appendJsonl("runs/ffd-report-library.jsonl", {
    type: "convert",
    at: new Date().toISOString(),
    rawDir: result.rawDir,
    processedDir: result.processedDir,
    processed: result.processed.length,
    skipped: result.skipped.length,
    warnings: result.warnings,
  });
  if (result.processed.length > 0) {
    await refreshLibraryEmbeddingsBestEffort("convert");
    await notifyFeishuReport("FFD研报库新增研报", renderFfdReportReview(result.processed, 8));
  }
  return renderFfdReportLibraryRun(result);
}

async function reviewFfdReports(): Promise<string> {
  return renderFfdReportReview(await listFfdReportManifests());
}

async function enhanceFfdReportsCommand(input: string): Promise<string> {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  const includeAll = parts.includes("--all");
  const includeFailed = parts.includes("--failed");
  const reportIds = parts.filter((part) => !part.startsWith("--"));
  const result = await enhanceFfdReports({ reportIds, includeAll, includeFailed });
  await appendJsonl("runs/ffd-report-library.jsonl", {
    type: "enhance",
    at: new Date().toISOString(),
    reportIds: result.processed.map((manifest) => manifest.id),
    processed: result.processed.length,
    warnings: result.warnings,
  });
  return renderFfdReportEnhanceRun(result);
}

async function acceptFfdReportCommand(input: string): Promise<string> {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  const bypassQualityGate = parts.includes("--force");
  const reportId = parts.find((part) => part !== "--force") ?? "";
  if (!reportId) return "Usage: /reports-accept [--force] <report-id>";
  const result = await acceptFfdReport(reportId, { bypassQualityGate });
  const merged = mergeSources(await loadSourceRegistry(), [result.source]);
  await saveSourceRegistry(merged);
  await syncKnowledgebaseSources(merged);
  await appendJsonl("runs/ffd-report-library.jsonl", {
    type: "accept",
    at: new Date().toISOString(),
    reportId: result.manifest.id,
    sourceId: result.source.id,
    bypassQualityGate,
  });
  return [`Accepted ${result.manifest.id}`, `Source: ${result.source.id}`, `Quality gate: ${result.manifest.quality?.canAccept ? "pass" : "bypassed"}`, `Obsidian: ${result.manifest.obsidianAcceptedPath ?? "n/a"}`].join("\n");
}

async function acceptQualityFfdReportsCommand(): Promise<string> {
  const targets = (await listFfdReportManifests()).filter((manifest) => manifest.status !== "accepted" && qualityForManifest(manifest).canAccept);
  if (targets.length === 0) return "No quality-gate-passing staged FFD reports to accept.";

  const accepted = [];
  for (const manifest of targets) {
    accepted.push(await acceptFfdReport(manifest.id));
  }
  const merged = mergeSources(await loadSourceRegistry(), accepted.map((item) => item.source));
  await saveSourceRegistry(merged);
  await syncKnowledgebaseSources(merged);
  await refreshLibraryEmbeddingsBestEffort("accept-quality");
  await appendJsonl("runs/ffd-report-library.jsonl", {
    type: "accept-quality",
    at: new Date().toISOString(),
    reportIds: accepted.map((item) => item.manifest.id),
    sourceIds: accepted.map((item) => item.source.id),
  });

  return [
    `Accepted ${accepted.length} quality-gate-passing FFD reports.`,
    ...accepted.map((item) => `- ${item.manifest.id} -> ${item.source.id}`),
  ].join("\n");
}

async function organizeFfdObsidianCommand(): Promise<string> {
  const result = await organizeFfdObsidianKnowledgebase();
  await appendJsonl("runs/ffd-report-library.jsonl", {
    type: "organize-obsidian",
    at: new Date().toISOString(),
    acceptedReports: result.acceptedReports,
    updatedReportNotes: result.updatedReportNotes,
    indexFiles: result.indexFiles,
  });
  return renderFfdObsidianOrganizationRun(result);
}

async function rejectFfdReportCommand(reportId: string): Promise<string> {
  if (!reportId.trim()) return "Usage: /reports-reject <report-id>";
  const manifest = await rejectFfdReport(reportId.trim());
  await appendJsonl("runs/ffd-report-library.jsonl", {
    type: "reject",
    at: new Date().toISOString(),
    reportId: manifest.id,
  });
  return `Rejected ${manifest.id}`;
}

function shouldRouteDirectlyToFfd(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^\/\w+/.test(trimmed)) return false;
  return /(最新价|现价|涨跌幅|成交量|成交额|实时快照|实时|现在|行情快照|当前价格|盘口|资金流向|北向资金|主力资金|分时|日内|分钟行情|技术指标|RSI|MACD|均线|支撑位|阻力位|行业景气|景气度|产业指标|公告|财务指标|估值分位|新闻快讯)/i.test(trimmed);
}

// Record passed-over / killed / downgraded theses so hit-rate is not survivor-only.
async function updateGraveyard(run: ScreenRun, watchlist: WatchlistEntry[], matched: Candidate[]): Promise<GraveyardEntry[]> {
  const now = run.generatedAt;
  const pinnedCriteria = new Map(watchlist.map((entry) => [entry.code, entry.killCriteria ?? []]));
  const additions: GraveyardEntry[] = [];

  for (const candidate of run.candidates) {
    const criteria = pinnedCriteria.get(candidate.stock.code) ?? candidate.trace.killCriteria ?? [];
    if (criteria.length === 0) continue;
    const evaluation = evaluateKillCriteria(
      criteria,
      {
        hasCandidateP0: evidenceHasCandidateP0(candidate.trace.structuredEvidence ?? []),
        activeNegativeSignals: candidate.trace.negativeSignals ?? [],
      },
      now,
    );
    if (evaluation.fired.length > 0) additions.push(buryKilled(candidate, evaluation.fired, now));
  }

  // Passed-over: matched candidates that scored below the topN cut are the most common
  // survivorship-bias source; bury them so base rates are not survivor-only.
  const cutScore = run.candidates.length > 0 ? Math.min(...run.candidates.map((candidate) => candidate.score)) : 0;
  additions.push(...buryBelowBar(matched, cutScore, now));

  for (const entry of watchlist) {
    if (entry.status === "downgraded" || entry.status === "archived") additions.push(buryDowngraded(entry, now));
  }

  const resolutions = await loadResolutions();
  const merged = attachGraveyardOutcomes(mergeGraveyard(await loadGraveyard(), additions), resolutions);
  await saveGraveyard(merged);
  return merged;
}

async function runScreenPipeline(sendNotification = true) {
  const config = getConfig();
  let sources = mergeSources(await seedSourceRegistry(), [EASTMONEY_SOURCE]);
  await saveSourceRegistry(sources);
  let matched: Candidate[] = [];
  const collectMatched = (candidates: Candidate[]) => {
    matched = candidates;
  };
  const bearCases = await loadBearCases();
  const graveyardContext = await loadGraveyard();
  const preliminaryRun = await screenCandidates(sources, { maxRows: config.aShareMaxRows, topN: config.aShareTopN, bearCases, graveyard: graveyardContext, onMatched: collectMatched });
  const cninfo = await fetchCninfoAnnualReportSourcesForCandidates(preliminaryRun.candidates.slice(0, Math.min(8, preliminaryRun.candidates.length)));
  if (cninfo.warnings.length > 0) {
    for (const warning of cninfo.warnings) console.warn(`CNINFO P0 fetch warning: ${warning}`);
  }
  if (cninfo.sources.length > 0) {
    sources = mergeSources(sources, cninfo.sources);
    await saveSourceRegistry(sources);
  }
  const run =
    cninfo.sources.length > 0
      ? await screenCandidates(sources, { maxRows: config.aShareMaxRows, topN: config.aShareTopN, bearCases, graveyard: graveyardContext, onMatched: collectMatched })
      : preliminaryRun;
  const completed = await writeScreenReport(run);
  const watchlist = updateWatchlistFromRun(completed, await loadWatchlist());
  await saveWatchlist(watchlist);
  const graveyard = await updateGraveyard(completed, watchlist, matched);
  const graveyardSummary = summarizeGraveyard(graveyard);
  const decisionLog = await loadDecisionLog();
  const pendingDecisions = pendingEntriesFromRun(completed, decisionLog);
  if (pendingDecisions.length > 0) await saveDecisionLog([...decisionLog, ...pendingDecisions]);
  const artifacts = await writeResearchArtifacts(completed, watchlist);
  await appendJsonl("runs/screen.jsonl", {
    type: "screen",
    at: new Date().toISOString(),
    runId: completed.runId,
    candidates: completed.candidates.length,
    cninfoP0Sources: cninfo.sources.length,
    cninfoWarnings: cninfo.warnings,
    graveyard: { total: graveyardSummary.total, resolved: graveyardSummary.resolvedWithOutcome, buriedHitRate: graveyardSummary.buriedHitRate },
    artifacts,
  });
  if (sendNotification && (await notifyFeishu("A股产业瓶颈筛选", renderFeishuSummary(completed)))) {
    console.log("Sent Feishu notification.");
  }
  return { run: completed, watchlist, graveyard: graveyardSummary, artifacts };
}

async function screen() {
  const result = await runScreenPipeline(true);
  console.log(`Wrote report: ${result.run.reportPath}`);
  console.log(`Updated watchlist: ${result.artifacts.watchlistPath}`);
  console.log(`Wrote evidence snapshot: ${result.artifacts.evidencePath}`);
  console.log(`Wrote graph snapshot: ${result.artifacts.graphPath}`);
  console.log(renderGraveyardSummary(result.graveyard));
}

async function dailyRun() {
  await ingestSerenity();
  await screen();
  const doctorReport = await diagnoseRuntime();
  await appendJsonl("runs/doctor.jsonl", {
    type: "doctor",
    at: new Date().toISOString(),
    ok: doctorReport.ok,
    checks: doctorReport.checks,
  });
  console.log(renderDoctorReport(doctorReport));
  if (!doctorReport.ok) process.exitCode = 1;
}

async function researchRefresh() {
  await ingestSerenity();
  const { run, watchlist, artifacts } = await runScreenPipeline(true);
  const calibration = await buildCalibrationSnapshot();
  await writeCalibrationSnapshot(calibration);
  const evals = runAnswerSafetyEvals(TRADING_AGENT_SYSTEM_PROMPT);
  await writeJsonFile("runs/answer-safety-evals-latest.json", evals);
  const sycophancyEvals = runSycophancyPromptEvals(TRADING_AGENT_SYSTEM_PROMPT);
  await writeJsonFile("runs/sycophancy-evals-latest.json", sycophancyEvals);
  const completeness = evaluateCompleteness(run);
  await writeJsonFile("runs/completeness-latest.json", completeness);
  const doctorReport = await diagnoseRuntime();
  await writeJsonFile(`runs/doctor-${run.runId}.json`, doctorReport);
  await appendJsonl("runs/research-refresh.jsonl", {
    type: "research-refresh",
    at: new Date().toISOString(),
    runId: run.runId,
    candidates: run.candidates.length,
    watchlist: watchlist.length,
    artifacts,
    calibration: { reportsAnalyzed: calibration.reportsAnalyzed, candidatesAnalyzed: calibration.candidatesAnalyzed },
    evalsPassed: evals.filter((item) => item.passed).length,
    evalsTotal: evals.length,
    sycophancyPassed: sycophancyEvals.filter((item) => item.passed).length,
    sycophancyTotal: sycophancyEvals.length,
    doctorOk: doctorReport.ok,
  });
  console.log(`Research refresh completed: ${run.runId}`);
  console.log(`Watchlist entries: ${watchlist.length}`);
  console.log(renderCalibrationSnapshot(calibration));
  console.log(renderAnswerSafetyEvals(evals));
  console.log(renderSycophancyEvals(sycophancyEvals));
  console.log(renderCompleteness(completeness));
  console.log(renderDoctorReport(doctorReport));
  if (!doctorReport.ok || evals.some((item) => !item.passed) || sycophancyEvals.some((item) => !item.passed)) process.exitCode = 1;
}


async function runBearForCode(query: string): Promise<{ text: string; ok: boolean }> {
  const latest = await findLatestRun();
  if (!latest) return { text: "No screen run found. Run `npm run screen` first.", ok: false };
  const candidate = latest.candidates.find((item) => item.stock.code === query || item.stock.name.includes(query));
  if (!candidate) return { text: `Candidate ${query} not found in latest run ${latest.runId}.`, ok: false };
  const client = createDeepSeekClient();
  const record = await runBearCasePass(candidate, client, { runId: latest.runId });
  await saveBearCase(record);
  const verdict = synthesizeVerdict(candidate, record.report);
  const lines = [renderBearCase(record), "", renderVerdict(verdict)];
  if (record.report != null) {
    const watchlist = await loadWatchlist();
    const entry = watchlist.find((item) => item.code === candidate.stock.code);
    if (entry) {
      const extra = bearKillCriteria(record, record.generatedAt);
      const existingIds = new Set((entry.killCriteria ?? []).map((item) => item.id));
      const merged = [...(entry.killCriteria ?? []), ...extra.filter((item) => !existingIds.has(item.id))];
      const updated = watchlist.map((item) => (item.code === entry.code ? { ...item, killCriteria: merged } : item));
      await saveWatchlist(updated);
      lines.push("", `Registered ${extra.filter((item) => !existingIds.has(item.id)).length} bear-derived kill criteria on watchlist entry ${entry.code}.`);
    }
  }
  return { text: lines.join("\n"), ok: record.status === "completed" };
}

async function researchBear(codeArg?: string) {
  const code = (codeArg ?? process.argv[3] ?? "").trim();
  if (!code) {
    console.error("Usage: npm run research:bear -- <stock code>");
    process.exitCode = 1;
    return;
  }
  const result = await runBearForCode(code);
  console.log(result.text);
  if (!result.ok) process.exitCode = 1;
}

async function portfolioReview(): Promise<string> {
  const { portfolio, errors } = await loadPortfolio();
  if (!portfolio) {
    return [`持仓文件校验失败（${PORTFOLIO_PATH}）：`, ...errors.map((error) => `- ${error}`)].join("\n");
  }
  const [latestRun, watchlist, bearCases, graveyard] = await Promise.all([
    findLatestRun(),
    loadWatchlist(),
    loadBearCases(),
    loadGraveyard(),
  ]);
  const report = buildPositionOverlay({ portfolio, latestRun, watchlist, bearCases, graveyard });
  await writeJsonFile("runs/position-overlay-latest.json", report);
  return renderPositionOverlay(report);
}


async function resolutionsUpdate() {
  const watchlist = await loadWatchlist();
  const now = new Date().toISOString();
  const inputs = buildResolutionInputsFromWatchlist(watchlist, now);
  if (inputs.length === 0) {
    console.log("No watchlist entries have completed their resolution horizon yet.");
    return;
  }
  const existing = await loadResolutions();
  const resolvedCodes = new Set(existing.map((item) => `${item.code}:${item.entryDate.slice(0, 10)}`));
  const dueInputs = inputs.filter((input) => !resolvedCodes.has(`${input.code}:${input.entryDate.slice(0, 10)}`));
  if (dueInputs.length === 0) {
    console.log(`All ${inputs.length} due entries already resolved.`);
    return;
  }
  console.log(`Resolving ${dueInputs.length} due theses via FFD quote history...`);
  const fresh = await resolveCandidates(dueInputs, createFfdPriceReturnProvider(), { now });
  const merged = [...existing, ...fresh];
  await saveResolutions(merged);
  console.log(`Resolved ${fresh.length}/${dueInputs.length} (skipped entries stay unresolved; no fabricated data).`);
  console.log(`Total resolutions on ledger: ${merged.length}. Run npm run calibration to refresh Brier/slices.`);
}


async function librarySearchCommand(queryArg?: string) {
  const query = (queryArg ?? process.argv.slice(3).join(" ")).trim();
  if (!query) {
    console.error("Usage: npm run library:search -- <关键词>");
    process.exitCode = 1;
    return;
  }
  console.log(renderHybridResults(query, await hybridSearchReportLibrary(query)));
}

async function libraryEmbedCommand() {
  if (!(await isOllamaAvailable())) {
    console.error("Ollama 未运行：先启动 Ollama（并确认已 pull bge-m3），再运行 npm run library:embed。");
    process.exitCode = 1;
    return;
  }
  const client = createOllamaEmbeddingClient();
  console.log(`Building embedding index via ${client.label}...`);
  const stats = await buildEmbeddingIndex(client);
  console.log(
    `Embedding index: ${stats.totalChunks} chunks total — embedded ${stats.embedded}, reused ${stats.reused}, pruned ${stats.pruned} (model ${stats.model}).`,
  );
}


async function libraryEvalCommand() {
  const cases = await loadRetrievalEvalCases();
  const summaries = [];
  summaries.push(
    await runRetrievalEval(cases, (query) => hybridSearchReportLibrary(query, { topK: 12 }, { embeddingIndex: null }), "lexical-only"),
  );
  if (await isOllamaAvailable()) {
    summaries.push(await runRetrievalEval(cases, (query) => hybridSearchReportLibrary(query, { topK: 12 }), "hybrid"));
  } else {
    console.warn("Ollama 未运行:跳过 hybrid 模式评测。");
  }
  const rendered = renderRetrievalEval(summaries);
  await writeJsonFile("runs/library-retrieval-eval-latest.json", summaries);
  console.log(rendered);
}

async function harness() {
  const result = await runHarness();
  for (const item of result.checks) {
    console.log(`${item.ok ? "✓" : "✗"} ${item.name}: ${item.detail}`);
  }
  if (!result.ok) process.exitCode = 1;
}

async function doctor() {
  const report = await diagnoseRuntime();
  console.log(renderDoctorReport(report));
  if (!report.ok) process.exitCode = 1;
}

async function showAgent() {
  const { metadata } = createTradingAgent();
  console.log(JSON.stringify(metadata, null, 2));
}

async function showWatchlist() {
  console.log(renderWatchlistSummary(await loadWatchlist()));
}

async function sycophancySliceReport(): Promise<string | null> {
  const { portfolio } = await loadPortfolio();
  if (!portfolio || portfolio.positions.length === 0) return null;
  const resolutions = await loadResolutions();
  const report = computeSycophancySlices(resolutions, new Set(portfolio.positions.map((position) => position.code)));
  await writeJsonFile("runs/sycophancy-slice-latest.json", report);
  return renderSycophancySlices(report);
}

async function calibration() {
  const snapshot = await buildCalibrationSnapshot();
  await writeCalibrationSnapshot(snapshot);
  console.log(renderCalibrationSnapshot(snapshot));
  const resolutions = await loadResolutions();
  const decisionLog = await loadDecisionLog();
  const { entries, resolvedCount } = resolveDecisionEntries(decisionLog, resolutions);
  if (resolvedCount > 0) await saveDecisionLog(entries);
  const decisionSummary = summarizeDecisionLog(entries);
  console.log(
    `Decision log: total=${decisionSummary.total} pending=${decisionSummary.pending} resolved=${decisionSummary.resolved}` +
      (decisionSummary.validatedRate != null ? ` validated-rate=${(decisionSummary.validatedRate * 100).toFixed(1)}%` : ""),
  );
  const slice = await sycophancySliceReport();
  if (slice) console.log(`\n${slice}`);
  const graveyardEntries = await loadGraveyard();
  let arms: ThemeArmState[] = initialArms(DEFAULT_THEMES.map((theme) => theme.id));
  const themeLabelToId = new Map(DEFAULT_THEMES.map((theme) => [theme.label, theme.id]));
  for (const entry of graveyardEntries) {
    if (entry.outcomeLabel !== "validated" && entry.outcomeLabel !== "falsified") continue;
    for (const label of entry.matchedThemes) {
      const themeId = themeLabelToId.get(label);
      if (themeId) arms = updateArm(arms, themeId, entry.outcomeLabel === "validated" ? 1 : 0);
    }
  }
  const rng = createRng(resolutions.length * 7919 + graveyardEntries.length + 1);
  const suggested = pickNextTheme(arms, rng);
  const suggestedLabel = DEFAULT_THEMES.find((theme) => theme.id === suggested)?.label ?? suggested;
  console.log(`研究预算建议（Thompson 采样，防主题自选择）：下一轮优先复核主题「${suggestedLabel}」；冷门主题保有探索保底概率。`);
}

async function resolutionsReport(): Promise<string> {
  const resolutions = await loadResolutions();
  return renderResolutionCalibration(buildResolutionCalibration(resolutions));
}

async function graveyardReport(): Promise<string> {
  const resolutions = await loadResolutions();
  const graveyard = attachGraveyardOutcomes(await loadGraveyard(), resolutions);
  const summary = summarizeGraveyard(graveyard);
  const combined = combinedBaseRate(resolutions, graveyard);
  const survivorship =
    combined.hitRate == null
      ? "无已兑现结果，暂无法计算命中率（先跑 resolution 回填 forward alpha）。"
      : `幸存者命中率 ${(combined.survivorsOnlyHitRate ?? 0).toFixed(2)} vs 全样本(含墓地) ${combined.hitRate.toFixed(2)}（n=${combined.n}）— 差值即幸存者偏差膨胀。`;
  return `${renderGraveyardSummary(summary)}\n${survivorship}`;
}

async function evals() {
  const results = runAnswerSafetyEvals(TRADING_AGENT_SYSTEM_PROMPT);
  await writeJsonFile("runs/answer-safety-evals-latest.json", results);
  const sycophancy = runSycophancyPromptEvals(TRADING_AGENT_SYSTEM_PROMPT);
  await writeJsonFile("runs/sycophancy-evals-latest.json", sycophancy);
  console.log(renderAnswerSafetyEvals(results));
  console.log(renderSycophancyEvals(sycophancy));
  if (results.some((item) => !item.passed) || sycophancy.some((item) => !item.passed)) process.exitCode = 1;
}

function renderQuantBacktestInputHelp(inputPath: string): string {
  return [
    `Backtest input not found: ${inputPath}`,
    "",
    "Create a JSON file with this shape, then run:",
    `npm run quant:backtest -- ${inputPath}`,
    "",
    JSON.stringify(
      {
        options: {
          portfolioSize: 20,
          maxIndustryWeight: 0.35,
          transactionCostBps: 15,
          slippageBps: 10,
          periodsPerYear: 52,
        },
        snapshots: [
          {
            date: "2026-01-02",
            benchmarkReturn: 0.01,
            candidates: [
              {
                code: "688001",
                name: "示例公司",
                industry: "AI算力",
                score: 82,
                bucket: "core",
                evidenceGate: "pass",
                forwardReturn: 0.035,
                tradable: true,
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
  ].join("\n");
}

async function quantBacktestCommand(inputPath = "data/quant/backtest-input.json"): Promise<string> {
  const payload = await readJsonFile<unknown | null>(inputPath, null);
  if (payload == null) return renderQuantBacktestInputHelp(inputPath);
  const snapshots = (Array.isArray(payload) ? payload : (payload as { snapshots?: unknown }).snapshots) as QuantBacktestSnapshot[] | undefined;
  const options = (Array.isArray(payload) ? {} : ((payload as { options?: QuantBacktestOptions }).options ?? {})) as QuantBacktestOptions;
  if (!Array.isArray(snapshots)) return "Invalid quant backtest input: expected an array of snapshots or an object with { snapshots, options }.";
  const result = runQuantBacktest(snapshots, options);
  await writeJsonFile("runs/quant-backtest-latest.json", result);
  await appendJsonl("runs/quant-backtest.jsonl", {
    type: "quant-backtest",
    at: result.generatedAt,
    inputPath,
    periods: result.metrics.periods,
    totalReturn: result.metrics.totalReturn,
    benchmarkTotalReturn: result.metrics.benchmarkTotalReturn,
    maxDrawdown: result.metrics.maxDrawdown,
    avgTurnover: result.metrics.avgTurnover,
  });
  return `${renderQuantBacktestReport(result)}\n\nWrote runs/quant-backtest-latest.json`;
}

function parseFlagArgs(args: string[]): { flags: Record<string, string | boolean>; positional: string[] } {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey.trim();
    if (!key) continue;
    if (inlineValue != null) {
      flags[key] = inlineValue;
      continue;
    }
    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { flags, positional };
}

function flagString(flags: Record<string, string | boolean>, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function flagNumber(flags: Record<string, string | boolean>, key: string): number | undefined {
  const value = flagString(flags, key);
  if (value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function renderQuantAdaptHistoryHelp(): string {
  return [
    "Usage: npm run quant:adapt-history -- --prices <csv-or-json-file-or-dir> [options]",
    "",
    "Options:",
    "--reports <dir>        Screen run directory, default reports",
    "--benchmark <path>     Benchmark CSV/JSON path, optional",
    "--benchmark-code <id>  Benchmark code when file contains multiple indices",
    "--output <path>        Output path, default data/quant/backtest-input.json",
    "--horizon <bars>       Holding-period bars, default 5",
    "--entry-lag <bars>     Entry lag after signal date, default 1; use 0 for close-after-close datasets",
    "--from <YYYY-MM-DD>    First signal date",
    "--to <YYYY-MM-DD>      Last signal date",
    "--max-candidates <n>   Max candidates per screen run, default 200",
    "--run                 Run quant-backtest immediately after writing input",
    "",
    "Price columns accept English or Chinese headers: code/date/open/close/adj_close/pct_change/tradable/suspended/limit_up/limit_down.",
  ].join("\n");
}

async function quantAdaptHistoryCommand(args: string[]): Promise<string> {
  const { flags } = parseFlagArgs(args);
  const pricePath = flagString(flags, "prices") ?? flagString(flags, "price");
  if (!pricePath) return renderQuantAdaptHistoryHelp();

  const reportDir = flagString(flags, "reports") ?? "reports";
  const outputPath = flagString(flags, "output") ?? "data/quant/backtest-input.json";
  const benchmarkPath = flagString(flags, "benchmark");
  const adapterOptions: QuantHistoryAdapterOptions = {
    horizonBars: flagNumber(flags, "horizon"),
    entryLagBars: flagNumber(flags, "entry-lag"),
    dateFrom: flagString(flags, "from"),
    dateTo: flagString(flags, "to"),
    maxCandidatesPerRun: flagNumber(flags, "max-candidates"),
    benchmarkCode: flagString(flags, "benchmark-code"),
  };

  const [screenRuns, priceBars, benchmarkBars] = await Promise.all([
    loadScreenRunsFromDirectory(reportDir),
    loadHistoricalPriceBarsFromPath(pricePath),
    benchmarkPath ? loadHistoricalPriceBarsFromPath(benchmarkPath) : Promise.resolve({ bars: [], files: [], warnings: [] }),
  ]);
  const adapted = adaptScreenRunsToBacktestInput(screenRuns.runs, priceBars.bars, adapterOptions, benchmarkBars.bars);
  const backtestInput = buildQuantBacktestInputFile(adapted, {}, {
    reports: screenRuns.files,
    prices: priceBars.files,
    benchmark: benchmarkBars.files,
  });
  backtestInput.adapter.warnings = [...screenRuns.warnings, ...priceBars.warnings, ...benchmarkBars.warnings, ...backtestInput.adapter.warnings];
  await writeJsonFile(outputPath, backtestInput);
  await appendJsonl("runs/quant-history-adapter.jsonl", {
    type: "quant-history-adapter",
    at: adapted.generatedAt,
    outputPath,
    coverage: adapted.coverage,
    warnings: backtestInput.adapter.warnings.length,
  });

  if (flags.run === true) {
    const result = runQuantBacktest(backtestInput.snapshots, backtestInput.options);
    await writeJsonFile("runs/quant-backtest-latest.json", result);
    return `${renderQuantHistoryAdapterReport({ ...adapted, warnings: backtestInput.adapter.warnings }, outputPath)}\n\n${renderQuantBacktestReport(result)}\n\nWrote runs/quant-backtest-latest.json`;
  }

  return renderQuantHistoryAdapterReport({ ...adapted, warnings: backtestInput.adapter.warnings }, outputPath);
}

async function feishuServer() {
  const config = getConfig();
  const tradingFeishuRouter = createHermesTradingFeishuRouter({
    directFfdQuery: runFfdNaturalQuery,
    shouldRouteDirectlyToFfd,
  });

  async function runFeishuText(text: string, sessionId: string) {
    const [command = "", ...rest] = text.trim().split(/\s+/);
    const arg = rest.join(" ");
    const routed = await tradingFeishuRouter.handleAgentCommand(command, arg, sessionId);
    if (routed !== undefined) return routed;
    switch (command.toLowerCase()) {
      case "/screen":
        await screen();
        return "Screening completed. Check reports/ and runs/.";
      case "/research-refresh":
        await researchRefresh();
        return "Research refresh completed. Check reports/, data/, and runs/.";
      case "/ffd-health":
        return runFfdHealth();
      case "/ffd":
        return runFfdNaturalQuery(arg);
      case "/ffd-industry":
        return runFfdIndustrySignal(arg);
      case "/ffd-research":
        return runFfdResearchSearch(arg);
      case "/ffd-news":
        return runFfdNewsSearch(arg);
      case "/ffd-smoke":
        return runFfdSmokeCommand();
      case "/ffd-signal":
        return archiveFfdSignalCommand(arg);
      case "/ffd-auto-rules":
        return renderFfdAutoDownloadGuide();
      case "/reports-convert":
        return convertFfdReports();
      case "/reports-enhance":
        return enhanceFfdReportsCommand(arg);
      case "/reports-review":
        return reviewFfdReports();
      case "/reports-accept":
        return acceptFfdReportCommand(arg);
      case "/reports-accept-quality":
        return acceptQualityFfdReportsCommand();
      case "/reports-organize-obsidian":
        return organizeFfdObsidianCommand();
      case "/reports-reject":
        return rejectFfdReportCommand(arg);
      case "/archive-obsidian":
      case "/obsidian-init":
        await initObsidian();
        return "Obsidian knowledgebase archived/refreshed by manual command.";
      case "/watchlist":
        return renderWatchlistSummary(await loadWatchlist());
      case "/calibration": {
        const snapshot = await buildCalibrationSnapshot();
        await writeCalibrationSnapshot(snapshot);
        const slice = await sycophancySliceReport();
        return slice ? [renderCalibrationSnapshot(snapshot), "", slice].join("\n") : renderCalibrationSnapshot(snapshot);
      }
      case "/resolutions":
        return resolutionsReport();
      case "/graveyard":
        return graveyardReport();
      case "/evals": {
        const results = runAnswerSafetyEvals(TRADING_AGENT_SYSTEM_PROMPT);
        await writeJsonFile("runs/answer-safety-evals-latest.json", results);
        const sycophancy = runSycophancyPromptEvals(TRADING_AGENT_SYSTEM_PROMPT);
        await writeJsonFile("runs/sycophancy-evals-latest.json", sycophancy);
        return [renderAnswerSafetyEvals(results), renderSycophancyEvals(sycophancy)].join("\n\n");
      }
      case "/quant-adapt-history":
        return quantAdaptHistoryCommand(arg.trim() ? arg.trim().split(/\s+/) : []);
      case "/quant-backtest":
        return quantBacktestCommand(arg.trim() || undefined);
      case "/board":
      case "/whiteboard":
        return runFeishuWhiteboardCommand(arg, sessionId);
      case "/sources": {
        const sources = await loadSourceRegistry();
        return sources.slice(0, 20).map((source) => `${source.id} [${source.tier}] ${source.title}`).join("\n");
      }
      case "/latest": {
        const run = await findLatestRun();
        return run ? renderFeishuSummary(run) : "No screen report JSON found under reports/. Run /screen first.";
      }
      case "/harness": {
        const result = await runHarness();
        return result.checks.map((item) => `${item.ok ? "✓" : "✗"} ${item.name}`).join("\n");
      }
      case "/why": {
        const run = await findLatestRun();
        if (!run) return "No screen report JSON found under reports/. Run /screen first.";
        if (!arg.trim()) return "Usage: /why <code-or-name>";
        return explainCandidate(run, arg);
      }
      case "/bear": {
        if (!arg.trim()) return "Usage: /bear <code-or-name>";
        return (await runBearForCode(arg.trim())).text;
      }
      case "/portfolio-review":
        return portfolioReview();
      case "/library": {
        if (!arg.trim()) return "Usage: /library <关键词> — 检索本地已入库研报";
        return renderHybridResults(arg.trim(), await hybridSearchReportLibrary(arg.trim()));
      }
      case "/methodology":
        return methodologySummary();
      case "/doctor":
        return renderDoctorReport(await diagnoseRuntime());
      default:
        return tradingFeishuRouter.ask(sessionId, text);
    }
  }

  async function runFeishuWhiteboardCommand(input: string, sessionId: string): Promise<string> {
    const trimmed = input.trim();
    const whiteboardToken = config.feishuWhiteboardToken?.trim();
    if (!trimmed) return renderFeishuWhiteboardHelp(Boolean(whiteboardToken));

    const suppliedMermaid = extractMermaidCode(trimmed);
    const mermaid = suppliedMermaid || extractMermaidCode(await tradingFeishuRouter.ask(`${sessionId}:whiteboard`, buildTradingWhiteboardPrompt(trimmed)));
    if (!mermaid) {
      return "Whiteboard generation failed: the model did not return a Mermaid diagram. Try /board with a more structured topic, or paste Mermaid directly after /board.";
    }

    if (!whiteboardToken) {
      return renderFeishuWhiteboardPreview(mermaid, "FEISHU_WHITEBOARD_TOKEN is not configured; returning a preview only.");
    }

    try {
      const result = await updateFeishuWhiteboardMermaid({
        whiteboardToken,
        mermaid,
        as: config.feishuWhiteboardAs,
        overwrite: config.feishuWhiteboardOverwrite,
        larkCliBin: config.larkCliBin,
        profile: config.larkCliProfile,
      });
      return [
        "Feishu whiteboard updated.",
        `Identity: ${result.as}`,
        `Mode: ${result.overwrite ? "overwrite" : "append"}`,
        "",
        "```mermaid",
        mermaid,
        "```",
      ].join("\n");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return renderFeishuWhiteboardPreview(
        mermaid,
        `Whiteboard Mermaid was generated, but writing to Feishu failed: ${message.replaceAll(whiteboardToken, "[REDACTED_WHITEBOARD_TOKEN]")}`,
      );
    }
  }

  function shouldHandleFeishuMessage(message: { chatId?: string; chatType?: string; senderOpenId?: string; mentionedBot: boolean; text: string }) {
    if (message.chatType !== "group") return true;
    if (config.feishuCommandSenderOpenId && message.senderOpenId !== config.feishuCommandSenderOpenId) return false;
    if (config.feishuNotifyChatId && message.chatId === config.feishuNotifyChatId) return true;
    const explicitCommand = message.text.trim().startsWith("/");
    return explicitCommand || message.mentionedBot;
  }

  const VISION_SYSTEM_PROMPT =
    "你是 Serenity A股产业研究助理。用户发来的图片多为 K线/行情截图、券商研报截图、产业链或财务图表。请用简体中文:① 客观读出图中关键信息(标的、数字、趋势、结构);② 给出专业解读(对A股投资或产业的含义);③ 标注不确定或需进一步核实之处。不要编造图中不存在的数据。";

  const DRAW_COMMANDS = new Set(["/draw", "/image", "/img", "/画图", "/生图", "/画"]);

  function redactForChat(text: string): string {
    return text
      .replace(/sk-[A-Za-z0-9_-]{10,}/g, "[KEY]")
      .replace(/ffd-[A-Za-z0-9_-]+/g, "[KEY]")
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [KEY]")
      .slice(0, 300);
  }

  function multimodalConfig(): AicodewithMultimodalConfig {
    return {
      apiKey: config.aicodewithApiKey ?? "",
      baseUrl: config.aicodewithBaseUrl,
      visionModel: config.visionModel,
      imageModel: config.imageModel,
    };
  }

  async function runFeishuVision(message: FeishuMessageEvent): Promise<void> {
    const appId = config.feishuAppId;
    const appSecret = config.feishuAppSecret;
    const chatId = message.chatId ?? message.sessionId;
    if (!appId || !appSecret) return;
    if (!config.multimodalEnabled || !config.aicodewithApiKey) {
      await sendFeishuTextToChat(appId, appSecret, chatId, "图片分析未启用:请在 .env 配置 AICODEWITH_API_KEY。");
      return;
    }
    try {
      await sendFeishuTextToChat(appId, appSecret, chatId, "🔍 正在分析图片,问题较复杂时约需 1–3 分钟…");
      const images = [];
      for (const key of (message.imageKeys ?? []).slice(0, 4)) {
        images.push(await downloadFeishuMessageImage(appId, appSecret, message.messageId, key));
      }
      if (images.length === 0) {
        await sendFeishuTextToChat(appId, appSecret, chatId, "没有读到可分析的图片。");
        return;
      }
      const question =
        message.text.trim() ||
        "请作为A股产业研究员,分析这张图(可能是K线、研报截图或产业链图),给出关键信息、含义与需要注意的风险点。";
      const analysis = await analyzeImagesWithVision(multimodalConfig(), images, question, VISION_SYSTEM_PROMPT);
      await replyFeishuMessage({
        appId,
        appSecret,
        messageId: message.messageId,
        chatId,
        text: analysis.trim() || "(视觉模型未返回内容)",
        renderMode: "card",
      });
    } catch (error) {
      await sendFeishuTextToChat(appId, appSecret, chatId, `图片分析失败:${redactForChat(error instanceof Error ? error.message : String(error))}`);
    }
  }

  async function runFeishuDraw(message: FeishuMessageEvent): Promise<void> {
    const chatId = message.chatId ?? message.sessionId;
    const appId = config.feishuAppId;
    const appSecret = config.feishuAppSecret;
    if (!appId || !appSecret) return;
    const prompt = message.text.trim().replace(/^\/\S+\s*/, "").trim();
    if (!config.multimodalEnabled || !config.aicodewithApiKey) {
      await sendFeishuTextToChat(appId, appSecret, chatId, "生图未启用:请在 .env 配置 AICODEWITH_API_KEY。");
      return;
    }
    if (!prompt) {
      await sendFeishuTextToChat(appId, appSecret, chatId, "用法:/draw <图片描述>。例如 /draw 半导体产业链结构图,扁平信息图风格,中文标注");
      return;
    }
    try {
      await sendFeishuTextToChat(appId, appSecret, chatId, `🎨 正在用 ${config.imageModel} 生成图片(约 30–60 秒)…`);
      const cfg = multimodalConfig();
      const { url } = await generateImage(cfg, prompt, { size: "1024x1024" });
      const { bytes } = await downloadImageBytes(cfg, url);
      const imageKey = await uploadFeishuImage(appId, appSecret, bytes);
      await sendFeishuImageToChat(appId, appSecret, chatId, imageKey);
    } catch (error) {
      await sendFeishuTextToChat(appId, appSecret, chatId, `生图失败:${redactForChat(error instanceof Error ? error.message : String(error))}`);
    }
  }

  async function handleFeishuMessage(message: FeishuMessageEvent): Promise<string | undefined> {
    if (!shouldHandleFeishuMessage(message)) return undefined;
    // 有图片就走视觉路(即便多模态未启用也走这里,由 runFeishuVision 回友好提示,
    // 避免把无文字的图片消息当成空文本丢给 deepseek)。
    // 复杂问题视觉分析可能 1–3 分钟;fire-and-forget,先回进度、结果自身发卡,
    // 不占用 per-session 队列(否则会阻塞后续提问)。
    if ((message.imageKeys?.length ?? 0) > 0) {
      void runFeishuVision(message).catch((error) =>
        console.error(`runFeishuVision failed: ${error instanceof Error ? error.message : String(error)}`),
      );
      return undefined;
    }
    const command = message.text.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    if (DRAW_COMMANDS.has(command)) {
      // 生图可达数分钟;fire-and-forget,结果自身经会话 API 回发,
      // 不占用 per-session 队列(否则会阻塞该用户后续的文本问答)。
      void runFeishuDraw(message).catch((error) =>
        console.error(`runFeishuDraw failed: ${error instanceof Error ? error.message : String(error)}`),
      );
      return undefined;
    }
    return runFeishuText(message.text, message.sessionId);
  }

  const server = createFeishuServer({
    port: config.feishuPort,
    token: config.feishuVerificationToken,
    appId: config.feishuAppId,
    appSecret: config.feishuAppSecret,
    dryRunReplies: config.feishuDryRunReplies,
    replyRenderMode: normalizeFeishuReplyRenderMode(config.feishuReplyRenderMode),
    onMessage: (message) => handleFeishuMessage(message),
    ffdReportRelay: config.ffdReportRelayToken
      ? {
          token: config.ffdReportRelayToken,
          onPayload: async (payload) => {
            await notifyFeishuReport("FFD研报库实时推送", renderFfdWebhookPayload(payload));
          },
        }
      : undefined,
    commands: {
      "/ask": (arg: string) => tradingFeishuRouter.ask("legacy", arg),
      "/chat": (arg: string) => tradingFeishuRouter.ask("legacy", arg),
      "/trading": (arg: string) => tradingFeishuRouter.ask("legacy", arg),
      "/hermes": (arg: string) => tradingFeishuRouter.ask("legacy", arg),
      "/reset": () => tradingFeishuRouter.reset("legacy"),
      "/hermes-metadata": () => tradingFeishuRouter.metadata("legacy"),
      "/agent-metadata": () => tradingFeishuRouter.metadata("legacy"),
      "/screen": async () => {
        await screen();
        return "Screening completed. Check reports/ and runs/.";
      },
      "/research-refresh": async () => {
        await researchRefresh();
        return "Research refresh completed. Check reports/, data/, and runs/.";
      },
      "/ffd-health": () => runFfdHealth(),
      "/ffd": (arg: string) => runFfdNaturalQuery(arg),
      "/ffd-industry": (arg: string) => runFfdIndustrySignal(arg),
      "/ffd-research": (arg: string) => runFfdResearchSearch(arg),
      "/ffd-news": (arg: string) => runFfdNewsSearch(arg),
      "/ffd-smoke": () => runFfdSmokeCommand(),
      "/ffd-signal": (arg: string) => archiveFfdSignalCommand(arg),
      "/ffd-auto-rules": () => renderFfdAutoDownloadGuide(),
      "/reports-convert": () => convertFfdReports(),
      "/reports-enhance": (arg: string) => enhanceFfdReportsCommand(arg),
      "/reports-review": () => reviewFfdReports(),
      "/reports-accept": (arg: string) => acceptFfdReportCommand(arg),
      "/reports-accept-quality": () => acceptQualityFfdReportsCommand(),
      "/reports-organize-obsidian": () => organizeFfdObsidianCommand(),
      "/reports-reject": (arg: string) => rejectFfdReportCommand(arg),
      "/archive-obsidian": async () => {
        await initObsidian();
        return "Obsidian knowledgebase archived/refreshed by manual command.";
      },
      "/obsidian-init": async () => {
        await initObsidian();
        return "Obsidian knowledgebase archived/refreshed by manual command.";
      },
      "/watchlist": async () => renderWatchlistSummary(await loadWatchlist()),
      "/calibration": async () => {
        const snapshot = await buildCalibrationSnapshot();
        await writeCalibrationSnapshot(snapshot);
        const slice = await sycophancySliceReport();
        return slice ? [renderCalibrationSnapshot(snapshot), "", slice].join("\n") : renderCalibrationSnapshot(snapshot);
      },
      "/resolutions": () => resolutionsReport(),
      "/graveyard": () => graveyardReport(),
      "/bear": async (arg: string) => {
        if (!arg.trim()) return "Usage: /bear <code-or-name>";
        return (await runBearForCode(arg.trim())).text;
      },
      "/portfolio-review": () => portfolioReview(),
      "/library": async (arg: string) => {
        if (!arg.trim()) return "Usage: /library <关键词> — 检索本地已入库研报";
        return renderHybridResults(arg.trim(), await hybridSearchReportLibrary(arg.trim()));
      },
      "/evals": async () => {
        const results = runAnswerSafetyEvals(TRADING_AGENT_SYSTEM_PROMPT);
        await writeJsonFile("runs/answer-safety-evals-latest.json", results);
        const sycophancy = runSycophancyPromptEvals(TRADING_AGENT_SYSTEM_PROMPT);
        await writeJsonFile("runs/sycophancy-evals-latest.json", sycophancy);
        return [renderAnswerSafetyEvals(results), renderSycophancyEvals(sycophancy)].join("\n\n");
      },
      "/quant-adapt-history": (arg: string) => quantAdaptHistoryCommand(arg.trim() ? arg.trim().split(/\s+/) : []),
      "/quant-backtest": (arg: string) => quantBacktestCommand(arg.trim() || undefined),
      "/board": (arg: string) => runFeishuWhiteboardCommand(arg, "legacy"),
      "/whiteboard": (arg: string) => runFeishuWhiteboardCommand(arg, "legacy"),
      "/sources": async () => {
        const sources = await loadSourceRegistry();
        return sources.slice(0, 20).map((source) => `${source.id} [${source.tier}] ${source.title}`).join("\n");
      },
      "/latest": async () => {
        const run = await findLatestRun();
        return run ? renderFeishuSummary(run) : "No screen report JSON found under reports/. Run /screen first.";
      },
      "/harness": async () => {
        const result = await runHarness();
        return result.checks.map((item) => `${item.ok ? "✓" : "✗"} ${item.name}`).join("\n");
      },
      "/why": async (code: string) => {
        const run = await findLatestRun();
        if (!run) return "No screen report JSON found under reports/. Run /screen first.";
        if (!code.trim()) return "Usage: /why <code-or-name>";
        return explainCandidate(run, code);
      },
      "/methodology": () => methodologySummary(),
      "/doctor": async () => renderDoctorReport(await diagnoseRuntime()),
    },
  });
  console.log(`Feishu callback server listening on ${config.feishuPort}`);
  if (!config.feishuAppId || !config.feishuAppSecret) {
    console.log("FEISHU_APP_ID/FEISHU_APP_SECRET are not configured; URL verification can work, but Feishu message replies will fail until they are set.");
  }
  await new Promise<void>((resolve) => server.on("close", resolve));
}

async function main() {
  const command = process.argv[2];
  switch (command) {
    case "ingest-serenity":
      await ingestSerenity();
      break;
    case "init-obsidian":
      await initObsidian();
      break;
    case "screen":
      await screen();
      break;
    case "research-refresh":
      await researchRefresh();
      break;
    case "research-bear":
      await researchBear();
      break;
    case "portfolio-review":
      console.log(await portfolioReview());
      break;
    case "resolutions-update":
      await resolutionsUpdate();
      break;
    case "library-search":
      await librarySearchCommand();
      break;
    case "library-embed":
      await libraryEmbedCommand();
      break;
    case "library-eval":
      await libraryEvalCommand();
      break;
    case "reports-rechunk":
      console.log(renderFfdRechunkRun(await rechunkFfdReports()));
      break;
    case "watchlist":
      await showWatchlist();
      break;
    case "calibration":
      await calibration();
      break;
    case "resolutions":
      console.log(await resolutionsReport());
      break;
    case "graveyard":
      console.log(await graveyardReport());
      break;
    case "evals":
      await evals();
      break;
    case "quant-adapt-history":
      console.log(await quantAdaptHistoryCommand(process.argv.slice(3)));
      break;
    case "quant-backtest":
      console.log(await quantBacktestCommand(process.argv[3]));
      break;
    case "reports-convert":
      console.log(await convertFfdReports());
      break;
    case "reports-enhance":
      console.log(await enhanceFfdReportsCommand(process.argv.slice(3).join(" ")));
      break;
    case "reports-review":
      console.log(await reviewFfdReports());
      break;
    case "reports-accept":
      console.log(await acceptFfdReportCommand(process.argv.slice(3).join(" ")));
      break;
    case "reports-accept-quality":
      console.log(await acceptQualityFfdReportsCommand());
      break;
    case "reports-organize-obsidian":
      console.log(await organizeFfdObsidianCommand());
      break;
    case "ffd-set-key":
      console.log(await setFfdApiKeyCommand());
      break;
    case "reports-reject":
      console.log(await rejectFfdReportCommand(process.argv[3] ?? ""));
      break;
    case "daily-run":
      await dailyRun();
      break;
    case "run-harness":
      await harness();
      break;
    case "doctor":
      await doctor();
      break;
    case "cron":
      console.log(renderCronExample());
      break;
    case "feishu-server":
      await feishuServer();
      break;
    case "chat":
      await runInteractiveChat();
      break;
    case "chat-server":
      {
        const server = await startChatHttpServer();
        await new Promise<void>((resolve) => server.on("close", resolve));
      }
      break;
    case "agent":
      await showAgent();
      break;
    case "ffd-auto-rules":
      console.log(renderFfdAutoDownloadGuide());
      break;
    case "ffd-smoke":
      console.log(await runFfdSmokeCommand());
      break;
    case "ffd-signal":
      console.log(await archiveFfdSignalCommand(process.argv.slice(3).join(" ")));
      break;
    default:
      console.log("Usage: tsx src/cli.ts <ingest-serenity|init-obsidian|screen|research-refresh|watchlist|calibration|evals|quant-adapt-history|quant-backtest|ffd-auto-rules|ffd-smoke|ffd-signal|ffd-set-key|reports-convert|reports-enhance|reports-review|reports-accept|reports-accept-quality|reports-organize-obsidian|reports-reject|daily-run|doctor|cron|run-harness|feishu-server|chat|chat-server|agent>");
      process.exitCode = 1;
  }
}

await main();
