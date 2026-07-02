#!/usr/bin/env node
import "dotenv/config";
import { spawn } from "node:child_process";
import readline from "node:readline";

const port = process.env.FEISHU_PORT || "8787";
const callbackUrl = process.env.FEISHU_LOCAL_CALLBACK_URL || `http://127.0.0.1:${port}`;
const profile = process.env.LARK_CLI_PROFILE;
const larkCliBin = process.env.LARK_CLI_BIN || "lark-cli";

function flattenRichText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flattenRichText).filter(Boolean).join("");
  if (!value || typeof value !== "object") return "";
  return [
    typeof value.text === "string" ? value.text : "",
    typeof value.href === "string" ? value.href : "",
    typeof value.user_name === "string" ? value.user_name : "",
    flattenRichText(value.content),
  ]
    .filter(Boolean)
    .join("");
}

function messageContentToText(content) {
  if (content == null) return "";
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (!trimmed) return "";
    try {
      return messageContentToText(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }
  if (!content || typeof content !== "object") return String(content).trim();
  if (typeof content.text === "string") return content.text.trim();
  if (content.content != null) return flattenRichText(content.content).trim();
  if (content.post && typeof content.post === "object") return flattenRichText(content.post).trim();
  return "";
}

function eventToCallbackPayload(event) {
  const messageId = event.message_id || event.id;
  const content = messageContentToText(event.content);
  if (!messageId || !content) return undefined;
  return {
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      token: process.env.FEISHU_VERIFICATION_TOKEN,
      event_id: event.event_id,
      create_time: event.timestamp,
    },
    event: {
      sender: {
        sender_id: {
          open_id: event.sender_id,
        },
      },
      message: {
        message_id: messageId,
        chat_id: event.chat_id,
        chat_type: event.chat_type,
        message_type: event.message_type || "text",
        create_time: event.create_time,
        content: JSON.stringify({ text: content }),
      },
    },
  };
}

async function forwardEvent(event) {
  const payload = eventToCallbackPayload(event);
  if (!payload) {
    console.error(`[feishu-event-relay] skipped event without message_id/content: ${JSON.stringify(event)}`);
    return;
  }
  const response = await fetch(callbackUrl, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`callback failed: ${response.status} ${body}`);
  console.error(`[feishu-event-relay] forwarded message_id=${payload.event.message.message_id} status=${response.status}`);
}

const args = ["event", "consume", "im.message.receive_v1", "--as", "bot"];
if (profile) args.push("--profile", profile);

const stdinKeepAlive = spawn("tail", ["-f", "/dev/null"], {
  stdio: ["ignore", "pipe", "ignore"],
});

const child = spawn(larkCliBin, args, {
  env: { ...process.env },
  stdio: ["pipe", "pipe", "pipe"],
});
stdinKeepAlive.stdout.pipe(child.stdin);

const stdout = readline.createInterface({ input: child.stdout });
const stderr = readline.createInterface({ input: child.stderr });

console.error(`[feishu-event-relay] forwarding lark-cli events to ${callbackUrl} via ${larkCliBin}`);

stdout.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  void (async () => {
    try {
      await forwardEvent(JSON.parse(trimmed));
    } catch (error) {
      console.error(`[feishu-event-relay] forward failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
});

stderr.on("line", (line) => {
  console.error(line);
});

child.on("error", (error) => {
  stdinKeepAlive.kill("SIGTERM");
  console.error(`[feishu-event-relay] failed to start ${larkCliBin}: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  stdinKeepAlive.kill("SIGTERM");
  console.error(`[feishu-event-relay] lark-cli exited code=${code ?? "null"} signal=${signal ?? "null"}`);
  process.exitCode = code ?? (signal ? 1 : 0);
});

function shutdown() {
  stdinKeepAlive.kill("SIGTERM");
  child.kill("SIGTERM");
  child.stdin.end();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
