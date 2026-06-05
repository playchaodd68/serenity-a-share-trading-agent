import fs from "node:fs/promises";
import path from "node:path";
import { getConfig, knowledgebasePath } from "../config.js";
import { ensureDir } from "../utils/fs.js";
import { listFfdReportManifests, qualityForManifest, type FfdReportManifest } from "./report-library.js";

type HubKind = "topic" | "company" | "evidence" | "quality";

interface HubDefinition {
  id: string;
  kind: HubKind;
  label: string;
  fileName: string;
  description: string;
  agentUse: string;
  tags: string[];
  ruleIds?: string[];
  terms?: string[];
  flagTerms?: string[];
  evidence?: (manifest: FfdReportManifest, text: string) => boolean;
}

interface ReportEntry {
  manifest: FfdReportManifest;
  notePath: string;
  hubs: HubDefinition[];
}

export interface FfdObsidianOrganizationRun {
  vaultRoot: string;
  indexDir: string;
  viewsDir: string;
  acceptedReports: number;
  updatedReportNotes: number;
  indexFiles: string[];
  viewFiles: string[];
  graphNodes: number;
  graphEdges: number;
}

const INDEX_DIR_RELATIVE = path.join("reports", "FFD", "Index");
const VIEWS_DIR_RELATIVE = path.join("reports", "FFD", "Views");
const MANAGED_START = "<!-- FFD-KB-LINKS:START -->";
const MANAGED_END = "<!-- FFD-KB-LINKS:END -->";

interface KnowledgeGraphNode {
  id: string;
  type: "report" | "hub";
  label: string;
  path: string;
  kind?: HubKind;
  quality?: string[];
}

interface KnowledgeGraphEdge {
  source: string;
  target: string;
  type: "classified_as" | "shared_reports";
  weight: number;
  reason: string;
}

interface KnowledgeGraph {
  generatedAt: string;
  stats: {
    reports: number;
    hubs: number;
    edges: number;
  };
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

const TOPIC_HUBS: HubDefinition[] = [
  {
    id: "topic-ai-optical-pcb-packaging",
    kind: "topic",
    label: "AI 光互连 / AI PCB / 先进封装",
    fileName: "主题-AI光互连-AI PCB-先进封装",
    description: "CPO、硅光、光模块、800G/1.6T、AI PCB、CCL、CoWoS 等 AI 硬件高速互连链条。",
    agentUse: "回答光模块、PCB、先进封装、光通信设备链问题时优先读取。",
    tags: ["ffd-topic", "ai-optical", "ai-pcb", "advanced-packaging"],
    ruleIds: ["ai-optical-pcb-packaging"],
  },
  {
    id: "topic-memory",
    kind: "topic",
    label: "存储芯片 / HBM / DRAM / NAND",
    fileName: "主题-存储芯片-HBM-DRAM-NAND",
    description: "HBM、DRAM、NAND、利基存储、存储周期和供需价格链条。",
    agentUse: "回答存储周期、HBM/NAND/DRAM 供需、国内存储链公司时优先读取。",
    tags: ["ffd-topic", "memory", "hbm", "dram", "nand"],
    ruleIds: ["memory-chips-hbm-dram-nand"],
  },
  {
    id: "topic-semi-equipment",
    kind: "topic",
    label: "半导体设备 / 材料国产替代",
    fileName: "主题-半导体设备-材料国产替代",
    description: "半导体设备、晶圆厂资本开支、国产替代、订单、验证和良率。",
    agentUse: "回答半导体设备景气、国产替代和资本开支链条时优先读取。",
    tags: ["ffd-topic", "semi-equipment", "localization"],
    ruleIds: ["semi-equipment-materials"],
  },
  {
    id: "topic-ai-passives-power",
    kind: "topic",
    label: "AI 被动元件 / 功率半导体 / 电源链",
    fileName: "主题-AI被动元件-功率半导体-电源链",
    description: "MLCC、钽电容、功率半导体、SiC、AI 电源需求和涨价周期。",
    agentUse: "回答 AI 服务器被动元件、功率器件、电源链量价逻辑时读取，按相邻背景降权。",
    tags: ["ffd-topic", "adjacent-background", "mlcc", "power-semiconductor"],
    ruleIds: ["adjacent-ai-passives-power"],
  },
  {
    id: "topic-ai-compute-chip",
    kind: "topic",
    label: "AI 算力芯片 / 国产 GPU / ASIC",
    fileName: "主题-AI算力芯片-国产GPU-ASIC",
    description: "国产 GPU、AI ASIC、算力芯片和上游配套环节。",
    agentUse: "回答国产算力芯片和 GPU/ASIC 产业链时读取，按相邻背景降权。",
    tags: ["ffd-topic", "adjacent-background", "gpu", "asic"],
    ruleIds: ["adjacent-ai-compute-chip"],
  },
  {
    id: "topic-optical-company-update",
    kind: "topic",
    label: "AI 光模块公司更新 / 短周期订单",
    fileName: "主题-AI光模块公司更新-短周期订单",
    description: "新易盛、中际旭创、光模块订单、产能、客户验证和短周期预期变化。",
    agentUse: "回答 watchlist 光模块公司短周期验证时读取，但需和公司公告、业绩会等 P0 交叉验证。",
    tags: ["ffd-topic", "adjacent-background", "optical-company-update"],
    ruleIds: ["adjacent-ai-optical-company-update"],
  },
  {
    id: "topic-watchlist-validation",
    kind: "topic",
    label: "Watchlist 公司直接验证",
    fileName: "主题-Watchlist公司直接验证",
    description: "当前 watchlist 公司被研报直接点名时的订单、产能、客户、毛利率和风险验证。",
    agentUse: "回答 watchlist 公司证据缺口时读取，但 Accepted 仍是 P1 broker_report。",
    tags: ["ffd-topic", "watchlist-validation"],
    ruleIds: ["watchlist-direct-validation"],
  },
];

const COMPANY_HUBS: HubDefinition[] = [
  "新易盛",
  "中际旭创",
  "东山精密",
  "澜起科技",
  "拓荆科技",
  "绿的谐波",
  "兆易创新",
  "普冉股份",
  "北京君正",
  "壁仞科技",
  "锐捷网络",
  "铠侠",
  "三星",
  "SK海力士",
  "美光",
  "英飞凌",
  "意法",
  "村田",
].map((company) => ({
  id: `company-${company}`,
  kind: "company" as const,
  label: company,
  fileName: `公司-${company}`,
  description: `${company} 相关 FFD Accepted 研报集合。`,
  agentUse: `检索 ${company} 的券商研报证据和相邻产业线索。`,
  tags: ["ffd-company", company],
  terms: [company],
}));

const EVIDENCE_HUBS: HubDefinition[] = [
  {
    id: "evidence-customer-order-capacity",
    kind: "evidence",
    label: "客户 / 订单 / 产能 / 放量",
    fileName: "证据-客户订单产能放量",
    description: "客户认证、订单、出货、产能扩张、放量和供应约束证据。",
    agentUse: "回答产业链瓶颈和业绩验证时优先读取。",
    tags: ["ffd-evidence", "customer", "order", "capacity"],
    terms: ["客户", "订单", "产能", "放量", "出货", "扩产", "预付款", "认证"],
  },
  {
    id: "evidence-price-cycle",
    kind: "evidence",
    label: "价格 / 供需 / 库存 / 周期",
    fileName: "证据-价格供需库存周期",
    description: "涨价、供需紧张、库存去化、价格周期和供给约束证据。",
    agentUse: "回答周期位置、量价弹性和景气拐点时优先读取。",
    tags: ["ffd-evidence", "price-cycle"],
    terms: ["涨价", "价格", "供需", "库存", "周期", "供给", "供应不足", "供需紧张"],
  },
  {
    id: "evidence-margin-yield",
    kind: "evidence",
    label: "毛利率 / 良率 / 盈利弹性",
    fileName: "证据-毛利率良率盈利弹性",
    description: "毛利率、良率、净利率、产品结构和盈利预测调整。",
    agentUse: "回答财务弹性和利润率改善时读取。",
    tags: ["ffd-evidence", "margin", "yield"],
    terms: ["毛利率", "良率", "净利润", "盈利", "产品结构", "利润率", "业绩上修"],
  },
  {
    id: "evidence-technology-route",
    kind: "evidence",
    label: "技术路线 / 关键瓶颈",
    fileName: "证据-技术路线关键瓶颈",
    description: "CPO、硅光、EML、DSP、CoWoS、HBM、MLCC、SiC、GPU/ASIC 等技术路线和瓶颈。",
    agentUse: "回答技术路线比较和关键物料瓶颈时读取。",
    tags: ["ffd-evidence", "technology-route"],
    terms: ["CPO", "硅光", "EML", "DSP", "CoWoS", "HBM", "MLCC", "SiC", "碳化硅", "GPU", "ASIC", "技术路线", "瓶颈"],
  },
  {
    id: "evidence-risk-competition",
    kind: "evidence",
    label: "风险 / 替代 / 竞争格局",
    fileName: "证据-风险替代竞争格局",
    description: "替代风险、竞争格局、供应风险、目标价或情绪判断的限制条件。",
    agentUse: "回答反证、风险和可证伪条件时读取。",
    tags: ["ffd-evidence", "risk", "competition"],
    terms: ["风险", "替代", "竞争", "竞争格局", "供应风险", "不及预期", "降价"],
  },
];

const QUALITY_HUBS: HubDefinition[] = [
  {
    id: "quality-hard-evidence",
    kind: "quality",
    label: "P1 硬证据研报",
    fileName: "质量-P1硬证据研报",
    description: "包含客户、订单、产能、良率、毛利率、供需或价格等硬证据词的 FFD Accepted 研报。",
    agentUse: "作为 P1 broker_report 较高优先级证据，但仍需 P0 交叉验证。",
    tags: ["ffd-quality", "hard-evidence"],
    evidence: (manifest) => qualityForManifest(manifest).hasBottleneckEvidence,
  },
  {
    id: "quality-background-only",
    kind: "quality",
    label: "背景资料：需 P0 交叉验证",
    fileName: "质量-背景资料需P0交叉验证",
    description: "缺少硬证据词，主要作为产业背景、周期线索或观点来源。",
    agentUse: "只能作为线索和背景，不能单独支撑投资结论。",
    tags: ["ffd-quality", "background-only", "needs-p0-crosscheck"],
    evidence: (manifest) => !qualityForManifest(manifest).hasBottleneckEvidence,
  },
  {
    id: "quality-adjacent-background",
    kind: "quality",
    label: "相邻产业背景",
    fileName: "质量-相邻产业背景",
    description: "通过相邻背景规则入库的研报，覆盖 MLCC、功率半导体、AI 算力芯片、光模块短周期更新等。",
    agentUse: "用于扩展产业链视野和生成待验证假设，检索排序应低于核心主题硬证据。",
    tags: ["ffd-quality", "adjacent-background"],
    evidence: (manifest) => qualityForManifest(manifest).matchedRuleIds.some((ruleId) => ruleId.startsWith("adjacent-")),
  },
  {
    id: "quality-source-review",
    kind: "quality",
    label: "机构或来源需复核",
    fileName: "质量-机构或来源需复核",
    description: "机构字段缺失、疑似文件名，或来自扩展产业机构的报告。",
    agentUse: "引用前优先核对原 PDF、文件名和来源，不作为唯一证据。",
    tags: ["ffd-quality", "source-review"],
    flagTerms: ["机构字段缺失", "机构字段疑似文件名", "机构需人工复核", "扩展产业机构"],
  },
];

const ALL_HUBS = [...TOPIC_HUBS, ...COMPANY_HUBS, ...EVIDENCE_HUBS, ...QUALITY_HUBS];

function textForMatching(manifest: FfdReportManifest): string {
  return [
    manifest.title,
    manifest.institution,
    manifest.industry,
    manifest.summary,
    ...(manifest.tags ?? []),
    ...(manifest.topics ?? []),
    ...(manifest.companies ?? []),
    ...(manifest.evidenceKinds ?? []),
  ].filter(Boolean).join(" ");
}

function containsAny(text: string, terms: string[] = []): boolean {
  const compact = text.toLowerCase().replace(/\s+/g, "");
  return terms.some((term) => compact.includes(term.toLowerCase().replace(/\s+/g, "")));
}

function matchesHub(hub: HubDefinition, manifest: FfdReportManifest): boolean {
  const quality = qualityForManifest(manifest);
  const text = textForMatching(manifest);
  if (hub.ruleIds?.some((ruleId) => quality.matchedRuleIds.includes(ruleId))) return true;
  if (hub.flagTerms?.some((term) => quality.reviewFlags.some((flag) => flag.includes(term)))) return true;
  if (hub.terms && containsAny(text, hub.terms)) return true;
  return hub.evidence?.(manifest, text) ?? false;
}

function hubPath(vaultRoot: string, hub: HubDefinition): string {
  return path.join(vaultRoot, INDEX_DIR_RELATIVE, hub.kind === "topic" ? "topics" : hub.kind === "company" ? "companies" : hub.kind === "evidence" ? "evidence" : "quality", `${hub.fileName}.md`);
}

function viewKindDir(kind: HubKind): string {
  if (kind === "topic") return "by-topic";
  if (kind === "company") return "by-company";
  if (kind === "evidence") return "by-evidence";
  return "by-quality";
}

function viewKindLabel(kind: HubKind): string {
  if (kind === "topic") return "主题";
  if (kind === "company") return "公司";
  if (kind === "evidence") return "证据";
  return "质量";
}

function viewRootPath(vaultRoot: string): string {
  return path.join(vaultRoot, VIEWS_DIR_RELATIVE, "00-README.md");
}

function viewKindIndexPath(vaultRoot: string, kind: HubKind): string {
  return path.join(vaultRoot, VIEWS_DIR_RELATIVE, viewKindDir(kind), "00-README.md");
}

function viewHubPath(vaultRoot: string, hub: HubDefinition): string {
  return path.join(vaultRoot, VIEWS_DIR_RELATIVE, viewKindDir(hub.kind), `${hub.fileName}.md`);
}

function totalIndexPath(vaultRoot: string): string {
  return path.join(vaultRoot, INDEX_DIR_RELATIVE, "FFD研报库总索引.md");
}

function agentIndexPath(vaultRoot: string): string {
  return path.join(vaultRoot, INDEX_DIR_RELATIVE, "Agent检索入口.md");
}

function purposePath(vaultRoot: string): string {
  return path.join(vaultRoot, INDEX_DIR_RELATIVE, "purpose.md");
}

function schemaPath(vaultRoot: string): string {
  return path.join(vaultRoot, INDEX_DIR_RELATIVE, "schema.md");
}

function maintenanceLogPath(vaultRoot: string): string {
  return path.join(vaultRoot, INDEX_DIR_RELATIVE, "log.md");
}

function graphJsonPath(vaultRoot: string): string {
  return path.join(vaultRoot, INDEX_DIR_RELATIVE, "graph", "ffd-knowledge-graph.json");
}

function graphInsightsPath(vaultRoot: string): string {
  return path.join(vaultRoot, INDEX_DIR_RELATIVE, "graph", "graph-insights.md");
}

function vaultRelativeNoExt(vaultRoot: string, filePath: string): string {
  return path.relative(vaultRoot, filePath).replace(/\\/g, "/").replace(/\.md$/i, "");
}

function escapeAlias(value: string): string {
  return value.replace(/\|/g, "/").replace(/\[/g, "(").replace(/\]/g, ")").replace(/\s+/g, " ").trim();
}

function wikiLink(vaultRoot: string, filePath: string, alias: string): string {
  return `[[${vaultRelativeNoExt(vaultRoot, filePath)}|${escapeAlias(alias)}]]`;
}

function markdownHref(fromFile: string, targetFile: string): string {
  const relativePath = path.relative(path.dirname(fromFile), targetFile).replace(/\\/g, "/");
  return encodeURI(relativePath).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

function markdownLink(fromFile: string, targetFile: string, alias: string): string {
  return `[${escapeAlias(alias)}](${markdownHref(fromFile, targetFile)})`;
}

function frontmatter(type: string, tags: string[], extra: Record<string, string> = {}): string {
  const lines = [
    "---",
    `type: ${type}`,
    `updated_at: ${new Date().toISOString()}`,
    `tags: ${tags.join(", ")}`,
    ...Object.entries(extra).map(([key, value]) => `${key}: ${value}`),
    "---",
    "",
  ];
  return lines.join("\n");
}

function shortTitle(title: string, maxLength = 54): string {
  const compact = title.replace(/\s+/g, " ").trim();
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1)}…`;
}

function publishedDate(manifest: FfdReportManifest): string {
  return manifest.publishedAt ?? manifest.convertedAt.slice(0, 10);
}

function reportQualityLabels(manifest: FfdReportManifest): string[] {
  const quality = qualityForManifest(manifest);
  return [
    quality.hasBottleneckEvidence ? "硬证据" : "背景/P0交叉验证",
    quality.matchedRuleIds.some((ruleId) => ruleId.startsWith("adjacent-")) ? "相邻背景" : undefined,
    quality.reviewFlags.some((flag) => /机构字段|机构需人工复核|扩展产业机构/.test(flag)) ? "来源复核" : undefined,
  ].filter((label): label is string => Boolean(label));
}

function tableCell(value: string): string {
  return value.replace(/\|/g, "/").replace(/\n/g, " ").trim();
}

function reportRow(fromFile: string, entry: ReportEntry): string {
  const topicLabels = entry.hubs.filter((hub) => hub.kind === "topic").map((hub) => hub.label).join(", ") || "n/a";
  const companies = entry.hubs.filter((hub) => hub.kind === "company").map((hub) => hub.label).join(", ") || "n/a";
  const evidence = entry.hubs.filter((hub) => hub.kind === "evidence").map((hub) => hub.label).join(", ") || "n/a";
  return [
    publishedDate(entry.manifest),
    markdownLink(fromFile, entry.notePath, shortTitle(entry.manifest.title)),
    tableCell(entry.manifest.institution ?? "n/a"),
    tableCell(topicLabels),
    tableCell(companies),
    tableCell(evidence),
    tableCell(reportQualityLabels(entry.manifest).join(", ")),
  ].join(" | ");
}

function linksForKind(vaultRoot: string, entry: ReportEntry, kind: HubKind): string {
  const links = entry.hubs.filter((hub) => hub.kind === kind).map((hub) => wikiLink(vaultRoot, hubPath(vaultRoot, hub), hub.label));
  return links.length > 0 ? links.join("、") : "n/a";
}

function viewLinksForKind(vaultRoot: string, entry: ReportEntry, kind: HubKind): string {
  const links = entry.hubs.filter((hub) => hub.kind === kind).map((hub) => wikiLink(vaultRoot, viewHubPath(vaultRoot, hub), hub.label));
  return links.length > 0 ? links.join("、") : "n/a";
}

function managedKnowledgeBlock(vaultRoot: string, entry: ReportEntry): string {
  const total = totalIndexPath(vaultRoot);
  return [
    "## Knowledge Links",
    "",
    MANAGED_START,
    `- 总索引: ${wikiLink(vaultRoot, total, "FFD 研报库总索引")}`,
    `- Agent 检索入口: ${wikiLink(vaultRoot, agentIndexPath(vaultRoot), "FFD Agent 检索入口")}`,
    `- 主题: ${linksForKind(vaultRoot, entry, "topic")}`,
    `- 公司: ${linksForKind(vaultRoot, entry, "company")}`,
    `- 证据: ${linksForKind(vaultRoot, entry, "evidence")}`,
    `- 质量: ${linksForKind(vaultRoot, entry, "quality")}`,
    `- 浏览视图: ${wikiLink(vaultRoot, viewRootPath(vaultRoot), "FFD Views")} · 主题 ${viewLinksForKind(vaultRoot, entry, "topic")} · 公司 ${viewLinksForKind(vaultRoot, entry, "company")}`,
    `- Source: \`${entry.manifest.id}\` · \`P1 broker_report\` · ${reportQualityLabels(entry.manifest).join(" / ")}`,
    "- 使用约束: FFD Accepted 仍是 P1 研报来源；形成候选结论时必须和公告、年报、互动问答等 P0 披露交叉验证。",
    MANAGED_END,
    "",
  ].join("\n");
}

function removeManagedKnowledgeBlock(markdown: string): string {
  const escapedStart = MANAGED_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = MANAGED_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return markdown.replace(new RegExp(`\\n?## Knowledge Links\\n\\n${escapedStart}[\\s\\S]*?${escapedEnd}\\n?`, "g"), "\n");
}

function managedKnowledgeBlockPattern(): RegExp {
  const escapedStart = MANAGED_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = MANAGED_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`## Knowledge Links\\n\\n${escapedStart}[\\s\\S]*?${escapedEnd}`);
}

async function updateReportNote(vaultRoot: string, entry: ReportEntry): Promise<boolean> {
  const original = await fs.readFile(entry.notePath, "utf8");
  const block = managedKnowledgeBlock(vaultRoot, entry).trimEnd();
  const pattern = managedKnowledgeBlockPattern();
  if (pattern.test(original)) {
    const updated = original.replace(pattern, block);
    if (updated === original) return false;
    await fs.writeFile(entry.notePath, updated, "utf8");
    return true;
  }
  const anchor = "\n## Retrieval Chunks\n";
  const updated = original.includes(anchor) ? original.replace(anchor, `\n${block}\n${anchor}`) : `${removeManagedKnowledgeBlock(original).trimEnd()}\n\n${block}\n`;
  if (updated === original) return false;
  await fs.writeFile(entry.notePath, updated, "utf8");
  return true;
}

function buildHubPage(vaultRoot: string, hub: HubDefinition, entries: ReportEntry[]): string {
  const filePath = hubPath(vaultRoot, hub);
  const linkedEntries = entries.filter((entry) => entry.hubs.some((item) => item.id === hub.id)).sort((a, b) => publishedDate(b.manifest).localeCompare(publishedDate(a.manifest)) || a.manifest.title.localeCompare(b.manifest.title));
  return [
    frontmatter("ffd_index", ["ffd-index", ...hub.tags], { index_kind: hub.kind }),
    `# ${hub.label}`,
    "",
    `返回: ${wikiLink(vaultRoot, totalIndexPath(vaultRoot), "FFD 研报库总索引")} · ${wikiLink(vaultRoot, agentIndexPath(vaultRoot), "FFD Agent 检索入口")}`,
    "",
    "## 用途",
    "",
    hub.description,
    "",
    `Agent 用法: ${hub.agentUse}`,
    "",
    "## Linked Reports",
    "",
    "| 日期 | 报告 | 机构 | 主题 | 公司 | 证据 | 质量 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...(linkedEntries.length > 0 ? linkedEntries.map((entry) => `| ${reportRow(filePath, entry)} |`) : ["| n/a | 暂无 Accepted 研报 | n/a | n/a | n/a | n/a | n/a |"]),
    "",
  ].join("\n");
}

function buildViewRoot(vaultRoot: string, entries: ReportEntry[], activeHubs: HubDefinition[]): string {
  const filePath = viewRootPath(vaultRoot);
  const hubsByKind = (kind: HubKind) => activeHubs.filter((hub) => hub.kind === kind);
  const kindRows: HubKind[] = ["topic", "company", "evidence", "quality"];
  const recentEntries = [...entries].sort((a, b) => publishedDate(b.manifest).localeCompare(publishedDate(a.manifest)) || a.manifest.title.localeCompare(b.manifest.title)).slice(0, 12);
  return [
    frontmatter("ffd_view", ["ffd-view", "ffd-library", "rag-routing"], { view_kind: "root" }),
    "# FFD Views",
    "",
    `总索引: ${wikiLink(vaultRoot, totalIndexPath(vaultRoot), "FFD 研报库总索引")} · Agent 入口: ${wikiLink(vaultRoot, agentIndexPath(vaultRoot), "FFD Agent 检索入口")}`,
    "",
    "## 浏览入口",
    "",
    ...kindRows.map((kind) => `- ${wikiLink(vaultRoot, viewKindIndexPath(vaultRoot, kind), `按${viewKindLabel(kind)}浏览`)}: ${hubsByKind(kind).length} 个分组`),
    "",
    "## 活跃分组",
    "",
    "| 分类 | 分组 | 报告数 | Index Hub | Agent 用法 |",
    "| --- | --- | ---: | --- | --- |",
    ...activeHubs
      .map((hub) => {
        const count = reportCountForHub(entries, hub);
        return `| ${viewKindLabel(hub.kind)} | ${wikiLink(vaultRoot, viewHubPath(vaultRoot, hub), hub.label)} | ${count} | ${wikiLink(vaultRoot, hubPath(vaultRoot, hub), "hub")} | ${tableCell(hub.agentUse)} |`;
      }),
    "",
    "## 最新 Accepted",
    "",
    "| 日期 | 报告 | 机构 | 主题 | 公司 | 证据 | 质量 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...(recentEntries.length > 0 ? recentEntries.map((entry) => `| ${reportRow(filePath, entry)} |`) : ["| n/a | 暂无 Accepted 研报 | n/a | n/a | n/a | n/a | n/a |"]),
    "",
    "## 说明",
    "",
    "- 这里是可重建的分类视图层，只保存链接和路由信息，不复制 Accepted 正文。",
    "- 同一研报可以出现在多个主题、公司或证据视图中，符合研报多标签属性。",
    "- Agent 检索时先读 Views 或 Agent 入口，再进入具体报告和 full markdown。",
    "",
  ].join("\n");
}

function buildViewKindIndex(vaultRoot: string, kind: HubKind, entries: ReportEntry[], activeHubs: HubDefinition[]): string {
  const filePath = viewKindIndexPath(vaultRoot, kind);
  const hubs = activeHubs.filter((hub) => hub.kind === kind).sort((a, b) => reportCountForHub(entries, b) - reportCountForHub(entries, a) || a.label.localeCompare(b.label));
  return [
    frontmatter("ffd_view", ["ffd-view", `ffd-view-${kind}`, "rag-routing"], { view_kind: kind }),
    `# 按${viewKindLabel(kind)}浏览`,
    "",
    `返回: ${wikiLink(vaultRoot, viewRootPath(vaultRoot), "FFD Views")} · ${wikiLink(vaultRoot, totalIndexPath(vaultRoot), "FFD 研报库总索引")} · ${wikiLink(vaultRoot, agentIndexPath(vaultRoot), "FFD Agent 检索入口")}`,
    "",
    "## 分组",
    "",
    "| 分组 | 报告数 | Index Hub | Agent 用法 |",
    "| --- | ---: | --- | --- |",
    ...(hubs.length > 0
      ? hubs.map((hub) => `| ${wikiLink(vaultRoot, viewHubPath(vaultRoot, hub), hub.label)} | ${reportCountForHub(entries, hub)} | ${wikiLink(vaultRoot, hubPath(vaultRoot, hub), "hub")} | ${tableCell(hub.agentUse)} |`)
      : ["| n/a | 0 | n/a | n/a |"]),
    "",
    "## 使用约束",
    "",
    "- 这些页面是浏览和路由层，不提升研报可信等级。",
    "- 进入具体报告后仍按 `P1 broker_report` 处理，并与 P0 披露交叉验证。",
    "",
  ].join("\n");
}

function buildViewHubPage(vaultRoot: string, hub: HubDefinition, entries: ReportEntry[]): string {
  const filePath = viewHubPath(vaultRoot, hub);
  const linkedEntries = entries.filter((entry) => entry.hubs.some((item) => item.id === hub.id)).sort((a, b) => publishedDate(b.manifest).localeCompare(publishedDate(a.manifest)) || a.manifest.title.localeCompare(b.manifest.title));
  const hardEvidenceCount = linkedEntries.filter((entry) => qualityForManifest(entry.manifest).hasBottleneckEvidence).length;
  const sourceReviewCount = linkedEntries.filter((entry) => entry.hubs.some((item) => item.id === "quality-source-review")).length;
  return [
    frontmatter("ffd_view", ["ffd-view", `ffd-view-${hub.kind}`, ...hub.tags], { view_kind: hub.kind }),
    `# ${hub.label}`,
    "",
    `返回: ${wikiLink(vaultRoot, viewKindIndexPath(vaultRoot, hub.kind), `按${viewKindLabel(hub.kind)}浏览`)} · ${wikiLink(vaultRoot, viewRootPath(vaultRoot), "FFD Views")} · ${wikiLink(vaultRoot, hubPath(vaultRoot, hub), "Index Hub")}`,
    "",
    "## 用途",
    "",
    hub.description,
    "",
    `Agent 用法: ${hub.agentUse}`,
    "",
    "## 覆盖概览",
    "",
    `- Accepted reports: ${linkedEntries.length}`,
    `- 硬证据报告: ${hardEvidenceCount}`,
    `- 来源需复核: ${sourceReviewCount}`,
    "- Source tier: `P1 broker_report`",
    "",
    "## Reports",
    "",
    "| 日期 | 报告 | 机构 | 主题 | 公司 | 证据 | 质量 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...(linkedEntries.length > 0 ? linkedEntries.map((entry) => `| ${reportRow(filePath, entry)} |`) : ["| n/a | 暂无 Accepted 研报 | n/a | n/a | n/a | n/a | n/a |"]),
    "",
    "## Agent Retrieval Notes",
    "",
    "- 先用本页缩小主题或公司范围，再打开报告页的 `Evidence Map`、`Claims`、`Retrieval Chunks`。",
    "- 对来源复核或背景类报告降权；任何候选结论都必须回到 P0 公司披露验证。",
    "",
  ].join("\n");
}

function buildTotalIndex(vaultRoot: string, entries: ReportEntry[], activeHubs: HubDefinition[]): string {
  const filePath = totalIndexPath(vaultRoot);
  const hubsByKind = (kind: HubKind) => activeHubs.filter((hub) => hub.kind === kind);
  const hubRows = activeHubs.map((hub) => {
    const count = entries.filter((entry) => entry.hubs.some((item) => item.id === hub.id)).length;
    return `| ${hub.kind} | ${wikiLink(vaultRoot, hubPath(vaultRoot, hub), hub.label)} | ${count} | ${tableCell(hub.agentUse)} |`;
  });
  return [
    frontmatter("ffd_index", ["ffd-index", "ffd-library", "rag-routing"], { index_kind: "root" }),
    "# FFD 研报库总索引",
    "",
    `Agent 入口: ${wikiLink(vaultRoot, agentIndexPath(vaultRoot), "FFD Agent 检索入口")}`,
    `Obsidian 分类视图: ${wikiLink(vaultRoot, viewRootPath(vaultRoot), "FFD Views")}`,
    `治理文件: ${wikiLink(vaultRoot, purposePath(vaultRoot), "purpose")} · ${wikiLink(vaultRoot, schemaPath(vaultRoot), "schema")} · ${wikiLink(vaultRoot, graphInsightsPath(vaultRoot), "graph insights")} · ${wikiLink(vaultRoot, maintenanceLogPath(vaultRoot), "log")}`,
    "",
    "## 范围",
    "",
    `- Accepted FFD reports: ${entries.length}`,
    "- Source tier: `P1 broker_report`",
    "- 使用原则: 可用于产业链线索、券商观点和交叉验证；不能替代 P0 公司披露。",
    "",
    "## 分类入口",
    "",
    `- 主题: ${hubsByKind("topic").map((hub) => wikiLink(vaultRoot, hubPath(vaultRoot, hub), hub.label)).join("、") || "n/a"}`,
    `- 公司: ${hubsByKind("company").map((hub) => wikiLink(vaultRoot, hubPath(vaultRoot, hub), hub.label)).join("、") || "n/a"}`,
    `- 证据: ${hubsByKind("evidence").map((hub) => wikiLink(vaultRoot, hubPath(vaultRoot, hub), hub.label)).join("、") || "n/a"}`,
    `- 质量: ${hubsByKind("quality").map((hub) => wikiLink(vaultRoot, hubPath(vaultRoot, hub), hub.label)).join("、") || "n/a"}`,
    "",
    "## Hub 明细",
    "",
    "| 类型 | Hub | 报告数 | Agent 用法 |",
    "| --- | --- | ---: | --- |",
    ...hubRows,
    "",
    "## Accepted Reports",
    "",
    "| 日期 | 报告 | 机构 | 主题 | 公司 | 证据 | 质量 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...entries.sort((a, b) => publishedDate(b.manifest).localeCompare(publishedDate(a.manifest)) || a.manifest.title.localeCompare(b.manifest.title)).map((entry) => `| ${reportRow(filePath, entry)} |`),
    "",
  ].join("\n");
}

function buildAgentIndex(vaultRoot: string, entries: ReportEntry[], activeHubs: HubDefinition[]): string {
  const topicLinks = activeHubs.filter((hub) => hub.kind === "topic").map((hub) => `- ${wikiLink(vaultRoot, hubPath(vaultRoot, hub), hub.label)}: ${hub.agentUse}`);
  const evidenceLinks = activeHubs.filter((hub) => hub.kind === "evidence").map((hub) => `- ${wikiLink(vaultRoot, hubPath(vaultRoot, hub), hub.label)}: ${hub.agentUse}`);
  const qualityLinks = activeHubs.filter((hub) => hub.kind === "quality").map((hub) => `- ${wikiLink(vaultRoot, hubPath(vaultRoot, hub), hub.label)}: ${hub.agentUse}`);
  return [
    frontmatter("ffd_agent_index", ["ffd-index", "agent-routing", "rag-routing"], { index_kind: "agent" }),
    "# FFD Agent 检索入口",
    "",
    `总索引: ${wikiLink(vaultRoot, totalIndexPath(vaultRoot), "FFD 研报库总索引")}`,
    `分类视图: ${wikiLink(vaultRoot, viewRootPath(vaultRoot), "FFD Views")}`,
    `治理文件: ${wikiLink(vaultRoot, purposePath(vaultRoot), "purpose")} · ${wikiLink(vaultRoot, schemaPath(vaultRoot), "schema")} · ${wikiLink(vaultRoot, graphInsightsPath(vaultRoot), "graph insights")} · ${wikiLink(vaultRoot, maintenanceLogPath(vaultRoot), "log")}`,
    "",
    "## 检索顺序",
    "",
    "1. 先按用户问题进入主题 hub。",
    "2. 若问题点名公司，再进入公司 hub。",
    "3. 若问题是证据型，例如订单、产能、涨价、毛利率、技术路线，补读证据 hub。",
    "4. 最后读取质量 hub；相邻背景、机构需复核、background-only 资料必须降权。",
    "",
    "## 主题路由",
    "",
    ...topicLinks,
    "",
    "## 证据路由",
    "",
    ...evidenceLinks,
    "",
    "## 质量路由",
    "",
    ...qualityLinks,
    "",
    "## Agent 约束",
    "",
    "- 所有 FFD Accepted 都是 `P1 broker_report`。",
    "- `背景/P0交叉验证`、`相邻背景`、`来源复核` 只能生成待验证假设。",
    "- 回答候选公司结论时，必须要求 P0 公司公告、年报、业绩会、互动问答或监管披露交叉验证。",
    `- 当前可检索报告数: ${entries.length}`,
    "",
  ].join("\n");
}

function reportCountForHub(entries: ReportEntry[], hub: HubDefinition): number {
  return entries.filter((entry) => entry.hubs.some((item) => item.id === hub.id)).length;
}

function buildPurposePage(vaultRoot: string, entries: ReportEntry[], activeHubs: HubDefinition[]): string {
  return [
    frontmatter("ffd_wiki_governance", ["ffd-index", "wiki-purpose", "rag-governance"], { index_kind: "purpose" }),
    "# FFD Wiki Purpose",
    "",
    `返回: ${wikiLink(vaultRoot, totalIndexPath(vaultRoot), "FFD 研报库总索引")} · ${wikiLink(vaultRoot, agentIndexPath(vaultRoot), "FFD Agent 检索入口")}`,
    "",
    "## 目标",
    "",
    "- 把 FFD 自动下载研报整理成可追溯、可增量维护、可被 agent 快速路由的 P1 研报知识库。",
    "- 优先服务 AI 硬件链、存储芯片、半导体设备、光模块/PCB/先进封装、MLCC/功率半导体、AI 算力芯片等主题。",
    "- 为 trading agent 提供产业链线索、券商观点、证据候选和待验证假设。",
    "",
    "## 非目标",
    "",
    "- 不把 FFD 研报自动升级为 P0 事实来源。",
    "- 不把目标价、评级或短期情绪直接作为交易结论。",
    "- 不在索引中改写原文；原始摘要、claims、chunks 仍保留在各报告页。",
    "",
    "## 维护原则",
    "",
    "- 原始报告路径保持稳定，索引和双链为可重建层。",
    "- `reports/FFD/Views` 提供面向人和 agent 的文件夹式分组视图，但不复制 Accepted 正文。",
    "- 每篇 Accepted 报告必须有 `Knowledge Links` 托管块。",
    "- 背景、相邻产业、来源需复核报告必须通过质量 hub 降权。",
    "- 每次 accepted 报告变化后运行 `npm run reports:organize-obsidian`。",
    "",
    "## 当前范围",
    "",
    `- Accepted reports: ${entries.length}`,
    `- Active hubs: ${activeHubs.length}`,
    `- Topics: ${activeHubs.filter((hub) => hub.kind === "topic").length}`,
    `- Companies: ${activeHubs.filter((hub) => hub.kind === "company").length}`,
    "",
  ].join("\n");
}

function buildSchemaPage(vaultRoot: string): string {
  return [
    frontmatter("ffd_wiki_governance", ["ffd-index", "wiki-schema", "rag-governance"], { index_kind: "schema" }),
    "# FFD Wiki Schema",
    "",
    `返回: ${wikiLink(vaultRoot, totalIndexPath(vaultRoot), "FFD 研报库总索引")} · ${wikiLink(vaultRoot, agentIndexPath(vaultRoot), "FFD Agent 检索入口")}`,
    "",
    "## Page Types",
    "",
    "| type | path | role |",
    "| --- | --- | --- |",
    "| root index | `reports/FFD/Index/FFD研报库总索引.md` | 人和 agent 的总导航。 |",
    "| agent index | `reports/FFD/Index/Agent检索入口.md` | agent 检索顺序、降权规则和路由说明。 |",
    "| topic hub | `reports/FFD/Index/topics/*.md` | 按投资主题聚合报告。 |",
    "| company hub | `reports/FFD/Index/companies/*.md` | 按公司或关键海外可比对象聚合报告。 |",
    "| evidence hub | `reports/FFD/Index/evidence/*.md` | 按证据类型聚合报告。 |",
    "| quality hub | `reports/FFD/Index/quality/*.md` | 按可信度和复核要求聚合报告。 |",
    "| view root | `reports/FFD/Views/00-README.md` | Obsidian 侧栏友好的分类视图入口。 |",
    "| grouped view | `reports/FFD/Views/by-*/*.md` | 按主题、公司、证据、质量分组的可浏览报告清单。 |",
    "| report note | `reports/FFD/Accepted/*.md` | 具体 FFD Accepted 报告。 |",
    "| graph JSON | `reports/FFD/Index/graph/ffd-knowledge-graph.json` | agent 可读图谱快照。 |",
    "| graph insights | `reports/FFD/Index/graph/graph-insights.md` | 人可读覆盖、桥接和缺口分析。 |",
    "| log | `reports/FFD/Index/log.md` | 每次整理运行记录。 |",
    "",
    "## Link Contract",
    "",
    "- Report note 中 `<!-- FFD-KB-LINKS:START -->` 到 `<!-- FFD-KB-LINKS:END -->` 之间由脚本托管。",
    "- Hub 页面必须反向列出 linked reports。",
    "- View 页面只保存索引和链接，不复制报告正文；同一报告可以出现在多个视图。",
    "- Graph JSON 的 `report -> hub` 边是分类边，`hub -> hub` 边是共享报告边。",
    "- source tier 一律保留 `P1 broker_report`，不能在索引层提升可信等级。",
    "",
    "## Quality Labels",
    "",
    "- `硬证据`: 命中客户、订单、产能、毛利率、良率、供需、价格等证据词。",
    "- `背景/P0交叉验证`: 缺少硬证据，只能用于背景和线索。",
    "- `相邻背景`: 通过 MLCC、功率半导体、AI 算力芯片、光模块短周期等相邻规则入库。",
    "- `来源复核`: 机构字段缺失、疑似文件名，或来自扩展产业机构。",
    "",
  ].join("\n");
}

function edgeWeightForHub(hub: HubDefinition): number {
  if (hub.kind === "topic") return 3;
  if (hub.kind === "company") return 2.6;
  if (hub.kind === "evidence") return 2.2;
  return 1.4;
}

function buildKnowledgeGraph(vaultRoot: string, entries: ReportEntry[], activeHubs: HubDefinition[]): KnowledgeGraph {
  const nodes: KnowledgeGraphNode[] = [
    ...entries.map((entry) => ({
      id: entry.manifest.id,
      type: "report" as const,
      label: entry.manifest.title,
      path: vaultRelativeNoExt(vaultRoot, entry.notePath),
      quality: reportQualityLabels(entry.manifest),
    })),
    ...activeHubs.map((hub) => ({
      id: hub.id,
      type: "hub" as const,
      kind: hub.kind,
      label: hub.label,
      path: vaultRelativeNoExt(vaultRoot, hubPath(vaultRoot, hub)),
    })),
  ];
  const edges: KnowledgeGraphEdge[] = entries.flatMap((entry) =>
    entry.hubs.map((hub) => ({
      source: entry.manifest.id,
      target: hub.id,
      type: "classified_as" as const,
      weight: edgeWeightForHub(hub),
      reason: hub.kind,
    })),
  );
  for (let i = 0; i < activeHubs.length; i += 1) {
    for (let j = i + 1; j < activeHubs.length; j += 1) {
      const left = activeHubs[i];
      const right = activeHubs[j];
      const shared = entries.filter((entry) => entry.hubs.some((hub) => hub.id === left.id) && entry.hubs.some((hub) => hub.id === right.id)).length;
      if (shared < 2) continue;
      edges.push({
        source: left.id,
        target: right.id,
        type: "shared_reports",
        weight: Math.min(6, 1 + shared / 2),
        reason: `${shared} shared reports`,
      });
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    stats: {
      reports: entries.length,
      hubs: activeHubs.length,
      edges: edges.length,
    },
    nodes,
    edges,
  };
}

function buildGraphInsights(vaultRoot: string, entries: ReportEntry[], activeHubs: HubDefinition[], graph: KnowledgeGraph): string {
  const filePath = graphInsightsPath(vaultRoot);
  const topHubs = [...activeHubs]
    .map((hub) => ({ hub, count: reportCountForHub(entries, hub) }))
    .sort((a, b) => b.count - a.count || a.hub.label.localeCompare(b.hub.label))
    .slice(0, 12);
  const crossTopicEntries = entries
    .map((entry) => ({ entry, topics: entry.hubs.filter((hub) => hub.kind === "topic") }))
    .filter((item) => item.topics.length >= 3)
    .sort((a, b) => b.topics.length - a.topics.length || b.entry.hubs.length - a.entry.hubs.length)
    .slice(0, 10);
  const sourceReviewEntries = entries.filter((entry) => entry.hubs.some((hub) => hub.id === "quality-source-review"));
  const backgroundEntries = entries.filter((entry) => entry.hubs.some((hub) => hub.id === "quality-background-only"));
  const undercoveredTopics = activeHubs.filter((hub) => hub.kind === "topic" && reportCountForHub(entries, hub) < 3);
  const missingWatchlistCompanies = COMPANY_HUBS.filter((hub) => ["新易盛", "中际旭创", "东山精密", "澜起科技", "拓荆科技", "绿的谐波"].includes(hub.label) && !activeHubs.some((activeHub) => activeHub.id === hub.id));
  return [
    frontmatter("ffd_graph_insights", ["ffd-index", "knowledge-graph", "rag-routing"], { index_kind: "graph_insights" }),
    "# FFD Knowledge Graph Insights",
    "",
    `返回: ${wikiLink(vaultRoot, totalIndexPath(vaultRoot), "FFD 研报库总索引")} · ${wikiLink(vaultRoot, agentIndexPath(vaultRoot), "FFD Agent 检索入口")} · ${markdownLink(filePath, graphJsonPath(vaultRoot), "graph JSON")}`,
    "",
    "## Graph Snapshot",
    "",
    `- Reports: ${graph.stats.reports}`,
    `- Hubs: ${graph.stats.hubs}`,
    `- Edges: ${graph.stats.edges}`,
    "",
    "## High-Degree Hubs",
    "",
    "| Hub | Kind | Reports |",
    "| --- | --- | ---: |",
    ...topHubs.map((item) => `| ${wikiLink(vaultRoot, hubPath(vaultRoot, item.hub), item.hub.label)} | ${item.hub.kind} | ${item.count} |`),
    "",
    "## Bridge Reports",
    "",
    "这些报告跨多个主题，适合作为 agent 扩展检索的二跳入口。",
    "",
    "| 报告 | 主题数 | 主题 | 质量 |",
    "| --- | ---: | --- | --- |",
    ...(crossTopicEntries.length > 0
      ? crossTopicEntries.map((item) => `| ${markdownLink(filePath, item.entry.notePath, shortTitle(item.entry.manifest.title))} | ${item.topics.length} | ${tableCell(item.topics.map((hub) => hub.label).join(", "))} | ${tableCell(reportQualityLabels(item.entry.manifest).join(", "))} |`)
      : ["| n/a | 0 | n/a | n/a |"]),
    "",
    "## Quality Alerts",
    "",
    `- 来源需复核: ${sourceReviewEntries.length}`,
    `- 背景/P0 交叉验证: ${backgroundEntries.length}`,
    `- 相邻产业背景: ${entries.filter((entry) => entry.hubs.some((hub) => hub.id === "quality-adjacent-background")).length}`,
    "",
    "## Coverage Gaps",
    "",
    ...(undercoveredTopics.length > 0 ? undercoveredTopics.map((hub) => `- 主题覆盖偏少: ${wikiLink(vaultRoot, hubPath(vaultRoot, hub), hub.label)} (${reportCountForHub(entries, hub)} reports)`) : ["- 核心主题暂无明显低覆盖。"]),
    ...(missingWatchlistCompanies.length > 0 ? missingWatchlistCompanies.map((hub) => `- Watchlist 公司暂无 Accepted FFD: ${hub.label}`) : ["- Watchlist 公司均已有至少一篇 Accepted FFD。"]),
    "",
    "## Maintenance Recommendations",
    "",
    "- 新增 Accepted 后先运行 `npm run reports:organize-obsidian`，再让 agent 检索。",
    "- 若某主题连续低覆盖，应回到 FFD 自动下载规则补关键词或机构。",
    "- 来源需复核报告在引用前打开原 PDF 路径核对机构、日期和标题。",
    "",
  ].join("\n");
}

async function appendMaintenanceLog(vaultRoot: string, run: FfdObsidianOrganizationRun): Promise<void> {
  const filePath = maintenanceLogPath(vaultRoot);
  await ensureDir(path.dirname(filePath));
  let current = "";
  try {
    current = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const header = [
    frontmatter("ffd_wiki_log", ["ffd-index", "wiki-log", "rag-governance"], { index_kind: "log" }),
    "# FFD Wiki Maintenance Log",
    "",
    `返回: ${wikiLink(vaultRoot, totalIndexPath(vaultRoot), "FFD 研报库总索引")}`,
    "",
  ].join("\n");
  const body = current.trim() ? current : header;
  const entry = [
    `## ${new Date().toISOString()}`,
    "",
    `- accepted_reports: ${run.acceptedReports}`,
    `- report_notes_updated: ${run.updatedReportNotes}`,
    `- index_files_written: ${run.indexFiles.length}`,
    `- view_files_written: ${run.viewFiles.length}`,
    `- graph_nodes: ${run.graphNodes}`,
    `- graph_edges: ${run.graphEdges}`,
    "",
  ].join("\n");
  await fs.writeFile(filePath, `${body.trimEnd()}\n\n${entry}`, "utf8");
}

async function writeIndexFile(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

export async function organizeFfdObsidianKnowledgebase(): Promise<FfdObsidianOrganizationRun> {
  const vaultRoot = knowledgebasePath(getConfig());
  const manifests = (await listFfdReportManifests())
    .filter((manifest) => manifest.status === "accepted" && manifest.obsidianAcceptedPath)
    .sort((a, b) => publishedDate(b).localeCompare(publishedDate(a)) || a.title.localeCompare(b.title));
  const entries: ReportEntry[] = manifests.map((manifest) => {
    const hubs = ALL_HUBS.filter((hub) => matchesHub(hub, manifest));
    return { manifest, notePath: manifest.obsidianAcceptedPath as string, hubs };
  });
  const activeHubs = ALL_HUBS.filter((hub) => entries.some((entry) => entry.hubs.some((item) => item.id === hub.id)));
  const graph = buildKnowledgeGraph(vaultRoot, entries, activeHubs);
  const governanceFiles = [purposePath(vaultRoot), schemaPath(vaultRoot), graphInsightsPath(vaultRoot), graphJsonPath(vaultRoot), maintenanceLogPath(vaultRoot)];
  const indexFiles = [totalIndexPath(vaultRoot), agentIndexPath(vaultRoot), ...governanceFiles, ...activeHubs.map((hub) => hubPath(vaultRoot, hub))];
  const viewFiles = [
    viewRootPath(vaultRoot),
    ...(["topic", "company", "evidence", "quality"] as HubKind[]).map((kind) => viewKindIndexPath(vaultRoot, kind)),
    ...activeHubs.map((hub) => viewHubPath(vaultRoot, hub)),
  ];

  await writeIndexFile(totalIndexPath(vaultRoot), buildTotalIndex(vaultRoot, entries, activeHubs));
  await writeIndexFile(agentIndexPath(vaultRoot), buildAgentIndex(vaultRoot, entries, activeHubs));
  await writeIndexFile(purposePath(vaultRoot), buildPurposePage(vaultRoot, entries, activeHubs));
  await writeIndexFile(schemaPath(vaultRoot), buildSchemaPage(vaultRoot));
  await writeIndexFile(graphInsightsPath(vaultRoot), buildGraphInsights(vaultRoot, entries, activeHubs, graph));
  await writeIndexFile(graphJsonPath(vaultRoot), `${JSON.stringify(graph, null, 2)}\n`);
  for (const hub of activeHubs) {
    await writeIndexFile(hubPath(vaultRoot, hub), buildHubPage(vaultRoot, hub, entries));
  }
  await writeIndexFile(viewRootPath(vaultRoot), buildViewRoot(vaultRoot, entries, activeHubs));
  for (const kind of ["topic", "company", "evidence", "quality"] as HubKind[]) {
    await writeIndexFile(viewKindIndexPath(vaultRoot, kind), buildViewKindIndex(vaultRoot, kind, entries, activeHubs));
  }
  for (const hub of activeHubs) {
    await writeIndexFile(viewHubPath(vaultRoot, hub), buildViewHubPage(vaultRoot, hub, entries));
  }

  let updatedReportNotes = 0;
  for (const entry of entries) {
    if (await updateReportNote(vaultRoot, entry)) updatedReportNotes += 1;
  }

  const run: FfdObsidianOrganizationRun = {
    vaultRoot,
    indexDir: path.join(vaultRoot, INDEX_DIR_RELATIVE),
    viewsDir: path.join(vaultRoot, VIEWS_DIR_RELATIVE),
    acceptedReports: entries.length,
    updatedReportNotes,
    indexFiles,
    viewFiles,
    graphNodes: graph.nodes.length,
    graphEdges: graph.edges.length,
  };
  await appendMaintenanceLog(vaultRoot, run);
  return run;
}

export function renderFfdObsidianOrganizationRun(run: FfdObsidianOrganizationRun): string {
  return [
    "FFD Obsidian knowledgebase organized.",
    `Vault: ${run.vaultRoot}`,
    `Index dir: ${run.indexDir}`,
    `Views dir: ${run.viewsDir}`,
    `Accepted reports linked: ${run.acceptedReports}`,
    `Report notes updated: ${run.updatedReportNotes}`,
    `Index files written: ${run.indexFiles.length}`,
    `View files written: ${run.viewFiles.length}`,
    `Graph: ${run.graphNodes} nodes, ${run.graphEdges} edges`,
    ...run.indexFiles.slice(0, 12).map((filePath) => `- ${filePath}`),
    run.indexFiles.length > 12 ? `- ... ${run.indexFiles.length - 12} more` : undefined,
    ...run.viewFiles.slice(0, 8).map((filePath) => `- ${filePath}`),
    run.viewFiles.length > 8 ? `- ... ${run.viewFiles.length - 8} more views` : undefined,
  ].filter((line): line is string => Boolean(line)).join("\n");
}
