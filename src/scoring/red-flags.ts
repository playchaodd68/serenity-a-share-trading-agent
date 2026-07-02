// 财务红旗清单（muxuuu evidence-ladder 七条中的可量化子集）。
// 输入是外部取数之后的指标形状：本模块不做任何网络请求，
// 数据缺失（null）不触发对应规则，只在渲染时注明覆盖缺口。
export interface FinancialSnapshotInput {
  revenueGrowthYoY: number | null; // 营收同比增速，小数，0.2 = 20%
  inventoryGrowthYoY: number | null; // 存货同比增速，小数
  receivablesGrowthYoY: number | null; // 应收同比增速，小数
  grossMarginTrendPp: number | null; // 毛利率同比变动，百分点
  claimsScarcity: boolean; // 叙事声称稀缺/供不应求
  plannedDilution: boolean; // 定增/可转债/大额再融资在途
  pledgeRatio: number | null; // 大股东质押比例 0-1
  singleUnnamedCustomer: boolean; // 依赖单一未披露名称的大客户
}

export interface RedFlag {
  id: string;
  severity: "warning" | "critical";
  detail: string;
}

// 存货/应收增速超出营收增速的容忍带，单位：小数（0.15 = 15 个百分点）。
const DIVERGENCE_THRESHOLD = 0.15;
// 大股东质押比例警戒线。
const PLEDGE_RATIO_THRESHOLD = 0.5;

// 评估财务红旗。纯确定性规则，null 数据一律跳过不触发。
export function evaluateRedFlags(input: FinancialSnapshotInput): RedFlag[] {
  const flags: RedFlag[] = [];

  // 规则一：存货/应收增速与营收增速背离（虚增出货或渠道压货的常见形态）。
  if (input.revenueGrowthYoY !== null) {
    if (
      input.inventoryGrowthYoY !== null &&
      input.inventoryGrowthYoY - input.revenueGrowthYoY > DIVERGENCE_THRESHOLD
    ) {
      flags.push({
        id: "inventory-divergence",
        severity: "warning",
        detail: `存货应收背离：存货增速 ${formatPct(input.inventoryGrowthYoY)} 超出营收增速 ${formatPct(input.revenueGrowthYoY)} 达 15 个百分点以上，警惕压货或需求虚增。`,
      });
    }
    if (
      input.receivablesGrowthYoY !== null &&
      input.receivablesGrowthYoY - input.revenueGrowthYoY > DIVERGENCE_THRESHOLD
    ) {
      flags.push({
        id: "receivables-divergence",
        severity: "warning",
        detail: `存货应收背离：应收增速 ${formatPct(input.receivablesGrowthYoY)} 超出营收增速 ${formatPct(input.revenueGrowthYoY)} 达 15 个百分点以上，警惕放宽信用或收入确认激进。`,
      });
    }
  }

  // 规则二：自称稀缺但毛利率不升——真稀缺应体现为涨价能力。
  if (input.claimsScarcity && input.grossMarginTrendPp !== null && input.grossMarginTrendPp <= 0) {
    flags.push({
      id: "scarcity-margin-mismatch",
      severity: "critical",
      detail: `自称稀缺但毛利率不升：叙事声称供不应求，毛利率同比变动却为 ${input.grossMarginTrendPp} 个百分点（<=0），稀缺叙事与定价权证据矛盾。`,
    });
  }

  // 规则三：兑现前先融资/稀释——业绩尚未兑现即启动再融资，是典型的叙事套现信号。
  if (input.plannedDilution) {
    flags.push({
      id: "planned-dilution",
      severity: "critical",
      detail: "兑现前先融资/稀释：定增、可转债或大额再融资在途，需求兑现之前先向市场要钱，警惕叙事套现。",
    });
  }

  // 规则四：大股东高质押。
  if (input.pledgeRatio !== null && input.pledgeRatio >= PLEDGE_RATIO_THRESHOLD) {
    flags.push({
      id: "high-pledge-ratio",
      severity: "warning",
      detail: `大股东质押比例 ${formatPct(input.pledgeRatio)} 达到或超过 50%，存在平仓连锁风险。`,
    });
  }

  // 规则五：依赖单一未披露名称的大客户。
  if (input.singleUnnamedCustomer) {
    flags.push({
      id: "single-unnamed-customer",
      severity: "warning",
      detail: "依赖单一未披露名称的大客户：订单真实性与持续性均无法独立验证。",
    });
  }

  return flags;
}

// 找出因数据缺失而未评估的规则，在渲染中注明覆盖缺口。
function collectCoverageGaps(input: FinancialSnapshotInput): string[] {
  const gaps: string[] = [];
  if (input.revenueGrowthYoY === null) {
    gaps.push("营收增速缺失：存货/应收背离规则未评估。");
  } else {
    if (input.inventoryGrowthYoY === null) {
      gaps.push("存货增速缺失：存货背离规则未评估。");
    }
    if (input.receivablesGrowthYoY === null) {
      gaps.push("应收增速缺失：应收背离规则未评估。");
    }
  }
  if (input.claimsScarcity && input.grossMarginTrendPp === null) {
    gaps.push("毛利率变动缺失：稀缺叙事与毛利率匹配规则未评估。");
  }
  if (input.pledgeRatio === null) {
    gaps.push("大股东质押比例缺失：质押规则未评估。");
  }
  return gaps;
}

// 渲染红旗清单为报告文本。可选传入原始输入以标注数据覆盖缺口。
export function renderRedFlags(flags: RedFlag[], input?: FinancialSnapshotInput): string {
  const lines: string[] = [];
  if (flags.length === 0) {
    lines.push("✅ 财务红旗清单：未触发任何红旗。");
  } else {
    lines.push(`🚩 财务红旗清单：共 ${flags.length} 条。`);
    for (const flag of flags) {
      const badge = flag.severity === "critical" ? "【严重】" : "【警告】";
      lines.push(`- ${badge}[${flag.id}] ${flag.detail}`);
    }
  }
  if (input) {
    const gaps = collectCoverageGaps(input);
    if (gaps.length > 0) {
      lines.push("覆盖缺口（数据缺失，对应规则未评估，不代表安全）：");
      for (const gap of gaps) {
        lines.push(`- ${gap}`);
      }
    }
  }
  return lines.join("\n");
}

// 小数增速格式化为百分比文本，例如 0.2 → "20.0%"。
function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
