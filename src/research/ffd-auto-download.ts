export interface FfdAutoDownloadRule {
  id: string;
  label: string;
  industries: string[];
  topicKeywords: string[];
  depthKeywords: string[];
  companyKeywords?: string[];
  evidenceKeywords?: string[];
}

export interface FfdAutoDownloadCandidateInput {
  title: string;
  institution?: string;
  industry?: string;
  summary?: string;
  tags?: string[];
}

export interface FfdAutoDownloadEvaluation {
  canAccept: boolean;
  matchedRuleIds: string[];
  matchedRuleLabels: string[];
  matchedInstitution?: string;
  hasDepthSignal: boolean;
  hasBottleneckEvidence: boolean;
  excludedTitleKeywords: string[];
  rejectionReasons: string[];
  reviewFlags: string[];
}

export const FFD_AUTO_DOWNLOAD_QUOTA_PROTECT_THRESHOLD = 25;
export const FFD_AUTO_DOWNLOAD_DAILY_TARGET = { min: 1, max: 10 };
export const FFD_REPORT_RAW_DIR = "/Users/apple/Desktop/FFD研报库/_raw";

export const FFD_DEPTH_KEYWORDS = ["深度", "专题", "产业链", "框架", "梳理", "跟踪", "公司深度", "行业专题"];
export const FFD_WATCHLIST_COMPANIES = ["拓荆科技", "东山精密", "绿的谐波", "中际旭创", "新易盛"];
export const FFD_WATCHLIST_EVIDENCE_KEYWORDS = ["客户", "订单", "产能", "毛利率", "良率", "验证", "导入", "定点", "放量", "风险"];
export const FFD_ACCEPTANCE_EVIDENCE_KEYWORDS = [
  "产业链",
  "客户",
  "订单",
  "产能",
  "毛利率",
  "良率",
  "验证",
  "导入",
  "定点",
  "放量",
  "技术路线",
  "替代风险",
  "竞争格局",
  "国产替代",
  "晶圆厂",
  "寿命测试",
  "一致性",
  "库存",
  "涨价",
  "供需",
  "供需紧张",
  "供应不足",
  "价格上行",
  "供给收缩",
  "价格周期",
  "资本开支",
];

export const FFD_EXCLUDED_TITLE_KEYWORDS = ["每日晨会", "晨会", "早会", "日评", "短评", "策略周报", "市场策略周报", "评级快评", "泛AI主题点评", "招股书", "未知机构"];

export const FFD_INSTITUTION_WHITELIST: Array<{ label: string; aliases: string[] }> = [
  { label: "中信证券", aliases: ["中信证券"] },
  { label: "中金公司", aliases: ["中金公司", "中金"] },
  { label: "华泰证券", aliases: ["华泰证券", "华泰"] },
  { label: "国泰海通/国泰君安/海通", aliases: ["国泰海通", "国泰君安", "海通证券", "海通"] },
  { label: "广发证券", aliases: ["广发证券", "广发"] },
  { label: "招商证券", aliases: ["招商证券", "招商"] },
  { label: "兴业证券", aliases: ["兴业证券", "兴业"] },
  { label: "申万宏源", aliases: ["申万宏源", "申万"] },
  { label: "国盛证券", aliases: ["国盛证券", "国盛"] },
  { label: "民生证券", aliases: ["民生证券", "民生"] },
  { label: "天风证券", aliases: ["天风证券", "天风"] },
  { label: "浙商证券", aliases: ["浙商证券", "浙商"] },
  { label: "国金证券", aliases: ["国金证券", "国金"] },
  { label: "高盛", aliases: ["高盛", "Goldman Sachs"] },
  { label: "摩根士丹利", aliases: ["摩根士丹利", "Morgan Stanley", "大摩"] },
  { label: "瑞银", aliases: ["瑞银", "UBS"] },
  { label: "花旗", aliases: ["花旗", "Citi", "Citigroup"] },
];

export const FFD_SECONDARY_INSTITUTION_WHITELIST: Array<{ label: string; aliases: string[] }> = [
  { label: "华创证券", aliases: ["华创证券", "华创"] },
  { label: "华源证券", aliases: ["华源证券", "华源"] },
  { label: "东吴证券", aliases: ["东吴证券", "东吴"] },
  { label: "长江证券", aliases: ["长江证券", "长江"] },
  { label: "开源证券", aliases: ["开源证券", "开源"] },
  { label: "信达证券", aliases: ["信达证券", "信达"] },
  { label: "光大证券", aliases: ["光大证券", "光大"] },
  { label: "财通证券", aliases: ["财通证券", "财通"] },
  { label: "国联证券", aliases: ["国联证券", "国联"] },
  { label: "国信证券", aliases: ["国信证券", "国信"] },
  { label: "东兴证券", aliases: ["东兴证券", "东兴"] },
  { label: "华西证券", aliases: ["华西证券", "华西"] },
  { label: "西南证券", aliases: ["西南证券", "西南"] },
  { label: "中泰证券", aliases: ["中泰证券", "中泰"] },
  { label: "中国银河证券", aliases: ["中国银河证券", "银河证券", "银河"] },
  { label: "方正证券", aliases: ["方正证券", "方正"] },
  { label: "慧博智能投研", aliases: ["慧博智能投研", "慧博"] },
];

export const FFD_AUTO_DOWNLOAD_RULES: FfdAutoDownloadRule[] = [
  {
    id: "ai-optical-pcb-packaging",
    label: "AI 光互连 / AI PCB / 先进封装",
    industries: ["通信设备", "电子", "半导体", "元件", "消费电子"],
    topicKeywords: [
      "CPO",
      "硅光",
      "光模块",
      "800G",
      "1.6T",
      "LPO",
      "DSP",
      "EML",
      "AI PCB",
      "高速PCB",
      "CCL",
      "覆铜板",
      "铜箔",
      "先进封装",
      "CoWoS",
      "Chiplet",
      "HBM",
      "SerDes",
    ],
    depthKeywords: FFD_DEPTH_KEYWORDS,
  },
  {
    id: "semi-equipment-materials",
    label: "半导体设备 / 材料国产替代",
    industries: ["半导体", "半导体设备", "电子化学品"],
    topicKeywords: [
      "半导体设备",
      "薄膜沉积",
      "ALD",
      "CVD",
      "PVD",
      "刻蚀",
      "量测",
      "检测",
      "先进制程",
      "先进封装设备",
      "晶圆厂",
    ],
    depthKeywords: FFD_DEPTH_KEYWORDS,
    evidenceKeywords: ["国产替代", "订单", "验证", "产能", "良率", "客户", "资本开支", "晶圆厂"],
  },
  {
    id: "memory-chips-hbm-dram-nand",
    label: "存储芯片 / HBM / DRAM / NAND",
    industries: ["半导体", "电子"],
    topicKeywords: [
      "存储芯片",
      "存储器",
      "存储",
      "DRAM",
      "NAND",
      "NOR Flash",
      "HBM",
      "DDR5",
      "LPDDR5",
      "eSSD",
      "CXL Memory",
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
      "SK海力士",
      "海力士",
      "美光",
      "铠侠",
      "Kioxia",
    ],
    depthKeywords: [...FFD_DEPTH_KEYWORDS, "周期"],
    evidenceKeywords: ["库存", "涨价", "供需", "供需紧张", "供应不足", "产能", "良率", "客户", "订单", "价格", "资本开支", "供给收缩", "价格周期"],
  },
  {
    id: "humanoid-robot-actuator",
    label: "人形机器人 / 执行器瓶颈",
    industries: ["机器人", "机械设备", "自动化设备", "电机", "稀土磁材"],
    topicKeywords: ["人形机器人", "机器人执行器", "谐波减速器", "RV减速器", "滚柱丝杠", "丝杠", "伺服", "机器人电机", "空心杯电机", "无框力矩电机", "力矩电机", "力传感器", "稀土磁材"],
    depthKeywords: FFD_DEPTH_KEYWORDS,
    evidenceKeywords: ["送样", "定点", "量产", "一致性", "寿命测试", "客户", "订单", "良率"],
  },
  {
    id: "watchlist-direct-validation",
    label: "现有 watchlist 公司直接验证",
    industries: [],
    topicKeywords: [],
    depthKeywords: FFD_DEPTH_KEYWORDS,
    companyKeywords: FFD_WATCHLIST_COMPANIES,
    evidenceKeywords: FFD_WATCHLIST_EVIDENCE_KEYWORDS,
  },
];

export const FFD_ADJACENT_BACKGROUND_RULES: FfdAutoDownloadRule[] = [
  {
    id: "adjacent-ai-passives-power",
    label: "相邻背景：AI 被动元件 / 功率半导体 / 电源链",
    industries: ["电子", "半导体", "元件"],
    topicKeywords: [
      "MLCC",
      "被动元件",
      "钽电容",
      "铝电解电容",
      "薄膜电容",
      "功率半导体",
      "功率器件",
      "SiC",
      "碳化硅",
      "IGBT",
      "MOSFET",
      "MOS",
      "电源管理",
      "PMIC",
      "意法",
      "英飞凌",
      "安森美",
      "村田",
      "太阳诱电",
    ],
    depthKeywords: [...FFD_DEPTH_KEYWORDS, "周期", "涨价", "产业格局", "供需"],
  },
  {
    id: "adjacent-ai-compute-chip",
    label: "相邻背景：AI 算力芯片 / 国产 GPU / ASIC",
    industries: ["半导体", "电子", "软件"],
    topicKeywords: ["AI算力", "算力芯片", "GPU", "GPGPU", "ASIC", "AI ASIC", "国产算力", "壁仞科技", "寒武纪", "海光信息", "昆仑芯", "摩尔线程"],
    depthKeywords: [...FFD_DEPTH_KEYWORDS, "产品迭代", "生态", "订单", "客户"],
  },
  {
    id: "adjacent-ai-optical-company-update",
    label: "相邻背景：AI 光模块公司更新 / 短周期订单",
    industries: ["通信设备", "电子", "半导体"],
    topicKeywords: ["新易盛", "中际旭创", "光模块", "硅光", "800G", "1.6T", "EML", "DSP", "LPO", "CPO"],
    depthKeywords: [...FFD_DEPTH_KEYWORDS, "订单", "放量", "上调", "产能", "客户"],
  },
];

function searchable(value: string): string {
  return value.toLowerCase();
}

function compactSearchable(value: string): string {
  return searchable(value).replace(/\s+/g, "");
}

function containsTerm(text: string, term: string): boolean {
  return searchable(text).includes(searchable(term)) || compactSearchable(text).includes(compactSearchable(term));
}

function matchingTerms(text: string, terms: string[]): string[] {
  return terms.filter((term) => containsTerm(text, term));
}

function hasAny(text: string, terms: string[]): boolean {
  return matchingTerms(text, terms).length > 0;
}

function uniqueTerms(terms: string[]): string[] {
  return Array.from(new Set(terms));
}

function normalizedComparableText(value: string): string {
  return compactSearchable(value).replace(/\.(pdf|docx|doc|txt|md)$/i, "");
}

function buildHaystack(input: FfdAutoDownloadCandidateInput): string {
  return [input.title, input.institution, input.industry, input.summary, ...(input.tags ?? [])].filter(Boolean).join(" ");
}

function institutionFieldLooksLikeFileName(input: FfdAutoDownloadCandidateInput, matchedInstitution?: string): boolean {
  if (!input.institution?.trim() || matchedInstitution) return false;
  const institution = input.institution.trim();
  if (/\.(pdf|docx|doc|txt|md)$/i.test(institution)) return true;
  const normalizedInstitution = normalizedComparableText(institution);
  const normalizedTitle = normalizedComparableText(input.title);
  return normalizedInstitution.length > 12 && (normalizedInstitution.includes(normalizedTitle) || normalizedTitle.includes(normalizedInstitution));
}

function matchInstitution(input: FfdAutoDownloadCandidateInput): string | undefined {
  const text = [input.institution, input.title].filter(Boolean).join(" ");
  return matchFfdInstitutionText(text) ?? matchFfdSecondaryInstitutionText(text);
}

export function matchFfdInstitutionText(text: string): string | undefined {
  return FFD_INSTITUTION_WHITELIST.find((item) => item.aliases.some((alias) => containsTerm(text, alias)))?.label;
}

function matchFfdSecondaryInstitutionText(text: string): string | undefined {
  return FFD_SECONDARY_INSTITUTION_WHITELIST.find((item) => item.aliases.some((alias) => containsTerm(text, alias)))?.label;
}

function ruleMatches(rule: FfdAutoDownloadRule, input: FfdAutoDownloadCandidateInput, haystack: string, hasReviewSignal: boolean): boolean {
  if (!hasReviewSignal) return false;
  const depth = hasAny(haystack, rule.depthKeywords);
  const evidence = hasAny(haystack, rule.evidenceKeywords ?? FFD_ACCEPTANCE_EVIDENCE_KEYWORDS);
  if (rule.companyKeywords?.length) {
    return hasAny(haystack, rule.companyKeywords) && (depth || evidence);
  }
  const topicMatch = hasAny(haystack, rule.topicKeywords);
  const industryMatch = input.industry ? hasAny(input.industry, rule.industries) : false;
  if (rule.topicKeywords.length > 0) return topicMatch && (depth || evidence);
  return industryMatch && hasAny(haystack, FFD_ACCEPTANCE_EVIDENCE_KEYWORDS);
}

export function evaluateFfdAutoDownloadCandidate(input: FfdAutoDownloadCandidateInput): FfdAutoDownloadEvaluation {
  const haystack = buildHaystack(input);
  const excludedTitleKeywords = matchingTerms(input.title, FFD_EXCLUDED_TITLE_KEYWORDS);
  const acceptedDepthKeywords = uniqueTerms(FFD_AUTO_DOWNLOAD_RULES.flatMap((rule) => rule.depthKeywords));
  const hasDepthSignal = hasAny(haystack, acceptedDepthKeywords);
  const hasBottleneckEvidence = hasAny(haystack, FFD_ACCEPTANCE_EVIDENCE_KEYWORDS);
  const hasReviewSignal = hasDepthSignal || hasBottleneckEvidence;
  const matchedCoreRules = FFD_AUTO_DOWNLOAD_RULES.filter((rule) => ruleMatches(rule, input, haystack, hasReviewSignal));
  const matchedAdjacentRules = FFD_ADJACENT_BACKGROUND_RULES.filter((rule) => ruleMatches(rule, input, haystack, hasReviewSignal));
  const matchedRules = [...matchedCoreRules, ...matchedAdjacentRules];
  const matchedPrimaryInstitution = matchFfdInstitutionText([input.institution, input.title].filter(Boolean).join(" "));
  const matchedInstitution = matchInstitution(input);
  const hasBogusInstitutionField = institutionFieldLooksLikeFileName(input, matchedInstitution);
  const isMissingInstitution = (!input.institution?.trim() || hasBogusInstitutionField) && !matchedInstitution;
  const canAcceptMissingInstitution = isMissingInstitution && matchedRules.length > 0 && hasReviewSignal;
  const rejectionReasons: string[] = [];
  const reviewFlags: string[] = [];

  if (excludedTitleKeywords.length > 0) rejectionReasons.push(`排除标题: ${excludedTitleKeywords.join(", ")}`);
  if (!matchedInstitution && !canAcceptMissingInstitution) rejectionReasons.push("机构未命中头部/产业专长白名单或扩展产业白名单");
  if (matchedRules.length === 0) rejectionReasons.push("未命中核心主题、相邻背景或 watchlist 验证规则");
  if (!hasReviewSignal) rejectionReasons.push("缺少深度/证据信号");

  if (input.institution && !matchedInstitution) reviewFlags.push(`机构需人工复核: ${input.institution}`);
  if (canAcceptMissingInstitution) reviewFlags.push(`${hasBogusInstitutionField ? "机构字段疑似文件名" : "机构字段缺失"}，按主题和证据信号降级入库`);
  if (matchedInstitution && !matchedPrimaryInstitution) reviewFlags.push(`扩展产业机构入库: ${matchedInstitution}`);
  if (matchedRules.some((rule) => rule.id === "watchlist-direct-validation")) reviewFlags.push("watchlist 公司直接验证");
  if (matchedAdjacentRules.length > 0) reviewFlags.push("相邻产业背景入库，非核心主题硬证据");
  if (matchedRules.length > 0 && !hasBottleneckEvidence) reviewFlags.push("缺少硬证据词，仅作产业/周期背景，需 P0 交叉验证");

  return {
    canAccept: rejectionReasons.length === 0,
    matchedRuleIds: matchedRules.map((rule) => rule.id),
    matchedRuleLabels: matchedRules.map((rule) => rule.label),
    matchedInstitution,
    hasDepthSignal,
    hasBottleneckEvidence,
    excludedTitleKeywords,
    rejectionReasons,
    reviewFlags,
  };
}

export function renderFfdAutoDownloadEvaluation(evaluation: FfdAutoDownloadEvaluation): string {
  const status = evaluation.canAccept ? "pass" : "fail";
  const rules = evaluation.matchedRuleLabels.length > 0 ? evaluation.matchedRuleLabels.join(", ") : "none";
  const institution = evaluation.matchedInstitution ?? "none";
  const reasons = evaluation.rejectionReasons.length > 0 ? ` | reasons: ${evaluation.rejectionReasons.join("; ")}` : "";
  const flags = evaluation.reviewFlags.length > 0 ? ` | flags: ${evaluation.reviewFlags.join("; ")}` : "";
  return `Quality gate: ${status} | institution: ${institution} | rules: ${rules}${reasons}${flags}`;
}

export function renderFfdAutoDownloadGuide(): string {
  const institutions = FFD_INSTITUTION_WHITELIST.map((item) => item.label).join("、");
  const secondaryInstitutions = FFD_SECONDARY_INSTITUTION_WHITELIST.map((item) => item.label).join("、");
  const rules = FFD_AUTO_DOWNLOAD_RULES.map((rule, index) => {
    const fields = [
      `行业: ${rule.industries.length > 0 ? rule.industries.join("、") : "不限"}`,
      rule.companyKeywords?.length ? `公司: ${rule.companyKeywords.join("、")}` : undefined,
      rule.topicKeywords.length > 0 ? `主题关键词: ${rule.topicKeywords.join("、")}` : undefined,
      rule.evidenceKeywords?.length ? `证据关键词: ${rule.evidenceKeywords.join("、")}` : undefined,
      `深度关键词: ${rule.depthKeywords.join("、")}`,
    ].filter((line): line is string => Boolean(line));
    return [`${index + 1}. ${rule.label}`, ...fields.map((field) => `   - ${field}`)].join("\n");
  }).join("\n\n");
  const adjacentRules = FFD_ADJACENT_BACKGROUND_RULES.map((rule, index) => {
    const fields = [
      `行业: ${rule.industries.length > 0 ? rule.industries.join("、") : "不限"}`,
      `主题关键词: ${rule.topicKeywords.join("、")}`,
      `信号关键词: ${rule.depthKeywords.join("、")}`,
    ];
    return [`${index + 1}. ${rule.label}`, ...fields.map((field) => `   - ${field}`)].join("\n");
  }).join("\n\n");

  return [
    "# FFD 自动下载研报规则",
    "",
    "策略: FFD 负责下载强相关候选；本地闸门分为核心主题 pass 与相邻背景 pass。规则组之间取 OR；单个规则组内跨维度取 AND。若 FFD 页面缺少单独字段，把相应维度合并进标题/关键词。",
    "",
    `下载目录: ${FFD_REPORT_RAW_DIR}`,
    `配额保护阈值: ${FFD_AUTO_DOWNLOAD_QUOTA_PROTECT_THRESHOLD}`,
    `第一周目标: 每天 ${FFD_AUTO_DOWNLOAD_DAILY_TARGET.min}-${FFD_AUTO_DOWNLOAD_DAILY_TARGET.max} 篇`,
    "",
    "## 机构白名单",
    institutions,
    "",
    "## 扩展产业机构",
    secondaryInstitutions,
    "",
    "## 规则组",
    rules,
    "",
    "## 相邻背景规则",
    adjacentRules,
    "",
    "## 排除标题",
    FFD_EXCLUDED_TITLE_KEYWORDS.join("、"),
    "",
    "## 本地入库闸门",
    "下载后运行 `npm run reports:convert`，用 `npm run reports:review` 查看质检结果，对 pass 的报告执行 `npm run reports:accept-quality` 或 `npm run reports:accept -- <report-id>`。相邻背景和机构缺失报告会带降级复核标签。Accepted 仍是 P1 broker_report，不能替代候选级 P0 披露。",
  ].join("\n");
}
