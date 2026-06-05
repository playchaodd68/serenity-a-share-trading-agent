import type { Candidate, EvidencePolarity, ResearchEvidence, SourceTier, SupplyChainEdge, SupplyChainGraph, SupplyChainNode } from "../types.js";

function nodeId(prefix: string, value: string): string {
  return `${prefix}:${value}`.replace(/\s+/g, "-").slice(0, 140);
}

function edgeId(from: string, to: string, type: SupplyChainEdge["type"], index: number): string {
  return `${type}:${from}->${to}:${index}`.replace(/\s+/g, "-").slice(0, 180);
}

function upsertNode(nodes: Map<string, SupplyChainNode>, node: SupplyChainNode): void {
  const existing = nodes.get(node.id);
  nodes.set(node.id, existing ? { ...existing, tags: [...new Set([...existing.tags, ...node.tags])] } : node);
}

function strongestTier(values: SourceTier[]): SourceTier {
  if (values.includes("P0")) return "P0";
  if (values.includes("P1")) return "P1";
  return "P2";
}

function edgePolarity(evidence: ResearchEvidence): EvidencePolarity {
  return evidence.kind === "risk" ? "negative" : evidence.polarity;
}

function evidenceHas(item: ResearchEvidence, terms: string[]): boolean {
  const haystack = `${item.snippet} ${item.tags.join(" ")}`.toLowerCase();
  return terms.some((term) => haystack.includes(term.toLowerCase()));
}

function addDirectRelationshipEdges(
  candidate: Candidate,
  item: ResearchEvidence,
  nodes: Map<string, SupplyChainNode>,
  edges: SupplyChainEdge[],
  candidateNodeId: string,
  edgeIndex: { value: number },
): void {
  if (!item.direct) return;

  for (const theme of candidate.matchedThemes) {
    for (const keyword of theme.keywords.filter((term) => evidenceHas(item, [term])).slice(0, 3)) {
      const productNodeId = nodeId("product", keyword);
      upsertNode(nodes, { id: productNodeId, label: keyword, type: "product", tags: [theme.themeId, item.sourceId] });
      edges.push({
        id: edgeId(candidateNodeId, productNodeId, "mentions-product", edgeIndex.value++),
        from: candidateNodeId,
        to: productNodeId,
        type: "mentions-product",
        sourceIds: [item.sourceId],
        tier: item.tier,
        polarity: edgePolarity(item),
        confidence: item.confidence,
        direct: true,
        description: `Direct source mentions product/theme keyword "${keyword}": ${item.snippet}`,
      });
    }
  }

  if (evidenceHas(item, ["客户", "订单", "验证", "定点"])) {
    const customerNodeId = nodeId("customer", `${item.sourceId}-customer-signal`);
    upsertNode(nodes, { id: customerNodeId, label: "客户/订单验证信号", type: "customer", tags: [item.sourceId] });
    edges.push({
      id: edgeId(candidateNodeId, customerNodeId, "customer-signal", edgeIndex.value++),
      from: candidateNodeId,
      to: customerNodeId,
      type: "customer-signal",
      sourceIds: [item.sourceId],
      tier: item.tier,
      polarity: edgePolarity(item),
      confidence: item.confidence,
      direct: true,
      description: item.snippet,
    });
  }

  if (evidenceHas(item, ["供应", "供应商", "产能", "良率", "扩产"])) {
    const supplierNodeId = nodeId("supplier", `${item.sourceId}-capacity-signal`);
    upsertNode(nodes, { id: supplierNodeId, label: "供应/产能/良率信号", type: "supplier", tags: [item.sourceId] });
    edges.push({
      id: edgeId(candidateNodeId, supplierNodeId, "supplier-signal", edgeIndex.value++),
      from: candidateNodeId,
      to: supplierNodeId,
      type: "supplier-signal",
      sourceIds: [item.sourceId],
      tier: item.tier,
      polarity: edgePolarity(item),
      confidence: item.confidence,
      direct: true,
      description: item.snippet,
    });
  }
}

export function buildSupplyChainGraph(candidate: Candidate, evidence: ResearchEvidence[], now = new Date().toISOString()): SupplyChainGraph {
  const nodes = new Map<string, SupplyChainNode>();
  const edges: SupplyChainEdge[] = [];
  const candidateNodeId = nodeId("candidate", candidate.stock.code);
  upsertNode(nodes, {
    id: candidateNodeId,
    label: `${candidate.stock.code} ${candidate.stock.name}`,
    type: "candidate",
    tags: [candidate.stock.industry, candidate.stock.region].filter(Boolean),
  });

  const edgeIndex = { value: 0 };
  for (const theme of candidate.matchedThemes) {
    const themeNodeId = nodeId("theme", theme.themeId);
    upsertNode(nodes, { id: themeNodeId, label: theme.label, type: "theme", tags: theme.keywords });
    edges.push({
      id: edgeId(candidateNodeId, themeNodeId, "matches-theme", edgeIndex.value++),
      from: candidateNodeId,
      to: themeNodeId,
      type: "matches-theme",
      sourceIds: ["EASTMONEY-A-SHARE-SNAPSHOT"],
      tier: "P2",
      polarity: "neutral",
      confidence: 44,
      direct: false,
      description: `Framework inference from stock industry/concept keywords: ${theme.keywords.join(", ")}.`,
    });

    for (const keyword of theme.keywords.slice(0, 4)) {
      const productNodeId = nodeId("product", keyword);
      upsertNode(nodes, { id: productNodeId, label: keyword, type: "product", tags: [theme.themeId] });
      edges.push({
        id: edgeId(themeNodeId, productNodeId, "mentions-product", edgeIndex.value++),
        from: themeNodeId,
        to: productNodeId,
        type: "mentions-product",
        sourceIds: ["EASTMONEY-A-SHARE-SNAPSHOT"],
        tier: "P2",
        polarity: "neutral",
        confidence: 38,
        direct: false,
        description: "Keyword relationship inferred from configured bottleneck theme.",
      });
    }
  }

  for (const item of evidence) {
    const sourceNodeId = nodeId("source", item.sourceId);
    upsertNode(nodes, {
      id: sourceNodeId,
      label: item.sourceId,
      type: "source",
      tags: [item.tier, item.kind, ...item.tags.slice(0, 4)],
    });

    const type = item.kind === "risk" || item.polarity === "negative" ? "risk-from" : "supported-by";
    edges.push({
      id: edgeId(candidateNodeId, sourceNodeId, type, edgeIndex.value++),
      from: candidateNodeId,
      to: sourceNodeId,
      type,
      sourceIds: [item.sourceId],
      tier: item.tier,
      polarity: edgePolarity(item),
      confidence: item.confidence,
      direct: item.direct,
      description: item.direct ? `Candidate-specific evidence: ${item.snippet}` : `Indirect research signal: ${item.snippet}`,
    });

    if (item.polarity === "negative" || item.kind === "risk") {
      const riskNodeId = nodeId("risk", item.sourceId);
      upsertNode(nodes, { id: riskNodeId, label: item.title.slice(0, 80), type: "risk", tags: item.tags });
      edges.push({
        id: edgeId(sourceNodeId, riskNodeId, "risk-from", edgeIndex.value++),
        from: sourceNodeId,
        to: riskNodeId,
        type: "risk-from",
        sourceIds: [item.sourceId],
        tier: item.tier,
        polarity: "negative",
        confidence: item.confidence,
        direct: item.direct,
        description: item.snippet,
      });
    }
    addDirectRelationshipEdges(candidate, item, nodes, edges, candidateNodeId, edgeIndex);
  }

  const directTiers = evidence.filter((item) => item.direct).map((item) => item.tier);
  const directEdges = edges.filter((edge) => edge.direct);
  const unresolvedLinks = [
    ...(directTiers.includes("P0") ? [] : ["缺少公司级 P0 主来源边。"]),
    ...(directEdges.some((edge) => edge.type === "customer-signal") ? [] : ["缺少可追溯客户/订单关系边。"]),
    ...(directEdges.some((edge) => edge.type === "supplier-signal") ? [] : ["缺少供应、产能或良率约束证据边。"]),
  ];

  return {
    candidateCode: candidate.stock.code,
    generatedAt: now,
    nodes: [...nodes.values()],
    edges: edges.sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id)),
    unresolvedLinks,
  };
}

export function summarizeSupplyChainGraph(graph: SupplyChainGraph): string {
  const direct = graph.edges.filter((edge) => edge.direct).slice(0, 3);
  const inferred = graph.edges.filter((edge) => !edge.direct && edge.type === "matches-theme").slice(0, 2);
  const strongestTierText = graph.edges.length > 0 ? strongestTier(graph.edges.map((edge) => edge.tier)) : "P2";
  const lines = [
    `Graph nodes=${graph.nodes.length}, edges=${graph.edges.length}, strongest tier=${strongestTierText}.`,
    ...(direct.length > 0
      ? direct.map((edge) => `Direct: ${edge.type} via ${edge.sourceIds.join(", ")} (${edge.tier}, ${edge.confidence}).`)
      : ["Direct: no candidate-specific relationship edge yet."]),
    ...inferred.map((edge) => `Inference: ${edge.description}`),
    ...(graph.unresolvedLinks.length > 0 ? graph.unresolvedLinks.map((link) => `Gap: ${link}`) : ["No unresolved graph gaps."]),
  ];
  return lines.join("\n");
}
