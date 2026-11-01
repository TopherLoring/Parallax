import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client } from "colyseus.js";
import { ParallaxRoom } from "./rooms/ParallaxRoom";
import { generateRoomCode, ROOM_TTL_MS, roomCodeRegistry } from "./roomCodes";

type TestRoom = Awaited<ReturnType<Client["consumeSeatReservation"]>> & { state: any };

function waitForState(room: TestRoom, predicate: (state: any) => boolean, timeoutMs = 10_000) {
  if (predicate(room.state)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Load smoke timed out waiting for state")), timeoutMs);
    room.onStateChange((state) => {
      if (!predicate(state)) return;
      clearTimeout(timeout);
      resolve();
    });
  });
}

test("five concurrent rooms support ten connected clients through lobby start", async () => {
  const httpServer = createServer();
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer, maxPayload: 8 * 1024 }) });
  gameServer.define("parallax", ParallaxRoom);
  matchMaker.controller.exposedMethods = ["reconnect"];
  const connectedRooms: TestRoom[] = [];
  const startedAt = Date.now();

  try {
    await gameServer.listen(0);
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("No load-test server address");
    const endpoint = `ws://127.0.0.1:${address.port}`;

    const pairs = await Promise.all(Array.from({ length: 5 }, async (_, index) => {
      const expiresAt = Date.now() + ROOM_TTL_MS;
      const roomCode = generateRoomCode(roomCodeRegistry, new Set<string>(), expiresAt);
      const created = await matchMaker.createRoom("parallax", { roomCode, expiresAt });
      roomCodeRegistry.bind(roomCode, created.roomId);
      const [hostReservation, guestReservation] = await Promise.all([
        matchMaker.joinById(created.roomId, { displayName: `Host ${index + 1}` }),
        matchMaker.joinById(created.roomId, { displayName: `Guest ${index + 1}` }),
      ]);
      const [host, guest] = await Promise.all([
        new Client(endpoint).consumeSeatReservation(hostReservation) as Promise<TestRoom>,
        new Client(endpoint).consumeSeatReservation(guestReservation) as Promise<TestRoom>,
      ]);
      connectedRooms.push(host, guest);
      return [host, guest] as const;
    }));

    const readyPromises = pairs.map(([host]) =>
      waitForState(host, (state) => Array.from(state.players).length === 2 && Array.from(state.players).every((player) => player.ready)),
    );
    for (const [host, guest] of pairs) {
      host.send("ready", { ready: true });
      guest.send("ready", { ready: true });
    }
    await Promise.all(readyPromises);

    const activePromises = pairs.map(([host]) => waitForState(host, (state) => state.phase === "active"));
    for (const [host] of pairs) host.send("start", {});
    await Promise.all(activePromises);

    for (const [host, guest] of pairs) {
      assert.equal(host.state.phase, "active");
      assert.equal(guest.state.phase, "active");
      assert.equal(host.state.players.length, 2);
    }
    assert.ok(Date.now() - startedAt < 15_000, "ten clients across five rooms should connect and start within 15 seconds");
  } finally {
    await Promise.all(connectedRooms.map((room) => room.leave()));
    await gameServer.gracefullyShutdown(false);
  }
});
