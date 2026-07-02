import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getConfig, knowledgebasePath } from "../config.js";
import type { SourceRecord } from "../types.js";
import { toSimplifiedChinese } from "../utils/chinese.js";
import { ensureDir, readJsonFile, safeFilename, writeJsonFile } from "../utils/fs.js";
import { evaluateFfdAutoDownloadCandidate, matchFfdInstitutionText, renderFfdAutoDownloadEvaluation, type FfdAutoDownloadEvaluation } from "./ffd-auto-download.js";

const execFileAsync = promisify(execFile);

export type FfdReportStatus = "downloaded" | "staged" | "accepted" | "rejected" | "archived";
export type FfdReportEvidenceKind =
  | "customer_order_capacity"
  | "price_supply_inventory_cycle"
  | "margin_yield_profit"
  | "technology_route_bottleneck"
  | "risk_competition_substitution"
  | "valuation_rating"
  | "background_context";

export interface FfdReportSection {
  id: string;
  order: number;
  level: number;
  title: string;
  path: string[];
  text: string;
  tags: string[];
  topics: string[];
  companies: string[];
  tokenEstimate: number;
  charStart: number;
  charEnd: number;
}

export interface FfdReportClaim {
  id: string;
  text: string;
  polarity: "positive" | "negative" | "neutral";
  tags: string[];
  evidenceKind?: FfdReportEvidenceKind;
  evidenceStrength?: "hard" | "context" | "soft";
  sectionPath?: string[];
  companies?: string[];
  topics?: string[];
  sourceTier?: "P1";
  requiresP0Verification?: boolean;
  chunkId?: string;
}

export interface FfdReportChunk {
  id: string;
  order: number;
  text: string;
  tags: string[];
  sectionTitle?: string;
  sectionPath?: string[];
  topics?: string[];
  companies?: string[];
  evidenceKinds?: FfdReportEvidenceKind[];
  sourceTier?: "P1";
  requiresP0Verification?: boolean;
  tokenEstimate: number;
}

export interface FfdReportEvidenceItem {
  id: string;
  kind: FfdReportEvidenceKind;
  label: string;
  snippet: string;
  tags: string[];
  chunkId?: string;
  claimId?: string;
  sectionPath?: string[];
  companies: string[];
  topics: string[];
  sourceTier: "P1";
  strength: "hard" | "context" | "soft";
  requiresP0Verification: boolean;
}

export interface FfdReportManifest {
  id: string;
  title: string;
  fileName: string;
  rawPath: string;
  checksum: string;
  sizeBytes: number;
  status: FfdReportStatus;
  provider: "FFD";
  sourceTier: "P1";
  sourceType: "broker_report";
  ffdFileId?: number;
  metadataPath?: string;
  institution?: string;
  industry?: string;
  publishedAt?: string;
  convertedAt: string;
  converter: string;
  markdownPath: string;
  summaryPath: string;
  claimsPath: string;
  chunksPath: string;
  sectionsPath?: string;
  evidencePath?: string;
  canonicalPath?: string;
  manifestPath: string;
  converterOutputPath?: string;
  assetPath?: string;
  obsidianStagingPath?: string;
  obsidianFullPath?: string;
  obsidianAcceptedPath?: string;
  sourceRecordId?: string;
  summary: string;
  tags: string[];
  topics?: string[];
  companies?: string[];
  evidenceKinds?: FfdReportEvidenceKind[];
  claimCount: number;
  chunkCount: number;
  sectionCount?: number;
  evidenceCount?: number;
  tableCount?: number;
  imageCount?: number;
  textCharCount?: number;
  quality?: FfdAutoDownloadEvaluation;
}

export interface FfdReportLibraryOptions {
  rawDir?: string;
  processedDir?: string;
  obsidianRoot?: string;
  writeObsidian?: boolean;
  force?: boolean;
  reportIds?: string[];
  converter?: (filePath: string) => Promise<FfdReportConverterResult>;
  now?: string;
}

export interface FfdReportEnhanceOptions extends FfdReportLibraryOptions {
  reportIds?: string[];
  includeAll?: boolean;
  includeFailed?: boolean;
}

interface FfdRawMetadata {
  file_id?: number;
  fileId?: number;
  file_name?: string;
  fileName?: string;
  organization?: string;
  institution?: string;
  industry?: string;
  category_name?: string;
  categoryName?: string;
  publish_date?: string;
  publishedAt?: string;
  uploaded_at?: string;
  summary?: string;
  tags?: string[];
}

interface FfdReportConverterResult {
  markdown: string;
  converter: string;
  assetRoot?: string;
  artifactRoot?: string;
}

export interface FfdReportLibraryRun {
  rawDir: string;
  processedDir: string;
  obsidianRoot?: string;
  processed: FfdReportManifest[];
  skipped: FfdReportManifest[];
  warnings: string[];
}

const SUPPORTED_RAW_EXTENSIONS = new Set([".pdf", ".md", ".txt", ".docx", ".doc"]);
const REPORT_TAG_TERMS = [
  "CPO",
  "光模块",
  "硅光",
  "800G",
  "1.6T",
  "LPO",
  "DSP",
  "EML",
  "薄膜铌酸锂",
  "半导体",
  "AI",
  "GPU",
  "ASIC",
  "HBM",
  "DRAM",
  "NAND",
  "NOR Flash",
  "DDR5",
  "LPDDR5",
  "eSSD",
  "CXL Memory",
  "存储",
  "存储芯片",
  "存储器",
  "内存",
  "闪存",
  "长鑫存储",
  "长江存储",
  "兆易创新",
  "江波龙",
  "佰维存储",
  "澜起科技",
  "香农芯创",
  "东芯股份",
  "普冉股份",
  "三星DRAM",
  "三星NAND",
  "三星存储",
  "CoWoS",
  "SerDes",
  "交换芯片",
  "PCB",
  "CCL",
  "覆铜板",
  "铜箔",
  "机器人",
  "新能源",
  "通信",
  "软件",
  "互联网",
  "医药",
  "银行",
  "化工",
  "有色金属",
  "汽车",
  "客户",
  "订单",
  "产能",
  "价格",
  "毛利率",
  "良率",
  "风险",
  "库存",
  "涨价",
  "供需",
  "供需紧张",
  "供应不足",
  "价格周期",
];

const POSITIVE_CLAIM_TERMS = ["上调", "增长", "改善", "放量", "涨价", "价格上行", "扩产", "订单", "需求", "盈利", "毛利率", "国产替代", "验证"];
const NEGATIVE_CLAIM_TERMS = ["下调", "下降", "风险", "承压", "不及预期", "库存", "降价", "竞争", "替代", "放缓", "亏损"];

const REPORT_COMPANY_TERMS = [
  "新易盛",
  "中际旭创",
  "东山精密",
  "澜起科技",
  "拓荆科技",
  "绿的谐波",
  "兆易创新",
  "普冉股份",
  "北京君正",
  "江波龙",
  "佰维存储",
  "东芯股份",
  "香农芯创",
  "长鑫存储",
  "长江存储",
  "壁仞科技",
  "锐捷网络",
  "铠侠",
  "三星",
  "SK海力士",
  "美光",
  "英飞凌",
  "意法",
  "村田",
];

const TOPIC_DEFINITIONS: Array<{ label: string; terms: string[]; ruleIds?: string[] }> = [
  { label: "AI 光互连 / AI PCB / 先进封装", terms: ["CPO", "硅光", "光模块", "800G", "1.6T", "LPO", "DSP", "EML", "AI PCB", "高速PCB", "CCL", "覆铜板", "CoWoS", "Chiplet", "SerDes"], ruleIds: ["ai-optical-pcb-packaging"] },
  { label: "存储芯片 / HBM / DRAM / NAND", terms: ["HBM", "DRAM", "NAND", "NOR Flash", "DDR5", "LPDDR5", "eSSD", "CXL Memory", "存储", "存储芯片", "存储器", "内存", "闪存", "利基存储", "铠侠"], ruleIds: ["memory-chips-hbm-dram-nand"] },
  { label: "半导体设备 / 材料国产替代", terms: ["半导体设备", "薄膜沉积", "ALD", "CVD", "PVD", "刻蚀", "量测", "检测", "先进制程", "先进封装设备", "国产替代", "晶圆厂", "良率"], ruleIds: ["semi-equipment-materials"] },
  { label: "人形机器人 / 执行器瓶颈", terms: ["人形机器人", "机器人执行器", "谐波减速器", "RV减速器", "滚柱丝杠", "丝杠", "伺服", "电机", "传感器", "稀土磁材"], ruleIds: ["humanoid-robot-actuator"] },
  { label: "AI 被动元件 / 功率半导体 / 电源链", terms: ["MLCC", "钽电容", "被动元件", "功率半导体", "SiC", "碳化硅", "电源"], ruleIds: ["adjacent-ai-passives-power"] },
  { label: "AI 算力芯片 / 国产 GPU / ASIC", terms: ["GPU", "ASIC", "AI芯片", "算力芯片", "国产GPU"], ruleIds: ["adjacent-ai-compute-chip"] },
  { label: "Watchlist 公司直接验证", terms: ["拓荆科技", "东山精密", "绿的谐波", "中际旭创", "新易盛", "澜起科技"], ruleIds: ["watchlist-direct-validation", "adjacent-ai-optical-company-update"] },
];

const EVIDENCE_DEFINITIONS: Array<{ kind: FfdReportEvidenceKind; label: string; terms: string[]; tags: string[]; strength: "hard" | "context" | "soft" }> = [
  { kind: "customer_order_capacity", label: "客户 / 订单 / 产能 / 放量", terms: ["客户", "订单", "产能", "扩产", "放量", "出货", "交付", "认证", "导入", "定点", "资本开支"], tags: ["customer", "order", "capacity"], strength: "hard" },
  { kind: "price_supply_inventory_cycle", label: "价格 / 供需 / 库存 / 周期", terms: ["价格", "涨价", "降价", "供需", "库存", "周期", "需求", "供给", "供应不足", "供需紧张"], tags: ["price-cycle", "supply-demand", "inventory"], strength: "hard" },
  { kind: "margin_yield_profit", label: "毛利率 / 良率 / 盈利弹性", terms: ["毛利率", "良率", "盈利", "利润", "净利润", "利润率", "业绩上修", "成本", "产品结构"], tags: ["margin", "yield", "profit"], strength: "hard" },
  { kind: "technology_route_bottleneck", label: "技术路线 / 关键瓶颈", terms: ["技术路线", "瓶颈", "CPO", "硅光", "800G", "1.6T", "EML", "DSP", "CoWoS", "HBM", "MLCC", "SiC", "耦合", "测试", "封装"], tags: ["technology-route", "bottleneck"], strength: "context" },
  { kind: "risk_competition_substitution", label: "风险 / 替代 / 竞争格局", terms: ["风险", "替代", "竞争", "竞争格局", "供应风险", "不及预期", "降价", "客户自研", "份额"], tags: ["risk", "competition", "substitution"], strength: "hard" },
  { kind: "valuation_rating", label: "估值 / 评级 / 目标价", terms: ["目标价", "评级", "买入", "增持", "估值", "PE", "PS", "上调至", "下调至"], tags: ["valuation", "rating"], strength: "soft" },
  { kind: "background_context", label: "产业背景 / 框架 / 观点", terms: ["产业链", "框架", "梳理", "专题", "深度", "趋势", "格局", "景气"], tags: ["background", "framework"], strength: "context" },
];

function normalizeWhitespace(value: string): string {
  return value.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

function compactText(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function stripMarkdownMedia(value: string): string {
  return value
    .replace(/!\[[^\]]*]\([^)]+\)/g, " [image] ")
    .replace(/<img\b[^>]*>/gi, " [image] ");
}

function compactForMatch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesTerm(text: string, term: string): boolean {
  if (/^[a-z0-9.+-]{1,5}$/i.test(term)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(term.toLowerCase())}($|[^a-z0-9])`, "i").test(text);
  }
  return compactForMatch(text).includes(compactForMatch(term));
}

// Company recognition = built-in term list + the real A-share universe dictionary
// (data/a-share-universe.json, refreshed by every screen run). Names shorter than
// 3 chars are excluded from the dictionary path to avoid false positives.
let cachedUniverseNames: string[] | null = null;
function universeCompanyNames(): string[] {
  if (cachedUniverseNames) return cachedUniverseNames;
  try {
    const raw = readFileSync(path.resolve("data/a-share-universe.json"), "utf8");
    const rows = JSON.parse(raw) as Array<{ name?: string }>;
    cachedUniverseNames = rows
      .map((row) => (row.name ?? "").trim())
      .filter((name) => name.length >= 3 && !/ST|退/.test(name));
  } catch {
    cachedUniverseNames = [];
  }
  return cachedUniverseNames;
}

function inferCompanies(...values: string[]): string[] {
  const text = values.filter(Boolean).join(" ");
  const builtin = REPORT_COMPANY_TERMS.filter((company) => includesTerm(text, company));
  const universe = universeCompanyNames().filter((name) => text.includes(name));
  return [...new Set([...builtin, ...universe])];
}

function inferTopicsFromText(text: string, quality?: FfdAutoDownloadEvaluation): string[] {
  const topics = TOPIC_DEFINITIONS
    .filter((topic) => {
      if (topic.label === "人形机器人 / 执行器瓶颈" && !["人形机器人", "机器人", "机器人执行器"].some((term) => includesTerm(text, term))) return false;
      return topic.terms.some((term) => includesTerm(text, term))
        || topic.ruleIds?.some((ruleId) => quality?.matchedRuleIds.includes(ruleId));
    })
    .map((topic) => topic.label);
  return [...new Set(topics)];
}

function evidenceKindsForText(text: string): FfdReportEvidenceKind[] {
  return EVIDENCE_DEFINITIONS
    .filter((definition) => definition.terms.some((term) => includesTerm(text, term)))
    .map((definition) => definition.kind);
}

function evidenceDefinition(kind: FfdReportEvidenceKind): (typeof EVIDENCE_DEFINITIONS)[number] {
  return EVIDENCE_DEFINITIONS.find((definition) => definition.kind === kind) ?? EVIDENCE_DEFINITIONS[EVIDENCE_DEFINITIONS.length - 1]!;
}

function countMarkdownTables(markdown: string): number {
  const lines = markdown.split(/\r?\n/);
  let count = 0;
  for (let index = 1; index < lines.length; index += 1) {
    if (/\|/.test(lines[index - 1] ?? "") && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index] ?? "")) count += 1;
  }
  return count;
}

function countMarkdownImages(markdown: string): number {
  return (markdown.match(/!\[[^\]]*]\([^)]+\)/g) ?? []).length + (markdown.match(/<img\b/gi) ?? []).length;
}

function titleFromFileName(fileName: string): string {
  return path.basename(fileName, path.extname(fileName)).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function metadataFileName(metadata?: FfdRawMetadata): string | undefined {
  return metadata?.file_name ?? metadata?.fileName;
}

function metadataInstitution(metadata?: FfdRawMetadata): string | undefined {
  return metadata?.organization ?? metadata?.institution;
}

function metadataFileId(metadata?: FfdRawMetadata): number | undefined {
  const fileId = metadata?.file_id ?? metadata?.fileId;
  return typeof fileId === "number" && Number.isFinite(fileId) ? fileId : undefined;
}

function inferInstitution(fileName: string, metadata?: FfdRawMetadata): string | undefined {
  const explicit = metadataInstitution(metadata);
  if (explicit) return explicit;
  const base = path.basename(fileName, path.extname(fileName));
  const underscoreParts = base.split("_").map((part) => part.trim()).filter(Boolean);
  if (/^20\d{6}$/.test(underscoreParts[0] ?? "") && underscoreParts[1]) return underscoreParts[1];
  const dateDash = base.match(/^20\d{6}[-_—]+([^-_—]+?)(?:[-_—]|$)/);
  if (dateDash?.[1]) return dateDash[1].trim();
  const leadingDash = base.split("-").map((part) => part.trim()).filter(Boolean);
  if (leadingDash.length > 1 && !/^\d/.test(leadingDash[0] ?? "")) return leadingDash[0];
  return matchFfdInstitutionText(base);
}

function inferPublishedAt(fileName: string, metadata?: FfdRawMetadata): string | undefined {
  const explicit = metadata?.publish_date ?? metadata?.publishedAt ?? metadata?.uploaded_at;
  if (explicit) return explicit.slice(0, 10);
  const yyyymmdd = fileName.match(/(20\d{2})(\d{2})(\d{2})/);
  if (yyyymmdd) return `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}`;
  const yymmdd = fileName.match(/(?:^|[-_])(\d{2})(\d{2})(\d{2})(?:\.|$)/);
  if (yymmdd) return `20${yymmdd[1]}-${yymmdd[2]}-${yymmdd[3]}`;
  return undefined;
}

function extractTags(...values: string[]): string[] {
  const haystack = values.join(" ").toLowerCase();
  const tags = REPORT_TAG_TERMS.filter((term) => haystack.includes(term.toLowerCase()));
  return [...new Set(["ffd-library", "broker-report", "auto-converted-md", ...tags])];
}

function inferIndustry(tags: string[], metadata?: FfdRawMetadata): string | undefined {
  if (metadata?.industry) return metadata.industry;
  const industryTags = ["半导体", "通信", "软件", "互联网", "医药", "银行", "化工", "有色金属", "汽车", "新能源"];
  return industryTags.find((tag) => tags.includes(tag));
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update(await fs.readFile(filePath));
  return hash.digest("hex");
}

async function readRawMetadata(rawPath: string): Promise<{ metadata?: FfdRawMetadata; metadataPath?: string }> {
  const candidates = [
    `${rawPath}.ffd-meta.json`,
    `${rawPath}.meta.json`,
    path.join(path.dirname(rawPath), `${path.basename(rawPath, path.extname(rawPath))}.ffd-meta.json`),
  ];
  for (const candidate of candidates) {
    const metadata = await readJsonFile<FfdRawMetadata | undefined>(candidate, undefined);
    if (metadata) return { metadata, metadataPath: candidate };
  }
  return {};
}

async function convertWithPymupdf4llm(filePath: string): Promise<string> {
  const script = [
    "import sys",
    "import pymupdf4llm",
    "sys.stdout.write(pymupdf4llm.to_markdown(sys.argv[1]))",
  ].join("; ");
  const { stdout } = await execFileAsync("python3", ["-c", script, filePath], { maxBuffer: 24 * 1024 * 1024 });
  return stdout;
}

async function convertWithPdftotext(filePath: string): Promise<string> {
  const { stdout } = await execFileAsync("pdftotext", ["-layout", "-nopgbrk", filePath, "-"], { maxBuffer: 24 * 1024 * 1024 });
  return stdout
    .split(/\n{2,}/)
    .map((block) => block.trimEnd())
    .filter(Boolean)
    .join("\n\n");
}

async function convertWithTextutil(filePath: string): Promise<string> {
  const { stdout } = await execFileAsync("textutil", ["-convert", "txt", "-stdout", filePath], { maxBuffer: 24 * 1024 * 1024 });
  const text = stdout
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .join("\n\n");
  if (!text) throw new Error("textutil produced empty output");
  return text;
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync("which", [command], { maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function renderEnhanceCommand(template: string, inputPath: string, outputDir: string): string {
  return template
    .replaceAll("{input}", shellQuote(inputPath))
    .replaceAll("{outputDir}", shellQuote(outputDir));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function parserFriendlyInputPath(filePath: string, tempDir: string): Promise<string> {
  const lower = filePath.toLowerCase();
  if (!lower.endsWith(".pdf")) return filePath;

  let isOfficePayload = false;
  try {
    const handle = await fs.open(filePath, "r");
    try {
      const buffer = Buffer.alloc(4);
      await handle.read(buffer, 0, 4, 0);
      isOfficePayload = buffer.subarray(0, 2).equals(Buffer.from("PK"));
    } finally {
      await handle.close();
    }
  } catch {
    return filePath;
  }
  if (!isOfficePayload) return filePath;

  const correctedPath = lower.endsWith(".docx.pdf") ? filePath.slice(0, -4) : `${filePath.slice(0, -4)}.docx`;
  if (await fileExists(correctedPath)) return correctedPath;
  const tempInput = path.join(tempDir, safeFilename(path.basename(correctedPath)));
  await fs.symlink(filePath, tempInput);
  return tempInput;
}

async function findLargestMarkdownFile(root: string): Promise<string | undefined> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await findLargestMarkdownFile(entryPath);
      if (nested) files.push(nested);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(entryPath);
  }
  if (files.length === 0) return undefined;
  const stats = await Promise.all(files.map(async (file) => ({ file, size: (await fs.stat(file)).size })));
  return stats.sort((a, b) => b.size - a.size)[0]?.file;
}

async function convertWithShellEnhancer(filePath: string, commandTemplate: string, label: string): Promise<FfdReportConverterResult> {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "ffd-report-enhance-"));
  const parserInputPath = await parserFriendlyInputPath(filePath, outputDir);
  const command = renderEnhanceCommand(commandTemplate, parserInputPath, outputDir);
  const timeout = Number(process.env.FFD_REPORT_ENHANCE_TIMEOUT_MS || 20 * 60 * 1000);
  const { stdout } = await execFileAsync("zsh", ["-lc", command], { maxBuffer: 64 * 1024 * 1024, timeout });
  const markdownPath = await findLargestMarkdownFile(outputDir);
  if (markdownPath) {
    const markdown = await fs.readFile(markdownPath, "utf8");
    if (markdown.trim()) return { markdown, converter: label, assetRoot: path.dirname(markdownPath), artifactRoot: outputDir };
  }
  if (stdout.trim()) return { markdown: stdout, converter: `${label}:stdout` };
  throw new Error(`${label} did not produce markdown output`);
}

async function convertWithOptionalCli(filePath: string): Promise<FfdReportConverterResult | undefined> {
  const attempts: Array<{ command: string; template: string; label: string }> = [
    { command: "mineru", template: "mineru -p {input} -o {outputDir} -m auto", label: "high-quality:mineru" },
    { command: "magic-pdf", template: "magic-pdf -p {input} -o {outputDir} -m auto", label: "high-quality:magic-pdf" },
    { command: "marker_single", template: "marker_single {input} --output_dir {outputDir} --output_format markdown", label: "high-quality:marker" },
    { command: "docling", template: "docling {input} --to md --output {outputDir}", label: "high-quality:docling" },
  ];
  for (const attempt of attempts) {
    if (!(await commandExists(attempt.command))) continue;
    try {
      return await convertWithShellEnhancer(filePath, attempt.template, attempt.label);
    } catch {
      continue;
    }
  }
  return undefined;
}

export async function fastReportMarkdownConverter(filePath: string): Promise<FfdReportConverterResult> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".md") return { markdown: await fs.readFile(filePath, "utf8"), converter: "markdown-pass-through" };
  if (ext === ".txt") {
    const text = await fs.readFile(filePath, "utf8");
    return { markdown: text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean).join("\n\n"), converter: "text-to-markdown" };
  }
  try {
    return { markdown: await convertWithPymupdf4llm(filePath), converter: "pymupdf4llm" };
  } catch {
    try {
      return { markdown: await convertWithPdftotext(filePath), converter: "pdftotext" };
    } catch {
      return { markdown: await convertWithTextutil(filePath), converter: "textutil" };
    }
  }
}

export async function enhancedReportMarkdownConverter(filePath: string): Promise<FfdReportConverterResult> {
  const config = getConfig();
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".md" || ext === ".txt") return fastReportMarkdownConverter(filePath);
  if (config.ffdReportEnhanceCommand?.trim()) {
    try {
      return await convertWithShellEnhancer(filePath, config.ffdReportEnhanceCommand, "high-quality:custom");
    } catch {
      // Fall through to auto-detected tools and fast extractors.
    }
  }
  const cliResult = await convertWithOptionalCli(filePath);
  if (cliResult) return cliResult;
  const fallback = await fastReportMarkdownConverter(filePath);
  return { ...fallback, converter: `high-quality-fallback:${fallback.converter}` };
}

export const defaultReportMarkdownConverter = enhancedReportMarkdownConverter;

function splitSentences(markdown: string): string[] {
  return compactText(stripMarkdownMedia(markdown))
    .split(/(?<=[。！？!?；;])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 18 && sentence.length <= 520);
}

function headingFromLine(line: string): { level: number; title: string } | undefined {
  const trimmed = line.trim();
  const markdownHeading = trimmed.match(/^(#{1,4})\s+(.{2,120})$/);
  if (markdownHeading) return { level: markdownHeading[1]!.length, title: normalizeOutlineLine(markdownHeading[2]!) };
  if (/^(投资要点|核心观点|内容目录|图表目录|投资建议|投资分析意见|风险提示|盈利预测|估值|行业观点|公司观点)[:：]?$/.test(trimmed)) return { level: 2, title: trimmed.replace(/[:：]$/, "") };
  const numbered = trimmed.match(/^(\d+(?:\.\d+){0,3})[\.、]?\s+(.{3,100})$/);
  if (numbered) return { level: Math.min(numbered[1]!.split(".").length + 1, 4), title: normalizeOutlineLine(`${numbered[1]} ${numbered[2]}`) };
  const cnNumbered = trimmed.match(/^([一二三四五六七八九十]+)[、.]\s*(.{3,100})$/);
  if (cnNumbered) return { level: 2, title: normalizeOutlineLine(trimmed) };
  return undefined;
}

function extractReportSections(markdown: string, tags: string[], quality?: FfdAutoDownloadEvaluation): FfdReportSection[] {
  const normalized = normalizeWhitespace(markdown);
  if (!normalized) return [];
  const sections: FfdReportSection[] = [];
  const pathStack: string[] = ["全文"];
  let currentTitle = "全文";
  let currentLevel = 1;
  let currentLines: string[] = [];
  let currentStart = 0;
  let cursor = 0;

  const pushSection = (charEnd: number) => {
    const text = normalizeWhitespace(currentLines.join("\n"));
    if (!text) return;
    const sectionText = `${currentTitle === "全文" ? "" : `${currentTitle}\n\n`}${text}`.trim();
    const sectionPath = [...pathStack];
    const sectionTopics = inferTopicsFromText(`${sectionPath.join(" ")} ${sectionText}`, quality);
    const sectionCompanies = inferCompanies(sectionPath.join(" "), sectionText);
    sections.push({
      id: `section-${sections.length + 1}`,
      order: sections.length + 1,
      level: currentLevel,
      title: currentTitle,
      path: sectionPath,
      text: sectionText,
      tags: extractTags(sectionPath.join(" "), sectionText, ...tags),
      topics: sectionTopics,
      companies: sectionCompanies,
      tokenEstimate: estimateTokens(sectionText),
      charStart: currentStart,
      charEnd,
    });
  };

  for (const line of normalized.split("\n")) {
    const heading = headingFromLine(line);
    if (heading) {
      pushSection(cursor);
      currentLines = [];
      currentLevel = heading.level;
      currentTitle = heading.title;
      pathStack.splice(Math.max(heading.level - 1, 1));
      pathStack[heading.level - 1] = heading.title;
      currentStart = cursor;
    } else {
      currentLines.push(line);
    }
    cursor += line.length + 1;
  }
  pushSection(normalized.length);

  if (sections.length > 0) return sections;
  return [{
    id: "section-1",
    order: 1,
    level: 1,
    title: "全文",
    path: ["全文"],
    text: normalized,
    tags: extractTags(normalized.slice(0, 4000), ...tags),
    topics: inferTopicsFromText(normalized, quality),
    companies: inferCompanies(normalized),
    tokenEstimate: estimateTokens(normalized),
    charStart: 0,
    charEnd: normalized.length,
  }];
}

function buildSummary(markdown: string, title: string, sections: FfdReportSection[] = []): string {
  const prioritySections = sections
    .filter((section) => /核心观点|投资要点|投资建议|行业观点|公司观点|盈利预测|风险提示/.test(section.title))
    .map((section) => section.text);
  const priorityText = compactText(stripMarkdownMedia(prioritySections.join(" ")));
  if (priorityText.length >= 800) return priorityText.slice(0, 2400);
  const fallbackParagraphs = normalizeWhitespace(markdown)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length >= 30)
    .filter((block) => !/^!\[/.test(block))
    .filter((block) => !/^\|.*\|$/.test(block))
    .filter((block) => !/请务必|免责声明|评级说明|证券研究报告|SAC[:：]|@/.test(block))
    .slice(0, 24);
  const text = compactText(stripMarkdownMedia([...prioritySections, ...fallbackParagraphs].join(" ")));
  return (text || title).slice(0, 2400);
}

function reportTextLength(markdown: string | undefined, chunks: FfdReportChunk[]): number {
  const text = markdown?.trim() || chunks.map((chunk) => chunk.text).join("\n\n");
  return compactText(text).length;
}

function reportCoverageKind(manifest: FfdReportManifest, chunks: FfdReportChunk[], markdown?: string): "brief-note" | "fallback-fulltext" | "structured" {
  const textLength = reportTextLength(markdown, chunks);
  if (textLength < 2000 || chunks.length <= 1) return "brief-note";
  if (manifest.converter.includes("fallback")) return "fallback-fulltext";
  return "structured";
}

function coverageLabel(kind: ReturnType<typeof reportCoverageKind>): string {
  if (kind === "brief-note") return "短评/摘要级资料";
  if (kind === "fallback-fulltext") return "完整文本可用，但版面结构为降级抽取";
  return "结构化转换可用";
}

function renderConversionDiagnostics(manifest: FfdReportManifest, claims: FfdReportClaim[], chunks: FfdReportChunk[], markdown?: string): string {
  const kind = reportCoverageKind(manifest, chunks, markdown);
  const textLength = reportTextLength(markdown, chunks);
  const guidance = kind === "brief-note"
    ? "只能作为线索、催化或观点来源；不要把它当成完整行业框架，agent 回答必须回到 P0 或完整报告交叉验证。"
    : kind === "fallback-fulltext"
      ? "适合全文检索和证据定位；表格、图表、页码和版式可能丢失，涉及精确数值时应打开原文或 full markdown 复核。"
      : "可作为优先检索材料；仍按 P1 broker_report 使用，并与 P0 披露交叉验证。";

  return [
    `- 覆盖级别: **${coverageLabel(kind)}**`,
    `- Converter: \`${manifest.converter}\`; text chars: ${manifest.textCharCount ?? textLength}; sections: ${manifest.sectionCount ?? "n/a"}; chunks: ${chunks.length}; claims: ${claims.length}; evidence: ${manifest.evidenceCount ?? "n/a"}; tables: ${manifest.tableCount ?? "n/a"}; images: ${manifest.imageCount ?? "n/a"}; raw ext: \`${path.extname(manifest.fileName).toLowerCase() || "n/a"}\``,
    `- RAG 使用建议: ${guidance}`,
  ].join("\n");
}

function normalizeOutlineLine(line: string): string {
  return line
    .replace(/\s+/g, " ")
    .replace(/\.{4,}\s*\d+\s*$/, "")
    .replace(/\s+第\s*\d+\s*页.*$/, "")
    .trim();
}

function extractReportOutline(markdown: string | undefined): string[] {
  if (!markdown) return [];
  const seen = new Set<string>();
  const lines = normalizeWhitespace(markdown)
    .split("\n")
    .map(normalizeOutlineLine)
    .filter((line) => line.length >= 4 && line.length <= 120)
    .filter((line) => !/请务必|评级说明|重要声明|证券研究报告|SAC[:：]|@/.test(line));

  const outline: string[] = [];
  for (const line of lines) {
    const isSection = /^(#{1,4}\s*)?(投资要点|核心观点|内容目录|图表目录|投资分析意见|风险提示)[:：]?$/.test(line)
      || /^(#{1,4}\s*)?\d+(?:\.\d+)*[\.、]?\s+\S.{2,}$/.test(line);
    if (!isSection) continue;
    const normalized = line.replace(/^#{1,4}\s*/, "");
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    outline.push(normalized);
    if (outline.length >= 16) break;
  }
  return outline;
}

function usefulEvidenceSentence(text: string): boolean {
  return !/^(图表|资料来源|请务必|免责声明|评级说明|重要声明|第\s*\d+\s*页)/.test(text)
    && !/\.{4,}/.test(text)
    && text.length >= 24;
}

function isLowSignalSection(sectionPath: string[] | undefined): boolean {
  const value = sectionPath?.join(" ") ?? "";
  return /证券分析师|联系人|图表目录|内容目录|目录|评级说明|免责声明|法律声明/.test(value);
}

function polarityFor(text: string): FfdReportClaim["polarity"] {
  const positive = POSITIVE_CLAIM_TERMS.some((term) => text.includes(term));
  const negative = NEGATIVE_CLAIM_TERMS.some((term) => text.includes(term));
  if (negative && !positive) return "negative";
  if (positive && !negative) return "positive";
  return "neutral";
}

function evidenceKindForText(text: string): FfdReportEvidenceKind {
  return evidenceKindsForText(text)[0] ?? "background_context";
}

function extractClaims(chunks: FfdReportChunk[], tags: string[]): FfdReportClaim[] {
  const seen = new Set<string>();
  const relevantTerms = [...new Set([...REPORT_TAG_TERMS, ...POSITIVE_CLAIM_TERMS, ...NEGATIVE_CLAIM_TERMS])];
  const claims: FfdReportClaim[] = [];
  for (const chunk of chunks) {
    if (isLowSignalSection(chunk.sectionPath)) continue;
    for (const sentence of splitSentences(chunk.text)) {
      const cleanedSentence = compactText(stripMarkdownMedia(sentence));
      if (!relevantTerms.some((term) => includesTerm(cleanedSentence, term))) continue;
      const key = cleanedSentence.slice(0, 110);
      if (seen.has(key)) continue;
      seen.add(key);
      const evidenceKind = evidenceKindForText(cleanedSentence);
      const definition = evidenceDefinition(evidenceKind);
      claims.push({
        id: `claim-${claims.length + 1}`,
        text: cleanedSentence,
        polarity: polarityFor(cleanedSentence),
        tags: extractTags(cleanedSentence, ...definition.tags, ...tags),
        evidenceKind,
        evidenceStrength: definition.strength,
        sectionPath: chunk.sectionPath,
        companies: inferCompanies(cleanedSentence, ...(chunk.companies ?? [])),
        topics: [...new Set([...(chunk.topics ?? []), ...inferTopicsFromText(cleanedSentence)])],
        sourceTier: "P1",
        requiresP0Verification: true,
        chunkId: chunk.id,
      });
      if (claims.length >= 120) return claims;
    }
  }
  return claims;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.2);
}

function splitLongBlock(block: string, maxChars: number): string[] {
  if (block.length <= maxChars) return [block];
  const sentences = splitSentences(block);
  if (sentences.length === 0) {
    const parts: string[] = [];
    for (let index = 0; index < block.length; index += maxChars) parts.push(block.slice(index, index + maxChars));
    return parts;
  }
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const next = current ? `${current}${sentence}` : sentence;
    if (next.length > maxChars && current) {
      parts.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }
  if (current) parts.push(current);
  return parts;
}

// --- P0-3 chunking rework ------------------------------------------------------------
// Old behavior: 2800-char hard cuts, no overlap, no boilerplate stripping — produced
// 32-token page-header crumbs that polluted retrieval. New behavior: token-bounded
// (target 300-800) paragraph accumulation with ~15% overlap, markdown tables kept
// intact, and legal/page boilerplate stripped before chunking.

const CHUNK_MIN_TOKENS = 300;
const CHUNK_MAX_TOKENS = 800;
const CHUNK_OVERLAP_CHARS = 240;
const CHUNK_MIN_KEEP_TOKENS = 30;

const BOILERPLATE_BLOCK_PATTERNS = [
  /免责声明/,
  /法律声明/,
  /分析师声明/,
  /评级说明/,
  /投资评级的?说明/,
  /本报告仅供.{0,20}(参考|使用)/,
  /特别声明/,
];

const BOILERPLATE_LINE_PATTERNS = [
  /^证券研究报告(\s*[|｜].*)?$/,
  /^敬请参阅最后一页/,
  /^请务必阅读正文之后/,
  /^扫码获取更多服务$/,
  /^行业研究$/,
  /^公司研究$/,
  /^第?\s*\d+\s*页(共\s*\d+\s*页)?$/,
  /^\d{1,4}$/,
  /^.{0,80}[.…·]{5,}\s*\d+\s*$/,
  /^[-—=\s]{4,}$/,
];

function isMarkdownTableBlock(block: string): boolean {
  const lines = block.split(/\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return false;
  return lines.filter((line) => line.trim().startsWith("|")).length >= Math.ceil(lines.length * 0.6);
}

function isBoilerplateBlock(block: string): boolean {
  const head = block.slice(0, 120);
  return BOILERPLATE_BLOCK_PATTERNS.some((pattern) => pattern.test(head));
}

function stripBoilerplateLines(block: string): string {
  return block
    .split(/\n/)
    .filter((line) => !BOILERPLATE_LINE_PATTERNS.some((pattern) => pattern.test(line.trim())))
    .join("\n")
    .trim();
}

function overlapTail(text: string): string {
  if (text.length <= CHUNK_OVERLAP_CHARS) return "";
  const tail = text.slice(-CHUNK_OVERLAP_CHARS);
  // Snap to a sentence boundary inside the tail so the overlap reads naturally.
  const boundary = tail.search(/[。！？!?\n]/);
  return boundary >= 0 && boundary < tail.length - 1 ? tail.slice(boundary + 1).trim() : tail.trim();
}

function buildChunk(
  text: string,
  section: FfdReportSection,
  tags: string[],
  order: number,
): FfdReportChunk {
  return {
    id: `chunk-${order}`,
    order,
    text,
    tags: extractTags(text, section.title, ...tags),
    sectionTitle: section.title,
    sectionPath: section.path,
    topics: [...new Set([...section.topics, ...inferTopicsFromText(text)])],
    companies: [...new Set([...section.companies, ...inferCompanies(text)])],
    evidenceKinds: evidenceKindsForText(text),
    sourceTier: "P1",
    requiresP0Verification: true,
    tokenEstimate: estimateTokens(text),
  };
}

function chunkSection(section: FfdReportSection, tags: string[], startIndex: number): FfdReportChunk[] {
  const maxChars = Math.floor(CHUNK_MAX_TOKENS * 3.2);
  const rawBlocks = normalizeWhitespace(section.text).split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const blocks: string[] = [];
  for (const raw of rawBlocks) {
    if (isBoilerplateBlock(raw)) continue;
    const cleaned = isMarkdownTableBlock(raw) ? raw : stripBoilerplateLines(raw);
    if (!cleaned) continue;
    if (isMarkdownTableBlock(cleaned) || cleaned.length <= maxChars) {
      blocks.push(cleaned);
    } else {
      blocks.push(...splitLongBlock(cleaned, maxChars));
    }
  }

  const chunks: FfdReportChunk[] = [];
  let current = "";
  const flush = () => {
    const text = current.trim();
    current = "";
    if (!text) return;
    chunks.push(buildChunk(text, section, tags, startIndex + chunks.length + 1));
  };

  for (const block of blocks) {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (estimateTokens(candidate) > CHUNK_MAX_TOKENS && estimateTokens(current) >= CHUNK_MIN_TOKENS) {
      const carry = overlapTail(current);
      flush();
      current = carry ? `${carry}\n\n${block}` : block;
    } else {
      current = candidate;
    }
  }
  flush();

  // Drop trailing crumbs (page-number leftovers) unless the section is genuinely tiny.
  if (chunks.length > 1) {
    return chunks.filter((chunk) => chunk.tokenEstimate >= CHUNK_MIN_KEEP_TOKENS);
  }
  // A heading-only section (chunk ≈ its own title) is a crumb, not content.
  if (
    chunks.length === 1 &&
    chunks[0].tokenEstimate < CHUNK_MIN_KEEP_TOKENS &&
    chunks[0].text.replace(/\s+/g, "").length <= section.title.replace(/\s+/g, "").length + 6
  ) {
    return [];
  }
  return chunks;
}

// Strip a leading YAML frontmatter block so metadata never becomes chunk/claim #1.
function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^\s*---\n[\s\S]*?\n---\s*\n/, "");
}

function chunkMarkdown(rawMarkdown: string, tags: string[], sections?: FfdReportSection[]): FfdReportChunk[] {
  const markdown = stripFrontmatter(rawMarkdown);
  const sourceSections = sections && sections.length > 0 && !/^\s*---\n/.test(rawMarkdown)
    ? sections
    : extractReportSections(markdown, tags);
  const chunks: FfdReportChunk[] = [];
  for (const section of sourceSections) {
    chunks.push(...chunkSection(section, tags, chunks.length));
    if (chunks.length >= 500) break;
  }
  return chunks.slice(0, 500);
}

function extractEvidenceItems(claims: FfdReportClaim[], chunks: FfdReportChunk[]): FfdReportEvidenceItem[] {
  const items: FfdReportEvidenceItem[] = [];
  const seen = new Set<string>();
  for (const definition of EVIDENCE_DEFINITIONS) {
    const candidates = [
      ...claims
        .filter((claim) => claim.evidenceKind === definition.kind || definition.terms.some((term) => includesTerm(claim.text, term)))
        .map((claim) => ({ text: claim.text, chunkId: claim.chunkId, claimId: claim.id, sectionPath: claim.sectionPath, companies: claim.companies ?? [], topics: claim.topics ?? [] })),
      ...chunks.flatMap((chunk) => splitSentences(chunk.text)
        .filter(() => !isLowSignalSection(chunk.sectionPath))
        .filter((sentence) => definition.terms.some((term) => includesTerm(sentence, term)))
        .map((sentence) => ({ text: sentence, chunkId: chunk.id, sectionPath: chunk.sectionPath, companies: chunk.companies ?? [], topics: chunk.topics ?? [] }))),
    ];
    let picked = 0;
    for (const candidate of candidates) {
      const snippet = compactText(candidate.text);
      if (!usefulEvidenceSentence(snippet)) continue;
      const key = `${definition.kind}:${snippet.slice(0, 110)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        id: `evidence-${items.length + 1}`,
        kind: definition.kind,
        label: definition.label,
        snippet: snippet.length > 420 ? `${snippet.slice(0, 420)}...` : snippet,
        tags: extractTags(snippet, ...definition.tags),
        chunkId: candidate.chunkId,
        claimId: "claimId" in candidate ? candidate.claimId : undefined,
        sectionPath: candidate.sectionPath,
        companies: [...new Set([...candidate.companies, ...inferCompanies(snippet)])],
        topics: [...new Set([...candidate.topics, ...inferTopicsFromText(snippet)])],
        sourceTier: "P1",
        strength: definition.strength,
        requiresP0Verification: true,
      });
      picked += 1;
      if (picked >= 4) break;
    }
  }
  return items.slice(0, 80);
}

function renderEvidenceMap(evidenceItems: FfdReportEvidenceItem[]): string {
  if (evidenceItems.length === 0) return "- 未抽出稳定的证据片段；优先打开 full markdown 或原文复核。";
  const rows = evidenceItems.slice(0, 16).map((item) => [
    item.label,
    item.strength,
    item.sectionPath?.join(" > ") ?? "n/a",
    item.companies.length > 0 ? item.companies.join(", ") : "n/a",
    stripMarkdownMedia(item.snippet).replace(/\|/g, "/"),
    item.chunkId ?? "n/a",
  ]);
  return [
    "| 证据类型 | 强度 | 章节 | 公司 | 原文要点 | chunk |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

async function copyDirectoryIfExists(sourceDir: string, destDir: string): Promise<boolean> {
  if (!(await fileExists(sourceDir))) return false;
  await fs.rm(destDir, { recursive: true, force: true });
  await ensureDir(path.dirname(destDir));
  await fs.cp(sourceDir, destDir, { recursive: true });
  return true;
}

async function materializeConverterArtifacts(artifactRoot: string | undefined, reportDir: string): Promise<string | undefined> {
  if (!artifactRoot) return undefined;
  const destDir = path.join(reportDir, "conversion-output");
  const copied = await copyDirectoryIfExists(artifactRoot, destDir);
  return copied ? destDir : undefined;
}

async function materializeMarkdownAssets(markdown: string, assetRoot: string | undefined, reportDir: string): Promise<{ markdown: string; assetDir?: string }> {
  if (!assetRoot) return { markdown };

  const sourceImagesDir = path.join(assetRoot, "images");
  const destImagesDir = path.join(reportDir, "assets", "images");
  const copied = await copyDirectoryIfExists(sourceImagesDir, destImagesDir);
  if (!copied) return { markdown };

  return {
    markdown: markdown.replaceAll("](images/", "](assets/images/").replaceAll('src="images/', 'src="assets/images/'),
    assetDir: path.join(reportDir, "assets"),
  };
}

async function copyObsidianAssets(markdown: string, assetSourceDir: string | undefined, fullDir: string, reportId: string): Promise<string> {
  if (!assetSourceDir) return markdown;
  const destAssetDir = path.join(fullDir, "assets", reportId);
  const copied = await copyDirectoryIfExists(assetSourceDir, destAssetDir);
  if (!copied) return markdown;
  return markdown
    .replaceAll("](assets/", `](assets/${reportId}/`)
    .replaceAll('src="assets/', `src="assets/${reportId}/`);
}

function markdownHeader(manifest: Pick<FfdReportManifest, "id" | "title" | "status" | "provider" | "institution" | "industry" | "publishedAt" | "checksum" | "tags">): string {
  return toSimplifiedChinese([
    "---",
    `source_id: ${manifest.id}`,
    "source_tier: P1",
    "source_type: broker_report",
    `status: ${manifest.status}`,
    `provider: ${manifest.provider}`,
    manifest.institution ? `institution: ${manifest.institution}` : undefined,
    manifest.industry ? `industry: ${manifest.industry}` : undefined,
    manifest.publishedAt ? `published_at: ${manifest.publishedAt}` : undefined,
    `checksum: ${manifest.checksum}`,
    `tags: ${manifest.tags.join(", ")}`,
    "---",
    "",
    `# ${manifest.title}`,
    "",
  ]
    .filter((line): line is string => line != null)
    .join("\n"));
}

export function qualityForManifest(manifest: FfdReportManifest): FfdAutoDownloadEvaluation {
  return manifest.quality ?? evaluateFfdAutoDownloadCandidate({
    title: manifest.title,
    institution: manifest.institution,
    industry: manifest.industry,
    summary: manifest.summary,
    tags: manifest.tags,
  });
}

function renderTopicLinks(manifest: FfdReportManifest): string {
  const topics = manifest.topics ?? [];
  const companies = manifest.companies ?? [];
  const evidenceKinds = manifest.evidenceKinds ?? [];
  return [
    topics.length > 0 ? `- 主题: ${topics.join("、")}` : "- 主题: n/a",
    companies.length > 0 ? `- 公司: ${companies.join("、")}` : "- 公司: n/a",
    evidenceKinds.length > 0 ? `- 证据类型: ${evidenceKinds.map((kind) => evidenceDefinition(kind).label).join("、")}` : "- 证据类型: n/a",
  ].join("\n");
}

function renderClaimsTable(claims: FfdReportClaim[]): string {
  if (claims.length === 0) return "- No high-signal claims extracted automatically.";
  return [
    "| claim | polarity | evidence | section | text |",
    "| --- | --- | --- | --- | --- |",
    ...claims.slice(0, 36).map((claim) => {
      const evidence = claim.evidenceKind ? evidenceDefinition(claim.evidenceKind).label : "n/a";
      const section = claim.sectionPath?.join(" > ") ?? "n/a";
      return `| ${claim.id} | ${claim.polarity} | ${evidence} | ${section} | ${claim.text.replace(/\|/g, "/")} |`;
    }),
  ].join("\n");
}

function renderChunkTable(chunks: FfdReportChunk[]): string {
  if (chunks.length === 0) return "- No chunks generated.";
  return [
    "| chunk | section | topics | companies | chars | preview |",
    "| --- | --- | --- | --- | ---: | --- |",
    ...chunks.slice(0, 24).map((chunk) => {
      const section = chunk.sectionPath?.join(" > ") ?? chunk.sectionTitle ?? "n/a";
      const preview = stripMarkdownMedia(chunk.text).slice(0, 220).replace(/\s+/g, " ").replace(/\|/g, "/");
      return `| ${chunk.id} | ${section} | ${(chunk.topics ?? []).join(", ") || "n/a"} | ${(chunk.companies ?? []).join(", ") || "n/a"} | ${chunk.text.length} | ${preview}${chunk.text.length > 220 ? "..." : ""} |`;
    }),
  ].join("\n");
}

function reportCardMarkdown(manifest: FfdReportManifest, claims: FfdReportClaim[], chunks: FfdReportChunk[], evidenceItems: FfdReportEvidenceItem[] = [], sections: FfdReportSection[] = [], fullPath?: string, markdown?: string): string {
  const quality = qualityForManifest(manifest);
  const outline = extractReportOutline(markdown);
  return toSimplifiedChinese(`${markdownHeader(manifest)}
## Metadata

- Source: \`${manifest.id}\` · \`${manifest.sourceTier} ${manifest.sourceType}\`
- Institution: ${manifest.institution ?? "n/a"} · Industry: ${manifest.industry ?? "n/a"} · Published: ${manifest.publishedAt ?? "n/a"}
- Status: \`${manifest.status}\` · Converter: \`${manifest.converter}\`
- Sections: ${manifest.sectionCount ?? sections.length} · Chunks: ${manifest.chunkCount} · Claims: ${manifest.claimCount} · Evidence: ${manifest.evidenceCount ?? evidenceItems.length}
- Tables: ${manifest.tableCount ?? "n/a"} · Images: ${manifest.imageCount ?? "n/a"} · Text chars: ${manifest.textCharCount ?? "n/a"}

## Core Summary

${manifest.summary}

## Investment Relevance

${renderTopicLinks(manifest)}
- 使用约束: FFD Accepted 仍是 P1 研报来源，形成候选结论时必须和公告、年报、互动问答等 P0 披露交叉验证。

## Conversion Diagnostics

${renderConversionDiagnostics(manifest, claims, chunks, markdown)}

## Report Outline

${outline.length > 0 ? outline.map((line) => `- ${line}`).join("\n") : "- 未识别结构化提纲；该文件可能只是短评、转发摘要或解析后的纯文本片段。"}

## Key Evidence Map

${renderEvidenceMap(evidenceItems)}

## Claims

${renderClaimsTable(claims)}

## Quality Gate

- ${renderFfdAutoDownloadEvaluation(quality)}

## Retrieval Chunks

${renderChunkTable(chunks)}

## Files

- Raw: \`${manifest.rawPath}\`
- Processed Markdown: \`${manifest.markdownPath}\`
- Claims JSON: \`${manifest.claimsPath}\`
- Chunks JSON: \`${manifest.chunksPath}\`
- Sections JSON: \`${manifest.sectionsPath ?? "n/a"}\`
- Evidence JSON: \`${manifest.evidencePath ?? "n/a"}\`
- Canonical JSON: \`${manifest.canonicalPath ?? "n/a"}\`
- Converter Output: \`${manifest.converterOutputPath ?? "n/a"}\`
- Assets: \`${manifest.assetPath ?? "n/a"}\`
${fullPath ? `- Obsidian Full Markdown: [[${path.basename(fullPath, ".md")}]]` : ""}

## Review

- Status: \`${manifest.status}\`
- Accept with: \`npm run reports:accept -- ${manifest.id}\`
- Reject with: \`npm run reports:reject -- ${manifest.id}\`
`);
}

async function writeObsidianArtifacts(
  manifest: FfdReportManifest,
  markdown: string,
  claims: FfdReportClaim[],
  chunks: FfdReportChunk[],
  evidenceItems: FfdReportEvidenceItem[],
  sections: FfdReportSection[],
  root: string,
  assetSourceDir?: string,
): Promise<Pick<FfdReportManifest, "obsidianStagingPath" | "obsidianFullPath">> {
  const stagingDir = path.join(root, "reports", "FFD", "Staging");
  const fullDir = path.join(stagingDir, "full");
  await ensureDir(stagingDir);
  await ensureDir(fullDir);
  const baseName = safeFilename(`${manifest.id}-${manifest.title}`);
  const fullPath = path.join(fullDir, `${baseName}-full.md`);
  const notePath = path.join(stagingDir, `${baseName}.md`);
  const obsidianMarkdown = await copyObsidianAssets(markdown, assetSourceDir, fullDir, manifest.id);
  await fs.writeFile(fullPath, `${markdownHeader(manifest)}\n${normalizeWhitespace(obsidianMarkdown)}\n`, "utf8");
  await fs.writeFile(notePath, reportCardMarkdown(manifest, claims, chunks, evidenceItems, sections, fullPath, obsidianMarkdown), "utf8");
  return { obsidianStagingPath: notePath, obsidianFullPath: fullPath };
}

async function maybeExistingManifest(processedDir: string, reportId: string): Promise<FfdReportManifest | undefined> {
  const manifestPath = path.join(processedDir, reportId, "manifest.json");
  return readJsonFile<FfdReportManifest | undefined>(manifestPath, undefined);
}

async function listRawReportFiles(rawDir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(rawDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(rawDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listRawReportFiles(entryPath));
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!SUPPORTED_RAW_EXTENSIONS.has(ext)) continue;
    files.push(entryPath);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function manifestToSourceRecord(manifest: FfdReportManifest): SourceRecord {
  const quality = qualityForManifest(manifest);
  const qualityTags = [
    quality.matchedRuleIds.some((ruleId) => ruleId.startsWith("adjacent-")) ? "ffd-adjacent-background" : undefined,
    quality.reviewFlags.some((flag) => flag.includes("机构字段缺失") || flag.includes("机构字段疑似文件名")) ? "ffd-institution-missing" : undefined,
    quality.reviewFlags.some((flag) => flag.includes("扩展产业机构")) ? "ffd-secondary-institution" : undefined,
  ].filter((tag): tag is string => Boolean(tag));
  return {
    id: manifest.sourceRecordId ?? manifest.id,
    title: manifest.title,
    tier: "P1",
    sourceType: "broker_report",
    publisher: manifest.institution ? `FFD Library / ${manifest.institution}` : "FFD Library",
    observedAt: manifest.convertedAt.slice(0, 10),
    path: manifest.obsidianAcceptedPath ?? manifest.obsidianStagingPath ?? manifest.summaryPath,
    summary: manifest.summary.slice(0, 700),
    evidenceTags: [
      ...new Set([
        ...manifest.tags,
        ...(manifest.topics ?? []),
        ...(manifest.companies ?? []),
        ...(manifest.evidenceKinds ?? []),
        "ffd-library",
        "broker-report",
        manifest.status,
        quality.canAccept ? "ffd-quality-pass" : "ffd-quality-bypassed",
        quality.hasBottleneckEvidence ? "ffd-hard-evidence" : "ffd-background-only",
        ...(!quality.hasBottleneckEvidence ? ["ffd-needs-p0-crosscheck"] : []),
        ...qualityTags,
        ...quality.matchedRuleIds,
      ]),
    ],
    provider: "FFD",
    institution: manifest.institution,
    publishedAt: manifest.publishedAt,
    licenseMode: "user-licensed-local",
    canQuote: false,
    canStoreFullText: true,
    canUseInLLM: true,
    externalId: manifest.ffdFileId ? `ffd-file-${manifest.ffdFileId}` : manifest.id,
    checksum: manifest.checksum,
    reviewStatus: manifest.status,
  };
}

function buildCanonicalReport(
  manifest: FfdReportManifest,
  sections: FfdReportSection[],
  evidenceItems: FfdReportEvidenceItem[],
  claims: FfdReportClaim[],
  chunks: FfdReportChunk[],
): Record<string, unknown> {
  return {
    schemaVersion: "ffd-report-canonical/v1",
    report: {
      id: manifest.id,
      title: manifest.title,
      status: manifest.status,
      sourceTier: manifest.sourceTier,
      sourceType: manifest.sourceType,
      provider: manifest.provider,
      institution: manifest.institution,
      industry: manifest.industry,
      publishedAt: manifest.publishedAt,
      convertedAt: manifest.convertedAt,
      converter: manifest.converter,
    },
    classification: {
      topics: manifest.topics ?? [],
      companies: manifest.companies ?? [],
      evidenceKinds: manifest.evidenceKinds ?? [],
      tags: manifest.tags,
      quality: manifest.quality,
    },
    structure: {
      summary: manifest.summary,
      sectionCount: sections.length,
      chunkCount: chunks.length,
      claimCount: claims.length,
      evidenceCount: evidenceItems.length,
      tableCount: manifest.tableCount ?? 0,
      imageCount: manifest.imageCount ?? 0,
      textCharCount: manifest.textCharCount ?? 0,
      outline: sections.slice(0, 80).map((section) => ({
        id: section.id,
        title: section.title,
        path: section.path,
        chars: section.text.length,
        tokenEstimate: section.tokenEstimate,
      })),
    },
    evidenceMap: evidenceItems,
    files: {
      raw: manifest.rawPath,
      markdown: manifest.markdownPath,
      summary: manifest.summaryPath,
      sections: manifest.sectionsPath,
      claims: manifest.claimsPath,
      chunks: manifest.chunksPath,
      evidence: manifest.evidencePath,
      converterOutput: manifest.converterOutputPath,
      assets: manifest.assetPath,
      obsidianStaging: manifest.obsidianStagingPath,
      obsidianFull: manifest.obsidianFullPath,
      obsidianAccepted: manifest.obsidianAcceptedPath,
    },
    retrievalPolicy: {
      defaultUse: "Use as P1 broker_report context and cross-check material.",
      mustCrossCheckWithP0: true,
      preferEvidenceKinds: ["customer_order_capacity", "price_supply_inventory_cycle", "margin_yield_profit", "technology_route_bottleneck"],
      avoidAsStandaloneEvidence: ["valuation_rating", "background_context"],
    },
  };
}

export async function processFfdReportLibrary(options: FfdReportLibraryOptions = {}): Promise<FfdReportLibraryRun> {
  const config = getConfig();
  const rawDir = path.resolve(options.rawDir ?? config.ffdReportRawDir);
  const processedDir = path.resolve(options.processedDir ?? config.ffdReportProcessedDir);
  const obsidianRoot = options.obsidianRoot ?? knowledgebasePath(config);
  const now = options.now ?? new Date().toISOString();
  const converter = options.converter ?? defaultReportMarkdownConverter;
  const processed: FfdReportManifest[] = [];
  const skipped: FfdReportManifest[] = [];
  const warnings: string[] = [];

  await ensureDir(rawDir);
  await ensureDir(processedDir);

  const targetIds = new Set(options.reportIds ?? []);
  const rawFiles = await listRawReportFiles(rawDir);
  for (const rawPath of rawFiles) {
    const fileName = path.basename(rawPath);
    const stat = await fs.stat(rawPath);
    const checksum = await sha256File(rawPath);
    const reportId = `FFD-REPORT-${checksum.slice(0, 12).toUpperCase()}`;
    if (targetIds.size > 0 && !targetIds.has(reportId)) continue;
    const existing = await maybeExistingManifest(processedDir, reportId);
    if (existing && existing.checksum === checksum && !options.force) {
      skipped.push(existing);
      continue;
    }

    try {
      const { metadata, metadataPath } = await readRawMetadata(rawPath);
      const title = titleFromFileName(metadataFileName(metadata) ?? fileName);
      const reportDir = path.join(processedDir, reportId);
      await ensureDir(reportDir);
      const converted = await converter(rawPath);
      const converterOutputPath = await materializeConverterArtifacts(converted.artifactRoot, reportDir);
      const materialized = await materializeMarkdownAssets(converted.markdown, converted.assetRoot, reportDir);
      const markdown = normalizeWhitespace(materialized.markdown);
      const initialTags = extractTags(fileName, title, metadata?.summary ?? "", ...(metadata?.tags ?? []), markdown.slice(0, 4000));
      const initialSections = extractReportSections(markdown, initialTags);
      const manifestBase = {
        id: reportId,
        title,
        fileName,
        rawPath,
        ffdFileId: metadataFileId(metadata),
        metadataPath,
        checksum,
        sizeBytes: stat.size,
        status: existing?.status ?? "staged" as const,
        provider: "FFD" as const,
        sourceTier: "P1" as const,
        sourceType: "broker_report" as const,
        institution: inferInstitution(fileName, metadata),
        publishedAt: inferPublishedAt(fileName, metadata),
        convertedAt: now,
        converter: converted.converter,
        tags: initialTags,
      };
      const summary = buildSummary(markdown, title, initialSections);
      const tags = extractTags(fileName, title, metadata?.summary ?? "", summary, ...initialTags);
      const industry = inferIndustry(tags, metadata);
      const quality = evaluateFfdAutoDownloadCandidate({
        title,
        institution: manifestBase.institution,
        industry,
        summary,
        tags,
      });
      const sections = extractReportSections(markdown, tags, quality);
      const chunks = chunkMarkdown(markdown, tags, sections);
      const claims = extractClaims(chunks, tags);
      const evidenceItems = extractEvidenceItems(claims, chunks);
      const topics = [...new Set([
        ...inferTopicsFromText([fileName, title, summary, ...tags, markdown.slice(0, 8000)].join(" "), quality),
        ...sections.flatMap((section) => section.topics),
        ...chunks.flatMap((chunk) => chunk.topics ?? []),
      ])];
      const companies = [...new Set([
        ...inferCompanies(fileName, title, summary, markdown.slice(0, 12000)),
        ...sections.flatMap((section) => section.companies),
        ...chunks.flatMap((chunk) => chunk.companies ?? []),
        ...claims.flatMap((claim) => claim.companies ?? []),
      ])];
      const evidenceKinds = [...new Set([
        ...chunks.flatMap((chunk) => chunk.evidenceKinds ?? []),
        ...claims.map((claim) => claim.evidenceKind).filter((kind): kind is FfdReportEvidenceKind => Boolean(kind)),
        ...evidenceItems.map((item) => item.kind),
      ])];

      let manifest: FfdReportManifest = {
        ...manifestBase,
        industry,
        tags,
        topics,
        companies,
        evidenceKinds,
        summary,
        quality,
        markdownPath: path.join(reportDir, "full.md"),
        summaryPath: path.join(reportDir, "summary.md"),
        claimsPath: path.join(reportDir, "claims.json"),
        chunksPath: path.join(reportDir, "chunks.json"),
        sectionsPath: path.join(reportDir, "sections.json"),
        evidencePath: path.join(reportDir, "evidence-map.json"),
        canonicalPath: path.join(reportDir, "canonical.json"),
        manifestPath: path.join(reportDir, "manifest.json"),
        converterOutputPath,
        assetPath: materialized.assetDir,
        sourceRecordId: existing?.sourceRecordId,
        obsidianAcceptedPath: existing?.obsidianAcceptedPath,
        claimCount: claims.length,
        chunkCount: chunks.length,
        sectionCount: sections.length,
        evidenceCount: evidenceItems.length,
        tableCount: countMarkdownTables(markdown),
        imageCount: countMarkdownImages(markdown),
        textCharCount: compactText(markdown).length,
      };

      if (options.writeObsidian !== false) {
        const obsidianPaths = await writeObsidianArtifacts(manifest, markdown, claims, chunks, evidenceItems, sections, obsidianRoot, materialized.assetDir);
        manifest = { ...manifest, ...obsidianPaths };
      }

      await fs.writeFile(manifest.markdownPath, `${markdownHeader(manifest)}\n${markdown}\n`, "utf8");
      await fs.writeFile(manifest.summaryPath, reportCardMarkdown(manifest, claims, chunks, evidenceItems, sections, manifest.obsidianFullPath, markdown), "utf8");
      await writeJsonFile(manifest.claimsPath, claims);
      await writeJsonFile(manifest.chunksPath, chunks);
      await writeJsonFile(manifest.sectionsPath!, sections);
      await writeJsonFile(manifest.evidencePath!, evidenceItems);
      await writeJsonFile(manifest.canonicalPath!, buildCanonicalReport(manifest, sections, evidenceItems, claims, chunks));
      if (manifest.status === "accepted" && manifest.obsidianAcceptedPath) {
        await fs.writeFile(manifest.obsidianAcceptedPath, reportCardMarkdown(manifest, claims, chunks, evidenceItems, sections, manifest.obsidianFullPath, markdown), "utf8");
      }
      await writeJsonFile(manifest.manifestPath, manifest);
      processed.push(manifest);
    } catch (error) {
      warnings.push(`${fileName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { rawDir, processedDir, obsidianRoot: options.writeObsidian === false ? undefined : obsidianRoot, processed, skipped, warnings };
}

export async function enhanceFfdReports(options: FfdReportEnhanceOptions = {}): Promise<FfdReportLibraryRun> {
  const processedDir = path.resolve(options.processedDir ?? getConfig().ffdReportProcessedDir);
  const manifests = await listFfdReportManifests(processedDir);
  const explicitIds = options.reportIds?.filter(Boolean) ?? [];
  const reportIds = explicitIds.length > 0
    ? explicitIds
    : manifests
        .filter((manifest) => {
          if (options.includeAll) return true;
          if (options.includeFailed) return !qualityForManifest(manifest).canAccept;
          return manifest.status === "staged";
        })
        .map((manifest) => manifest.id);

  if (reportIds.length === 0) {
    const config = getConfig();
    return {
      rawDir: path.resolve(options.rawDir ?? config.ffdReportRawDir),
      processedDir,
      obsidianRoot: options.writeObsidian === false ? undefined : options.obsidianRoot ?? knowledgebasePath(config),
      processed: [],
      skipped: [],
      warnings: ["No FFD reports matched the enhance selector."],
    };
  }

  return processFfdReportLibrary({
    ...options,
    processedDir,
    reportIds,
    force: true,
    converter: options.converter ?? enhancedReportMarkdownConverter,
  });
}

export async function listFfdReportManifests(processedDir = path.resolve(getConfig().ffdReportProcessedDir)): Promise<FfdReportManifest[]> {
  try {
    const entries = await fs.readdir(processedDir, { withFileTypes: true });
    const manifests: FfdReportManifest[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifest = await readJsonFile<FfdReportManifest | undefined>(path.join(processedDir, entry.name, "manifest.json"), undefined);
      if (manifest) manifests.push(manifest);
    }
    return manifests.sort((a, b) => b.convertedAt.localeCompare(a.convertedAt) || a.title.localeCompare(b.title));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export function renderFfdReportReview(manifests: FfdReportManifest[], limit = 20): string {
  if (manifests.length === 0) return "No FFD report manifests found. Run `npm run reports:convert` after the FFD downloader writes files.";
  const qualityCounts = manifests.reduce(
    (counts, item) => {
      if (qualityForManifest(item).canAccept) counts.pass += 1;
      else counts.fail += 1;
      return counts;
    },
    { pass: 0, fail: 0 },
  );
  return manifests
    .slice(0, limit)
    .map((item) =>
      [
        `${item.id} [${item.status}] ${item.title}`,
        `- Institution: ${item.institution ?? "n/a"} | Industry: ${item.industry ?? "n/a"} | Published: ${item.publishedAt ?? "n/a"}`,
        `- ${renderFfdAutoDownloadEvaluation(qualityForManifest(item))}`,
        `- Sections: ${item.sectionCount ?? "n/a"}, chunks: ${item.chunkCount}, claims: ${item.claimCount}, evidence: ${item.evidenceCount ?? "n/a"}, tables: ${item.tableCount ?? "n/a"}, images: ${item.imageCount ?? "n/a"}, converter: ${item.converter}`,
        `- Summary: ${item.summary.slice(0, 220)}${item.summary.length > 220 ? "..." : ""}`,
      ].join("\n"),
    )
    .concat(`\nQuality summary: pass=${qualityCounts.pass}, fail=${qualityCounts.fail}, acceptance-rate=${Math.round((qualityCounts.pass / manifests.length) * 100)}%`)
    .join("\n\n");
}

async function saveManifest(manifest: FfdReportManifest): Promise<void> {
  await writeJsonFile(manifest.manifestPath, manifest);
}

export async function acceptFfdReport(reportId: string, options: { processedDir?: string; obsidianRoot?: string; bypassQualityGate?: boolean } = {}): Promise<{ manifest: FfdReportManifest; source: SourceRecord }> {
  const manifests = await listFfdReportManifests(options.processedDir ? path.resolve(options.processedDir) : undefined);
  let manifest = manifests.find((item) => item.id === reportId);
  if (!manifest) throw new Error(`FFD report not found: ${reportId}`);
  const quality = qualityForManifest(manifest);
  if (!quality.canAccept && !options.bypassQualityGate) {
    throw new Error(`FFD report failed quality gate: ${quality.rejectionReasons.join("; ")}`);
  }
  const sourceRecordId = `P1-${manifest.id}`;
  const obsidianRoot = options.obsidianRoot ?? knowledgebasePath(getConfig());
  const acceptedDir = path.join(obsidianRoot, "reports", "FFD", "Accepted");
  await ensureDir(acceptedDir);
  const claims = await readJsonFile<FfdReportClaim[]>(manifest.claimsPath, []);
  const chunks = await readJsonFile<FfdReportChunk[]>(manifest.chunksPath, []);
  const sections = manifest.sectionsPath ? await readJsonFile<FfdReportSection[]>(manifest.sectionsPath, []) : [];
  const evidenceItems = manifest.evidencePath ? await readJsonFile<FfdReportEvidenceItem[]>(manifest.evidencePath, []) : [];
  const markdown = await fs.readFile(manifest.markdownPath, "utf8").catch(() => "");
  const acceptedPath = path.join(acceptedDir, `${safeFilename(`${manifest.id}-${manifest.title}`)}.md`);
  manifest = {
    ...manifest,
    status: "accepted",
    sourceRecordId,
    obsidianAcceptedPath: acceptedPath,
    quality,
  };
  await fs.writeFile(acceptedPath, reportCardMarkdown(manifest, claims, chunks, evidenceItems, sections, manifest.obsidianFullPath, markdown), "utf8");
  await saveManifest(manifest);
  return { manifest, source: manifestToSourceRecord(manifest) };
}

export async function rejectFfdReport(reportId: string, options: { processedDir?: string; reason?: string } = {}): Promise<FfdReportManifest> {
  const manifests = await listFfdReportManifests(options.processedDir ? path.resolve(options.processedDir) : undefined);
  const manifest = manifests.find((item) => item.id === reportId);
  if (!manifest) throw new Error(`FFD report not found: ${reportId}`);
  const updated = {
    ...manifest,
    status: "rejected" as const,
    tags: [...new Set([...manifest.tags, "rejected", ...(options.reason ? [options.reason] : [])])],
  };
  await saveManifest(updated);
  return updated;
}

// --- P0-3 rechunk: rebuild chunks/claims/evidence for already-converted reports -------
// Re-runs the improved chunker over existing full.md without repeating PDF conversion,
// so the whole library benefits from token-bounded chunks immediately. Obsidian notes
// are not rewritten (their summary cards stay valid); retrieval reads chunks.json.

export interface FfdRechunkRun {
  scanned: number;
  rebuilt: number;
  skipped: number;
  totalChunksBefore: number;
  totalChunksAfter: number;
  warnings: string[];
}

export async function rechunkFfdReports(processedDir = path.resolve(getConfig().ffdReportProcessedDir)): Promise<FfdRechunkRun> {
  const manifests = await listFfdReportManifests(processedDir);
  const run: FfdRechunkRun = { scanned: manifests.length, rebuilt: 0, skipped: 0, totalChunksBefore: 0, totalChunksAfter: 0, warnings: [] };
  for (const manifest of manifests) {
    let markdown: string;
    try {
      markdown = normalizeWhitespace(await fs.readFile(manifest.markdownPath, "utf8"));
    } catch {
      run.skipped += 1;
      run.warnings.push(`${manifest.id}: full.md 缺失，跳过。`);
      continue;
    }
    if (!markdown.trim()) {
      run.skipped += 1;
      continue;
    }
    const before = await readJsonFile<FfdReportChunk[]>(manifest.chunksPath, []);
    run.totalChunksBefore += before.length;
    const tags = manifest.tags ?? [];
    const sections = extractReportSections(markdown, tags);
    const chunks = chunkMarkdown(markdown, tags, sections);
    const claims = extractClaims(chunks, tags);
    const evidenceItems = extractEvidenceItems(claims, chunks);
    await writeJsonFile(manifest.chunksPath, chunks);
    await writeJsonFile(manifest.claimsPath, claims);
    if (manifest.evidencePath) await writeJsonFile(manifest.evidencePath, evidenceItems);
    run.totalChunksAfter += chunks.length;
    run.rebuilt += 1;
  }
  return run;
}

export function renderFfdRechunkRun(run: FfdRechunkRun): string {
  return [
    `Rechunk: rebuilt ${run.rebuilt}/${run.scanned} reports (skipped ${run.skipped}).`,
    `Chunks: ${run.totalChunksBefore} -> ${run.totalChunksAfter}.`,
    ...(run.warnings.length > 0 ? [`Warnings:`, ...run.warnings.slice(0, 10).map((warning) => `- ${warning}`)] : []),
  ].join("\n");
}
