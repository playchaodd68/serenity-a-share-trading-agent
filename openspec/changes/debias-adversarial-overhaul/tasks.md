# Tasks

## Stage 1 — P1-2 先验对称化
- [x] 1.1 types: HypeRiskAssessment / DisqualifierAssessment / HotThemeDowngrade / ConfidenceLevel; crowdingPolicy 替换 noCrowdingPenalty
- [x] 1.2 scoring/rating-constraints.ts + tests(确定性评级封顶)
- [x] 1.3 methodology: assessHypeRisk / assessDisqualifiers / 负分上限提高 / METHODOLOGY_NOTE 对称化改写 + tests
- [x] 1.4 quant/scoring: 双向拥挤注记 + hype 惩罚组件 + crowdingPolicy;backtest/history-adapter 注记同步 + tests
- [x] 1.5 research/theme-heat.ts 热门降级槽 + screener/report 接线 + tests
- [x] 1.6 trading-agent system prompt 对称化 + 反谄媚条款;evals 增 sycophancy prompt lint;harness 检查 + cli 接线
- [x] 1.7 npm run review 全绿

## Stage 2 — P0-2 反方引擎
- [x] 2.1 research/debate/llm-client.ts(注入式接口 + DeepSeek 实现 + fake client)
- [x] 2.2 research/debate/bear-case.ts(失效五问 schema + steel-man prompt + 证据引用强制 + 研报注入免疫)+ tests
- [x] 2.3 research/debate/verdict.ts(反骑墙裁判,5 档对称量表,无强制点估计;当前为确定性合成,LLM judge 为后续)+ tests
- [x] 2.4 bear 输出喂 buildKillCriteria;screener bear gate(high 依赖 bear pass);watchlist validated 经由 confidence 间接依赖 + tests
- [x] 2.5 cli research:bear 命令 + Feishu /bear 命令 + harness 检查

## Stage 3 — P0-1 立场防火墙
- [x] 3.1 portfolio/portfolio.ts(schema 校验 + 原子写 + data/portfolio.example.json)+ tests
- [x] 3.2 盲评证据包 = renderEvidencePack(bear-case.ts),白名单装配 + tests 断言无持仓内容
- [x] 3.3 pipeline/position-overlay.ts(暴露度/集中度/冲突,只读)+ tests
- [x] 3.4 边界测试 tests/firewall.test.ts:盲评通道模块禁止 import portfolio;agent 工具集无持仓工具(harness 检查)
- [x] 3.5 cli portfolio-review 命令 + Feishu /portfolio-review
- [ ] 3.6 (后续)chat 会话记忆治理:立场性内容摘要剥离;分析类命令强制 fresh session

## Stage 4 — P1-1 谄媚量化
- [x] 4.1 sycophancy prompt evals(7 个压力场景,harness/cli/Feishu 接线);行为级(LLM-in-loop)evals 为后续
- [x] 4.2 sycophancy-slice.ts:持仓相关 vs 无关的乐观度/命中率/Brier 切片 + 谄媚警告判定 + calibration 接线 + tests
- [ ] 4.3 (后续)idea 来源通道切片;MASK 式双通道分歧率(需 LLM-in-loop)

## Stage 5 — 兑现与记忆回路
- [x] 5.1 research/decision-log.ts(pending→resolved + 确定性 reflection)+ screen/calibration 接线 + tests
- [x] 5.2 graveyard 召回注入(same-code/shared-theme 召回 → trace.risks 注记,不改分)+ screener 接线 + tests
- [x] 5.3 research/catalysts.ts(四类带日期正向触发;watchlist 与 kill-criteria 同规则钉住)+ tests
- [x] 5.4 classifyResolutionConfirmation(fundamental-confirmed vs unconfirmed-rise)+ tests;resolution.ts 深度集成为后续

## Stage 6 — 评分精读与主题发现(部分)
- [x] 6.1 validation/completeness-gate.ts + report/research-refresh 接线 + tests
- [x] 6.2 scoring/valuation-gate.ts(红黄绿灯确定性硬门,封顶 quant 分桶)+ tests
- [x] 6.3 scoring/red-flags.ts(财务红旗五条,输入为取数后指标形状)+ tests;FFD 取数适配器为后续
- [x] 6.4 research/direction-bandit.ts(Thompson 采样,calibration 输出研究预算建议)+ tests
- [ ] 6.5 (后续)P2-2 LLM 结构化精读评分(14 项清单/六维 rubric schema);P2-1 主题自动发现 pipeline + 主题墓地;N5 报告数字 QA;N6 per-source 校准;N7 立场反转台账

## 收尾
- [x] 7.1 README/docs 同步
- [ ] 7.2 全量 npm run review + code review agent 过一遍
- [ ] 7.3 提交(分阶段 commit)+ PR
