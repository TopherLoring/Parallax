# Agent and contributor rules

These rules exist to prevent the class of issues we hit during the Colyseus 0.18 upgrade and the Vite/plugin-react mismatch.

## Dependency management

- Pin the Colyseus family together. `colyseus`, `@colyseus/schema`, and `@colyseus/sdk` must be on compatible majors. Do not mix 0.16 client with 0.18 server.
- Prefer exact versions or very narrow ranges for these packages. Floating `^` ranges are allowed for non-Colyseus deps only after the lockfile is committed and reviewed.
- Commit the lockfile. Dependency updates are explicit, reviewable changes — not something that happens implicitly on `bun install`.
- When upgrading Colyseus, do server, schema, and client in a single PR. Update every import (including type-only imports).

## Compatibility matrix (current)

| Package | Version |
|---------|---------|
| colyseus | ^0.18 |
| @colyseus/schema | ^5 |
| @colyseus/sdk | ^0.18 |
| vite | ^7 |
| @vitejs/plugin-react | 5.2.0 (6.x requires Vite 8) |

## Workflow

- Keep feature branches short-lived. Rebase or merge main into them frequently so they do not diverge into unmergeable state.
- Typecheck is necessary but not sufficient. A change that touches the web or server startup path should also be verified by starting the processes.
- Leftover imports from old package names (e.g. `colyseus.js` after switching to `@colyseus/sdk`) are bugs. Grep for them before opening a PR.

## CI expectations

- Quality Gates must stay green.
- Prefer adding a lightweight smoke check that starts the server and web processes for a few seconds when the change surface is large.
