import * as dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: ".env", quiet: true });
dotenv.config({ path: ".env.local", override: true, quiet: true });

const defaultFfdReportRawDir = path.join(process.env.HOME ?? process.cwd(), "Desktop", "FFD研报库", "_raw");

export interface AppConfig {
  obsidianVaultPath: string;
  obsidianKbFolder: string;
  reportInbox: string;
  ffdReportRawDir: string;
  ffdReportProcessedDir: string;
  ffdReportEnhanceCommand?: string;
  ffdReportRelayToken?: string;
  ffdFeishuWebhookUrl?: string;
  aShareMaxRows: number;
  aShareTopN: number;
  feishuWebhookUrl?: string;
  feishuVerificationToken?: string;
  feishuAppId?: string;
  feishuAppSecret?: string;
  feishuReportAppId?: string;
  feishuReportAppSecret?: string;
  feishuNotifyOpenId?: string;
  feishuNotifyChatId?: string;
  feishuCommandSenderOpenId?: string;
  feishuReportNotifyReceiveId?: string;
  feishuReportNotifyReceiveIdType: "open_id" | "union_id" | "user_id" | "email";
  feishuReportNotifyOpenId?: string;
  feishuPort: number;
  chatPort: number;
  modelProvider: string;
  modelName: string;
  anthropicOAuthCredentialsPath: string;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function feishuReportReceiveIdType(): "open_id" | "union_id" | "user_id" | "email" {
  const raw = process.env.FEISHU_REPORT_NOTIFY_RECEIVE_ID_TYPE;
  if (raw === "open_id" || raw === "union_id" || raw === "user_id" || raw === "email") return raw;
  return "open_id";
}

export function getConfig(): AppConfig {
  return {
    obsidianVaultPath: process.env.OBSIDIAN_VAULT_PATH ?? "/Users/apple/Documents/HenryXu",
    obsidianKbFolder: process.env.OBSIDIAN_KB_FOLDER ?? "Serenity-A股产业投研",
    reportInbox: process.env.REPORT_INBOX ?? "reports/inbox",
    ffdReportRawDir: process.env.FFD_REPORT_RAW_DIR ?? defaultFfdReportRawDir,
    ffdReportProcessedDir: process.env.FFD_REPORT_PROCESSED_DIR ?? "reports/ffd/processed",
    ffdReportEnhanceCommand: process.env.FFD_REPORT_ENHANCE_COMMAND,
    ffdReportRelayToken: process.env.FFD_REPORT_RELAY_TOKEN,
    ffdFeishuWebhookUrl: process.env.FFD_FEISHU_WEBHOOK_URL,
    aShareMaxRows: numberEnv("A_SHARE_MAX_ROWS", 800),
    aShareTopN: numberEnv("A_SHARE_TOP_N", 15),
    feishuWebhookUrl: process.env.FEISHU_WEBHOOK_URL,
    feishuVerificationToken: process.env.FEISHU_VERIFICATION_TOKEN,
    feishuAppId: process.env.FEISHU_APP_ID,
    feishuAppSecret: process.env.FEISHU_APP_SECRET,
    feishuReportAppId: process.env.FEISHU_REPORT_APP_ID ?? process.env.FEISHU_APP_ID,
    feishuReportAppSecret: process.env.FEISHU_REPORT_APP_SECRET ?? process.env.FEISHU_APP_SECRET,
    feishuNotifyOpenId: process.env.FEISHU_NOTIFY_OPEN_ID,
    feishuNotifyChatId: process.env.FEISHU_NOTIFY_CHAT_ID,
    feishuCommandSenderOpenId: process.env.FEISHU_COMMAND_SENDER_OPEN_ID,
    feishuReportNotifyReceiveId: process.env.FEISHU_REPORT_NOTIFY_RECEIVE_ID,
    feishuReportNotifyReceiveIdType: feishuReportReceiveIdType(),
    feishuReportNotifyOpenId: process.env.FEISHU_REPORT_NOTIFY_OPEN_ID ?? process.env.FEISHU_NOTIFY_OPEN_ID,
    feishuPort: numberEnv("FEISHU_PORT", 8787),
    chatPort: numberEnv("CHAT_SERVER_PORT", 8788),
    modelProvider: process.env.TRADING_AGENT_MODEL_PROVIDER ?? "deepseek",
    modelName: process.env.TRADING_AGENT_MODEL ?? "deepseek-v4-pro",
    anthropicOAuthCredentialsPath: process.env.ANTHROPIC_OAUTH_CREDENTIALS_PATH ?? "runs/anthropic-oauth.json",
  };
}

export function knowledgebasePath(config = getConfig()): string {
  return path.join(config.obsidianVaultPath, config.obsidianKbFolder);
}
