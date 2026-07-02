# Tasks

## Stage 1 — P1-2 先验对称化
- [ ] 1.1 types: HypeRiskAssessment / DisqualifierAssessment / HotThemeDowngrade / ConfidenceLevel; crowdingPolicy 替换 noCrowdingPenalty
- [ ] 1.2 scoring/rating-constraints.ts + tests(确定性评级封顶)
- [ ] 1.3 methodology: assessHypeRisk / assessDisqualifiers / 负分上限提高 / METHODOLOGY_NOTE 对称化改写 + tests
- [ ] 1.4 quant/scoring: 双向拥挤注记 + hype 惩罚组件 + crowdingPolicy;backtest/history-adapter 注记同步 + tests
- [ ] 1.5 research/theme-heat.ts 热门降级槽 + screener/report 接线 + tests
- [ ] 1.6 trading-agent system prompt 对称化 + 反谄媚条款;evals 增 sycophancy prompt lint;harness 检查 + cli 接线
- [ ] 1.7 npm run review 全绿

## Stage 2 — P0-2 反方引擎
- [ ] 2.1 research/debate/llm-client.ts(注入式接口 + DeepSeek 实现 + fake client)
- [ ] 2.2 research/debate/bear-case.ts(失效五问 schema + steel-man prompt + 证据引用强制)+ tests
- [ ] 2.3 research/debate/verdict.ts(反骑墙裁判,5 档对称量表,无强制点估计)+ tests
- [ ] 2.4 bear 输出喂 buildKillCriteria;rating-constraints 接 bearCaseCompleted;watchlist validated 依赖 bear pass + tests
- [ ] 2.5 cli research:bear 命令 + Feishu /bear 命令 + harness 检查

## Stage 3 — P0-1 立场防火墙
- [ ] 3.1 portfolio/portfolio.ts(schema 校验 + 原子写 + data/portfolio.json)+ tests
- [ ] 3.2 research/evidence-pack.ts 白名单装配 + tests(类型层无持仓字段)
- [ ] 3.3 pipeline/position-overlay.ts(暴露度/集中度/冲突,只读)+ tests
- [ ] 3.4 边界测试:research/** 禁止 import portfolio;chat 分析命令 fresh session
- [ ] 3.5 cli portfolio-review 命令 + Feishu /portfolio-review

## Stage 4 — P1-1 谄媚量化
- [ ] 4.1 evals: sycophancy 行为用例(三立场变体不变性)+ tests
- [ ] 4.2 calibration/resolution 切片(持仓相关 vs 无关、idea 来源通道)+ tests

## Stage 5 — 兑现与记忆回路
- [ ] 5.1 research/decision-log.ts(pending→resolved + reflection 字段)+ tests
- [ ] 5.2 graveyard 召回注入(相似已死候选 → 评分风险注记)+ tests
- [ ] 5.3 research/catalysts.ts(带日期正向触发,watchlist 接线)+ tests
- [ ] 5.4 confirmation criteria(与 kill-criteria 镜像,resolution 区分确认/无确认上涨)+ tests

## Stage 6 — 评分精读与主题发现(部分)
- [ ] 6.1 validation/completeness-gate.ts + tests
- [ ] 6.2 scoring/valuation-gate.ts(确定性硬门)+ tests
- [ ] 6.3 scoring/red-flags.ts(财务红旗,FFD 数据形状输入)+ tests
- [ ] 6.4 research/direction-bandit.ts(Thompson 采样)+ tests

## 收尾
- [ ] 7.1 README/docs 同步;openspec specs 补齐
- [ ] 7.2 全量 npm run review + code review agent 过一遍
- [ ] 7.3 提交(分阶段 commit)
