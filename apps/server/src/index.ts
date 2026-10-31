import { createServer } from "node:http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ParallaxRoom } from "./rooms/ParallaxRoom";
import { handleHealthRequest } from "./health";
import { handleRoomApiRequest } from "./roomApi";

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
    console.error("Unhandled HTTP handler error", error);
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader("content-type", "application/json; charset=utf-8");
    }
    if (!response.writableEnded) response.end(JSON.stringify({ error: "internal_error" }));
  });
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("parallax", ParallaxRoom);
gameServer.onBeforeShutdown(() => {
  health.ready = false;
});

async function start() {
  try {
    await gameServer.listen(port);
    health.ready = true;
    console.log(`PARALLAX room server listening on :${port}`);
  } catch (error) {
    health.ready = false;
    console.error("Failed to start PARALLAX server", error);
    process.exitCode = 1;
    httpServer.close();
  }
}

void start();
