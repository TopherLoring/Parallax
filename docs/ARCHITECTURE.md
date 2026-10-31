# Architecture

## Runtime topology

- Browser clients use HTTPS for assets and WebSockets for live sessions.
- A Node.js Colyseus server owns each room's authoritative state.
- The pure TypeScript game package owns puzzle rules, discovery rules, and state transitions.
- SQLite is deferred until a concrete persistence requirement exists; the first playable slice should avoid unnecessary infrastructure.

## Trust boundaries

The browser is untrusted. It sends intentions such as inspect object, attempt mechanism, or ready. It does not decide whether an action is valid or what hidden information exists.

The room server:
1. Authenticates a room participant using a server-issued session identity.
2. Validates message shape and action permissions.
3. Calls the game domain.
4. Applies valid state transitions.
5. Builds recipient-specific state projections.
6. Broadcasts shared changes and sends private discoveries only to authorized recipients.

## Private information

Do not put private clues in a globally synchronized Colyseus schema and hide them only in the UI. That leaks information to every connected client.

Keep private discovery data server-side. Produce a separate authorized projection for each player. Add tests that inspect actual outbound payloads for clue leakage.

## Domain boundaries

The game package must not import React, Colyseus, browser APIs, or Node server modules. It should be deterministic and testable with plain TypeScript inputs and outputs.

## Initial deployment

Deploy the web client as static assets and the Colyseus server as a persistent Node.js service with WebSocket support. Configure the browser's server URL through environment variables. Keep production secrets out of Git.
