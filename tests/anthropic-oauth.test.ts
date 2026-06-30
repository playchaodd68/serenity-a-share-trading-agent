import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  getFreshAnthropicAccessToken,
  isExpired,
  loadAnthropicCredentials,
  saveAnthropicCredentials,
  type OAuthCredentials,
} from "../src/auth/anthropic-oauth.js";

const tempFiles: string[] = [];

async function tempPath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "anthropic-oauth-"));
  const filePath = path.join(dir, "creds.json");
  tempFiles.push(filePath);
  return filePath;
}

function creds(overrides: Partial<OAuthCredentials> = {}): OAuthCredentials {
  return { refresh: "rt-old", access: "sk-ant-oat-old", expires: 10_000, ...overrides };
}

afterEach(async () => {
  await Promise.all(tempFiles.splice(0).map((file) => fs.rm(path.dirname(file), { recursive: true, force: true })));
});

describe("anthropic oauth credential helpers", () => {
  it("treats a token as expired within the refresh skew window", () => {
    const c = creds({ expires: 1_000_000 });
    expect(isExpired(c, 1_000_000 - 120_000)).toBe(false);
    expect(isExpired(c, 1_000_000 - 30_000)).toBe(true); // inside 60s skew
    expect(isExpired(c, 1_000_001)).toBe(true);
  });

  it("round-trips credentials and ignores malformed files", async () => {
    const filePath = await tempPath();
    await saveAnthropicCredentials(creds({ access: "sk-ant-oat-x" }), filePath);
    expect((await loadAnthropicCredentials(filePath))?.access).toBe("sk-ant-oat-x");

    await fs.writeFile(filePath, "{ not json", "utf8");
    expect(await loadAnthropicCredentials(filePath)).toBeUndefined();
  });

  it("writes the credential file with owner-only permissions", async () => {
    const filePath = await tempPath();
    await saveAnthropicCredentials(creds(), filePath);
    const mode = (await fs.stat(filePath)).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

describe("getFreshAnthropicAccessToken", () => {
  it("returns undefined when not logged in (falls back to env auth)", async () => {
    const filePath = await tempPath();
    const token = await getFreshAnthropicAccessToken({ credentialsPath: filePath });
    expect(token).toBeUndefined();
  });

  it("returns the stored token without refreshing when it is still valid", async () => {
    const filePath = await tempPath();
    await saveAnthropicCredentials(creds({ expires: 1_000_000, access: "sk-ant-oat-valid" }), filePath);
    let refreshed = false;
    const token = await getFreshAnthropicAccessToken({
      credentialsPath: filePath,
      now: 500_000,
      refresh: async () => {
        refreshed = true;
        return creds();
      },
    });
    expect(token).toBe("sk-ant-oat-valid");
    expect(refreshed).toBe(false);
  });

  it("refreshes and persists when the token is expired", async () => {
    const filePath = await tempPath();
    await saveAnthropicCredentials(creds({ expires: 100_000, access: "sk-ant-oat-old", refresh: "rt-old" }), filePath);
    const token = await getFreshAnthropicAccessToken({
      credentialsPath: filePath,
      now: 200_000,
      refresh: async (refreshToken) => {
        expect(refreshToken).toBe("rt-old");
        return { refresh: "rt-new", access: "sk-ant-oat-new", expires: 9_999_999 };
      },
    });
    expect(token).toBe("sk-ant-oat-new");
    // The refreshed credentials must be persisted for the next run.
    const persisted = await loadAnthropicCredentials(filePath);
    expect(persisted?.access).toBe("sk-ant-oat-new");
    expect(persisted?.refresh).toBe("rt-new");
  });
});
