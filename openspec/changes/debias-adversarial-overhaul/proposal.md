# Debias & Adversarial Overhaul

## Why

三个已确诊的结构性偏差正在污染推荐:

1. **会话层谄媚**:用户持仓/观点以聊天记忆形式永久驻留 LLM context,推荐向用户立场倾斜。
2. **方法论先验单向看多**:「拥挤/集中不减分」规则(trading-agent.ts:25、methodology.ts:84、quant/scoring.ts NO_CROWDING_NOTE)+ 正负评分上限不对称(约 +100/-33)。**出处保真核查(2026-07 调研)发现这是蒸馏失真**:Serenity 原文有完整负面层——「已拥挤/被抢跑」扣分、稀释一票否决、因子拥挤致 35-40% 回撤的自认教训。
3. **证据宇宙自选择**:硬编码主题=既有兴趣,来源库=用户手动接受的研报,形成正反馈回路。

外部调研(80 候选/12 深读)确认:生态中没有任何现成实现覆盖盲评通道、强制反方、校准兑现或墓地——必须自研;可移植的是设计模式(TradingAgents 辩论状态机、Khan et al. 指派立场+盲裁判协议、muxuuu 对称打分卡、ai-hedge-fund 确定性评级约束等)。

## What Changes

### Stage 1 — P1-2 先验对称化(确定性层)
- 拥挤度双向计价:供给侧集中(卡点强度)与交易侧拥挤(hype)拆成两个反向变量;`noCrowdingPenalty: true` → `crowdingPolicy: "two-sided"`。
- 新增 `assessHypeRisk`(文本信号 + 反身性:价格异动且仅有 P2 证据)与 `assessDisqualifiers`(立案调查/财务造假/清仓式减持等一票否决,不受负分上限约束)。
- 负分上限提高(negative 18→24, supply-release 15→20, hype 0→18),向 100/-80 对称结构靠拢。
- 确定性评级约束 `rating-constraints`:无候选级 P0 → 封顶 medium;反身性 → 封顶 medium;disqualifier → 封顶 low;bear pass 未完成 → 禁止 high(Stage 2 接线)。
- 强制「热门降级」输出槽:每次 screen 必须输出主题热度榜及降级判定(热度高但缺 P0/P1 增量证据 → 主动降级)。
- system prompt 对称化 + 反谄媚条款(用户持仓/观点不构成证据;结论冲突先呈现;每个候选必须有 bear case 与失效条件)。
- sycophancy prompt evals 纳入 evals 与 harness。

### Stage 2 — P0-2 强制反方引擎
- `src/research/debate/`:bear-case 研究员 pass(fresh context、失效五问 schema、steel-man 先行)、辩论状态机(第一轮 bear 不喂 bull 结论)、反骑墙裁判;注入式 LLM client,测试用 fake client。
- bear 输出的 killCriterionCandidates 喂 buildKillCriteria;watchlist `validated` 与 confidence `high` 依赖 bear pass 完成。

### Stage 3 — P0-1 立场防火墙
- `data/portfolio.json` 结构化(schema 校验 + 原子写);盲评证据包构建器(代码白名单装配,类型层禁止持仓进入);position-overlay 只读输出(暴露度/集中度/冲突),无权改结论;research 模块禁止 import portfolio 的边界测试。

### Stage 4 — P1-1 谄媚量化
- sycophancy 行为 evals(同一证据包 × 持仓看多/看空/无立场三变体,断言输出不随立场漂移);calibration/resolution 增加切片维度(持仓相关 vs 无关、idea 来源通道)。

### Stage 5 — 兑现与记忆回路(N1-N4)
- 决策日志 pending→resolved + reflection;graveyard 激活(相似已死候选召回注入);催化剂账本(kill-criteria 正向镜像);确认清单(区分基本面确认 vs 无确认上涨)。

### Stage 6 — 评分精读与主题发现(P2-2/P2-1 部分)
- 完成度校验器、估值硬门、财务红旗、瓶颈六维 rubric schema、Thompson bandit 研究方向分配。

## Impact

- Affected specs: methodology-scoring, quant-overlay, agent-prompt, watchlist-lifecycle, evals
- Affected code: src/methodology.ts, src/quant/*, src/agent/trading-agent.ts, src/screener.ts, src/report.ts, src/research/*, src/cli.ts, tests/*, src/harness/run.ts
- Breaking: `QuantCandidateOverlay.noCrowdingPenalty` / `QuantScreenSummary.noCrowdingPenalty` 字段更名为 `crowdingPolicy`(持久化 JSON 向后不兼容,历史 run 文件仅作展示不受运行时影响)
