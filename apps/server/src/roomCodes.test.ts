import assert from "node:assert/strict";
import test from "node:test";
import {
  generateRoomCode,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  RoomCodeRegistry,
} from "./roomCodes";

test("room code registry reserves, binds, and releases codes", () => {
  const registry = new RoomCodeRegistry();
  assert.equal(registry.reserve("ABC234", 5_000, 1_000), true);
  assert.equal(registry.reserve("ABC234", 5_000, 1_000), false);
  assert.equal(registry.bind("ABC234", "room-1"), true);
  assert.deepEqual(registry.get("ABC234"), { roomId: "room-1", expiresAt: 5_000 });
  registry.release("ABC234");
  assert.equal(registry.get("ABC234"), null);
});

test("expired room codes remain reserved until their room is disposed", () => {
  const registry = new RoomCodeRegistry();
  registry.reserve("ABC234", 2_000, 1_000);
  assert.deepEqual(registry.get("ABC234"), { roomId: null, expiresAt: 2_000 });
  assert.equal(registry.reserve("ABC234", 5_000, 1_000), false);
  registry.release("ABC234");
  assert.equal(registry.size, 0);
});

test("room code expiry can be extended for a host rematch", () => {
  const registry = new RoomCodeRegistry();
  registry.reserve("ABC234", Date.now() + 1_000);
  registry.bind("ABC234", "room-1");
  const extendedExpiry = Date.now() + 60_000;
  assert.equal(registry.extend("ABC234", extendedExpiry), true);
  assert.equal(registry.get("ABC234")?.expiresAt, extendedExpiry);
});

test("generated codes use the unambiguous alphabet and avoid active codes", () => {
  const registry = new RoomCodeRegistry();
  const first = generateRoomCode(registry, new Set(["AAAAAA"]), Date.now() + 10_000);
  assert.equal(first.length, ROOM_CODE_LENGTH);
  assert.ok([...first].every((character) => ROOM_CODE_ALPHABET.includes(character)));
  assert.notEqual(first, "AAAAAA");
  assert.equal(registry.has(first), true);
});

test("room code normalization is case and whitespace insensitive", () => {
  assert.equal(normalizeRoomCode(" ab23 cd "), "AB23CD");
});
