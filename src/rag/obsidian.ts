import fs from "node:fs/promises";
import path from "node:path";
import { getConfig, knowledgebasePath } from "../config.js";
import { METHODOLOGY_NOTE } from "../methodology.js";
import type { SourceRecord } from "../types.js";
import { toSimplifiedChinese } from "../utils/chinese.js";
import { ensureDir, safeFilename, writeJsonFile } from "../utils/fs.js";

export interface KnowledgebaseInitResult {
  root: string;
  directories: string[];
  files: string[];
}

const KB_DIRS = [
  "methodology",
  "industries",
  "companies",
  "reports",
  "reports/FFD",
  "reports/FFD/Staging",
  "reports/FFD/Staging/full",
  "reports/FFD/Accepted",
  "reports/FFD/Rejected",
  "signals",
  "signals/ffd",
  "sources",
  "runs",
  "templates",
];

function sourceNote(source: SourceRecord): string {
  return toSimplifiedChinese(`# ${source.title}

- Source ID: \`${source.id}\`
- Tier: \`${source.tier}\`
- Type: \`${source.sourceType}\`
- Publisher: ${source.publisher}
- Observed: ${source.observedAt}
- URL/Path: ${source.url ?? source.path ?? "n/a"}
- Tags: ${source.evidenceTags.map((tag) => `#${tag.replace(/\s+/g, "-")}`).join(" ")}

## Summary

${source.summary}
`);
}

export async function syncKnowledgebaseSources(sources: SourceRecord[], root = knowledgebasePath(getConfig())): Promise<string[]> {
  const files: string[] = [];
  const sourcesDir = path.join(root, "sources");
  await ensureDir(sourcesDir);

  const registryPath = path.join(sourcesDir, "source-registry.json");
  await writeJsonFile(registryPath, sources);
  files.push(registryPath);

  for (const source of sources) {
    const notePath = path.join(sourcesDir, `${safeFilename(source.id)}.md`);
    await fs.writeFile(notePath, sourceNote(source), "utf8");
    files.push(notePath);
  }

  return files;
}

export async function initializeKnowledgebase(sources: SourceRecord[], root = knowledgebasePath(getConfig())): Promise<KnowledgebaseInitResult> {
  const directories: string[] = [];
  const files: string[] = [];
  await ensureDir(root);
  for (const dir of KB_DIRS) {
    const fullPath = path.join(root, dir);
    await ensureDir(fullPath);
    directories.push(fullPath);
  }

  const indexPath = path.join(root, "00-README.md");
  await fs.writeFile(
    indexPath,
    `# Serenity A股产业投研

该知识库是 trading agent 的 RAG 根目录。所有结论必须能回溯到 \`sources/source-registry.json\` 中的 Source ID。

## Folder Map

- \`methodology/\`: Serenity 产业链瓶颈方法论和评分规则
- \`industries/\`: 行业链条、瓶颈、技术路线
- \`companies/\`: A 股候选公司研究卡片
- \`reports/\`: 卖方研报、本地高质量资料索引
- \`reports/FFD/Staging/\`: FFD 下载研报的待审阅卡片，不能直接作为正式 RAG 证据
- \`reports/FFD/Accepted/\`: 通过 quality gate 并进入 \`source-registry.json\` 的 FFD P1 研报
- \`signals/ffd/\`: FFD 实时行情、资金流、行业景气、公告、新闻等短周期信号的日期化摘录
- \`sources/\`: 来源注册表和来源卡片
- \`runs/\`: 每次筛选输出
- \`templates/\`: 候选、行业、证据模板

## Guardrails

- 社交媒体仅作为线索，不作为高置信度结论。
- 高置信度必须有 P0 主来源和独立交叉验证。
- FFD accepted 研报是 P1 佐证，不替代公司公告、年报、交易所互动等候选级 P0。
- 实时行情、分时、资金流、技术指标只能证明市场发酵状态，不能单独证明产业逻辑。
- 每条可复用结论都必须写明 Source ID、tier、直接/佐证关系、时间戳和待验证缺口。
- Agent 输出候选和证据，不输出买卖指令。
`,
    "utf8",
  );
  files.push(indexPath);

  const methodologyPath = path.join(root, "methodology", "Serenity产业链瓶颈方法论.md");
  await fs.writeFile(methodologyPath, METHODOLOGY_NOTE, "utf8");
  files.push(methodologyPath);

  const governancePath = path.join(root, "methodology", "Wiki维护与证据治理.md");
  await fs.writeFile(
    governancePath,
    `# Wiki维护与证据治理

## 核心原则

1. 先分层，再入库：P0 负责候选级事实，P1 负责产业和卖方佐证，P2 负责情绪、扩散和线索。
2. 先证据，再推理：任何结论必须能回链到 \`sources/source-registry.json\` 的 Source ID。
3. 先质量门槛，再 RAG：FFD Staging 研报不能直接作为正式上下文；只有 Accepted 报告才进入 source registry。
4. 先产业逻辑，再交易状态：分时、资金流、技术指标用于判断是否发酵，不能替代供需、价格、利润和产能证据。

## 日常维护流程

1. FFD 下载或推送新研报后，运行 \`npm run reports:convert\` 生成 Staging 卡片。
2. 用 \`npm run reports:review\` 查看质量门槛，只接受 pass 报告，例外必须用 \`--force\` 并在笔记中写明原因。
3. 对通过门槛的报告运行 \`npm run reports:accept -- <report-id>\`，或批量运行 \`npm run reports:accept-quality\`。
4. 对重要实时信号，在 \`signals/ffd/YYYY-MM-DD-主题.md\` 写入工具名、查询语句、时间、结论、可复核 Source ID。
5. 候选公司笔记只记录被证据支持的判断；推测必须标注为 framework inference。

## 研究输出结构

- 产业趋势：需求、供给、瓶颈、价格、利润、竞争格局。
- 公司映射：A 股公司暴露度、客户/订单/产能/良率/技术路线证据。
- 证据链：P0/P1/P2 分层，直接证据和佐证分开。
- 市场发酵：历史行情、分时、资金流、技术指标、新闻/研报扩散。
- 失效条件：产业逻辑失效、数据反证、价格已透支、信源覆盖缺口。
`,
    "utf8",
  );
  files.push(governancePath);

  const templatePath = path.join(root, "templates", "Candidate.md");
  await fs.writeFile(
    templatePath,
    `# {{code}} {{name}}

## Thesis

## Evidence

| Source ID | Tier | Evidence | Effect |
| --- | --- | --- | --- |

## Risks

## Coverage Gaps
`,
    "utf8",
  );
  files.push(templatePath);

  const industryTemplatePath = path.join(root, "templates", "Industry.md");
  await fs.writeFile(
    industryTemplatePath,
    `# {{industry}}

## 产业链地图

## 瓶颈排序

| 环节 | 需求 | 供给 | 缺口 | 价格 | 利润弹性 | Source IDs |
| --- | --- | --- | --- | --- | --- | --- |

## FFD实时信号

| 日期 | 工具 | 查询 | 结论 | 是否入库 |
| --- | --- | --- | --- | --- |

## A股映射

## 失效条件
`,
    "utf8",
  );
  files.push(industryTemplatePath);

  const signalTemplatePath = path.join(root, "templates", "FFD-Signal.md");
  await fs.writeFile(
    signalTemplatePath,
    `# {{date}} {{topic}} FFD信号

- Tool:
- Query:
- Generated At:
- Freshness:

## Raw Takeaway

## Methodology Interpretation

## Linked Sources

| Source ID | Tier | Role |
| --- | --- | --- |

## Follow-up
`,
    "utf8",
  );
  files.push(signalTemplatePath);

  files.push(...await syncKnowledgebaseSources(sources, root));

  return { root, directories, files };
}
