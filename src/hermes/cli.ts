#!/usr/bin/env node
import {
  buildHermesTradingSubagentMetadata,
  createHermesTradingSubagentSession,
  promptHermesTradingSubagent,
  renderHermesTradingSubagentMetadata,
  resetHermesTradingSubagentSession,
} from "./trading-subagent.js";

interface HermesCliArgs {
  sessionId: string;
  message: string;
  metadata: boolean;
  reset: boolean;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): HermesCliArgs {
  const args: HermesCliArgs = {
    sessionId: "hermes",
    message: "",
    metadata: false,
    reset: false,
    json: false,
    help: false,
  };
  const messageParts: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--session" && argv[index + 1]) {
      args.sessionId = argv[index + 1];
      index += 1;
    } else if (arg === "--message" && argv[index + 1]) {
      messageParts.push(argv[index + 1]);
      index += 1;
    } else if (arg === "--metadata") {
      args.metadata = true;
    } else if (arg === "--reset") {
      args.reset = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      messageParts.push(arg);
    }
  }

  args.message = messageParts.join(" ").trim();
  return args;
}

function renderHelp(): string {
  return [
    "Usage:",
    "  npm run hermes:subagent -- --metadata",
    "  npm run hermes:subagent -- --session henry --message \"用 Serenity 方法论筛选 A 股候选\"",
    "  npm run hermes:subagent -- --session feishu-oc_x \"检查 FFD 连接\"",
    "",
    "Options:",
    "  --session <id>   Persist and resume this Hermes trading subagent session",
    "  --message <text>  Message to send; remaining positional args are also joined as message text",
    "  --metadata        Print the replicated subagent metadata without calling the model",
    "  --reset           Clear the selected session before optional message execution",
    "  --json            Print machine-readable JSON",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(renderHelp());
    return;
  }

  const session = await createHermesTradingSubagentSession(args.sessionId);
  const metadata = buildHermesTradingSubagentMetadata(session);

  if (args.reset) {
    await resetHermesTradingSubagentSession(session);
    if (!args.message && !args.metadata) {
      const payload = { ok: true, sessionId: session.sessionId, reset: true };
      console.log(args.json ? JSON.stringify(payload, null, 2) : `Reset Hermes trading subagent session: ${session.sessionId}`);
      return;
    }
  }

  if (args.metadata || !args.message) {
    console.log(args.json ? JSON.stringify(metadata, null, 2) : renderHermesTradingSubagentMetadata(metadata));
    return;
  }

  const result = await promptHermesTradingSubagent(session, args.message);
  if (args.json) {
    console.log(JSON.stringify({ metadata, result }, null, 2));
    return;
  }

  if (result.errorMessage) {
    console.log(`Agent error: ${result.errorMessage}`);
    process.exitCode = 1;
    return;
  }
  console.log(result.reply);
}

await main();
