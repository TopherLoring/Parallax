import { describe, expect, it } from "vitest";
import {
  createInitialRoomState,
  MAX_PLAYERS,
  MIN_PLAYERS,
  STARTING_ENERGY,
  transition,
} from "./index";

describe("game domain foundation", () => {
  it("starts in a clean lobby", () => {
    expect(createInitialRoomState()).toEqual({
      phase: "lobby",
      players: [],
      discoveries: [],
      energy: STARTING_ENERGY,
      deadline: null,
    });
  });

  it("requires at least two players to start", () => {
    let state = transition(createInitialRoomState(), {
      type: "player.join",
      player: { id: "a", displayName: "A", connected: true },
    });
    state = transition(state, { type: "game.start", deadline: 1000 });
    expect(state.phase).toBe("lobby");
    state = transition(state, {
      type: "player.join",
      player: { id: "b", displayName: "B", connected: true },
    });
    state = transition(state, { type: "game.start", deadline: 1000 });
    expect(state.phase).toBe("active");
  });

  it("caps rooms at six players", () => {
    let state = createInitialRoomState();
    for (let i = 0; i < MAX_PLAYERS + 1; i++) {
      state = transition(state, {
        type: "player.join",
        player: { id: String(i), displayName: String(i), connected: true },
      });
    }
    expect(state.players).toHaveLength(MAX_PLAYERS);
  });

  it("ends the game when shared energy reaches zero", () => {
    let state = createInitialRoomState();
    state = transition(state, { type: "player.join", player: { id: "a", displayName: "A", connected: true } });
    state = transition(state, { type: "player.join", player: { id: "b", displayName: "B", connected: true } });
    state = transition(state, { type: "game.start", deadline: 1000 });
    state = transition(state, { type: "energy.spend", amount: STARTING_ENERGY });
    expect(state.phase).toBe("lost");
    expect(state.energy).toBe(0);
  });

  it("does not mutate state when duplicate discoveries are recorded", () => {
    let state = createInitialRoomState();
    state = transition(state, { type: "player.join", player: { id: "a", displayName: "A", connected: true } });
    state = transition(state, { type: "player.join", player: { id: "b", displayName: "B", connected: true } });
    state = transition(state, { type: "game.start", deadline: 1000 });
    const discovery = { id: "fragment-a", title: "Fragment A", content: "Signal fragment", discoveredBy: "a", discoveredAt: 1 };
    state = transition(state, { type: "discovery.record", discovery });
    const afterDuplicate = transition(state, { type: "discovery.record", discovery });
    expect(afterDuplicate.discoveries).toHaveLength(1);
  });
});
