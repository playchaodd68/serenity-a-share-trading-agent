import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

// Atomic write: temp-file + rename so a crash mid-write can never leave a truncated
// state file (watchlist/graveyard/bear-cases/decision-log all persist through here).
export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt state file: preserve it for forensics instead of throwing (which would
    // brick every command) or silently overwriting the evidence.
    const backupPath = `${filePath}.corrupt-${Date.now()}`;
    try {
      await fs.rename(filePath, backupPath);
      console.warn(`readJsonFile: ${filePath} is not valid JSON; moved to ${backupPath} and using fallback.`);
    } catch {
      console.warn(`readJsonFile: ${filePath} is not valid JSON; using fallback.`);
    }
    return fallback;
  }
}

export async function appendJsonl(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

export function safeFilename(input: string): string {
  return input.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "-").slice(0, 120);
}
