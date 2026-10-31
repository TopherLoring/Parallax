import type { Discovery, GamePhase, Player, RoomState } from "./types";

export type {
  ClueDefinition,
  ClueId,
  Discovery,
  DiscoveryId,
  DiscoveryVisibility,
  GameObject,
  GameObjectId,
  GameOutcome,
  GamePhase,
  GameTimer,
  MechanismDefinition,
  MechanismId,
  MechanismResult,
  Player,
  PlayerId,
  PlayerPerspective,
  PlayerRoleId,
  Prerequisite,
  ResourcePool,
  RoomId,
  RoomState,
  ScenarioId,
} from "./types";

export type GameAction =
  | { type: "player.join"; player: Player }
  | { type: "player.leave"; playerId: string }
  | { type: "discovery.record"; discovery: Discovery }
  | { type: "energy.spend"; amount: number; at: number }
  | { type: "game.start"; deadline: number }
  | { type: "game.win"; at: number }
  | { type: "game.lose"; at: number };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const STARTING_ENERGY = 100;

export function createInitialRoomState(): RoomState {
  return {
    phase: "lobby",
    players: [],
    discoveries: [],
    energy: STARTING_ENERGY,
    deadline: null,
    outcome: null,
  };
}

/** Pure domain transition. Network authorization belongs to the room server. */
export function transition(state: RoomState, action: GameAction): RoomState {
  switch (action.type) {
    case "player.join": {
      if (state.phase !== "lobby" || state.players.length >= MAX_PLAYERS) return state;
      if (state.players.some((player) => player.id === action.player.id)) return state;
      return { ...state, players: [...state.players, action.player] };
    }
    case "player.leave":
      return {
        ...state,
        players: state.players.map((player) =>
          player.id === action.playerId ? { ...player, connected: false } : player,
        ),
      };
    case "discovery.record":
      if (state.phase !== "active" || state.discoveries.some((item) => item.id === action.discovery.id)) return state;
      return { ...state, discoveries: [...state.discoveries, action.discovery] };
    case "energy.spend": {
      if (state.phase !== "active" || !Number.isFinite(action.amount) || action.amount <= 0 || !Number.isFinite(action.at)) return state;
      const energy = Math.max(0, state.energy - action.amount);
      return {
        ...state,
        energy,
        phase: energy === 0 ? "lost" : state.phase,
        outcome: energy === 0 ? { kind: "energy-depleted", completedAt: action.at } : state.outcome,
      };
    }
    case "game.start":
      if (state.phase !== "lobby" || state.players.length < MIN_PLAYERS) return state;
      return { ...state, phase: "active", deadline: action.deadline, outcome: null };
    case "game.win":
      return state.phase === "active" && Number.isFinite(action.at)
        ? { ...state, phase: "won", outcome: { kind: "victory", completedAt: action.at } }
        : state;
    case "game.lose":
      return state.phase === "active" && Number.isFinite(action.at)
        ? { ...state, phase: "lost", outcome: { kind: "timeout", completedAt: action.at } }
        : state;
  }
}
