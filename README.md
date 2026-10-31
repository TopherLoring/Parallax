# PARALLAX: The Shared Signal

A cooperative, real-time escape-room game built around asymmetric information, environmental discovery, and collaborative puzzle solving.

## Project status

**Foundation scaffold — gameplay implementation pending.**

## Stack

- TypeScript across the application
- React + Vite for the mobile-first browser client
- Colyseus + WebSockets for authoritative multiplayer rooms
- A framework-independent game domain package for puzzle rules and discovery
- Zod for runtime validation
- Vitest for unit tests and Playwright for browser-level verification
- Bun workspaces for package management and scripts

## Repository layout

```text
apps/
  server/       Colyseus room server
  web/          React browser client
packages/
  game/         Pure game domain, puzzle definitions, and validation
```

## Requirements

- Bun 1.2+
- Node.js 20.19+ or 22.12+

## Development

```bash
bun install
bun dev
```

The web client and room server run as separate workspace processes.

## Design principles

1. Players discover information by investigating the environment; clues are not simply handed out in timed batches.
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

See [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Security

Never send undiscovered clues, answer keys, hidden prerequisites, or future puzzle state to browser clients. Clients submit intentions; the server validates and returns only authorized state.
