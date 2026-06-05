import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Candidate, SourceRecord } from "../types.js";
import { ensureDir } from "../utils/fs.js";

const execFileAsync = promisify(execFile);
const CNINFO_BASE = "http://www.cninfo.com.cn";
const CNINFO_STATIC_BASE = "https://static.cninfo.com.cn";
const CNINFO_DATA_DIR = path.resolve("data/cninfo");

interface CninfoCompany {
  code: string;
  orgId: string;
  zwjc: string;
}

interface CninfoAnnouncement {
  secCode: string;
  secName: string;
  orgId: string;
  announcementId: string;
  announcementTitle: string;
  announcementTime: number;
  adjunctUrl: string;
  adjunctType: string;
}

interface CninfoAnnouncementResponse {
  announcements: CninfoAnnouncement[] | null;
}

export interface CninfoFetchResult {
  sources: SourceRecord[];
  warnings: string[];
}

function cninfoHeaders(referer: string): Record<string, string> {
  return {
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    origin: CNINFO_BASE,
    referer,
    "user-agent": "Mozilla/5.0 serenity-a-share-trading-agent/1.0",
  };
}

async function postCninfoJson<T>(url: string, data: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: cninfoHeaders(`${CNINFO_BASE}/new/commonUrl?url=disclosure/list/notice`),
    body: new URLSearchParams(data),
  });
  if (!response.ok) throw new Error(`CNINFO request failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

function columnForCode(code: string): string {
  return code.startsWith("6") ? "sse" : "szse";
}

function dateRange(): string {
  const end = new Date().toISOString().slice(0, 10);
  return `2024-01-01~${end}`;
}

export async function fetchCninfoCompany(code: string): Promise<CninfoCompany | null> {
  const rows = await postCninfoJson<CninfoCompany[]>(`${CNINFO_BASE}/new/information/topSearch/query`, {
    keyWord: code,
    maxNum: "10",
  });
  return rows.find((row) => row.code === code) ?? rows[0] ?? null;
}

export async function fetchCninfoAnnualReports(code: string, orgId: string): Promise<CninfoAnnouncement[]> {
  const body = await postCninfoJson<CninfoAnnouncementResponse>(`${CNINFO_BASE}/new/hisAnnouncement/query`, {
    pageNum: "1",
    pageSize: "8",
    column: columnForCode(code),
    tabName: "fulltext",
    plate: "",
    stock: `${code},${orgId}`,
    searchkey: "",
    secid: "",
    category: "category_ndbg_szsh;",
    trade: "",
    seDate: dateRange(),
    sortName: "",
    sortType: "",
    isHLtitle: "true",
  });
  return (body.announcements ?? []).filter(
    (item) => item.announcementTitle.includes("年度报告") && !item.announcementTitle.includes("摘要") && !item.announcementTitle.includes("英文版"),
  );
}

async function downloadPdf(url: string, targetPath: string): Promise<void> {
  try {
    await fs.access(targetPath);
    return;
  } catch {
    // Continue to download.
  }
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 serenity-a-share-trading-agent/1.0" } });
  if (!response.ok) throw new Error(`CNINFO PDF download failed: ${response.status}`);
  await ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, Buffer.from(await response.arrayBuffer()));
}

function compactPdfText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function firstTermIndex(lowerText: string, terms: string[]): number | undefined {
  return terms
    .map((term) => lowerText.indexOf(term.toLowerCase()))
    .filter((value) => value >= 0)
    .sort((a, b) => a - b)[0];
}

function preferredTermIndex(lowerText: string, terms: string[]): number | undefined {
  for (const term of terms) {
    const index = lowerText.indexOf(term.toLowerCase());
    if (index >= 0) return index;
  }
  return undefined;
}

function textWindow(compact: string, index: number, before = 220, length = 620): string {
  const start = Math.max(0, index - before);
  return compact.slice(start, start + length);
}

export function selectRelevantCninfoSnippet(text: string, priorityTerms: string[], fallbackTerms: string[]): string {
  const compact = compactPdfText(text);
  const lower = compact.toLowerCase();
  const relationshipTerms = ["产能", "良率", "扩产", "供应", "供应商", "客户", "订单", "验证"];
  const windows = [
    firstTermIndex(lower, priorityTerms.filter((term) => !["客户", "订单", "产能", "良率"].includes(term))),
    preferredTermIndex(lower, relationshipTerms.filter((term) => priorityTerms.includes(term))),
  ]
    .filter((value): value is number => value != null)
    .map((index) => textWindow(compact, index));
  if (windows.length > 0) return [...new Set(windows)].join(" ... ").slice(0, 1_200);
  const fallbackIndex = firstTermIndex(lower, fallbackTerms);
  if (fallbackIndex != null) return textWindow(compact, fallbackIndex, 160, 800);
  return compact.slice(0, 800);
}

function matchedTerms(text: string, terms: string[]): string[] {
  const lower = text.toLowerCase();
  return [...new Set(terms.filter((term) => lower.includes(term.toLowerCase())))];
}

async function extractPdfEvidence(pdfPath: string, priorityTerms: string[], fallbackTerms: string[]): Promise<{ snippet: string; tags: string[] }> {
  try {
    const { stdout } = await execFileAsync("pdftotext", ["-layout", "-nopgbrk", pdfPath, "-"], { maxBuffer: 3 * 1024 * 1024 });
    return {
      snippet: selectRelevantCninfoSnippet(stdout, priorityTerms, fallbackTerms),
      tags: matchedTerms(compactPdfText(stdout), priorityTerms),
    };
  } catch {
    return { snippet: "", tags: [] };
  }
}

function reportUrl(announcement: CninfoAnnouncement): string {
  return `${CNINFO_STATIC_BASE}/${announcement.adjunctUrl}`;
}

export async function cninfoAnnouncementToSource(announcement: CninfoAnnouncement, snippet = "", tags: string[] = []): Promise<SourceRecord> {
  const publishedAt = new Date(announcement.announcementTime).toISOString().slice(0, 10);
  const url = reportUrl(announcement);
  return {
    id: `P0-CNINFO-${announcement.secCode}-${announcement.announcementId}`,
    title: `${announcement.secCode} ${announcement.secName} ${announcement.announcementTitle}`,
    tier: "P0",
    sourceType: "primary",
    publisher: "CNINFO / 深圳证券信息有限公司",
    observedAt: publishedAt,
    url,
    path: path.join(CNINFO_DATA_DIR, `${announcement.secCode}-${announcement.announcementId}.PDF`),
    summary:
      snippet ||
      `${announcement.secCode} ${announcement.secName} 于 ${publishedAt} 在巨潮资讯披露 ${announcement.announcementTitle}，公告 ID ${announcement.announcementId}。`,
    evidenceTags: [...new Set([announcement.secCode, announcement.secName, "annual-report", "announcement", "candidate-direct", "cninfo", ...tags])],
  };
}

export async function fetchCninfoAnnualReportSourcesForCandidates(candidates: Candidate[]): Promise<CninfoFetchResult> {
  const sources: SourceRecord[] = [];
  const warnings: string[] = [];
  for (const candidate of candidates) {
    try {
      const company = await fetchCninfoCompany(candidate.stock.code);
      if (!company) {
        warnings.push(`${candidate.stock.code} ${candidate.stock.name}: CNINFO company lookup returned no match.`);
        continue;
      }
      const reports = await fetchCninfoAnnualReports(candidate.stock.code, company.orgId);
      const latest = reports[0];
      if (!latest) {
        warnings.push(`${candidate.stock.code} ${candidate.stock.name}: no CNINFO annual report found.`);
        continue;
      }
      const pdfUrl = reportUrl(latest);
      const pdfPath = path.join(CNINFO_DATA_DIR, `${latest.secCode}-${latest.announcementId}.PDF`);
      await downloadPdf(pdfUrl, pdfPath);
      const priorityTerms = [
        ...candidate.matchedThemes.flatMap((theme) => theme.keywords),
        ...candidate.stock.concept.split(/\s+/),
        candidate.stock.industry,
        "客户",
        "订单",
        "产能",
        "良率",
      ].filter((term) => term.length >= 2);
      const fallbackTerms = [
        candidate.stock.name,
        candidate.stock.code,
      ].filter((term) => term.length >= 2);
      const evidence = await extractPdfEvidence(pdfPath, [...new Set(priorityTerms)], [...new Set(fallbackTerms)]);
      sources.push(await cninfoAnnouncementToSource(latest, evidence.snippet, evidence.tags));
    } catch (error) {
      warnings.push(`${candidate.stock.code} ${candidate.stock.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { sources, warnings };
}
