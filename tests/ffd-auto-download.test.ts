import { describe, expect, it } from "vitest";
import { evaluateFfdAutoDownloadCandidate, renderFfdAutoDownloadGuide } from "../src/research/ffd-auto-download.js";

describe("FFD auto-download quality profile", () => {
  it("passes high-precision theme and watchlist reports", () => {
    const cases = [
      {
        title: "高盛_半导体CPO产业链跟踪",
        summary: "客户订单验证和产能扩张推动 CPO 光模块、800G 和 1.6T 产业链放量。",
      },
      {
        title: "中信证券_AI PCB产业链深度",
        summary: "高速 PCB、CCL 和铜箔的技术路线、竞争格局和毛利率弹性值得验证。",
      },
      {
        title: "华泰证券_半导体设备国产替代专题",
        summary: "晶圆厂订单、薄膜沉积设备验证、产能和良率改善构成设备国产替代证据。",
      },
      {
        title: "中金公司_存储芯片产业链跟踪",
        summary: "DRAM、NAND 和 HBM 供需改善，库存去化、涨价周期、产能和良率是核心证据。",
      },
      {
        title: "高盛_全球存储周期延长至2028年",
        summary: "DRAM、NAND 和 HBM 供需紧张，供应不足和资本开支纪律推动价格周期上行。",
      },
      {
        title: "高盛_铠侠NAND周期延长",
        summary: "铠侠 NAND 供应紧张延续，三星DRAM、SK海力士和美光资本开支纪律支撑价格周期。",
      },
      {
        title: "国盛证券_人形机器人执行器深度",
        summary: "谐波减速器、滚柱丝杠、定点、量产一致性和寿命测试是执行器瓶颈。",
      },
      {
        title: "招商证券_拓荆科技公司深度跟踪",
        summary: "客户订单、先进制程导入、产能、毛利率和验证进展是直接证据。",
      },
    ];

    for (const item of cases) {
      expect(evaluateFfdAutoDownloadCandidate(item), item.title).toMatchObject({ canAccept: true });
    }
  });

  it("rejects low-signal or off-profile reports", () => {
    const cases = [
      { title: "中信证券_每日晨会纪要", summary: "覆盖 AI 和市场热点。" },
      { title: "华泰证券_市场策略周报", summary: "指数和行业轮动观点。" },
      { title: "广发证券_某公司评级快评", summary: "上调目标价。" },
      { title: "高盛_泛AI主题点评", summary: "泛 AI 方向活跃。" },
      { title: "未知机构_CPO产业链深度", summary: "客户订单和产能验证。" },
      { title: "中信证券_长鑫科技招股书梳理", summary: "存储芯片产业链、产能和良率。" },
      { title: "浙商证券_功率半导体主题观察", summary: "AI 硬件方向市场关注度提升。" },
    ];

    for (const item of cases) {
      expect(evaluateFfdAutoDownloadCandidate(item).canAccept, item.title).toBe(false);
    }
  });

  it("accepts adjacent background reports with lower-trust review flags", () => {
    const cases = [
      {
        title: "浙商证券_功率半导体涨价周期",
        summary: "功率半导体需求回暖，订单和毛利率改善。",
        matchedRuleIds: ["adjacent-ai-passives-power"],
      },
      {
        title: "国金证券_MLCC涨价与产业格局分析",
        summary: "村田、三星新增产能受限，AI服务器需求推升MLCC涨价。",
        matchedRuleIds: ["adjacent-ai-passives-power"],
      },
      {
        title: "慧博智能投研_MLCC行业深度市场格局趋势展望",
        summary: "AI 服务器需求推升 MLCC 和钽电容供需紧张，产业链、产能和价格周期需要跟踪。",
        matchedRuleIds: ["adjacent-ai-passives-power"],
      },
      {
        title: "华源证券_光模块设备产业链梳理",
        summary: "CPO、800G 和 1.6T 设备订单、客户验证与产能扩张构成核心证据。",
        matchedRuleIds: ["ai-optical-pcb-packaging", "adjacent-ai-optical-company-update"],
      },
      {
        title: "新易盛27年DSP订单超预期",
        institution: "新易盛27年DSP订单超预期.docx",
        summary: "1.6T 光模块和 DSP 订单超预期，客户验证与产能扩张仍需 P0 交叉验证。",
        matchedRuleIds: ["ai-optical-pcb-packaging", "watchlist-direct-validation", "adjacent-ai-optical-company-update"],
      },
    ];

    for (const item of cases) {
      const evaluation = evaluateFfdAutoDownloadCandidate(item);
      expect(evaluation.canAccept, item.title).toBe(true);
      expect(evaluation.matchedRuleIds, item.title).toEqual(expect.arrayContaining(item.matchedRuleIds));
      expect(evaluation.reviewFlags.join(";"), item.title).toContain("相邻产业背景入库");
    }
  });

  it("allows strong thematic reports as background when hard evidence is thin", () => {
    const evaluation = evaluateFfdAutoDownloadCandidate({
      title: "高盛_铠侠NAND周期延长",
      summary: "高盛看好铠侠以及 NAND 周期延长，利润峰值持续上行。",
    });

    expect(evaluation).toMatchObject({
      canAccept: true,
      hasBottleneckEvidence: false,
      matchedRuleIds: ["memory-chips-hbm-dram-nand"],
    });
    expect(evaluation.rejectionReasons).toEqual([]);
    expect(evaluation.reviewFlags).toContain("缺少硬证据词，仅作产业/周期背景，需 P0 交叉验证");
  });

  it("renders the FFD configuration guide", () => {
    const guide = renderFfdAutoDownloadGuide();
    expect(guide).toContain("规则组之间取 OR");
    expect(guide).toContain("配额保护阈值: 25");
    expect(guide).toContain("FFD研报库/_raw");
    expect(guide).toContain("存储芯片 / HBM / DRAM / NAND");
    expect(guide).toContain("相邻背景：AI 被动元件 / 功率半导体 / 电源链");
  });
});
