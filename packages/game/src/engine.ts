import type {
  Discovery,
  GameOutcome,
  GamePhase,
  Player,
} from "./types";
import type { PrerequisiteInput, ScenarioDefinition } from "./scenario";

export interface SessionPlayer extends Player {
  ready: boolean;
}

export interface GameSessionState {
  scenarioId: string;
  phase: GamePhase;
  players: SessionPlayer[];
  discoveries: Discovery[];
  solvedMechanismIds: string[];
  mechanismAttempts: Record<string, number>;
  processedActionIds: string[];
  energy: number;
  startedAt: number | null;
  deadline: number | null;
  outcome: GameOutcome | null;
}

export type GameSessionAction =
  | { type: "player.join"; player: Player }
  | { type: "player.leave"; playerId: string }
  | { type: "player.ready"; playerId: string; ready: boolean }
  | { type: "game.start"; at: number }
  | { type: "object.inspect"; playerId: string; objectId: string; at: number }
  | { type: "clue.discover"; playerId: string; clueId: string; at: number }
  | { type: "mechanism.attempt"; playerId: string; mechanismId: string; answer: string; actionId: string; at: number }
  | { type: "game.tick"; at: number };

export interface PlayerScenarioView {
  scenario: { id: string; title: string; description: string; durationSeconds: number };
  player: { id: string; displayName: string; role: { id: string; name: string; description: string } };
  phase: GamePhase;
  energy: number;
  deadline: number | null;
  solvedMechanismIds: string[];
  discoveries: Array<Pick<Discovery, "id" | "clueId" | "title" | "content" | "discoveredBy" | "discoveredAt">>;
  objects: Array<{ id: string; name: string; description: string; areaId: string }>;
  mechanisms: Array<{ id: string; name: string; description: string }>;
  actions: Array<{ id: string; kind: "inspect-object" | "attempt-mechanism"; label: string; targetId: string }>;
  outcome: GameOutcome | null;
}

export function createGameSession(scenario: ScenarioDefinition): GameSessionState {
  return {
    scenarioId: scenario.id,
    phase: "lobby",
    players: [],
    discoveries: [],
    solvedMechanismIds: [],
    mechanismAttempts: {},
    processedActionIds: [],
    energy: scenario.startingEnergy,
    startedAt: null,
    deadline: null,
    outcome: null,
  };
}

function findPlayer(state: GameSessionState, playerId: string): SessionPlayer | undefined {
  return state.players.find((player) => player.id === playerId && player.connected);
}

function findPerspective(scenario: ScenarioDefinition, player: Player) {
  return scenario.perspectives.find((perspective) => perspective.id === player.roleId);
}

function isVisibleToPlayer(
  visibility: { kind: "shared" } | { kind: "player"; playerIds: readonly string[] } | { kind: "role"; roleIds: readonly string[] },
  player: Player,
): boolean {
  if (visibility.kind === "shared") return true;
  if (visibility.kind === "player") return visibility.playerIds.includes(player.id);
  return Boolean(player.roleId && visibility.roleIds.includes(player.roleId));
}

function isDiscovered(state: GameSessionState, id: string): boolean {
  return state.discoveries.some((discovery) => discovery.id === id);
}

export function evaluatePrerequisite(
  state: GameSessionState,
  requirement: PrerequisiteInput,
  playerId?: string,
): boolean {
  switch (requirement.kind) {
    case "clue-discovered": {
      const discovery = state.discoveries.find((item) => item.clueId === requirement.clueId);
      if (!discovery) return false;
      if (requirement.by === "same-player") return Boolean(playerId && discovery.discoveredBy === playerId);
      if (requirement.by === "different-player") return Boolean(playerId && discovery.discoveredBy !== playerId);
      return true;
    }
    case "object-discovered":
      return isDiscovered(state, `object:${requirement.objectId}`);
    case "mechanism-solved":
      return state.solvedMechanismIds.includes(requirement.mechanismId);
    case "all":
      return requirement.requirements.every((child) => evaluatePrerequisite(state, child, playerId));
    case "any":
      return requirement.requirements.some((child) => evaluatePrerequisite(state, child, playerId));
  }
}

function prerequisitesMet(
  state: GameSessionState,
  requirements: readonly PrerequisiteInput[],
  playerId: string,
): boolean {
  return requirements.every((requirement) => evaluatePrerequisite(state, requirement, playerId));
}

function isObjectUnlocked(scenario: ScenarioDefinition, state: GameSessionState, objectId: string): boolean {
  const unlockingMechanisms = scenario.mechanisms.filter((mechanism) => mechanism.unlockObjectIds.includes(objectId));
  return unlockingMechanisms.length === 0 || unlockingMechanisms.some((mechanism) => state.solvedMechanismIds.includes(mechanism.id));
}

export function canInspectObject(
  state: GameSessionState,
  scenario: ScenarioDefinition,
  player: Player,
  objectId: string,
): boolean {
  const perspective = findPerspective(scenario, player);
  const object = scenario.objects.find((item) => item.id === objectId);
  const inspectActions = scenario.actions.filter(
    (action) => action.kind === "inspect-object" && action.targetObjectId === objectId,
  );
  return Boolean(
    perspective &&
    object &&
    object.inspectable &&
    perspective.visibleObjectIds.includes(objectId) &&
    isVisibleToPlayer(object.visibility, player) &&
    isObjectUnlocked(scenario, state, objectId) &&
    inspectActions.some((action) => prerequisitesMet(state, action.prerequisites, player.id)),
  );
}

export function canDiscoverClue(
  state: GameSessionState,
  scenario: ScenarioDefinition,
  player: Player,
  clueId: string,
): boolean {
  if (state.phase !== "active") return false;
  const perspective = findPerspective(scenario, player);
  const clue = scenario.clues.find((item) => item.id === clueId);
  if (!perspective || !clue || !perspective.visibleClueIds.includes(clueId)) return false;
  if (!isVisibleToPlayer(clue.visibility, player)) return false;
  if (!canInspectObject(state, scenario, player, clue.sourceObjectId)) return false;
  if (!isDiscovered(state, `object:${clue.sourceObjectId}`)) return false;
  return prerequisitesMet(state, clue.prerequisites, player.id);
}

export function canAttemptMechanism(
  state: GameSessionState,
  scenario: ScenarioDefinition,
  player: Player,
  mechanismId: string,
): boolean {
  if (state.phase !== "active") return false;
  const perspective = findPerspective(scenario, player);
  const mechanism = scenario.mechanisms.find((item) => item.id === mechanismId);
  if (!perspective || !mechanism || !perspective.usableMechanismIds.includes(mechanismId)) return false;
  if (state.solvedMechanismIds.includes(mechanismId)) return false;
  const attemptActions = scenario.actions.filter(
    (action) => action.kind === "attempt-mechanism" && action.targetMechanismId === mechanismId,
  );
  return prerequisitesMet(state, mechanism.prerequisites, player.id) &&
    attemptActions.some((action) => prerequisitesMet(state, action.prerequisites, player.id));
}

function withDiscovery(
  state: GameSessionState,
  discovery: Discovery,
): GameSessionState {
  if (isDiscovered(state, discovery.id)) return state;
  return { ...state, discoveries: [...state.discoveries, discovery] };
}

function terminal(
  state: GameSessionState,
  phase: "won" | "lost",
  outcome: GameOutcome,
): GameSessionState {
  return { ...state, phase, outcome };
}

function normalizeAnswer(answer: string): string {
  return answer.trim().toLocaleUpperCase("en-US").replace(/\s+/g, "");
}

export function transitionGame(
  state: GameSessionState,
  scenario: ScenarioDefinition,
  action: GameSessionAction,
): GameSessionState {
  if (state.scenarioId !== scenario.id) return state;

  switch (action.type) {
    case "player.join": {
      if (state.phase !== "lobby" || state.players.length >= 6) return state;
      if (state.players.some((player) => player.id === action.player.id)) return state;
      if (!scenario.perspectives.some((perspective) => perspective.id === action.player.roleId)) return state;
      const displayName = action.player.displayName.trim().slice(0, 20);
      if (!displayName) return state;
      return {
        ...state,
        players: [...state.players, { ...action.player, displayName, ready: false }],
      };
    }
    case "player.leave":
      if (!state.players.some((player) => player.id === action.playerId && player.connected)) return state;
      return {
        ...state,
        players: state.players.map((player) =>
          player.id === action.playerId ? { ...player, connected: false, ready: false } : player,
        ),
      };
    case "player.ready": {
      if (state.phase !== "lobby" || !findPlayer(state, action.playerId)) return state;
      return {
        ...state,
        players: state.players.map((player) =>
          player.id === action.playerId ? { ...player, ready: action.ready } : player,
        ),
      };
    }
    case "game.start": {
      const connected = state.players.filter((player) => player.connected);
      if (
        state.phase !== "lobby" ||
        connected.length < 2 ||
        connected.some((player) => !player.ready) ||
        scenario.requiredRoleIds.some((roleId) => !connected.some((player) => player.roleId === roleId)) ||
        !Number.isFinite(action.at)
      ) return state;
      return {
        ...state,
        phase: "active",
        startedAt: action.at,
        deadline: action.at + scenario.durationSeconds * 1_000,
        outcome: null,
      };
    }
    case "object.inspect": {
      if (state.phase !== "active" || !Number.isFinite(action.at)) return state;
      const player = findPlayer(state, action.playerId);
      if (!player || !canInspectObject(state, scenario, player, action.objectId)) return state;
      const object = scenario.objects.find((item) => item.id === action.objectId);
      if (!object) return state;
      return withDiscovery(state, {
        id: `object:${object.id}`,
        title: object.name,
        content: object.description,
        discoveredBy: player.id,
        discoveredAt: action.at,
        visibility: object.visibility,
      });
    }
    case "clue.discover": {
      if (state.phase !== "active" || !Number.isFinite(action.at)) return state;
      const player = findPlayer(state, action.playerId);
      const clue = scenario.clues.find((item) => item.id === action.clueId);
      if (!player || !clue || !canDiscoverClue(state, scenario, player, clue.id)) return state;
      return withDiscovery(state, {
        id: `clue:${clue.id}`,
        clueId: clue.id,
        title: clue.title,
        content: clue.content,
        discoveredBy: player.id,
        discoveredAt: action.at,
        visibility: clue.visibility,
      });
    }
    case "mechanism.attempt": {
      if (
        state.phase !== "active" ||
        !Number.isFinite(action.at) ||
        !action.actionId.trim() ||
        state.processedActionIds.includes(action.actionId)
      ) return state;
      const player = findPlayer(state, action.playerId);
      const mechanism = scenario.mechanisms.find((item) => item.id === action.mechanismId);
      if (!player || !mechanism || !canAttemptMechanism(state, scenario, player, mechanism.id)) return state;

      const attempts = (state.mechanismAttempts[mechanism.id] ?? 0) + 1;
      const processedActionIds = [...state.processedActionIds, action.actionId];
      const mechanismAttempts = { ...state.mechanismAttempts, [mechanism.id]: attempts };
      const correct = mechanism.acceptedAnswers.some(
        (accepted) => normalizeAnswer(accepted) === normalizeAnswer(action.answer),
      );

      if (correct) {
        const solvedMechanismIds = [...state.solvedMechanismIds, mechanism.id];
        const next = { ...state, mechanismAttempts, processedActionIds, solvedMechanismIds };
        const won = scenario.winCondition.every((requirement) => evaluatePrerequisite(next, requirement, player.id));
        return won
          ? terminal(next, "won", { kind: "victory", completedAt: action.at })
          : next;
      }

      const energy = Math.max(0, state.energy - mechanism.failedAttemptEnergyCost);
      const next = { ...state, mechanismAttempts, processedActionIds, energy };
      return energy === 0 && scenario.failureConditions.includes("energy-depleted")
        ? terminal(next, "lost", { kind: "energy-depleted", completedAt: action.at })
        : next;
    }
    case "game.tick":
      if (state.phase !== "active" || !scenario.failureConditions.includes("timeout") || state.deadline === null || !Number.isFinite(action.at) || action.at < state.deadline) return state;
      return terminal(state, "lost", { kind: "timeout", completedAt: action.at });
  }
}

export function getPlayerScenarioView(
  state: GameSessionState,
  scenario: ScenarioDefinition,
  playerId: string,
): PlayerScenarioView | null {
  const player = findPlayer(state, playerId);
  if (!player) return null;
  const perspective = findPerspective(scenario, player);
  if (!perspective) return null;

  const discoveries = state.discoveries.filter((item) => isVisibleToPlayer(item.visibility ?? { kind: "shared" }, player));
  const objects = scenario.objects
    .filter((object) => canInspectObject(state, scenario, player, object.id))
    .map(({ id, name, description, areaId }) => ({ id, name, description, areaId }));
  const mechanisms = scenario.mechanisms
    .filter((mechanism) => canAttemptMechanism(state, scenario, player, mechanism.id))
    .map(({ id, name, description }) => ({ id, name, description }));
  const actions = state.phase === "active" ? scenario.actions.flatMap((action) => {
    if (action.kind === "inspect-object") {
      const object = scenario.objects.find((item) => item.id === action.targetObjectId);
      if (!object || !canInspectObject(state, scenario, player, object.id)) return [];
      if (!prerequisitesMet(state, action.prerequisites, player.id)) return [];
      return [{ id: action.id, kind: action.kind, label: action.label, targetId: action.targetObjectId }];
    }
    const mechanism = scenario.mechanisms.find((item) => item.id === action.targetMechanismId);
    if (!mechanism || !canAttemptMechanism(state, scenario, player, mechanism.id)) return [];
    if (!prerequisitesMet(state, action.prerequisites, player.id)) return [];
    return [{ id: action.id, kind: action.kind, label: action.label, targetId: action.targetMechanismId }];
  }) : [];

  return {
    scenario: {
      id: scenario.id,
      title: scenario.title,
      description: scenario.description,
      durationSeconds: scenario.durationSeconds,
    },
    player: {
      id: player.id,
      displayName: player.displayName,
      role: { id: perspective.id, name: perspective.name, description: perspective.description },
    },
    phase: state.phase,
    energy: state.energy,
    deadline: state.deadline,
    solvedMechanismIds: [...state.solvedMechanismIds],
    discoveries: discoveries.map(({ id, clueId, title, content, discoveredBy, discoveredAt }) => ({
      id, clueId, title, content, discoveredBy, discoveredAt,
    })),
    objects,
    mechanisms,
    actions,
    outcome: state.outcome,
  };
}
