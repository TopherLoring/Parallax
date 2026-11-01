import { createServer } from "node:http";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ParallaxRoom } from "./rooms/ParallaxRoom";
import { handleHealthRequest } from "./health";
import { handleRoomApiRequest } from "./roomApi";
import { logEvent } from "./logger";

const port = Number(process.env.PORT ?? 2567);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const startedAt = Date.now();
const health = { ready: false, startedAt };
const httpServer = createServer((request, response) => {
  if (handleHealthRequest(request, response, health)) return;
  void handleRoomApiRequest(request, response).then((handled) => {
    if (handled) return;
    response.statusCode = 404;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "not_found" }));
  }).catch((error: unknown) => {
    logEvent("error", "http.handler_error", { errorType: error instanceof Error ? error.name : "unknown" });
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader("content-type", "application/json; charset=utf-8");
    }
    if (!response.writableEnded) response.end(JSON.stringify({ error: "internal_error" }));
  });
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer, maxPayload: 8 * 1024 }),
});

gameServer.define("parallax", ParallaxRoom);
// All matchmaking is routed through the validated HTTP API; clients only consume server-issued reservations.
matchMaker.controller.exposedMethods = ["reconnect"];
gameServer.onBeforeShutdown(() => {
  health.ready = false;
});

let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  health.ready = false;
  logEvent("info", "server.shutdown_started");
  try {
    await gameServer.gracefullyShutdown(false);
    logEvent("info", "server.shutdown_complete");
  } catch (error) {
    logEvent("error", "server.shutdown_failed", { errorType: error instanceof Error ? error.name : "unknown" });
    process.exitCode = 1;
  }
}

process.once("SIGTERM", () => { void shutdown(); });
process.once("SIGINT", () => { void shutdown(); });

async function start() {
  try {
    await gameServer.listen(port);
    health.ready = true;
    logEvent("info", "server.started", { port });
  } catch (error) {
    health.ready = false;
    logEvent("error", "server.start_failed", { errorType: error instanceof Error ? error.name : "unknown" });
    process.exitCode = 1;
    httpServer.close();
  }
}

void start();
