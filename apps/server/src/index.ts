import { createServer } from "node:http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ParallaxRoom } from "./rooms/ParallaxRoom";

const port = Number(process.env.PORT ?? 2567);
const httpServer = createServer();

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("parallax", ParallaxRoom);

gameServer.listen(port).then(() => {
  console.log(`PARALLAX room server listening on :${port}`);
}).catch((error: unknown) => {
  console.error("Failed to start PARALLAX server", error);
  process.exitCode = 1;
});
