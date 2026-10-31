# Game Design: The Shared Signal

## Premise

A communications network has failed. Two to six players are inside its isolated control environment and must restore the network before shared power is exhausted.

## Core experience

PARALLAX is an escape room, not a sequence of automatically revealed clue cards. Players inspect the environment, test mechanisms, discover records, compare evidence, and earn access to deeper parts of the mystery.

## Session

- Target: 5–8 minutes for the first scenario
- Players: 2–6
- Mode: cooperative, real-time
- Access: room code, no account or installation
- Shared pressure: energy budget and countdown
- Outcome: team victory or team failure

## Discovery loop

1. **Orient:** inspect the shared control room and identify available objects.
2. **Investigate:** inspect terminals, transmissions, panels, and damaged systems.
3. **Correlate:** compare player-specific evidence and infer relationships.
4. **Unlock:** solve a mechanism to expose a new part of the environment.
5. **Execute:** coordinate network configuration using earned information.
6. **Escape:** complete the final sequence before resources expire.

These are conceptual stages, not automatic clue-release timers. Players may revisit discovered evidence and investigate available objects in a flexible order.

## Asymmetric information

Each player has a distinct information and interaction perspective. The complete solution requires evidence distributed across players. A clue may be visible to one player, interpretable only with another player's discovery, or actionable only through a third player's interface.

The server must enforce all visibility and interaction permissions. Hidden information must not exist in client payloads before it is discovered and authorized.

## Puzzle content requirements

The first scenario must be a single coherent chain of interdependent mechanisms, not unrelated minigames. Every clue must have:
- A discoverable source and a clear interaction.
- A defined audience/permission rule.
- A meaningful relationship to another clue or mechanism.
- A server-validated result.
- A test proving the intended solution is solvable and incorrect actions are handled.

## Resource design

Exploration should be low-risk and allow players to inspect evidence repeatedly. Reserve energy costs for consequential failed experiments, incorrect mechanism submissions, or other explicitly signaled actions. Never charge players merely for reading an already discovered clue.

## Usability

- Persistent personal evidence journal.
- Clear feedback for successful, failed, and unavailable interactions.
- Shared team status and player presence.
- Mobile-first touch targets and readable text.
- No requirement to memorize previously discovered clues.
