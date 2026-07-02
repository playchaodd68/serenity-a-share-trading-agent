import path from "node:path";
import { getConfig } from "../config.js";
import { readJsonFile } from "../utils/fs.js";
import { listFfdReportManifests, type FfdReportClaim, type FfdReportManifest } from "./report-library.js";

// B-layer of the RAG upgrade: entity-level index over extracted claims. Chunks answer
// "what text matches"; claims answer "what is asserted about WHOM". This is the
// substrate for auto-generated company dossiers and for candidate-level evidence
// lookup that does not depend on a company name appearing in a report title.

export interface CompanyClaimRef {
  company: string;
  claim: FfdReportClaim;
  reportId: string;
  sourceRecordId: string;
  title: string;
  institution?: string;
  publishedAt?: string;
  notePath?: string;
}

export interface ClaimsEntityIndex {
  builtAt: string;
  reportCount: number;
  companies: Map<string, CompanyClaimRef[]>;
}

const MIN_COMPANY_NAME_LENGTH = 3;
const MAX_CLAIMS_PER_COMPANY_PER_REPORT = 6;
// Generic tokens that inferCompanies occasionally emits but are not companies.
const COMPANY_STOPLIST = new Set(["有限公司", "股份有限", "证券研究", "研究报告", "上市公司"]);

function eligibleCompany(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < MIN_COMPANY_NAME_LENGTH) return false;
  if (COMPANY_STOPLIST.has(trimmed)) return false;
  return true;
}

export async function buildClaimsEntityIndex(processedDir?: string): Promise<ClaimsEntityIndex> {
  const resolvedDir = processedDir ? path.resolve(processedDir) : path.resolve(getConfig().ffdReportProcessedDir);
  const manifests = (await listFfdReportManifests(resolvedDir)).filter((manifest) => manifest.status === "accepted");
  const companies = new Map<string, CompanyClaimRef[]>();

  for (const manifest of manifests) {
    const claims = await readJsonFile<FfdReportClaim[]>(manifest.claimsPath, []);
    const perCompanyCount = new Map<string, number>();
    for (const claim of claims) {
      for (const rawCompany of claim.companies ?? []) {
        const company = rawCompany.trim();
        if (!eligibleCompany(company)) continue;
        const key = `${company}:${manifest.id}`;
        const used = perCompanyCount.get(key) ?? 0;
        if (used >= MAX_CLAIMS_PER_COMPANY_PER_REPORT) continue;
        perCompanyCount.set(key, used + 1);
        const ref: CompanyClaimRef = {
          company,
          claim,
          reportId: manifest.id,
          sourceRecordId: (manifest as { sourceRecordId?: string }).sourceRecordId ?? manifest.id,
          title: manifest.title,
          institution: manifest.institution,
          publishedAt: manifest.publishedAt,
          notePath:
            (manifest as { obsidianAcceptedPath?: string }).obsidianAcceptedPath ??
            (manifest as { obsidianStagingPath?: string }).obsidianStagingPath,
        };
        companies.set(company, [...(companies.get(company) ?? []), ref]);
      }
    }
  }

  // Deterministic ordering: newest report first, then claim id.
  for (const [company, refs] of companies) {
    companies.set(
      company,
      [...refs].sort(
        (a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || a.claim.id.localeCompare(b.claim.id),
      ),
    );
  }

  return { builtAt: new Date().toISOString(), reportCount: manifests.length, companies };
}

export function lookupCompanyClaims(index: ClaimsEntityIndex, companyOrCode: string): CompanyClaimRef[] {
  const query = companyOrCode.trim();
  if (!query) return [];
  const direct = index.companies.get(query);
  if (direct) return direct;
  // Substring match tolerates short forms (长川 -> 长川科技).
  const matches: CompanyClaimRef[] = [];
  for (const [company, refs] of index.companies) {
    if (company.includes(query) || query.includes(company)) matches.push(...refs);
  }
  return matches.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

export function summarizeClaimsIndex(index: ClaimsEntityIndex): { companyCount: number; claimCount: number; topCompanies: Array<{ company: string; claims: number }> } {
  const rows = [...index.companies.entries()].map(([company, refs]) => ({ company, claims: refs.length }));
  rows.sort((a, b) => b.claims - a.claims || a.company.localeCompare(b.company));
  return {
    companyCount: rows.length,
    claimCount: rows.reduce((sum, row) => sum + row.claims, 0),
    topCompanies: rows.slice(0, 10),
  };
}
