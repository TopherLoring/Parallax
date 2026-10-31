# The Shared Signal — Canonical Playthrough

> Server-only design reference. This document contains the intended solution and answer keys. Never expose it through client routes, browser bundles, room state, or public API responses.

## Scenario contract

- Scenario ID: `shared-signal`
- Schema version: `1`
- Players: 2–6; the intended minimum is two distinct roles.
- Time limit: 8 minutes.
- Shared energy: 100.
- Failure: timer expires or energy reaches zero.
- Victory: the `relay-restoration` mechanism is solved.

## Role split

| Systems Operator | Signal Analyst |
|---|---|
| Power phase = 3 | Carrier offset = 7 |
| Pulse cadence = 1 | Routing echo = NORTHSTAR |
| Restoration sequence = 3-7-1-9 | Positive relay polarity |

Neither role can independently complete the chain. The first lock requires facts from both roles. The second stage requires the Analyst's routing echo after the first lock. The final stage requires the Operator's recovery sequence and the Analyst's polarity confirmation.

## Intended progression

1. Both players join and receive distinct server-assigned roles.
2. Systems Operator inspects the diagnostic terminal and discovers `power-phase` and `pulse-cadence`.
3. Signal Analyst inspects the receiver and discovers `carrier-offset` and `relay-polarity`.
4. The team combines offset 7, phase 3, cadence 1 and enters **731** (canonical display: `7-3-1`) at the Frequency Lock.
5. The server validates the answer. On success, it marks `frequency-lock` solved and reveals the Hidden Network Node. On failure, charge 5 energy, subject to the action's idempotency key.
6. Signal Analyst inspects the receiver's now-available routing echo and discovers `routing-echo` (NORTHSTAR).
7. The team authenticates the Hidden Network Node using **NORTHSTAR**. On success, the Restoration Array becomes available. On failure, charge 8 energy.
8. Systems Operator reads the now-available restoration note and discovers `restoration-sequence` (3-7-1-9).
9. Signal Analyst confirms `relay-polarity` (positive). Both facts are required for the final mechanism.
10. The team enters **3719** (canonical display: `3-7-1-9`) at Relay Restoration. On success, the room transitions to victory. A failed consequential attempt costs 10 energy.

## Answer key (server only)

| Mechanism | Accepted answers | Failure cost |
|---|---|---:|---:|
| Frequency Lock | `7-3-1`, `731` | 5 |
| Network Authentication | `NORTHSTAR` | 8 |
| Relay Restoration | `3-7-1-9`, `3719` | 10 |

Answers should be normalized (trim, uppercase, remove permitted separators) by the server before comparison. Do not send accepted answer arrays, mechanism prerequisites, hidden clues, or future unlock state to clients.

## Invariants and edge cases

- Reading evidence and repeating an inspection are free.
- A discovery is recorded once; retries must not duplicate it or create duplicate rewards.
- A mechanism attempt must be authorized for the player's role and all prerequisites must be satisfied.
- A repeated `actionId` must be idempotent and must never charge energy twice.
- Incorrect answers charge the configured cost once. Locked, unauthorized, malformed, or duplicate requests do not charge energy.
- Terminal rooms reject all subsequent actions.
- The server assigns roles and owns all answer comparison, prerequisites, energy changes, and outcome transitions.
- The game must remain solvable when players exchange information verbally; no single player receives all required clues.
