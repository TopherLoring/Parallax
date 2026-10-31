import type { IncomingMessage, ServerResponse } from "node:http";

export interface HealthSnapshot {
  ready: boolean;
  startedAt: number;
}

export function handleHealthRequest(
  request: IncomingMessage,
  response: ServerResponse,
  snapshot: HealthSnapshot,
): boolean {
  if (request.method !== "GET") return false;

  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  if (path !== "/health" && path !== "/health/live" && path !== "/health/ready") return false;

  const live = path === "/health/live";
  const ready = live || snapshot.ready;
  response.statusCode = ready ? 200 : 503;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify({
    status: live ? "alive" : ready ? "ready" : "not-ready",
    uptimeSeconds: Math.max(0, Math.floor((Date.now() - snapshot.startedAt) / 1_000)),
  }));
  return true;
}
