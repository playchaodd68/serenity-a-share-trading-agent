import http, { type ServerResponse } from "node:http";
import { getConfig, type AppConfig } from "../config.js";
import { collectAgentStatus, type AgentStatusSnapshot } from "./status.js";
import { renderDashboardShell } from "./render.js";

// collectAgentStatus runs the runtime doctor, which makes live FFD network calls (up to ~13s).
// Cache the snapshot briefly and share in-flight work so frequent dashboard polls neither hammer
// FFD nor pile up overlapping slow requests.
const STATUS_TTL_MS = 15_000;

interface StatusCache {
  at: number;
  promise: Promise<AgentStatusSnapshot>;
}

function createStatusProvider(config: AppConfig): () => Promise<AgentStatusSnapshot> {
  let cache: StatusCache | null = null;
  return () => {
    const now = Date.now();
    if (cache && now - cache.at < STATUS_TTL_MS) return cache.promise;
    const promise = collectAgentStatus(config);
    cache = { at: now, promise };
    // Drop a rejected snapshot from the cache so the next poll retries instead of serving the error.
    promise.catch(() => {
      if (cache?.promise === promise) cache = null;
    });
    return promise;
  };
}

function parsePortArg(args: string[]): number | undefined {
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--port" && args[index + 1]) {
      const parsed = Number(args[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return undefined;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body, null, 2));
}

export interface DashboardLogger {
  info: (message: string) => void;
  error: (message: string, error: unknown) => void;
}

export async function startDashboardServer(
  args = process.argv.slice(3),
  logger: DashboardLogger = { info: (message) => console.log(message), error: (message, error) => console.error(message, error) },
): Promise<http.Server> {
  const config = getConfig();
  const port = parsePortArg(args) ?? config.dashboardPort;
  const getStatus = createStatusProvider(config);

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        response.end(renderDashboardShell(config));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/status") {
        sendJson(response, 200, await getStatus());
        return;
      }

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { ok: true, service: "serenity-dashboard", port });
        return;
      }

      sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      logger.error("[dashboard] request failed", error);
      sendJson(response, 500, { error: "Internal server error" });
    }
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  logger.info(`Serenity monitoring dashboard listening on http://localhost:${port}`);
  return server;
}
