import fs from "node:fs/promises";
import path from "node:path";
import { loginAnthropic, refreshAnthropicToken, type OAuthCredentials } from "@earendil-works/pi-ai/oauth";
import { getConfig } from "../config.js";

export type { OAuthCredentials };

export interface AnthropicOAuthStatus {
  loggedIn: boolean;
  path: string;
  expiresAt?: string;
  expired?: boolean;
}

/**
 * Refresh the access token slightly before it actually expires. pi-ai already bakes
 * a 5-minute safety margin into `expires`, so this is an additional small cushion.
 */
const REFRESH_SKEW_MS = 60_000;

function credentialsPath(): string {
  return path.resolve(getConfig().anthropicOAuthCredentialsPath);
}

function isOAuthCredentials(value: unknown): value is OAuthCredentials {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.refresh === "string" && typeof record.access === "string" && typeof record.expires === "number";
}

export async function loadAnthropicCredentials(filePath = credentialsPath()): Promise<OAuthCredentials | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    const parsed = JSON.parse(raw);
    return isOAuthCredentials(parsed) ? parsed : undefined;
  } catch {
    // Malformed credentials file: treat as not logged in rather than crashing the agent.
    return undefined;
  }
}

export async function saveAnthropicCredentials(credentials: OAuthCredentials, filePath = credentialsPath()): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  // Owner-only permissions: this file holds long-lived refresh tokens.
  await fs.writeFile(filePath, `${JSON.stringify(credentials, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.chmod(filePath, 0o600).catch(() => undefined);
}

export function isExpired(credentials: OAuthCredentials, now = Date.now(), skewMs = REFRESH_SKEW_MS): boolean {
  return now >= credentials.expires - skewMs;
}

export interface GetTokenOptions {
  credentialsPath?: string;
  now?: number;
  refresh?: (refreshToken: string) => Promise<OAuthCredentials>;
  save?: (credentials: OAuthCredentials, filePath: string) => Promise<void>;
}

/**
 * Return a usable Anthropic OAuth access token, refreshing and persisting it when
 * expired. Returns undefined when the user has not logged in yet, so callers can
 * fall back to ANTHROPIC_OAUTH_TOKEN / ANTHROPIC_API_KEY environment auth.
 *
 * Deps are injectable purely so the refresh path can be unit-tested without network.
 */
export async function getFreshAnthropicAccessToken(options: GetTokenOptions = {}): Promise<string | undefined> {
  const filePath = options.credentialsPath ?? credentialsPath();
  const refresh = options.refresh ?? refreshAnthropicToken;
  const save = options.save ?? saveAnthropicCredentials;
  const now = options.now ?? Date.now();

  const credentials = await loadAnthropicCredentials(filePath);
  if (!credentials) return undefined;
  if (!isExpired(credentials, now)) return credentials.access;

  const refreshed = await refresh(credentials.refresh);
  await save(refreshed, filePath);
  return refreshed.access;
}

export async function anthropicOAuthStatus(filePath = credentialsPath()): Promise<AnthropicOAuthStatus> {
  const credentials = await loadAnthropicCredentials(filePath);
  if (!credentials) return { loggedIn: false, path: filePath };
  return {
    loggedIn: true,
    path: filePath,
    expiresAt: new Date(credentials.expires).toISOString(),
    expired: isExpired(credentials, Date.now(), 0),
  };
}

/**
 * Interactive CLI login for a Claude Pro/Max subscription via OAuth. Opens the
 * authorization URL, accepts the redirected code (callback server or manual paste),
 * and persists the resulting credentials.
 */
export async function runAnthropicLogin(
  prompt: (message: string) => Promise<string>,
  log: (message: string) => void = (message) => console.log(message),
  filePath = credentialsPath(),
): Promise<AnthropicOAuthStatus> {
  const credentials = await loginAnthropic({
    onAuth: ({ url, instructions }) => {
      log("\n用浏览器打开下面的链接，用你的 Claude Pro/Max 账号授权：\n");
      log(url);
      if (instructions) log(`\n${instructions}`);
      log("");
    },
    onPrompt: (request) => prompt(request.message),
    onManualCodeInput: () => prompt("如果回调没有自动完成，粘贴授权码或完整回调 URL（直接回车跳过）："),
    onProgress: (message) => log(message),
  });
  await saveAnthropicCredentials(credentials, filePath);
  return {
    loggedIn: true,
    path: filePath,
    expiresAt: new Date(credentials.expires).toISOString(),
    expired: false,
  };
}
