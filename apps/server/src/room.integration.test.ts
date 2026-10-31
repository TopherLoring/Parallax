import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client } from "colyseus.js";
import { ParallaxRoom } from "./rooms/ParallaxRoom";
import { ROOM_TTL_MS, roomCodeRegistry } from "./roomCodes";

type TestRoom = Awaited<ReturnType<Client["consumeSeatReservation"]>> & { state: any };

function waitForMessage<T>(
  room: TestRoom,
  type: string,
  predicate: (payload: T) => boolean = () => true,
  timeoutMs = 5_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), timeoutMs);
    room.onMessage(type, (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

function waitForOneOfMessages(
  room: TestRoom,
  types: string[],
  predicate: (payload: any) => boolean,
  timeoutMs = 5_000,
): Promise<{ type: string; payload: any }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${types.join(" or ")}`)), timeoutMs);
    for (const type of types) {
      room.onMessage(type, (payload: any) => {
        if (!predicate(payload)) return;
        clearTimeout(timeout);
        resolve({ type, payload });
      });
    }
  });
}

function waitForState(
  room: TestRoom,
  predicate: (state: TestRoom["state"]) => boolean,
  timeoutMs = 5_000,
): Promise<void> {
  if (predicate(room.state)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for room state")), timeoutMs);
    room.onStateChange((state) => {
      if (!predicate(state)) return;
      clearTimeout(timeout);
      resolve();
    });
  });
}

test("two independent clients receive private roles and duplicate attempts charge energy once", async () => {
  const httpServer = createServer();
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer, maxPayload: 8 * 1024 }),
  });
  gameServer.define("parallax", ParallaxRoom);
  matchMaker.controller.exposedMethods = ["reconnect"];

  let systemsRoom: TestRoom | null = null;
  let signalsRoom: TestRoom | null = null;

  try {
    await gameServer.listen(0);
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("No test server address");
    const client = new Client(`ws://127.0.0.1:${address.port}`);

    const roomCode = "M5TEST";
    const expiresAt = Date.now() + ROOM_TTL_MS;
    assert.equal(roomCodeRegistry.reserve(roomCode, expiresAt), true);
    const created = await matchMaker.createRoom("parallax", { roomCode, expiresAt });
    roomCodeRegistry.bind(roomCode, created.roomId);

    const systemsReservation = await matchMaker.joinById(created.roomId, { displayName: "Systems" });
    const signalsReservation = await matchMaker.joinById(created.roomId, { displayName: "Signals" });
    systemsRoom = await client.consumeSeatReservation(systemsReservation);
    signalsRoom = await client.consumeSeatReservation(signalsReservation);

    const systemsViewPromise = waitForMessage<any>(systemsRoom, "game:view");
    const signalsViewPromise = waitForMessage<any>(signalsRoom, "game:view");
    systemsRoom.send("sync", {});
    signalsRoom.send("sync", {});
    const [systemsView, signalsView] = await Promise.all([systemsViewPromise, signalsViewPromise]);

    assert.equal(systemsView.player.role.name, "Systems Operator");
    assert.equal(signalsView.player.role.name, "Signal Analyst");
    assert.equal(JSON.stringify(systemsView).includes("Signal Analyst"), false);
    assert.equal(JSON.stringify(signalsView).includes("Systems Operator"), false);
    assert.equal("roleName" in systemsRoom.state.players[0]!, false);

    const forgedReadyError = waitForMessage<any>(
      signalsRoom,
      "game:error",
      (payload) => payload.code === "invalid_ready_message",
    );
    signalsRoom.send("ready", { ready: true, playerId: systemsRoom.sessionId, roleId: "systems" });
    await forgedReadyError;
    assert.equal(Array.from(systemsRoom.state.players).every((player) => !player.ready), true);

    const readyPromise = waitForState(
      systemsRoom,
      (state) => Array.from(state.players).length === 2 && Array.from(state.players).every((player) => player.ready),
    );
    systemsRoom.send("ready", { ready: true });
    signalsRoom.send("ready", { ready: true });
    await readyPromise;

    const activePromise = waitForState(systemsRoom, (state) => state.phase === "active");
    systemsRoom.send("start", {});
    await activePromise;

    const nonHostStartError = waitForMessage<any>(
      signalsRoom,
      "game:error",
      (payload) => payload.code === "host_only",
    );
    signalsRoom.send("start", {});
    await nonHostStartError;

    const unauthorizedInspectError = waitForMessage<any>(
      signalsRoom,
      "game:error",
      (payload) => payload.code === "object_unavailable",
    );
    signalsRoom.send("inspect", { objectId: "diagnostic-terminal" });
    await unauthorizedInspectError;

    const systemsEvidencePromise = waitForMessage<any>(
      systemsRoom,
      "game:view",
      (view) => view.discoveries.some((item: { clueId?: string }) => item.clueId === "power-phase"),
    );
    const signalsEvidencePromise = waitForMessage<any>(
      signalsRoom,
      "game:view",
      (view) => view.discoveries.some((item: { clueId?: string }) => item.clueId === "carrier-offset"),
    );
    systemsRoom.send("inspect", { objectId: "diagnostic-terminal" });
    signalsRoom.send("inspect", { objectId: "signal-receiver" });
    const [systemsEvidence, signalsEvidence] = await Promise.all([systemsEvidencePromise, signalsEvidencePromise]);
    assert.equal(systemsEvidence.discoveries.some((item: { clueId?: string }) => item.clueId === "carrier-offset"), false);
    assert.equal(signalsEvidence.discoveries.some((item: { clueId?: string }) => item.clueId === "power-phase"), false);

    const messageTypes = ["game:attempt-result", "game:ack"];
    const waitForAttemptResponse = (room: TestRoom) =>
      waitForOneOfMessages(room, messageTypes, (payload) => payload.actionId === "same-action-id");
    const systemsResponse = waitForAttemptResponse(systemsRoom);
    const signalsResponse = waitForAttemptResponse(signalsRoom);
    const energyBefore = systemsRoom.state.energy;
    systemsRoom.send("attempt", {
      mechanismId: "frequency-lock",
      answer: "wrong",
      actionId: "same-action-id",
    });
    signalsRoom.send("attempt", {
      mechanismId: "frequency-lock",
      answer: "wrong",
      actionId: "same-action-id",
    });
    const responses = await Promise.all([systemsResponse, signalsResponse]);
    await waitForState(systemsRoom, (state) => state.energy === energyBefore - 5);

    assert.equal(systemsRoom.state.energy, energyBefore - 5);
    assert.equal(signalsRoom.state.energy, energyBefore - 5);
    assert.equal(responses.filter((response) => response.type === "game:attempt-result").length, 1);
    assert.equal(responses.filter((response) => response.type === "game:ack").length, 1);
  } finally {
    await Promise.all([systemsRoom?.leave(), signalsRoom?.leave()].filter(Boolean));
    await gameServer.gracefullyShutdown(false);
  }
});
