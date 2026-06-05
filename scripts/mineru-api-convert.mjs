#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_API_BASE = "https://mineru.net/api/v4";

async function loadEnvFile(fileName, override) {
  const envPath = path.resolve(fileName);
  await fs.readFile(envPath, "utf8")
    .then((content) => {
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const index = trimmed.indexOf("=");
        const key = trimmed.slice(0, index).trim();
        const value = trimmed.slice(index + 1).trim();
        if (key && (override || process.env[key] == null)) process.env[key] = value;
      }
    })
    .catch(() => undefined);
}

async function loadDotEnv() {
  await loadEnvFile(".env", false);
  await loadEnvFile(".env.local", true);
}

function usage() {
  console.error("Usage: node scripts/mineru-api-convert.mjs <input-file> <output-dir>");
  process.exit(2);
}

function token() {
  const value = process.env.MINERU_API_TOKEN || process.env.MINERU_API_KEY;
  if (!value) throw new Error("MINERU_API_TOKEN is not configured");
  return value;
}

function authHeaders() {
  return {
    "Authorization": `Bearer ${token()}`,
    "Content-Type": "application/json",
    "Accept": "*/*",
  };
}

function apiBase() {
  return process.env.MINERU_API_BASE || DEFAULT_API_BASE;
}

function dataIdFor(filePath) {
  const digest = createHash("sha256").update(path.resolve(filePath)).digest("hex").slice(0, 16);
  return `ffd_${digest}`;
}

async function parserFileName(filePath) {
  const base = path.basename(filePath);
  const lower = base.toLowerCase();
  if (!lower.endsWith(".pdf")) return base;
  try {
    const handle = await fs.open(filePath, "r");
    try {
      const buffer = Buffer.alloc(2);
      await handle.read(buffer, 0, 2, 0);
      if (buffer.equals(Buffer.from("PK"))) {
        if (lower.endsWith(".docx.pdf")) return base.slice(0, -4);
        return `${base.slice(0, -4)}.docx`;
      }
    } finally {
      await handle.close();
    }
  } catch {
    // Fall back to the actual filename below.
  }
  return base;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`MinerU API returned non-JSON HTTP ${response.status}`);
  }
  if (!response.ok || payload.code !== 0) {
    throw new Error(`MinerU API request failed: HTTP ${response.status}, code=${payload.code}, msg=${payload.msg ?? "n/a"}`);
  }
  return payload;
}

async function getJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token()}`,
      "Accept": "*/*",
    },
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`MinerU API returned non-JSON HTTP ${response.status}`);
  }
  if (!response.ok || payload.code !== 0) {
    throw new Error(`MinerU API poll failed: HTTP ${response.status}, code=${payload.code}, msg=${payload.msg ?? "n/a"}`);
  }
  return payload;
}

async function requestUpload(filePath, fileName, dataId) {
  const body = {
    files: [{
      name: fileName,
      data_id: dataId,
      is_ocr: process.env.MINERU_API_IS_OCR !== "false",
    }],
    model_version: process.env.MINERU_API_MODEL_VERSION || "vlm",
    language: process.env.MINERU_API_LANGUAGE || "ch",
    enable_table: process.env.MINERU_API_ENABLE_TABLE !== "false",
    enable_formula: process.env.MINERU_API_ENABLE_FORMULA !== "false",
  };
  const payload = await postJson(`${apiBase()}/file-urls/batch`, body);
  const batchId = payload.data?.batch_id;
  const uploadUrl = payload.data?.file_urls?.[0];
  if (!batchId || !uploadUrl) throw new Error("MinerU API did not return batch_id/file_url");
  return { batchId, uploadUrl };
}

async function uploadFile(uploadUrl, filePath) {
  const data = await fs.readFile(filePath);
  const response = await fetch(uploadUrl, { method: "PUT", body: data });
  if (!response.ok) throw new Error(`MinerU upload failed: HTTP ${response.status}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollBatch(batchId, dataId) {
  const timeoutMs = Number(process.env.MINERU_API_TIMEOUT_MS || 15 * 60 * 1000);
  const intervalMs = Number(process.env.MINERU_API_POLL_INTERVAL_MS || 5000);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const payload = await getJson(`${apiBase()}/extract-results/batch/${batchId}`);
    const results = payload.data?.extract_result;
    const list = Array.isArray(results) ? results : results ? [results] : [];
    const result = list.find((item) => item.data_id === dataId) || list[0];
    const state = result?.state;
    if (state === "done") {
      if (!result.full_zip_url) throw new Error("MinerU task done without full_zip_url");
      return result.full_zip_url;
    }
    if (state === "failed") {
      throw new Error(`MinerU task failed: ${result.err_msg || "unknown error"}`);
    }
    console.error(`MinerU API state=${state || "unknown"} elapsed=${Math.round((Date.now() - started) / 1000)}s`);
    await sleep(intervalMs);
  }
  throw new Error(`MinerU API polling timed out after ${Math.round(timeoutMs / 1000)}s`);
}

async function downloadZip(url, outputDir) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`MinerU result download failed: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(outputDir, { recursive: true });
  const zipPath = path.join(outputDir, "mineru-result.zip");
  await fs.writeFile(zipPath, buffer);
  await execFileAsync("/usr/bin/unzip", ["-q", "-o", zipPath, "-d", outputDir], { maxBuffer: 8 * 1024 * 1024 });
}

async function main() {
  await loadDotEnv();
  const [inputFile, outputDir] = process.argv.slice(2);
  if (!inputFile || !outputDir) usage();
  const filePath = path.resolve(inputFile);
  const out = path.resolve(outputDir);
  const fileName = await parserFileName(filePath);
  const dataId = dataIdFor(filePath);

  console.error(`MinerU API submit file=${fileName}`);
  const { batchId, uploadUrl } = await requestUpload(filePath, fileName, dataId);
  await uploadFile(uploadUrl, filePath);
  console.error(`MinerU API uploaded batch=${batchId}`);
  const zipUrl = await pollBatch(batchId, dataId);
  await downloadZip(zipUrl, out);
  console.error("MinerU API result extracted");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
