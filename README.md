# PARALLAX: The Shared Signal

A cooperative, real-time escape-room game built around asymmetric information, environmental discovery, and collaborative puzzle solving.

## Project status

**M1 domain implementation and M2 multiplayer room flow are implemented on stacked milestone branches.** The game package contains the versioned Shared Signal scenario, deterministic session transitions, private player projections, and progression tests. The M2 branch adds room-code matchmaking, server-issued identity/roles, validated messages, synchronized public state, private room views, lobby/game UI, health reporting, and short-window reconnection. Consolidated local verification and browser/device acceptance testing are still pending.

## Stack

- TypeScript across the application
- React + Vite for the mobile-first browser client
- Colyseus 0.16 + WebSockets for authoritative multiplayer rooms
- A framework-independent game domain package for puzzle rules and discovery
- Zod for runtime validation
- Vitest for game-domain tests; Node's built-in test runner for server tests. Browser/device acceptance testing is pending.
- Bun workspaces for package management and scripts

## Repository layout

```text
apps/
  server/       Colyseus room server, matchmaking API, health endpoints
  web/          React browser client and live room UI
packages/
  game/         Pure game domain, scenario schema, and server-owned scenario data
```

## Requirements

- Bun 1.4.0
- Node.js 20.19+ or 22.12+

## Development

```bash
bun install
bun dev
```

The web client runs on `http://localhost:5173`; the Colyseus HTTP/WebSocket server runs on `http://localhost:2567`.

Optional environment overrides:

- `apps/server/.env`: `PORT`, `WEB_ORIGIN` (or comma-separated `WEB_ORIGINS`)
- `apps/web/.env`: `VITE_GAME_SERVER_URL` and `VITE_GAME_SERVER_HTTP_URL`

```bash
bun run typecheck
bun run test
bun run build
```

## Multiplayer behavior

- Create or join a six-character room code; codes use an unambiguous alphabet and expire after 30 minutes.
- Rooms support 2–6 connected players.
- The server issues player session IDs, host status, and role assignments. Client payloads cannot set IDs or roles.
- The first two required roles are assigned before the room can start.
- Public Colyseus state contains player presence, readiness, room phase, shared energy, and solved mechanism IDs only.
- Role identity, private discoveries, and authorized player views are delivered only through per-client messages, never the shared state schema.
- The control-room scene shows only perspective-authorized objects with available/locked/used states; the personal evidence journal records source, discovery time, and discoverer, with free revisit.
- Unexpected disconnects reserve a seat for 20 seconds; the tab-scoped reconnection token supports reload recovery.
- The server maintains the countdown and publishes remaining seconds. The final restoration requires the Systems Operator to enter the recovery sequence and the Signal Analyst to confirm it; the host can start a rematch after a terminal result.
- Current room-code collision protection is process-local. Run one server instance until a shared presence/driver-backed registry is introduced.

## Design principles

1. Players discover information by investigating the environment; clues are revealed only when their source and prerequisites are available.
2. Each player receives only the discoveries and interfaces they are authorized to access.
3. Progress depends on combining information across players.
4. The server is authoritative for puzzle state, discovery permissions, validation, resources, and outcomes.
5. Puzzle content is data-driven and independent of the networking framework.
6. Every milestone must pass its acceptance tests before the next is considered complete.

## Milestones

1. Game engine and solvable puzzle specification
2. Room lifecycle, player identity, and synchronized state
3. Inspectable objects, private discoveries, prerequisites, and unlocks
4. Complete game loop: timer, shared energy, progression, victory, and failure
5. Multiplayer, privacy, reconnect, and adversarial-action testing
6. Mobile/desktop polish and production deployment
7. Demo and Handshake submission assets

See [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and the server-only [canonical Shared Signal playthrough](docs/SCENARIO_SHARED_SIGNAL.md).

## Security

Never send undiscovered clues, answer keys, hidden prerequisites, or future puzzle state to browser clients. Clients submit intentions; the server validates and returns only authorized state.
