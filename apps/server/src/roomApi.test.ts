import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { handleRoomApiRequest, type RoomApiDependencies } from "./roomApi";
import { RoomCodeRegistry } from "./roomCodes";

interface FakeRoom {
  roomId: string;
  name: string;
  metadata: Record<string, unknown>;
}

function createFakeDependencies(): { dependencies: RoomApiDependencies; rooms: FakeRoom[] } {
  const rooms: FakeRoom[] = [];
  let reservationCount = 0;
  const fake = {
    async query({ name }: { name: string }) {
      return rooms.filter((room) => room.name === name);
    },
    async createRoom(name: string, metadata: Record<string, unknown>) {
      const room = { roomId: `room-${rooms.length + 1}`, name, metadata };
      rooms.push(room);
      return room;
    },
    async joinById(roomId: string, options: { displayName: string }) {
      if (!rooms.some((room) => room.roomId === roomId)) throw new Error("room_not_found");
      reservationCount += 1;
      return {
        room: { roomId },
        sessionId: `session-${reservationCount}`,
        reconnectionToken: `token-${reservationCount}`,
        options,
      };
    },
  };
  return {
    rooms,
    dependencies: {
      matchMaker: fake as unknown as RoomApiDependencies["matchMaker"],
      registry: new RoomCodeRegistry(),
    },
  };
}

async function withApi(
  dependencies: RoomApiDependencies,
  run: (baseUrl: string) => Promise<void>,
) {
  const server = createServer((request, response) => {
    void handleRoomApiRequest(request, response, dependencies).then((handled) => {
      if (!handled) {
        response.statusCode = 404;
        response.end();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No TCP address assigned");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("room API creates a room and joins it by generated code", async () => {
  const { dependencies, rooms } = createFakeDependencies();
  await withApi(dependencies, async (baseUrl) => {
    const created = await fetch(`${baseUrl}/api/rooms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Host" }),
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json() as { roomCode: string; reservation: { sessionId: string } };
    assert.match(createdBody.roomCode, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
    assert.equal(createdBody.reservation.sessionId, "session-1");
    assert.equal(rooms.length, 1);

    const joined = await fetch(`${baseUrl}/api/rooms/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomCode: createdBody.roomCode.toLowerCase(), displayName: "Analyst" }),
    });
    assert.equal(joined.status, 200);
    const joinedBody = await joined.json() as { roomCode: string; reservation: { sessionId: string } };
    assert.equal(joinedBody.roomCode, createdBody.roomCode);
    assert.equal(joinedBody.reservation.sessionId, "session-2");
  });
});

test("room API rejects malformed requests, unknown codes, and disallowed origins", async () => {
  const { dependencies } = createFakeDependencies();
  await withApi(dependencies, async (baseUrl) => {
    const malformed = await fetch(`${baseUrl}/api/rooms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Host", roleId: "systems" }),
    });
    assert.equal(malformed.status, 400);

    const unknown = await fetch(`${baseUrl}/api/rooms/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomCode: "ZZZZZZ", displayName: "Guest" }),
    });
    assert.equal(unknown.status, 404);

    const blockedOrigin = await fetch(`${baseUrl}/api/rooms`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://untrusted.example",
      },
      body: JSON.stringify({ displayName: "Host" }),
    });
    assert.equal(blockedOrigin.status, 403);
  });
});
