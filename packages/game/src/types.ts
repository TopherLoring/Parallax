/** Stable identifiers are strings at runtime; aliases keep domain APIs self-documenting. */
export type RoomId = string;
export type PlayerId = string;
export type PlayerRoleId = string;
export type GameObjectId = string;
export type ClueId = string;
export type DiscoveryId = string;
export type MechanismId = string;
export type ScenarioId = string;

export type GamePhase = "lobby" | "active" | "won" | "lost";

export interface Player {
  id: PlayerId;
  displayName: string;
  connected: boolean;
  /** Assigned by the server; never accepted as authoritative client input. */
  roleId?: PlayerRoleId;
}

export interface PlayerPerspective {
  id: PlayerRoleId;
  name: string;
  description: string;
  /** Server-side authorization scope, not a client-visible role definition. */
  visibleObjectIds: readonly GameObjectId[];
  visibleClueIds: readonly ClueId[];
  usableMechanismIds: readonly MechanismId[];
}

export interface GameObject {
  id: GameObjectId;
  name: string;
  description: string;
  areaId: string;
  inspectable: boolean;
  interactable: boolean;
}

export type DiscoveryVisibility =
  | { kind: "shared" }
  | { kind: "player"; playerIds: readonly PlayerId[] }
  | { kind: "role"; roleIds: readonly PlayerRoleId[] };

export type Prerequisite =
  | { kind: "clue-discovered"; clueId: ClueId; by?: "any-player" | "same-player" | "different-player" }
  | { kind: "object-discovered"; objectId: GameObjectId }
  | { kind: "mechanism-solved"; mechanismId: MechanismId }
  | { kind: "all"; requirements: readonly Prerequisite[] }
  | { kind: "any"; requirements: readonly Prerequisite[] };

export interface ClueDefinition {
  id: ClueId;
  title: string;
  content: string;
  sourceObjectId: GameObjectId;
  visibility: DiscoveryVisibility;
  prerequisites: readonly Prerequisite[];
}

export interface Discovery {
  id: DiscoveryId;
  clueId?: ClueId;
  title: string;
  content: string;
  discoveredBy: PlayerId;
  discoveredAt: number;
  sourceObjectId?: GameObjectId;
  visibility?: DiscoveryVisibility;
}

export interface MechanismDefinition {
  id: MechanismId;
  name: string;
  description: string;
  prerequisites: readonly Prerequisite[];
  /** Domain-level cost for a consequential failed attempt; evidence review is free. */
  failedAttemptEnergyCost: number;
  maxAttempts?: number;
}

export interface ResourcePool {
  energy: number;
  maxEnergy: number;
}

export interface GameTimer {
  startedAt: number;
  deadline: number;
}

export type GameOutcome =
  | { kind: "victory"; completedAt: number }
  | { kind: "timeout"; completedAt: number }
  | { kind: "energy-depleted"; completedAt: number };

export interface RoomState {
  phase: GamePhase;
  players: Player[];
  discoveries: Discovery[];
  energy: number;
  deadline: number | null;
  outcome: GameOutcome | null;
}

export type MechanismResult =
  | { success: true; mechanismId: MechanismId; unlockedObjectIds: readonly GameObjectId[] }
  | { success: false; mechanismId: MechanismId; reason: "incorrect" | "locked" | "unauthorized" | "unavailable" };

