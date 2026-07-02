import { callFfdTool, classifyFfdToolText, renderFfdToolResult } from "../connectors/ffd.js";
import type { WatchlistEntry } from "../types.js";
import type { PriceReturnProvider, ResolveCandidateInput } from "./resolution.js";

// Producer side of the fulfillment loop: turns due watchlist entries into resolution
// inputs and provides realized stock/benchmark returns via FFD. Failure mode is an
// explicit skip (null) with a warning — an unresolved thesis stays unresolved; we never
// substitute fabricated numbers into the calibration ledger.

export const DEFAULT_BENCHMARK_CODE = "000300.SH";
const DEFAULT_HORIZON_DAYS = 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function buildResolutionInputsFromWatchlist(
  watchlist: WatchlistEntry[],
  now: string,
  horizonDays = DEFAULT_HORIZON_DAYS,
): ResolveCandidateInput[] {
  const nowMs = Date.parse(now);
  return watchlist
    .filter((entry) => {
      const entered = Date.parse(entry.firstSeenAt);
      return Number.isFinite(entered) && nowMs - entered >= horizonDays * MS_PER_DAY;
    })
    .map((entry) => ({
      code: entry.code,
      name: entry.name,
      posterior: entry.score,
      confidence: entry.confidence,
      evidenceAnchored: entry.evidenceState.hasCandidateP0,
      entryDate: entry.firstSeenAt,
      horizonDays,
    }));
}

interface ParsedBar {
  date: string;
  close: number;
}

// FFD may answer in JSON (several envelope shapes) or a markdown table; parse
// defensively and return [] when nothing recognizable is found.
export function parseFfdCloseSeries(text: string): ParsedBar[] {
  const trimmed = text.trim();
  const fromRows = (rows: unknown[]): ParsedBar[] =>
    rows
      .map((row) => {
        if (row == null || typeof row !== "object") return null;
        const record = row as Record<string, unknown>;
        const date = record.date ?? record.trade_date ?? record.day ?? record.时间 ?? record.日期;
        const close = record.close ?? record.closing_price ?? record.收盘 ?? record.收盘价;
        const closeNumber = typeof close === "string" ? Number(close) : (close as number | undefined);
        if (typeof date !== "string" || closeNumber == null || !Number.isFinite(closeNumber)) return null;
        return { date: date.slice(0, 10), close: closeNumber };
      })
      .filter((bar): bar is ParsedBar => bar != null);

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return fromRows(parsed);
    if (parsed != null && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      for (const key of ["data", "rows", "items", "result", "bars"]) {
        if (Array.isArray(record[key])) return fromRows(record[key] as unknown[]);
      }
    }
  } catch {
    // Not JSON — try a markdown table: | date | ... | close | with a header row.
  }

  const lines = trimmed.split(/\r?\n/).filter((line) => line.includes("|"));
  if (lines.length >= 2) {
    const header = lines[0]
      .split("|")
      .map((cell) => cell.trim().toLowerCase())
      .filter(Boolean);
    const dateIndex = header.findIndex((cell) => /date|日期|时间|day/.test(cell));
    const closeIndex = header.findIndex((cell) => /close|收盘/.test(cell));
    if (dateIndex >= 0 && closeIndex >= 0) {
      const bars: ParsedBar[] = [];
      for (const line of lines.slice(1)) {
        const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
        if (cells.length <= Math.max(dateIndex, closeIndex)) continue;
        if (/^[-: ]+$/.test(cells[0])) continue;
        const close = Number(cells[closeIndex]);
        if (!/^\d{4}-\d{2}-\d{2}/.test(cells[dateIndex]) || !Number.isFinite(close)) continue;
        bars.push({ date: cells[dateIndex].slice(0, 10), close });
      }
      return bars;
    }
  }
  return [];
}

export function windowReturn(bars: ParsedBar[], entryDate: string, horizonDays: number): number | null {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const entryDay = entryDate.slice(0, 10);
  const exitDay = new Date(Date.parse(entryDate) + horizonDays * MS_PER_DAY).toISOString().slice(0, 10);
  const entryBar = sorted.find((bar) => bar.date >= entryDay);
  const exitCandidates = sorted.filter((bar) => bar.date <= exitDay);
  const exitBar = exitCandidates.at(-1);
  if (!entryBar || !exitBar || exitBar.date <= entryBar.date || entryBar.close <= 0) return null;
  return exitBar.close / entryBar.close - 1;
}

async function fetchCloseSeries(code: string, startDate: string, endDate: string): Promise<ParsedBar[]> {
  const result = await callFfdTool("ffd_quote_history", {
    codes: code,
    start: startDate,
    end: endDate,
    format: "json",
  });
  const text = renderFfdToolResult(result);
  const classification = classifyFfdToolText(text);
  if (classification.status !== "ok") return [];
  return parseFfdCloseSeries(text);
}

export function createFfdPriceReturnProvider(benchmarkCode = DEFAULT_BENCHMARK_CODE): PriceReturnProvider {
  return async ({ code, entryDate, horizonDays }) => {
    const startDate = entryDate.slice(0, 10);
    const endDate = new Date(Date.parse(entryDate) + (horizonDays + 10) * MS_PER_DAY).toISOString().slice(0, 10);
    try {
      const [stockBars, benchmarkBars] = await Promise.all([
        fetchCloseSeries(code, startDate, endDate),
        fetchCloseSeries(benchmarkCode, startDate, endDate),
      ]);
      const stockReturn = windowReturn(stockBars, entryDate, horizonDays);
      const benchmarkReturn = windowReturn(benchmarkBars, entryDate, horizonDays);
      if (stockReturn == null || benchmarkReturn == null) {
        console.warn(`resolution provider: 无法为 ${code} 计算 ${horizonDays} 天窗口收益（数据缺失或窗口未走完），跳过——未兑现的判断保持未兑现。`);
        return null;
      }
      return { stockReturn, benchmarkReturn };
    } catch (error) {
      console.warn(`resolution provider: FFD 取数失败（${code}）：${error instanceof Error ? error.message : String(error)}；跳过。`);
      return null;
    }
  };
}
