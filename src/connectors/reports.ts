import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SourceRecord } from "../types.js";
import { safeFilename } from "../utils/fs.js";

const SUPPORTED_EXTENSIONS = new Set([".pdf", ".md", ".txt", ".html", ".json"]);
const execFileAsync = promisify(execFile);
const TAG_TERMS = [
  "CPO",
  "光模块",
  "硅光",
  "激光器",
  "功率半导体",
  "SiC",
  "GaN",
  "机器人",
  "减速器",
  "丝杠",
  "先进封装",
  "Chiplet",
  "HBM",
  "半导体",
  "刻蚀",
  "薄膜",
  "EDA",
  "客户",
  "订单",
  "产能",
  "良率",
  "风险",
];

function compactText(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function extractPdfText(filePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("pdftotext", ["-layout", "-nopgbrk", filePath, "-"], { maxBuffer: 2 * 1024 * 1024 });
    return stdout;
  } catch {
    return "";
  }
}

async function extractLocalReportText(filePath: string, ext: string): Promise<string> {
  if (ext === ".pdf") return compactText(await extractPdfText(filePath));
  const raw = await fs.readFile(filePath, "utf8");
  if (ext === ".json") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return compactText(typeof parsed === "string" ? parsed : JSON.stringify(parsed));
    } catch {
      return compactText(raw);
    }
  }
  return compactText(raw);
}

function summarizeText(text: string): string {
  if (!text) return "User-provided local report/high-quality information file registered for RAG ingestion; text extraction was unavailable.";
  return text.slice(0, 420);
}

function extractTags(fileName: string, ext: string, text: string): string[] {
  const haystack = `${fileName} ${text}`.toLowerCase();
  const tags = TAG_TERMS.filter((term) => haystack.includes(term.toLowerCase()));
  return [...new Set(["local-report", ext.slice(1), ...tags])];
}

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
      const text = await extractLocalReportText(filePath, ext);
      sources.push({
        id: `LOCAL-REPORT-${safeFilename(entry.name).toUpperCase()}`,
        title: entry.name,
        tier: ext === ".pdf" ? "P1" : "P1",
        sourceType: "local_file",
        publisher: "Local licensed report inbox",
        observedAt: stat.mtime.toISOString().slice(0, 10),
        path: filePath,
        summary: summarizeText(text),
        evidenceTags: extractTags(entry.name, ext, text),
      });
    }
    return sources;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
