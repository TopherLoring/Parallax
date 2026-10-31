import assert from "node:assert/strict";
import test from "node:test";
import { ParallaxPublicState, PublicPlayerState } from "./publicState";

test("synchronized room schema exposes public status without private game data", () => {
  const state = new ParallaxPublicState();
  const player = new PublicPlayerState();

  assert.equal(state.phase, "lobby");
  assert.equal(state.energy, 100);
  assert.equal(state.remainingSeconds, 0);
  assert.ok(state.players);
  assert.equal(player.connected, false);
  assert.equal(player.ready, false);

  for (const secretField of ["acceptedAnswers", "discoveries", "clues", "prerequisites", "scenario", "roleId", "roleName"]) {
    assert.equal(secretField in state, false);
    assert.equal(secretField in player, false);
  }
});
