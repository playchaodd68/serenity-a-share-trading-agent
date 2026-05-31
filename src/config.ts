import "dotenv/config";
import path from "node:path";

export interface AppConfig {
  obsidianVaultPath: string;
  obsidianKbFolder: string;
  reportInbox: string;
  aShareMaxRows: number;
  aShareTopN: number;
  feishuWebhookUrl?: string;
  feishuVerificationToken?: string;
  feishuPort: number;
  chatPort: number;
  modelProvider: string;
  modelName: string;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getConfig(): AppConfig {
  return {
    obsidianVaultPath: process.env.OBSIDIAN_VAULT_PATH ?? "/Users/apple/Documents/HenryXu",
    obsidianKbFolder: process.env.OBSIDIAN_KB_FOLDER ?? "Serenity-A股产业投研",
    reportInbox: process.env.REPORT_INBOX ?? "reports/inbox",
    aShareMaxRows: numberEnv("A_SHARE_MAX_ROWS", 800),
    aShareTopN: numberEnv("A_SHARE_TOP_N", 15),
    feishuWebhookUrl: process.env.FEISHU_WEBHOOK_URL,
    feishuVerificationToken: process.env.FEISHU_VERIFICATION_TOKEN,
    feishuPort: numberEnv("FEISHU_PORT", 8787),
    chatPort: numberEnv("CHAT_SERVER_PORT", 8788),
    modelProvider: process.env.TRADING_AGENT_MODEL_PROVIDER ?? "deepseek",
    modelName: process.env.TRADING_AGENT_MODEL ?? "deepseek-v4-pro",
  };
}

export function knowledgebasePath(config = getConfig()): string {
  return path.join(config.obsidianVaultPath, config.obsidianKbFolder);
}
