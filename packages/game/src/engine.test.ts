import { describe, expect, it } from "vitest";
import {
  canAttemptMechanism,
  canDiscoverClue,
  canInspectObject,
  createGameSession,
  getPlayerScenarioView,
  transitionGame,
} from "./engine";
import { scenarioSchema } from "./scenario";
import { sharedSignalScenario } from "./scenarios/shared-signal";

const scenario = scenarioSchema.parse(sharedSignalScenario);

function readySession() {
  let state = createGameSession(scenario);
  state = transitionGame(state, scenario, {
    type: "player.join",
    player: { id: "systems-1", displayName: "Systems", connected: true, roleId: "systems" },
  });
  state = transitionGame(state, scenario, {
    type: "player.join",
    player: { id: "signals-1", displayName: "Signals", connected: true, roleId: "signals" },
  });
  state = transitionGame(state, scenario, { type: "player.ready", playerId: "systems-1", ready: true });
  state = transitionGame(state, scenario, { type: "player.ready", playerId: "signals-1", ready: true });
  state = transitionGame(state, scenario, { type: "game.start", at: 1_000 });
  return state;
}

function inspectAndDiscover(
  state: ReturnType<typeof readySession>,
  playerId: string,
  objectId: string,
  clueIds: string[],
  at: number,
) {
  let next = transitionGame(state, scenario, {
    type: "object.inspect",
    playerId,
    objectId,
    at,
  });
  for (const clueId of clueIds) {
    next = transitionGame(next, scenario, {
      type: "clue.discover",
      playerId,
      clueId,
      at: at + 1,
    });
  }
  return next;
}

describe("authoritative scenario session engine", () => {
  it("requires two connected, ready players before starting", () => {
    let state = createGameSession(scenario);
    state = transitionGame(state, scenario, {
      type: "player.join",
      player: { id: "one", displayName: "One", connected: true, roleId: "systems" },
    });
    state = transitionGame(state, scenario, { type: "player.ready", playerId: "one", ready: true });
    expect(transitionGame(state, scenario, { type: "game.start", at: 100 }).phase).toBe("lobby");
    state = transitionGame(state, scenario, {
      type: "player.join",
      player: { id: "two", displayName: "Two", connected: true, roleId: "signals" },
    });
    expect(transitionGame(state, scenario, { type: "game.start", at: 100 }).phase).toBe("lobby");
    state = transitionGame(state, scenario, { type: "player.ready", playerId: "two", ready: true });
    expect(transitionGame(state, scenario, { type: "game.start", at: 100 }).phase).toBe("active");
  });

  it("enforces role visibility and complementary clue access", () => {
    const state = readySession();
    const systems = state.players.find((player) => player.id === "systems-1")!;
    const signals = state.players.find((player) => player.id === "signals-1")!;
    expect(canDiscoverClue(state, scenario, systems, "carrier-offset")).toBe(false);
    expect(canDiscoverClue(state, scenario, signals, "power-phase")).toBe(false);
    expect(canAttemptMechanism(state, scenario, systems, "frequency-lock")).toBe(false);
    expect(canInspectObject(state, scenario, signals, "diagnostic-terminal")).toBe(false);
  });

  it("keeps evidence inspection free and solves the complete asymmetric chain", () => {
    let state = readySession();
    const initialEnergy = state.energy;

    state = inspectAndDiscover(state, "systems-1", "diagnostic-terminal", ["power-phase", "pulse-cadence"], 2_000);
    state = inspectAndDiscover(state, "signals-1", "signal-receiver", ["carrier-offset", "relay-polarity"], 2_100);
    expect(state.energy).toBe(initialEnergy);
    expect(canAttemptMechanism(state, scenario, state.players[0]!, "frequency-lock")).toBe(true);

    state = transitionGame(state, scenario, {
      type: "mechanism.attempt",
      playerId: "systems-1",
      mechanismId: "frequency-lock",
      answer: "7-3-1",
      actionId: "attempt-frequency-1",
      at: 3_000,
    });
    expect(state.solvedMechanismIds).toContain("frequency-lock");

    state = transitionGame(state, scenario, {
      type: "object.inspect",
      playerId: "signals-1",
      objectId: "signal-receiver",
      at: 3_100,
    });
    state = transitionGame(state, scenario, {
      type: "clue.discover",
      playerId: "signals-1",
      clueId: "routing-echo",
      at: 3_101,
    });
    state = transitionGame(state, scenario, {
      type: "mechanism.attempt",
      playerId: "signals-1",
      mechanismId: "network-auth",
      answer: "northstar",
      actionId: "attempt-network-1",
      at: 3_200,
    });
    expect(state.solvedMechanismIds).toContain("network-auth");

    state = transitionGame(state, scenario, {
      type: "object.inspect",
      playerId: "systems-1",
      objectId: "diagnostic-terminal",
      at: 3_300,
    });
    state = transitionGame(state, scenario, {
      type: "clue.discover",
      playerId: "systems-1",
      clueId: "restoration-sequence",
      at: 3_301,
    });
    state = transitionGame(state, scenario, {
      type: "mechanism.attempt",
      playerId: "systems-1",
      mechanismId: "relay-restoration",
      answer: "3719",
      actionId: "attempt-restoration-1",
      at: 3_400,
    });

    expect(state.phase).toBe("won");
    expect(state.outcome).toEqual({ kind: "victory", completedAt: 3_400 });
  });

  it("charges a failed consequential attempt once and deduplicates retries", () => {
    let state = readySession();
    state = inspectAndDiscover(state, "systems-1", "diagnostic-terminal", ["power-phase", "pulse-cadence"], 2_000);
    state = inspectAndDiscover(state, "signals-1", "signal-receiver", ["carrier-offset"], 2_100);
    const before = state.energy;
    const attempt = {
      type: "mechanism.attempt" as const,
      playerId: "systems-1",
      mechanismId: "frequency-lock",
      answer: "wrong",
      actionId: "same-action",
      at: 3_000,
    };
    state = transitionGame(state, scenario, attempt);
    expect(state.energy).toBe(before - 5);
    const replay = transitionGame(state, scenario, attempt);
    expect(replay).toBe(state);
    expect(replay.energy).toBe(before - 5);
  });

  it("does not expose answer keys or undiscovered private clues in player views", () => {
    let state = readySession();
    state = inspectAndDiscover(state, "systems-1", "diagnostic-terminal", ["power-phase"], 2_000);
    const systemsView = getPlayerScenarioView(state, scenario, "systems-1");
    const signalsView = getPlayerScenarioView(state, scenario, "signals-1");
    expect(systemsView).not.toBeNull();
    expect(JSON.stringify(systemsView)).not.toContain("NORTHSTAR");
    expect(JSON.stringify(systemsView)).not.toContain("acceptedAnswers");
    expect(systemsView?.discoveries.some((item) => item.clueId === "power-phase")).toBe(true);
    expect(signalsView?.discoveries.some((item) => item.clueId === "power-phase")).toBe(false);
  });

  it("enforces the six-player cap and rejects duplicate identities or unknown roles", () => {
    let state = createGameSession(scenario);
    for (let index = 0; index < 6; index += 1) {
      state = transitionGame(state, scenario, {
        type: "player.join",
        player: {
          id: `player-${index}`,
          displayName: `Player ${index}`,
          connected: true,
          roleId: index % 2 === 0 ? "systems" : "signals",
        },
      });
    }
    expect(state.players).toHaveLength(6);
    expect(transitionGame(state, scenario, {
      type: "player.join",
      player: { id: "seventh", displayName: "Seventh", connected: true, roleId: "systems" },
    })).toBe(state);
    expect(transitionGame(state, scenario, {
      type: "player.join",
      player: { id: "player-0", displayName: "Duplicate", connected: true, roleId: "systems" },
    })).toBe(state);
    expect(transitionGame(state, scenario, {
      type: "player.join",
      player: { id: "unknown-role", displayName: "Unknown", connected: true, roleId: "admin" },
    })).toBe(state);
  });

  it("does not charge locked or unauthorized attempts and gates hidden objects", () => {
    let state = readySession();
    const initialEnergy = state.energy;
    state = transitionGame(state, scenario, {
      type: "mechanism.attempt",
      playerId: "systems-1",
      mechanismId: "network-auth",
      answer: "NORTHSTAR",
      actionId: "locked-network",
      at: 2_000,
    });
    expect(state.energy).toBe(initialEnergy);
    expect(state.processedActionIds).not.toContain("locked-network");
    const signals = state.players.find((player) => player.id === "signals-1")!;
    expect(canDiscoverClue(state, scenario, signals, "power-phase")).toBe(false);
    expect(transitionGame(state, scenario, {
      type: "object.inspect",
      playerId: "signals-1",
      objectId: "diagnostic-terminal",
      at: 2_100,
    })).toBe(state);
  });

  it("unlocks the hidden network node only after the frequency mechanism is solved", () => {
    let state = readySession();
    const signals = state.players.find((player) => player.id === "signals-1")!;
    expect(canInspectObject(state, scenario, signals, "network-node")).toBe(false);
    state = inspectAndDiscover(state, "systems-1", "diagnostic-terminal", ["power-phase", "pulse-cadence"], 2_000);
    state = inspectAndDiscover(state, "signals-1", "signal-receiver", ["carrier-offset"], 2_100);
    state = transitionGame(state, scenario, {
      type: "mechanism.attempt",
      playerId: "systems-1",
      mechanismId: "frequency-lock",
      answer: "731",
      actionId: "unlock-network",
      at: 3_000,
    });
    expect(canInspectObject(state, scenario, signals, "network-node")).toBe(true);
  });

  it("loses when repeated distinct failed attempts exhaust shared energy", () => {
    let state = readySession();
    state = inspectAndDiscover(state, "systems-1", "diagnostic-terminal", ["power-phase", "pulse-cadence"], 2_000);
    state = inspectAndDiscover(state, "signals-1", "signal-receiver", ["carrier-offset"], 2_100);
    for (let index = 0; index < 20 && state.phase === "active"; index += 1) {
      state = transitionGame(state, scenario, {
        type: "mechanism.attempt",
        playerId: "systems-1",
        mechanismId: "frequency-lock",
        answer: "incorrect",
        actionId: `failed-${index}`,
        at: 3_000 + index,
      });
    }
    expect(state.energy).toBe(0);
    expect(state.phase).toBe("lost");
    expect(state.outcome?.kind).toBe("energy-depleted");
  });

  it("times out at the authoritative deadline and rejects post-terminal actions", () => {
    let state = readySession();
    expect(state.deadline).toBe(481_000);
    state = transitionGame(state, scenario, { type: "game.tick", at: 481_000 });
    expect(state.phase).toBe("lost");
    expect(state.outcome).toEqual({ kind: "timeout", completedAt: 481_000 });
    expect(transitionGame(state, scenario, { type: "game.tick", at: 482_000 })).toBe(state);
  });
});
