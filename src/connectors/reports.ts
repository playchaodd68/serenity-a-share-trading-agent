import fs from "node:fs/promises";
import path from "node:path";
import type { SourceRecord } from "../types.js";
import { safeFilename } from "../utils/fs.js";

const SUPPORTED_EXTENSIONS = new Set([".pdf", ".md", ".txt", ".html", ".json"]);

export async function ingestLocalReportSources(inbox: string): Promise<SourceRecord[]> {
  try {
    const entries = await fs.readdir(inbox, { withFileTypes: true });
    const sources: SourceRecord[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
      const filePath = path.resolve(inbox, entry.name);
      const stat = await fs.stat(filePath);
      sources.push({
        id: `LOCAL-REPORT-${safeFilename(entry.name).toUpperCase()}`,
        title: entry.name,
        tier: ext === ".pdf" ? "P1" : "P1",
        sourceType: "local_file",
        publisher: "Local licensed report inbox",
        observedAt: stat.mtime.toISOString().slice(0, 10),
        path: filePath,
        summary: "User-provided local report/high-quality information file registered for RAG ingestion.",
        evidenceTags: ["local-report", ext.slice(1)],
      });
    }
    return sources;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
