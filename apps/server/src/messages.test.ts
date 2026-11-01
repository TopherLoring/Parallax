import assert from "node:assert/strict";
import test from "node:test";
import {
  attemptMessageSchema,
  createRoomRequestSchema,
  joinRoomRequestSchema,
  joinOptionsSchema,
  readyMessageSchema,
} from "./messages";

test("room creation accepts only a display name", () => {
  assert.equal(createRoomRequestSchema.safeParse({ displayName: "Operator" }).success, true);
  assert.equal(createRoomRequestSchema.safeParse({ displayName: "Operator", roleId: "systems" }).success, false);
  assert.equal(createRoomRequestSchema.safeParse({ displayName: " " }).success, false);
});

test("join requests normalize room codes and reject malformed codes", () => {
  const result = joinRoomRequestSchema.parse({ roomCode: " ab23cd ", displayName: "Analyst" });
  assert.equal(result.roomCode, "AB23CD");
  assert.equal(joinRoomRequestSchema.safeParse({ roomCode: "123", displayName: "Analyst" }).success, false);
});

test("client join options cannot assign identity or role", () => {
  assert.equal(joinOptionsSchema.safeParse({ displayName: "Player" }).success, true);
  assert.equal(joinOptionsSchema.safeParse({ displayName: "Player", playerId: "forged" }).success, false);
  assert.equal(joinOptionsSchema.safeParse({ displayName: "Player", roleId: "systems" }).success, false);
});

test("message contracts reject malformed or oversized game actions", () => {
  assert.equal(readyMessageSchema.safeParse({ ready: true }).success, true);
  assert.equal(readyMessageSchema.safeParse({ ready: "true" }).success, false);
  assert.equal(attemptMessageSchema.safeParse({
    mechanismId: "frequency-lock",
    answer: "731",
    actionId: "action-1",
  }).success, true);
  assert.equal(attemptMessageSchema.safeParse({
    mechanismId: "frequency-lock",
    answer: "x".repeat(201),
    actionId: "action-1",
  }).success, false);
});
