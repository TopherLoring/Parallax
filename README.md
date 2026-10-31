# PARALLAX: The Shared Signal

A cooperative, real-time escape-room game built around asymmetric information, environmental discovery, and collaborative puzzle solving.

## Project status

**M1–M5 implementation work is in place on one stacked branch per milestone.** The game now includes the versioned Shared Signal scenario, deterministic progression, role-private exploration, a two-player final restoration, authoritative countdown/energy, terminal outcomes, reconnect/rematch, multiplayer integration coverage, rate limits, structured logs, and CI quality gates. M6 adds responsive/accessibility polish and deployment configuration. The consolidated quality gates, live integration execution, and public-device acceptance have not yet been run; do not treat the current branches as release-verified.

## Stack

- TypeScript across the application
- React + Vite for the mobile-first browser client
- Colyseus 0.16 + WebSockets for authoritative multiplayer rooms
- A framework-independent game domain package for puzzle rules and discovery
- Zod for runtime validation
- Vitest for game-domain tests; Node's built-in test runner for server tests. Browser/device acceptance testing is pending.
- Bun workspaces for package management and scripts
- GitHub Actions for typecheck, unit/integration tests, and production builds

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
- Production examples: `apps/server/.env.production.example` and `apps/web/.env.production.example`

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
6. Keep exactly one working branch per milestone; stack the next milestone on the previous one. A milestone is not release-ready until its acceptance tests pass.

## Milestones

1. Game engine and solvable puzzle specification
2. Room lifecycle, player identity, and synchronized state
3. Inspectable objects, private discoveries, prerequisites, and unlocks
4. Complete game loop: timer, shared energy, progression, victory, and failure
5. Multiplayer, privacy, reconnect, and adversarial-action testing
6. Mobile/desktop polish and production deployment
7. Demo and Handshake submission assets

See [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/VISUAL_SYSTEM.md](docs/VISUAL_SYSTEM.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), and the server-only [canonical Shared Signal playthrough](docs/SCENARIO_SHARED_SIGNAL.md).

## Security

Never send undiscovered clues, answer keys, hidden prerequisites, role identities, or future puzzle state through public synchronized state. Clients submit intentions; the server validates and returns only authorized per-player state. Room messages are rate-limited, WebSocket payloads are capped at 8 KiB, and operational logs use an explicit safe-field allowlist.
