import { z } from "zod";
import type { AShareStock, SourceRecord } from "../types.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FALLBACK_A_SHARE_FIXTURE } from "./a-share-fixture.js";

const execFileAsync = promisify(execFile);

const EastmoneyRow = z.object({
  f2: z.number().nullable().optional(),
  f3: z.number().nullable().optional(),
  f9: z.number().nullable().optional(),
  f12: z.string(),
  f14: z.string(),
  f20: z.number().nullable().optional(),
  f21: z.number().nullable().optional(),
  f23: z.number().nullable().optional(),
  f62: z.number().nullable().optional(),
  f100: z.string().nullable().optional(),
  f102: z.string().nullable().optional(),
  f103: z.string().nullable().optional(),
});

const EastmoneyResponse = z.object({
  rc: z.number(),
  data: z.object({
    total: z.number(),
    diff: z.array(EastmoneyRow),
  }),
});

export const EASTMONEY_SOURCE: SourceRecord = {
  id: "EASTMONEY-A-SHARE-SNAPSHOT",
  title: "Eastmoney A-share market snapshot endpoint",
  tier: "P2",
  sourceType: "industry",
  publisher: "Eastmoney",
  observedAt: new Date().toISOString().slice(0, 10),
  url: "https://push2.eastmoney.com/api/qt/clist/get",
  summary: "Public A-share market snapshot used for screen inputs: code, name, market cap, PE, turnover, industry, concepts, and main net inflow.",
  evidenceTags: ["a-share", "market-data", "snapshot"],
};

export function mapEastmoneyStock(row: z.infer<typeof EastmoneyRow>): AShareStock {
  return {
    code: row.f12,
    name: row.f14,
    latestPrice: row.f2 ?? null,
    pctChange: row.f3 ?? null,
    totalMarketCap: row.f20 ?? null,
    floatMarketCap: row.f21 ?? null,
    pe: row.f9 ?? null,
    turnover: row.f23 ?? null,
    mainNetInflow: row.f62 ?? null,
    industry: row.f100 ?? "",
    region: row.f102 ?? "",
    concept: row.f103 ?? "",
  };
}

export async function fetchAShareSnapshot(limit = 800): Promise<AShareStock[]> {
  const pageSize = Math.min(Math.max(limit, 1), 5000);
  const fields = "f12,f14,f2,f3,f20,f21,f9,f23,f62,f100,f102,f103";
  const params = new URLSearchParams({
    pn: "1",
    pz: String(pageSize),
    po: "1",
    np: "1",
    ut: "bd1d9ddb04089700cf9c27f6f7426281",
    fltt: "2",
    invt: "2",
    fid: "f3",
    fs: "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23",
    fields,
  });
  const url = `https://push2.eastmoney.com/api/qt/clist/get?${params.toString()}`;
  try {
    const parsed = EastmoneyResponse.parse(await fetchEastmoneyJson(url));
    return parsed.data.diff.map(mapEastmoneyStock);
  } catch (error) {
    if (process.env.A_SHARE_DISABLE_FIXTURE === "true") throw error;
    console.warn(`Eastmoney live snapshot unavailable; using fallback fixture. Reason: ${error instanceof Error ? error.message : String(error)}`);
    return FALLBACK_A_SHARE_FIXTURE.slice(0, limit);
  }
}

async function fetchEastmoneyJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 serenity-a-share-trading-agent/1.0", referer: "https://quote.eastmoney.com/" },
    });
    if (!response.ok) throw new Error(`Eastmoney request failed: ${response.status}`);
    return response.json();
  } catch (_error) {
    const { stdout } = await execFileAsync("curl", ["-L", "-s", "-A", "Mozilla/5.0 serenity-a-share-trading-agent/1.0", url], {
      maxBuffer: 8 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  }
}
