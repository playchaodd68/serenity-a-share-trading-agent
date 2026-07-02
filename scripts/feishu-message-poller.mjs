#!/usr/bin/env node
import "dotenv/config";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const chatId = process.env.FEISHU_PRIVATE_CHAT_ID || process.env.FEISHU_NOTIFY_CHAT_ID;
const profile = process.env.LARK_CLI_PROFILE;
const larkCliBin = process.env.LARK_CLI_BIN || "lark-cli";
const port = process.env.FEISHU_PORT || "8787";
const callbackUrl = process.env.FEISHU_LOCAL_CALLBACK_URL || `http://127.0.0.1:${port}`;
const intervalMs = Number(process.env.FEISHU_POLLER_INTERVAL_MS || "8000");
const initialLookbackMinutes = Number(process.env.FEISHU_POLLER_INITIAL_LOOKBACK_MINUTES || "15");
const maxBacklogMinutes = Number(process.env.FEISHU_POLLER_MAX_BACKLOG_MINUTES || "15");
const statePath = process.env.FEISHU_POLLER_STATE_PATH || "runs/feishu-poller-state.json";

if (!chatId) {
  console.error("[feishu-poller] FEISHU_PRIVATE_CHAT_ID or FEISHU_NOTIFY_CHAT_ID is required.");
  process.exit(1);
}

async function readState() {
  try {
    return JSON.parse(await fs.readFile(statePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { processed: {}, initializedAt: null, ignoreBeforeMs: null };
    throw error;
  }
}

async function writeState(state) {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function parseFeishuMinute(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!match) return 0;
  const [, year, month, day, hour, minute] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)).getTime();
}

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

function extractBracketImageKeys(text) {
  const keys = [];
  for (const m of String(text).matchAll(/\[Image:\s*([^\]]+?)\s*\]/g)) keys.push(m[1].trim());
  return keys;
}

function stripImageTokens(text) {
  return String(text)
    .replace(/\[Image:\s*[^\]]+\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function messageImageKeys(content) {
  let node = content;
  if (typeof node === "string") {
    const trimmed = node.trim();
    try {
      node = trimmed ? JSON.parse(trimmed) : {};
    } catch {
      node = {};
    }
  }
  const keys = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value.image_key === "string" && value.image_key) keys.push(value.image_key);
    for (const inner of Object.values(value)) if (inner && typeof inner === "object") visit(inner);
  };
  visit(node);
  // lark-cli 把图片渲染成 "[Image: <image_key>]" 文本,从扁平文本里也抽取
  keys.push(...extractBracketImageKeys(messageContentToText(content)));
  return [...new Set(keys)];
}

function shouldProcessMessage(message, state, firstRunAt) {
  if (!message?.message_id || state.processed?.[message.message_id]) return false;
  if (!["text", "post", "image"].includes(message.msg_type)) return false;
  if (message.sender?.sender_type === "app") return false;
  if (!messageContentToText(message.content) && messageImageKeys(message.content).length === 0) return false;

  const createdAt = parseFeishuMinute(message.create_time);
  const stateIgnoreBeforeMs = Number(state.ignoreBeforeMs || firstRunAt - initialLookbackMinutes * 60_000);
  const backlogIgnoreBeforeMs = Date.now() - Math.max(0, maxBacklogMinutes) * 60_000;
  const ignoreBeforeMs = Math.max(stateIgnoreBeforeMs, backlogIgnoreBeforeMs);
  if (createdAt && createdAt < ignoreBeforeMs) return false;
  return true;
}

function toCallbackPayload(message) {
  return {
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      token: process.env.FEISHU_VERIFICATION_TOKEN,
      event_id: `poller-${message.message_id}`,
      create_time: String(Date.now()),
    },
    event: {
      sender: {
        sender_id: {
          open_id: message.sender?.id,
        },
      },
      message: {
        message_id: message.message_id,
        chat_id: message.chat_id,
        chat_type: "p2p",
        message_type: messageImageKeys(message.content).length > 0 ? "image" : "text",
        create_time: String(parseFeishuMinute(message.create_time)),
        content: JSON.stringify({
          text: stripImageTokens(messageContentToText(message.content)),
          image_keys: messageImageKeys(message.content),
        }),
      },
    },
  };
}

async function listMessages() {
  const args = ["im", "+chat-messages-list", "--as", "bot", "--chat-id", chatId, "--page-size", "20", "--no-reactions"];
  if (profile) args.push("--profile", profile);
  const { stdout } = await execFileAsync(larkCliBin, args, {
    env: { ...process.env },
    maxBuffer: 1024 * 1024 * 5,
  });
  const parsed = JSON.parse(stdout);
  if (!parsed.ok) throw new Error(parsed.error?.message || "lark-cli message list failed");
  return parsed.data?.messages || [];
}

async function forward(message) {
  const response = await fetch(callbackUrl, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(toCallbackPayload(message)),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`callback failed: ${response.status} ${body}`);
  console.error(
    `[feishu-poller] forwarded message_id=${message.message_id} msg_type=${message.msg_type} sender_type=${message.sender?.sender_type ?? "?"} status=${response.status}`,
  );
}

async function tick() {
  const state = await readState();
  const firstRunAt = state.initializedAt ? Date.parse(state.initializedAt) : Date.now();
  const messages = await listMessages();
  if (!state.initializedAt) {
    state.initializedAt = new Date(firstRunAt).toISOString();
    state.ignoreBeforeMs = firstRunAt - initialLookbackMinutes * 60_000;
  }
  const candidates = messages
    .filter((message) => shouldProcessMessage(message, state, firstRunAt))
    .sort((a, b) => Number(a.message_position || 0) - Number(b.message_position || 0));

  for (const message of candidates) {
    await forward(message);
    state.processed[message.message_id] = {
      at: new Date().toISOString(),
      position: message.message_position,
      create_time: message.create_time,
    };
  }
  await writeState(state);
}

let stopped = false;

async function loop() {
  console.error(`[feishu-poller] polling chat_id=${chatId} callback=${callbackUrl} intervalMs=${intervalMs}`);
  while (!stopped) {
    try {
      await tick();
    } catch (error) {
      console.error(`[feishu-poller] tick failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

process.on("SIGINT", () => {
  stopped = true;
});
process.on("SIGTERM", () => {
  stopped = true;
});

await loop();
