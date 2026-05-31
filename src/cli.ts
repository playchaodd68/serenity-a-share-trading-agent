import { getConfig } from "./config.js";
import { fetchTopicDiggPostSummaries, serenityPostsToSources } from "./connectors/serenity.js";
import { ingestLocalReportSources } from "./connectors/reports.js";
import { createFeishuServer } from "./feishu/feishu.js";
import { renderFeishuSummary, writeScreenReport } from "./report.js";
import { initializeKnowledgebase } from "./rag/obsidian.js";
import { screenCandidates } from "./screener.js";
import { loadSourceRegistry, mergeSources, saveSourceRegistry, seedSourceRegistry } from "./sources/registry.js";
import { EASTMONEY_SOURCE } from "./connectors/eastmoney.js";
import { runHarness } from "./harness/run.js";
import { appendJsonl, writeJsonFile } from "./utils/fs.js";
import { sendFeishuMarkdown } from "./feishu/feishu.js";
import { createTradingAgent } from "./agent/trading-agent.js";

async function ingestSerenity() {
  const config = getConfig();
  const seeded = await seedSourceRegistry();
  const posts = await fetchTopicDiggPostSummaries();
  await writeJsonFile("data/serenity-posts.json", posts);
  const reportSources = await ingestLocalReportSources(config.reportInbox);
  const merged = mergeSources(seeded, [...serenityPostsToSources(posts), ...reportSources, EASTMONEY_SOURCE]);
  await saveSourceRegistry(merged);
  await appendJsonl("runs/ingest.jsonl", { type: "ingest-serenity", at: new Date().toISOString(), sources: merged.length, posts: posts.length });
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

async function harness() {
  const result = await runHarness();
  for (const item of result.checks) {
    console.log(`${item.ok ? "✓" : "✗"} ${item.name}: ${item.detail}`);
  }
  if (!result.ok) process.exitCode = 1;
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
      "/harness": async () => {
        const result = await runHarness();
        return result.checks.map((item) => `${item.ok ? "✓" : "✗"} ${item.name}`).join("\n");
      },
      "/why": async (code: string) => {
        return `Use the latest report JSON and find candidate ${code}. The response includes prior, evidence deltas, posterior, risks, and coverage gaps.`;
      },
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
    case "run-harness":
      await harness();
      break;
    case "feishu-server":
      await feishuServer();
      break;
    case "agent":
      await showAgent();
      break;
    default:
      console.log("Usage: tsx src/cli.ts <ingest-serenity|init-obsidian|screen|run-harness|feishu-server|agent>");
      process.exitCode = 1;
  }
}

await main();
