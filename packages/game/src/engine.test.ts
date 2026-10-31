import { describe, expect, it } from "vitest";
import {
  canAttemptMechanism,
  canDiscoverClue,
  canInspectObject,
  createGameSession,
  evaluatePrerequisite,
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

function inspect(
  state: ReturnType<typeof readySession>,
  playerId: string,
  objectId: string,
  at: number,
) {
  return transitionGame(state, scenario, {
    type: "object.inspect",
    playerId,
    objectId,
    at,
  });
}

describe("authoritative scenario session engine", () => {
  it("requires two connected, ready players and all required roles before starting", () => {
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

  it("rejects a team that does not represent every scenario-critical role", () => {
    let state = createGameSession(scenario);
    for (const id of ["one", "two"]) {
      state = transitionGame(state, scenario, {
        type: "player.join",
        player: { id, displayName: id, connected: true, roleId: "systems" },
      });
      state = transitionGame(state, scenario, { type: "player.ready", playerId: id, ready: true });
    }
    expect(transitionGame(state, scenario, { type: "game.start", at: 500 }).phase).toBe("lobby");
  });

  it("reconnects a disconnected session without duplicating its player", () => {
    let state = readySession();
    state = transitionGame(state, scenario, { type: "player.leave", playerId: "signals-1" });
    expect(state.players.find((player) => player.id === "signals-1")?.connected).toBe(false);
    state = transitionGame(state, scenario, { type: "player.reconnect", playerId: "signals-1" });
    const reconnected = state.players.find((player) => player.id === "signals-1");
    expect(state.players).toHaveLength(2);
    expect(reconnected?.connected).toBe(true);
    expect(reconnected?.roleId).toBe("signals");
    expect(reconnected?.ready).toBe(false);
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

  it("evaluates same-player and different-player clue prerequisites", () => {
    let state = readySession();
    state = inspect(state, "systems-1", "diagnostic-terminal", 2_000);
    expect(evaluatePrerequisite(state, { kind: "clue-discovered", clueId: "power-phase", by: "same-player" }, "systems-1")).toBe(true);
    expect(evaluatePrerequisite(state, { kind: "clue-discovered", clueId: "power-phase", by: "different-player" }, "systems-1")).toBe(false);
    expect(evaluatePrerequisite(state, { kind: "clue-discovered", clueId: "power-phase", by: "different-player" }, "signals-1")).toBe(true);
  });

  it("keeps evidence inspection free and solves the complete asymmetric chain", () => {
    let state = readySession();
    const initialEnergy = state.energy;

    state = inspect(state, "systems-1", "diagnostic-terminal", 2_000);
    state = inspect(state, "signals-1", "signal-receiver", 2_100);
    expect(state.energy).toBe(initialEnergy);
    expect(state.discoveries.map((item) => item.clueId).filter(Boolean)).toEqual([
      "power-phase", "pulse-cadence", "carrier-offset", "relay-polarity",
    ]);
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

    // Re-inspection reveals the previously locked routing clue without a fee.
    state = inspect(state, "signals-1", "signal-receiver", 3_100);
    expect(state.discoveries.some((item) => item.clueId === "routing-echo")).toBe(true);
    state = transitionGame(state, scenario, {
      type: "mechanism.attempt",
      playerId: "signals-1",
      mechanismId: "network-auth",
      answer: "northstar",
      actionId: "attempt-network-1",
      at: 3_200,
    });
    expect(state.solvedMechanismIds).toContain("network-auth");

    // The recovery sequence becomes discoverable only after network authentication.
    state = inspect(state, "systems-1", "diagnostic-terminal", 3_300);
    expect(state.discoveries.some((item) => item.clueId === "restoration-sequence")).toBe(true);
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

  it("charges a failed consequential attempt once and deduplicates normalized retry keys", () => {
    let state = readySession();
    state = inspect(state, "systems-1", "diagnostic-terminal", 2_000);
    state = inspect(state, "signals-1", "signal-receiver", 2_100);
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
    const replay = transitionGame(state, scenario, { ...attempt, actionId: " same-action " });
    expect(replay).toBe(state);
    expect(replay.energy).toBe(before - 5);
  });

  it("projects visible object states without revealing another role's scene objects", () => {
    const state = readySession();
    const systemsView = getPlayerScenarioView(state, scenario, "systems-1")!;
    const signalsView = getPlayerScenarioView(state, scenario, "signals-1")!;

    expect(systemsView.objects.find((object) => object.id === "diagnostic-terminal")?.status).toBe("available");
    expect(systemsView.objects.find((object) => object.id === "restoration-array")?.status).toBe("locked");
    expect(systemsView.objects.some((object) => object.id === "signal-receiver")).toBe(false);

    expect(signalsView.objects.find((object) => object.id === "network-node")?.status).toBe("locked");
    expect(signalsView.objects.some((object) => object.id === "diagnostic-terminal")).toBe(false);
  });

  it("rejects guessed clue IDs from a player without the required perspective", () => {
    const state = readySession();
    const forged = transitionGame(state, scenario, {
      type: "clue.discover",
      playerId: "signals-1",
      clueId: "power-phase",
      at: 2_000,
    });
    expect(forged).toBe(state);
    const signalsView = getPlayerScenarioView(state, scenario, "signals-1")!;
    expect(JSON.stringify(signalsView)).not.toContain("power-phase");
  });

  it("does not expose answer keys or undiscovered private clues in player views", () => {
    let state = readySession();
    state = inspect(state, "systems-1", "diagnostic-terminal", 2_000);
    const systemsView = getPlayerScenarioView(state, scenario, "systems-1");
    const signalsView = getPlayerScenarioView(state, scenario, "signals-1");
    expect(systemsView).not.toBeNull();
    expect(JSON.stringify(systemsView)).not.toContain("NORTHSTAR");
    expect(JSON.stringify(systemsView)).not.toContain("acceptedAnswers");
    expect(systemsView?.discoveries.some((item) => item.clueId === "power-phase")).toBe(true);
    expect(signalsView?.discoveries.some((item) => item.clueId === "power-phase")).toBe(false);
    const journalEntry = systemsView?.discoveries.find((item) => item.clueId === "power-phase");
    expect(journalEntry).toMatchObject({
      sourceObjectId: "diagnostic-terminal",
      sourceObjectName: "Systems Diagnostic Terminal",
      discoveredByName: "Systems",
      discoveredAt: 2_000,
    });
  });

  it("enforces the six-connected-player cap and rejects duplicate identities or unknown roles", () => {
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
    state = transitionGame(state, scenario, { type: "player.leave", playerId: "player-0" });
    state = transitionGame(state, scenario, {
      type: "player.join",
      player: { id: "replacement", displayName: "Replacement", connected: true, roleId: "systems" },
    });
    expect(state.players.filter((player) => player.connected)).toHaveLength(6);
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
    state = inspect(state, "systems-1", "diagnostic-terminal", 2_000);
    state = inspect(state, "signals-1", "signal-receiver", 2_100);
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
    state = inspect(state, "systems-1", "diagnostic-terminal", 2_000);
    state = inspect(state, "signals-1", "signal-receiver", 2_100);
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
