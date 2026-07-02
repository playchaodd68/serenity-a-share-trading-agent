import fs from "node:fs/promises";
import path from "node:path";
import type { Candidate, QuantCandidateBucket, QuantEvidenceGate, ScreenRun } from "../types.js";
import type { QuantBacktestCandidate, QuantBacktestOptions, QuantBacktestSnapshot } from "./backtest.js";

export interface QuantHistoryPriceBar {
  code: string;
  date: string;
  open?: number;
  close: number;
  adjustedClose?: number;
  pctChange?: number;
  tradable?: boolean;
  suspended?: boolean;
  limitUp?: boolean;
  limitDown?: boolean;
}

export interface QuantHistoryAdapterOptions {
  horizonBars?: number;
  entryLagBars?: number;
  dateFrom?: string;
  dateTo?: string;
  dedupeBySignalDate?: boolean;
  maxCandidatesPerRun?: number;
  benchmarkCode?: string;
  inferLimitStatus?: boolean;
}

export interface EffectiveQuantHistoryAdapterOptions {
  horizonBars: number;
  entryLagBars: number;
  dedupeBySignalDate: boolean;
  maxCandidatesPerRun: number;
  benchmarkCode?: string;
  inferLimitStatus: boolean;
  dateFrom?: string;
  dateTo?: string;
}

export interface QuantHistoryAdapterCoverage {
  screenRunsRead: number;
  screenRunsUsed: number;
  priceBarsRead: number;
  benchmarkBarsRead: number;
  snapshotsBuilt: number;
  candidatesSeen: number;
  candidatesWithForwardReturn: number;
  candidatesSkipped: number;
}

export interface QuantHistoryAdapterResult {
  generatedAt: string;
  snapshots: QuantBacktestSnapshot[];
  options: EffectiveQuantHistoryAdapterOptions;
  coverage: QuantHistoryAdapterCoverage;
  warnings: string[];
}

export interface LoadedPriceBars {
  bars: QuantHistoryPriceBar[];
  files: string[];
  warnings: string[];
}

export interface LoadedScreenRuns {
  runs: ScreenRun[];
  files: string[];
  warnings: string[];
}

export interface QuantBacktestInputFile {
  options: QuantBacktestOptions;
  snapshots: QuantBacktestSnapshot[];
  adapter: {
    generatedAt: string;
    coverage: QuantHistoryAdapterCoverage;
    warnings: string[];
    sourceFiles?: {
      reports?: string[];
      prices?: string[];
      benchmark?: string[];
    };
  };
}

type CsvRow = Record<string, string>;

const DATE_ALIASES = ["date", "trade_date", "tradedate", "日期", "交易日期"];
const CODE_ALIASES = ["code", "symbol", "ts_code", "证券代码", "股票代码", "代码"];
const OPEN_ALIASES = ["open", "开盘", "开盘价"];
const CLOSE_ALIASES = ["close", "收盘", "收盘价"];
const ADJUSTED_CLOSE_ALIASES = ["adjustedclose", "adj_close", "adjclose", "复权收盘", "后复权收盘", "前复权收盘"];
const PCT_CHANGE_ALIASES = ["pct_change", "pctchange", "pct_chg", "涨跌幅"];
const TRADABLE_ALIASES = ["tradable", "可交易"];
const SUSPENDED_ALIASES = ["suspended", "paused", "suspend", "停牌"];
const LIMIT_UP_ALIASES = ["limit_up", "limitup", "涨停"];
const LIMIT_DOWN_ALIASES = ["limit_down", "limitdown", "跌停"];

function effectiveOptions(options: QuantHistoryAdapterOptions = {}): EffectiveQuantHistoryAdapterOptions {
  return {
    horizonBars: Math.max(1, Math.floor(options.horizonBars ?? 5)),
    entryLagBars: Math.max(0, Math.floor(options.entryLagBars ?? 1)),
    dedupeBySignalDate: options.dedupeBySignalDate ?? true,
    maxCandidatesPerRun: Math.max(1, Math.floor(options.maxCandidatesPerRun ?? 200)),
    benchmarkCode: options.benchmarkCode ? normalizeCode(options.benchmarkCode) : undefined,
    inferLimitStatus: options.inferLimitStatus ?? true,
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
  };
}

function normalizeHeader(value: string): string {
  return value.trim().replace(/[\s_\-.]/g, "").toLowerCase();
}

function valueFor(row: CsvRow | Record<string, unknown>, aliases: string[]): unknown {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.has(normalizeHeader(key))) return value;
  }
  return undefined;
}

function parseNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const normalized = String(value).trim().replace(/,/g, "");
  if (!normalized || normalized === "-" || normalized.toLowerCase() === "nan") return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "t", "yes", "y", "是", "可交易", "停牌", "涨停", "跌停"].includes(normalized)) return true;
  if (["0", "false", "f", "no", "n", "否", "未停牌", "未涨停", "未跌停"].includes(normalized)) return false;
  return undefined;
}

function normalizeRatio(value: number | undefined): number | undefined {
  if (value == null) return undefined;
  return Math.abs(value) > 1 ? value / 100 : value;
}

export function normalizeDate(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  const raw = String(value).trim();
  const yyyymmdd = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (yyyymmdd) return `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}`;
  const datePrefix = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (datePrefix) return `${datePrefix[1]}-${datePrefix[2].padStart(2, "0")}-${datePrefix[3].padStart(2, "0")}`;
  return undefined;
}

export function normalizeCode(value: unknown): string {
  const raw = String(value ?? "").trim();
  const match = raw.match(/\d{6}/);
  return match?.[0] ?? raw;
}

function inferLimitThreshold(code: string): number {
  if (code.startsWith("300") || code.startsWith("301") || code.startsWith("688")) return 0.198;
  return 0.098;
}

function withInferredLimitStatus(bar: QuantHistoryPriceBar, inferLimitStatus: boolean): QuantHistoryPriceBar {
  if (!inferLimitStatus || bar.pctChange == null) return bar;
  const threshold = inferLimitThreshold(bar.code);
  return {
    ...bar,
    limitUp: bar.limitUp ?? bar.pctChange >= threshold,
    limitDown: bar.limitDown ?? bar.pctChange <= -threshold,
  };
}

function coercePriceBar(row: Record<string, unknown>, source: string): QuantHistoryPriceBar | undefined {
  const code = normalizeCode(valueFor(row, CODE_ALIASES));
  const date = normalizeDate(valueFor(row, DATE_ALIASES));
  const close = parseNumber(valueFor(row, CLOSE_ALIASES));
  if (!code || !date || close == null) return undefined;
  const suspended = parseBoolean(valueFor(row, SUSPENDED_ALIASES));
  const tradable = parseBoolean(valueFor(row, TRADABLE_ALIASES));
  const pctChange = normalizeRatio(parseNumber(valueFor(row, PCT_CHANGE_ALIASES)));
  const bar: QuantHistoryPriceBar = {
    code,
    date,
    open: parseNumber(valueFor(row, OPEN_ALIASES)),
    close,
    adjustedClose: parseNumber(valueFor(row, ADJUSTED_CLOSE_ALIASES)),
    pctChange,
    tradable: tradable ?? (suspended == null ? undefined : !suspended),
    suspended,
    limitUp: parseBoolean(valueFor(row, LIMIT_UP_ALIASES)),
    limitDown: parseBoolean(valueFor(row, LIMIT_DOWN_ALIASES)),
  };
  if (bar.adjustedClose != null && bar.adjustedClose <= 0) {
    throw new Error(`Invalid price data in ${source}: adjustedClose for ${code} ${date} must be positive.`);
  }
  if (bar.close <= 0) {
    throw new Error(`Invalid price data in ${source}: close for ${code} ${date} must be positive.`);
  }
  return bar;
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }
  row.push(current.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

export function parseHistoricalPriceCsv(text: string, source = "csv"): QuantHistoryPriceBar[] {
  return parseCsv(text)
    .map((row) => coercePriceBar(row, source))
    .filter((bar): bar is QuantHistoryPriceBar => bar != null);
}

export function parseHistoricalPriceJson(value: unknown, source = "json"): QuantHistoryPriceBar[] {
  const rows = Array.isArray(value)
    ? value
    : Array.isArray((value as { bars?: unknown[] })?.bars)
      ? (value as { bars: unknown[] }).bars
      : Array.isArray((value as { prices?: unknown[] })?.prices)
        ? (value as { prices: unknown[] }).prices
        : Array.isArray((value as { data?: unknown[] })?.data)
          ? (value as { data: unknown[] }).data
          : [];
  return rows
    .filter((row): row is Record<string, unknown> => row != null && typeof row === "object" && !Array.isArray(row))
    .map((row) => coercePriceBar(row, source))
    .filter((bar): bar is QuantHistoryPriceBar => bar != null);
}

async function loadPriceFile(filePath: string): Promise<LoadedPriceBars> {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".csv") {
    return { bars: parseHistoricalPriceCsv(await fs.readFile(filePath, "utf8"), filePath), files: [filePath], warnings: [] };
  }
  if (extension === ".json") {
    return { bars: parseHistoricalPriceJson(JSON.parse(await fs.readFile(filePath, "utf8")), filePath), files: [filePath], warnings: [] };
  }
  return { bars: [], files: [], warnings: [`Skipped unsupported price file: ${filePath}`] };
}

export async function loadHistoricalPriceBarsFromPath(inputPath: string): Promise<LoadedPriceBars> {
  const stat = await fs.stat(inputPath);
  if (stat.isFile()) return loadPriceFile(inputPath);
  const files = (await fs.readdir(inputPath))
    .filter((file) => /\.(csv|json)$/i.test(file))
    .sort()
    .map((file) => path.join(inputPath, file));
  const loaded = await Promise.all(files.map((file) => loadPriceFile(file)));
  return {
    bars: loaded.flatMap((item) => item.bars),
    files: loaded.flatMap((item) => item.files),
    warnings: loaded.flatMap((item) => item.warnings),
  };
}

export async function loadScreenRunsFromDirectory(screenDir = "reports"): Promise<LoadedScreenRuns> {
  const files = (await fs.readdir(screenDir))
    .filter((file) => /^screen-.*\.json$/.test(file))
    .sort()
    .map((file) => path.join(screenDir, file));
  const runs: ScreenRun[] = [];
  const warnings: string[] = [];
  for (const file of files) {
    try {
      const run = JSON.parse(await fs.readFile(file, "utf8")) as ScreenRun;
      if (!run.generatedAt || !Array.isArray(run.candidates)) {
        warnings.push(`Skipped invalid screen run: ${file}`);
        continue;
      }
      runs.push(run);
    } catch (error) {
      warnings.push(`Failed to read ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { runs, files, warnings };
}

function indexedBars(bars: QuantHistoryPriceBar[], options: EffectiveQuantHistoryAdapterOptions): Map<string, QuantHistoryPriceBar[]> {
  const byCode = new Map<string, QuantHistoryPriceBar[]>();
  for (const bar of bars) {
    const normalized = withInferredLimitStatus({ ...bar, code: normalizeCode(bar.code), date: normalizeDate(bar.date) ?? bar.date }, options.inferLimitStatus);
    byCode.set(normalized.code, [...(byCode.get(normalized.code) ?? []), normalized]);
  }
  for (const [code, values] of byCode) {
    byCode.set(
      code,
      values
        .filter((bar) => bar.date >= (options.dateFrom ?? "0000-00-00") && bar.date <= (options.dateTo ?? "9999-99-99"))
        .sort((a, b) => a.date.localeCompare(b.date)),
    );
  }
  return byCode;
}

function tradingDatesFrom(priceBarsByCode: Map<string, QuantHistoryPriceBar[]>, benchmarkBars: QuantHistoryPriceBar[], options: EffectiveQuantHistoryAdapterOptions): string[] {
  const preferred = benchmarkBars.length > 0 ? benchmarkBars : [...priceBarsByCode.values()].flat();
  return [...new Set(preferred.map((bar) => bar.date))]
    .filter((date) => date >= (options.dateFrom ?? "0000-00-00") && date <= (options.dateTo ?? "9999-99-99"))
    .sort();
}

function signalDateFor(run: ScreenRun): string | undefined {
  return normalizeDate(run.generatedAt);
}

function sortedScreenRuns(runs: ScreenRun[], options: EffectiveQuantHistoryAdapterOptions): ScreenRun[] {
  const filtered = runs
    .filter((run) => {
      const date = signalDateFor(run);
      if (!date) return false;
      if (options.dateFrom && date < options.dateFrom) return false;
      if (options.dateTo && date > options.dateTo) return false;
      return true;
    })
    .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
  if (!options.dedupeBySignalDate) return filtered;
  const latestByDate = new Map<string, ScreenRun>();
  for (const run of filtered) {
    const date = signalDateFor(run);
    if (date) latestByDate.set(date, run);
  }
  return [...latestByDate.values()].sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
}

function entryDateFor(signalDate: string, tradingDates: string[], options: EffectiveQuantHistoryAdapterOptions): string | undefined {
  const anchor = tradingDates.findIndex((date) => date >= signalDate);
  if (anchor < 0) return undefined;
  return tradingDates[anchor + options.entryLagBars];
}

function priceValue(bar: QuantHistoryPriceBar): number {
  return bar.adjustedClose ?? bar.close;
}

function barAtDate(bars: QuantHistoryPriceBar[], date: string): { bar: QuantHistoryPriceBar; index: number } | undefined {
  const index = bars.findIndex((bar) => bar.date === date);
  return index >= 0 ? { bar: bars[index], index } : undefined;
}

function forwardReturnFor(bars: QuantHistoryPriceBar[], entryDate: string, horizonBars: number): { entry: QuantHistoryPriceBar; exit: QuantHistoryPriceBar; forwardReturn: number } | undefined {
  const entry = barAtDate(bars, entryDate);
  if (!entry) return undefined;
  const exit = bars[entry.index + horizonBars];
  if (!exit) return undefined;
  const base = priceValue(entry.bar);
  const future = priceValue(exit);
  if (base <= 0 || future <= 0) return undefined;
  return {
    entry: entry.bar,
    exit,
    forwardReturn: future / base - 1,
  };
}

function benchmarkReturnFor(benchmarkBars: QuantHistoryPriceBar[], entryDate: string, horizonBars: number): number | undefined {
  const result = forwardReturnFor(benchmarkBars, entryDate, horizonBars);
  return result?.forwardReturn;
}

function bucketFor(candidate: Candidate): QuantCandidateBucket | undefined {
  return candidate.quant?.bucket;
}

function evidenceGateFor(candidate: Candidate): QuantEvidenceGate | undefined {
  return candidate.quant?.evidenceGate;
}

function scoreFor(candidate: Candidate): number {
  return candidate.quant?.stockScore ?? candidate.score;
}

function toBacktestCandidate(candidate: Candidate, entry: QuantHistoryPriceBar, forwardReturn: number): QuantBacktestCandidate {
  return {
    code: normalizeCode(candidate.stock.code),
    name: candidate.stock.name,
    industry: candidate.stock.industry || candidate.quant?.industry.industryKey,
    theme: candidate.matchedThemes[0]?.label,
    score: scoreFor(candidate),
    bucket: bucketFor(candidate),
    evidenceGate: evidenceGateFor(candidate),
    forwardReturn,
    tradable: entry.tradable ?? !entry.suspended,
    suspended: entry.suspended,
    limitUp: entry.limitUp,
    limitDown: entry.limitDown,
  };
}

export function adaptScreenRunsToBacktestInput(
  screenRuns: ScreenRun[],
  priceBars: QuantHistoryPriceBar[],
  optionsInput: QuantHistoryAdapterOptions = {},
  benchmarkBarsInput: QuantHistoryPriceBar[] = [],
): QuantHistoryAdapterResult {
  const options = effectiveOptions(optionsInput);
  const warnings: string[] = [];
  const priceBarsByCode = indexedBars(priceBars, options);
  const benchmarkBarsByCode = indexedBars(benchmarkBarsInput, options);
  const benchmarkBars = options.benchmarkCode
    ? (benchmarkBarsByCode.get(options.benchmarkCode) ?? [])
    : benchmarkBarsInput.map((bar) => withInferredLimitStatus(bar, options.inferLimitStatus)).sort((a, b) => a.date.localeCompare(b.date));
  const tradingDates = tradingDatesFrom(priceBarsByCode, benchmarkBars, options);
  const runs = sortedScreenRuns(screenRuns, options);
  const snapshots: QuantBacktestSnapshot[] = [];
  let candidatesSeen = 0;
  let candidatesWithForwardReturn = 0;

  if (tradingDates.length === 0) warnings.push("No trading dates found in price or benchmark bars.");

  for (const run of runs) {
    const signalDate = signalDateFor(run);
    if (!signalDate) {
      warnings.push(`Skipped screen run ${run.runId}: missing generatedAt date.`);
      continue;
    }
    const entryDate = entryDateFor(signalDate, tradingDates, options);
    if (!entryDate) {
      warnings.push(`Skipped screen run ${run.runId}: no entry date after ${signalDate}.`);
      continue;
    }
    const candidates = run.candidates.slice(0, options.maxCandidatesPerRun);
    candidatesSeen += candidates.length;
    const snapshotCandidates: QuantBacktestCandidate[] = [];

    for (const candidate of candidates) {
      const code = normalizeCode(candidate.stock.code);
      const bars = priceBarsByCode.get(code);
      if (!bars || bars.length === 0) {
        warnings.push(`Missing price bars for ${code} ${candidate.stock.name} at signal ${signalDate}.`);
        continue;
      }
      const forward = forwardReturnFor(bars, entryDate, options.horizonBars);
      if (!forward) {
        warnings.push(`Missing entry/exit price for ${code} ${candidate.stock.name}: entry ${entryDate}, horizon ${options.horizonBars}.`);
        continue;
      }
      snapshotCandidates.push(toBacktestCandidate(candidate, forward.entry, forward.forwardReturn));
      candidatesWithForwardReturn += 1;
    }

    if (snapshotCandidates.length === 0) {
      warnings.push(`Skipped screen run ${run.runId}: no candidates with computable forward return.`);
      continue;
    }

    snapshots.push({
      date: entryDate,
      benchmarkReturn: benchmarkReturnFor(benchmarkBars, entryDate, options.horizonBars),
      candidates: snapshotCandidates,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    snapshots,
    options,
    coverage: {
      screenRunsRead: screenRuns.length,
      screenRunsUsed: runs.length,
      priceBarsRead: priceBars.length,
      benchmarkBarsRead: benchmarkBarsInput.length,
      snapshotsBuilt: snapshots.length,
      candidatesSeen,
      candidatesWithForwardReturn,
      candidatesSkipped: candidatesSeen - candidatesWithForwardReturn,
    },
    warnings: [...new Set(warnings)].slice(0, 200),
  };
}

export function buildQuantBacktestInputFile(result: QuantHistoryAdapterResult, backtestOptions: QuantBacktestOptions = {}, sourceFiles?: QuantBacktestInputFile["adapter"]["sourceFiles"]): QuantBacktestInputFile {
  const periodsPerYear = Math.max(1, Math.round(252 / result.options.horizonBars));
  return {
    options: {
      periodsPerYear,
      ...backtestOptions,
    },
    snapshots: result.snapshots,
    adapter: {
      generatedAt: result.generatedAt,
      coverage: result.coverage,
      warnings: result.warnings,
      sourceFiles,
    },
  };
}

export function renderQuantHistoryAdapterReport(result: QuantHistoryAdapterResult, outputPath?: string): string {
  return [
    "Quant history adapter completed.",
    outputPath ? `Output: ${outputPath}` : undefined,
    `Screen runs: ${result.coverage.screenRunsUsed}/${result.coverage.screenRunsRead}`,
    `Price bars: ${result.coverage.priceBarsRead}; benchmark bars: ${result.coverage.benchmarkBarsRead}`,
    `Snapshots: ${result.coverage.snapshotsBuilt}`,
    `Candidates with returns: ${result.coverage.candidatesWithForwardReturn}/${result.coverage.candidatesSeen}`,
    `Horizon bars: ${result.options.horizonBars}; entry lag bars: ${result.options.entryLagBars}`,
    "Two-sided crowding policy: the adapter introduces no crowding data field; crowding is priced only in the scoring layer.",
    result.warnings.length > 0 ? `Warnings:\n${result.warnings.slice(0, 20).map((warning) => `- ${warning}`).join("\n")}` : undefined,
  ]
    .filter((line): line is string => line != null)
    .join("\n");
}
