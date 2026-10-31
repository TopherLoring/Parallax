import assert from "node:assert/strict";
import test from "node:test";
import { ParallaxPublicState, PublicPlayerState } from "./publicState";

test("synchronized room schema contains only non-secret public fields", () => {
  const state = new ParallaxPublicState();
  const player = new PublicPlayerState();
  const roomFields = Object.keys(state);
  const playerFields = Object.keys(player);

  assert.deepEqual(roomFields.sort(), [
    "deadline",
    "energy",
    "hostPlayerId",
    "phase",
    "players",
    "roomCode",
    "scenarioTitle",
    "solvedMechanismIds",
  ].sort());
  assert.deepEqual(playerFields.sort(), [
    "connected",
    "displayName",
    "id",
    "ready",
    "roleName",
  ].sort());
  const serialized = JSON.stringify(state);
  assert.equal(serialized.includes("acceptedAnswers"), false);
  assert.equal(serialized.includes("discoveries"), false);
  assert.equal(serialized.includes("clues"), false);
});
