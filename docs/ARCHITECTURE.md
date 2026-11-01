# Architecture

## Runtime topology

- Browser clients use HTTPS for assets, HTTP for room reservation endpoints, and WebSockets for live sessions.
- A Node.js Colyseus 0.16 server owns each room's authoritative state.
- `POST /api/rooms` creates a room and reserves the host's seat; `POST /api/rooms/join` resolves a six-character code and reserves a seat.
- The matchmaker is called server-side. Direct client matchmaking methods are restricted; clients consume server-issued seat reservations.
- The pure TypeScript game package owns the versioned scenario contract, puzzle rules, discovery authorization, deterministic session transitions, and recipient-safe player projections.
- The server imports the dedicated `@parallax/game/server-scenario` subpath. Browser code imports only the public game-domain entrypoint and must never import server scenario data.
- Room codes are six characters from an unambiguous alphabet and expire after 30 minutes. A process-local registry prevents collisions within the single supported server process; horizontal scaling requires a shared registry or a shared matchmaker driver with atomic uniqueness.
- Health endpoints: `GET /health/live` and `GET /health/ready`. Colyseus graceful shutdown flips readiness off before draining rooms.

## Trust boundaries

The browser is untrusted. It sends intentions such as ready, inspect object, or attempt mechanism. It does not decide whether an action is valid, assign a player ID or role, or determine what hidden information exists.

The room server:
1. Validates display-name and room-code requests.
2. Issues seat reservations and uses Colyseus session IDs as player identities.
3. Assigns the first required roles server-side.
4. Validates every room message with Zod.
5. Calls the game domain and applies valid state transitions.
6. Updates the synchronized public room state.
7. Builds and sends recipient-specific private projections.

## Shared versus private state

The synchronized Colyseus schema contains only:
- room phase and code;
- host session ID;
- public player identity, role label, connection and ready status;
- shared energy, deadline, and solved mechanism IDs.

It never contains:
- clue contents or discovery records;
- accepted answer arrays;
- hidden prerequisites;
- private object descriptions or future unlock data;
- the full scenario definition.

Private discoveries are sent with a per-client `game:view` message built by `getPlayerScenarioView`. Never broadcast that projection or put it in a globally synchronized schema.

## Session lifecycle

- Room create/join APIs use `matchMaker.createRoom` and `matchMaker.joinById` server-side.
- New players receive a server-generated Colyseus session ID and a server-assigned role.
- The first connected player is host; host authority controls mission start.
- A room starts only with at least two connected, ready players and all required roles represented.
- Started rooms are locked against new participants.
- Unexpected disconnects reserve the player's seat for 20 seconds. Reconnection preserves the session ID, role, and private discoveries; a permanent leave marks the player disconnected.
- Expired lobby codes reject new joins and disconnect unused lobby rooms; games already started continue, and their code remains reserved until room disposal.

## Domain boundaries

The game package must not import React, Colyseus, browser APIs, or Node server modules. It should be deterministic and testable with plain TypeScript inputs and outputs.

The room server is the only adapter between Colyseus and the pure game domain. Do not duplicate puzzle rules or authorization logic in room handlers.

## Deployment constraints

Deploy the web client as static assets and the Colyseus server as a persistent Node.js service with WebSocket support. Configure the browser's WebSocket and HTTP API URLs through environment variables. Configure `WEB_ORIGIN`/ `WEB_ORIGINS` for production CORS.

The current in-memory room-code registry supports one server process only. Before scaling horizontally, replace it with an atomic shared registry and configure Colyseus shared presence/driver infrastructure. Keep production secrets out of Git.
