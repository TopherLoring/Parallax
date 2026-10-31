import { Room, Client } from "colyseus";
import { createInitialRoomState, transition, type RoomState } from "@parallax/game";

interface JoinOptions {
  displayName?: string;
}

/**
 * Initial room lifecycle scaffold.
 * Private discovery projections and validated puzzle actions are intentionally
 * not implemented yet; do not treat this as production-ready multiplayer.
 */
export class ParallaxRoom extends Room {
  private domainState: RoomState = createInitialRoomState();

  onCreate() {
    this.maxClients = 6;
    this.setMetadata({ game: "parallax", phase: "lobby" });
    this.onMessage("ping", (client) => client.send("pong", { at: Date.now() }));
  }

  onJoin(client: Client, options: JoinOptions) {
    const displayName = (options.displayName ?? "Operator").trim().slice(0, 20) || "Operator";
    this.domainState = transition(this.domainState, {
      type: "player.join",
      player: { id: client.sessionId, displayName, connected: true },
    });
    this.broadcast("room:presence", {
      players: this.domainState.players.map(({ id, displayName: name, connected }) => ({ id, displayName: name, connected })),
    });
  }

  onLeave(client: Client) {
    this.domainState = transition(this.domainState, {
      type: "player.leave",
      playerId: client.sessionId,
    });
    this.broadcast("room:presence", {
      players: this.domainState.players.map(({ id, displayName, connected }) => ({ id, displayName, connected })),
    });
  }

  onDispose() {
    this.domainState = createInitialRoomState();
  }
}
