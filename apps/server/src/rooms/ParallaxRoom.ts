import { Room, type Client } from "colyseus";
import {
  canAttemptMechanism,
  canInspectObject,
  createGameSession,
  getPlayerScenarioView,
  transitionGame,
  type GameSessionState,
  type SessionPlayer,
} from "@parallax/game";
import { activeScenario } from "../scenario";
import { ParallaxPublicState, PublicPlayerState } from "../publicState";
import { roomCodeRegistry } from "../roomCodes";
import {
  attemptMessageSchema,
  emptyMessageSchema,
  inspectMessageSchema,
  joinOptionsSchema,
  roomCreateOptionsSchema,
  readyMessageSchema,
  startMessageSchema,
} from "../messages";

export class ParallaxRoom extends Room<ParallaxPublicState> {
  state = new ParallaxPublicState();
  private domainState: GameSessionState = createGameSession(activeScenario);
  private roomCode = "";
  private expiresAt = 0;
  private hostPlayerId = "";

  async onCreate(options: unknown) {
    const parsed = roomCreateOptionsSchema.parse(options);
    this.roomCode = parsed.roomCode;
    this.expiresAt = parsed.expiresAt;
    this.maxClients = 6;
    await this.setMetadata({
      game: "parallax",
      roomCode: this.roomCode,
      expiresAt: this.expiresAt,
      phase: "lobby",
    });

    this.clock.setTimeout(() => {
      if (Date.now() < this.expiresAt || this.domainState.phase !== "lobby") return;
      this.lock();
      void this.disconnect();
    }, Math.max(0, this.expiresAt - Date.now()));

    this.onMessage("ping", (client, payload) => {
      if (!emptyMessageSchema.safeParse(payload ?? {}).success) return this.sendError(client, "invalid_ping_message");
      client.send("pong", { at: Date.now() });
    });
    this.onMessage("sync", (client, payload) => {
      if (!emptyMessageSchema.safeParse(payload ?? {}).success) return this.sendError(client, "invalid_sync_message");
      this.sendPlayerView(client);
    });
    this.onMessage("ready", (client, payload) => this.handleReady(client, payload));
    this.onMessage("start", (client, payload) => this.handleStart(client, payload));
    this.onMessage("inspect", (client, payload) => this.handleInspect(client, payload));
    this.onMessage("attempt", (client, payload) => this.handleAttempt(client, payload));
    this.syncState();
  }

  onAuth(_client: Client, options: unknown) {
    if (this.domainState.phase !== "lobby") throw new Error("room_already_started");
    if (Date.now() >= this.expiresAt) throw new Error("room_expired");
    joinOptionsSchema.parse(options);
    return true;
  }

  onJoin(client: Client, options: unknown) {
    const parsed = joinOptionsSchema.parse(options);
    const connected = this.domainState.players.filter((player) => player.connected);
    const assignedRoleId = this.assignRole(connected);
    const next = transitionGame(this.domainState, activeScenario, {
      type: "player.join",
      player: {
        id: client.sessionId,
        displayName: parsed.displayName,
        connected: true,
        roleId: assignedRoleId,
      },
    });
    if (next === this.domainState) throw new Error("unable_to_join_room");
    this.domainState = next;
    if (!this.hostPlayerId) this.hostPlayerId = client.sessionId;
    this.syncState();
  }

  async onLeave(client: Client, consented: boolean) {
    this.domainState = transitionGame(this.domainState, activeScenario, {
      type: "player.leave",
      playerId: client.sessionId,
    });
    if (this.hostPlayerId === client.sessionId) {
      this.hostPlayerId = this.domainState.players.find((player) => player.connected)?.id ?? "";
    }
    this.syncState();

    if (consented) return;
    try {
      await this.allowReconnection(client, 20);
      this.domainState = transitionGame(this.domainState, activeScenario, {
        type: "player.reconnect",
        playerId: client.sessionId,
      });
      if (!this.hostPlayerId) this.hostPlayerId = client.sessionId;
      this.syncState();
    } catch {
      // The player remains disconnected after the 20-second reservation expires.
      this.syncState();
    }
  }

  onDispose() {
    roomCodeRegistry.release(this.roomCode);
    this.domainState = createGameSession(activeScenario);
  }

  private assignRole(connected: readonly SessionPlayer[]): string {
    const present = new Set(connected.map((player) => player.roleId).filter(Boolean));
    const required = activeScenario.requiredRoleIds.find((roleId) => !present.has(roleId));
    if (required) return required;
    const next = activeScenario.perspectives[connected.length % activeScenario.perspectives.length];
    if (!next) throw new Error("scenario_has_no_assignable_roles");
    return next.id;
  }

  private handleReady(client: Client, payload: unknown) {
    const parsed = readyMessageSchema.safeParse(payload);
    if (!parsed.success) return this.sendError(client, "invalid_ready_message");
    const next = transitionGame(this.domainState, activeScenario, {
      type: "player.ready",
      playerId: client.sessionId,
      ready: parsed.data.ready,
    });
    if (next === this.domainState) return this.sendError(client, "ready_not_allowed");
    this.domainState = next;
    this.syncState();
  }

  private handleStart(client: Client, payload: unknown) {
    const parsed = startMessageSchema.safeParse(payload ?? {});
    if (!parsed.success) return this.sendError(client, "invalid_start_message");
    if (client.sessionId !== this.hostPlayerId) return this.sendError(client, "host_only");
    const next = transitionGame(this.domainState, activeScenario, {
      type: "game.start",
      at: Date.now(),
    });
    if (next === this.domainState) return this.sendError(client, "players_not_ready_or_roles_missing");
    this.domainState = next;
    this.lock();
    this.syncState();
  }

  private handleInspect(client: Client, payload: unknown) {
    const parsed = inspectMessageSchema.safeParse(payload);
    if (!parsed.success) return this.sendError(client, "invalid_inspect_message");
    const player = this.domainState.players.find((item) => item.id === client.sessionId && item.connected);
    if (this.domainState.phase !== "active" || !player || !canInspectObject(this.domainState, activeScenario, player, parsed.data.objectId)) {
      return this.sendError(client, "object_unavailable");
    }
    this.domainState = transitionGame(this.domainState, activeScenario, {
      type: "object.inspect",
      playerId: client.sessionId,
      objectId: parsed.data.objectId,
      at: Date.now(),
    });
    this.syncState();
  }

  private handleAttempt(client: Client, payload: unknown) {
    const parsed = attemptMessageSchema.safeParse(payload);
    if (!parsed.success) return this.sendError(client, "invalid_attempt_message");
    const { mechanismId, answer, actionId } = parsed.data;
    if (this.domainState.processedActionIds.includes(actionId)) {
      client.send("game:ack", { actionId, duplicate: true });
      return;
    }
    const player = this.domainState.players.find((item) => item.id === client.sessionId && item.connected);
    if (!player || !canAttemptMechanism(this.domainState, activeScenario, player, mechanismId)) {
      return this.sendError(client, "mechanism_unavailable");
    }

    const energyBefore = this.domainState.energy;
    const solvedBefore = this.domainState.solvedMechanismIds.includes(mechanismId);
    const next = transitionGame(this.domainState, activeScenario, {
      type: "mechanism.attempt",
      playerId: client.sessionId,
      mechanismId,
      answer,
      actionId,
      at: Date.now(),
    });
    if (next === this.domainState) return this.sendError(client, "attempt_rejected");
    this.domainState = next;
    const solved = !solvedBefore && next.solvedMechanismIds.includes(mechanismId);
    client.send("game:attempt-result", {
      actionId,
      mechanismId,
      result: solved ? "solved" : next.energy < energyBefore ? "incorrect" : "accepted",
      energy: next.energy,
      phase: next.phase,
    });
    this.syncState();
  }

  private sendPlayerView(client: Client) {
    const view = getPlayerScenarioView(this.domainState, activeScenario, client.sessionId);
    if (view) client.send("game:view", view);
  }

  private sendError(client: Client, code: string) {
    client.send("game:error", { code });
  }

  private syncState() {
    const state = this.state;
    state.phase = this.domainState.phase;
    state.roomCode = this.roomCode;
    state.hostPlayerId = this.hostPlayerId;
    state.scenarioTitle = activeScenario.title;
    state.energy = this.domainState.energy;
    state.deadline = this.domainState.deadline ?? 0;

    state.players.splice(0, state.players.length);
    for (const player of this.domainState.players) {
      const publicPlayer = new PublicPlayerState();
      publicPlayer.id = player.id;
      publicPlayer.displayName = player.displayName;
      publicPlayer.roleName = activeScenario.perspectives.find((role) => role.id === player.roleId)?.name ?? "Operator";
      publicPlayer.connected = player.connected;
      publicPlayer.ready = player.ready;
      state.players.push(publicPlayer);
    }

    state.solvedMechanismIds.splice(0, state.solvedMechanismIds.length);
    for (const mechanismId of this.domainState.solvedMechanismIds) {
      state.solvedMechanismIds.push(mechanismId);
    }

    // Never broadcast scenario definitions or raw domain state.
    for (const client of this.clients) {
      this.sendPlayerView(client);
    }
  }
}
