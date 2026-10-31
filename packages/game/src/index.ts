export type GamePhase = "lobby" | "active" | "won" | "lost";

export interface Player {
  id: string;
  displayName: string;
  connected: boolean;
}

export interface Discovery {
  id: string;
  title: string;
  content: string;
  discoveredBy: string;
  discoveredAt: number;
}

export interface RoomState {
  phase: GamePhase;
  players: Player[];
  discoveries: Discovery[];
  energy: number;
  deadline: number | null;
}

export type GameAction =
  | { type: "player.join"; player: Player }
  | { type: "player.leave"; playerId: string }
  | { type: "discovery.record"; discovery: Discovery }
  | { type: "energy.spend"; amount: number }
  | { type: "game.start"; deadline: number }
  | { type: "game.win" }
  | { type: "game.lose" };

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
      if (state.phase !== "active" || !Number.isFinite(action.amount) || action.amount <= 0) return state;
      const energy = Math.max(0, state.energy - action.amount);
      return { ...state, energy, phase: energy === 0 ? "lost" : state.phase };
    }
    case "game.start":
      if (state.phase !== "lobby" || state.players.length < MIN_PLAYERS) return state;
      return { ...state, phase: "active", deadline: action.deadline };
    case "game.win":
      return state.phase === "active" ? { ...state, phase: "won" } : state;
    case "game.lose":
      return state.phase === "active" ? { ...state, phase: "lost" } : state;
  }
}
