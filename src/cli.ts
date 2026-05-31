import { getConfig } from "./config.js";
import { fetchTopicDiggPostSummaries, serenityPostsToSources } from "./connectors/serenity.js";
import { ingestLocalReportSources } from "./connectors/reports.js";
import { createFeishuServer } from "./feishu/feishu.js";
import { explainCandidate, findLatestRun, renderFeishuSummary, writeScreenReport } from "./report.js";
import { initializeKnowledgebase } from "./rag/obsidian.js";
import { screenCandidates } from "./screener.js";
import { loadSourceRegistry, mergeSources, saveSourceRegistry, seedSourceRegistry } from "./sources/registry.js";
import { EASTMONEY_SOURCE } from "./connectors/eastmoney.js";
import { runHarness } from "./harness/run.js";
import { appendJsonl, readJsonFile, writeJsonFile } from "./utils/fs.js";
import { sendFeishuMarkdown } from "./feishu/feishu.js";
import { createTradingAgent } from "./agent/trading-agent.js";
import { runInteractiveChat, startChatHttpServer } from "./chatbot/chatbot.js";
import { methodologySummary } from "./methodology.js";
import { diagnoseRuntime, renderCronExample, renderDoctorReport } from "./operations.js";

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

async function screen() {
  const config = getConfig();
  const sources = mergeSources(await seedSourceRegistry(), [EASTMONEY_SOURCE]);
  await saveSourceRegistry(sources);
  const run = await screenCandidates(sources, { maxRows: config.aShareMaxRows, topN: config.aShareTopN });
  const completed = await writeScreenReport(run);
  await appendJsonl("runs/screen.jsonl", { type: "screen", at: new Date().toISOString(), runId: completed.runId, candidates: completed.candidates.length });
  console.log(`Wrote report: ${completed.reportPath}`);
  if (config.feishuWebhookUrl) {
    await sendFeishuMarkdown(config.feishuWebhookUrl, "A股产业瓶颈筛选", renderFeishuSummary(completed));
    console.log("Sent Feishu notification.");
  }
}

async function dailyRun() {
  await ingestSerenity();
  await initObsidian();
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

async function feishuServer() {
  const config = getConfig();
  createFeishuServer({
    port: config.feishuPort,
    token: config.feishuVerificationToken,
    commands: {
      "/screen": async () => {
        await screen();
        return "Screening completed. Check reports/ and Obsidian runs.";
      },
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
      await startChatHttpServer();
      break;
    case "agent":
      await showAgent();
      break;
    default:
      console.log("Usage: tsx src/cli.ts <ingest-serenity|init-obsidian|screen|daily-run|doctor|cron|run-harness|feishu-server|chat|chat-server|agent>");
      process.exitCode = 1;
  }
}

await main();
