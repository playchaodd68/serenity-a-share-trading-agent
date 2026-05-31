import type { SourceRecord } from "../types.js";

export const SEED_SOURCES: SourceRecord[] = [
  {
    id: "SERENITY-X-ARTICLE-SIVE-20260519",
    title: "SIVE - The CPO Laser Chokepoint for Hyperscalers",
    tier: "P2",
    sourceType: "social",
    publisher: "Serenity / X Articles",
    observedAt: "2026-05-31",
    url: "https://x.com/aleabitoreddit/status/2056691097594925522",
    summary:
      "Primary long-form Serenity article explaining how to map a hidden CPO laser bottleneck through disclosed customers, high-confidence customer inference, capacity, TAM, and negative execution risks.",
    evidenceTags: ["Serenity", "CPO", "photonics", "customer-mapping", "bottleneck"],
  },
  {
    id: "SERENITY-X-PROFILE-20260531",
    title: "Serenity X profile and Articles list",
    tier: "P2",
    sourceType: "social",
    publisher: "X",
    observedAt: "2026-05-31",
    url: "https://x.com/aleabitoreddit",
    summary:
      "Profile describes Serenity as AI/Semi supply-chain analyst trading unknown bottlenecks; live Chrome read showed 6,917 posts and X Articles including SIVE, robotics, crypto policy, and gold-rush bottleneck articles.",
    evidenceTags: ["Serenity", "profile", "articles"],
  },
  {
    id: "BAILI-SERENITY-BAYES-THREAD-20260531",
    title: "Baili thread summarizing Serenity's investment logic",
    tier: "P2",
    sourceType: "social",
    publisher: "X / Baili1018",
    observedAt: "2026-05-31",
    url: "https://x.com/Baili1018/status/2060903590169133358",
    summary:
      "Chinese thread interprets Serenity's process as Bayesian: high-quality priors from papers/BOM/supply-chain maps, early action under uncertainty, evidence updates during holding, and rotation to the highest posterior bottleneck.",
    evidenceTags: ["Bayesian", "methodology", "supply-chain-map", "rotation"],
  },
  {
    id: "TOPICDIGG-SERENITY-PROFILE",
    title: "TopicDigg Serenity profile mirror",
    tier: "P2",
    sourceType: "social",
    publisher: "TopicDigg",
    observedAt: "2026-05-31",
    url: "https://topicdigg.com/x/aleabitoreddit",
    summary:
      "Public mirror of recent Serenity posts used only for accessible metadata, short excerpts, and source IDs when X is unstable.",
    evidenceTags: ["Serenity", "mirror", "recent-posts"],
  },
  {
    id: "TWISCAN-SERENITY-PROFILE",
    title: "Twiscan Serenity profile mirror",
    tier: "P2",
    sourceType: "social",
    publisher: "Twiscan",
    observedAt: "2026-05-31",
    url: "https://twiscan.com/en/x/aleabitoreddit",
    summary:
      "Alternative public profile mirror used for cross-checking recent Serenity posts and follower/profile metadata.",
    evidenceTags: ["Serenity", "mirror", "cross-check"],
  },
  {
    id: "PI-AGENT-BASE",
    title: "earendil-works/pi Pi Agent Harness Mono Repo",
    tier: "P1",
    sourceType: "repo",
    publisher: "GitHub / earendil-works",
    observedAt: "2026-05-31",
    url: "https://github.com/earendil-works/pi",
    summary:
      "Pi provides @earendil-works/pi-agent-core, a stateful tool-calling agent runtime used as this project's base harness.",
    evidenceTags: ["pi", "agent-harness", "tool-calling"],
  },
  {
    id: "OPENSPEC-FISSION",
    title: "Fission-AI OpenSpec",
    tier: "P1",
    sourceType: "repo",
    publisher: "GitHub / Fission-AI",
    observedAt: "2026-05-31",
    url: "https://github.com/Fission-AI/OpenSpec",
    summary:
      "OpenSpec is used for the spec-driven proposal, design, requirements, and task artifacts for this implementation.",
    evidenceTags: ["openspec", "spec-driven-development"],
  },
  {
    id: "GITHUB-FINANCE-AGENT-SCAN-20260531",
    title: "GitHub finance agent landscape scan",
    tier: "P1",
    sourceType: "repo",
    publisher: "GitHub/Web search",
    observedAt: "2026-05-31",
    summary:
      "Landscape scan identified OpenBB, TradingAgents-CN, financial-research-analyst-agent, A-share investment agent forks, and Feishu/WeChat daily stock-analysis skills as relevant harness references.",
    evidenceTags: ["github-scan", "financial-agent", "a-share", "rag", "feishu"],
  },
];
