# PARALLAX Visual System

## Design intent
A dark, instrument-panel interface for a cooperative signal-recovery mission. The visual language should feel like a readable control surface, not a dense sci-fi dashboard. Every decorative element must reinforce orientation, state, or hierarchy.

## Foundations

| Token | Value | Use |
|---|---|---|
| Canvas | `#080d16` | App background |
| Surface 1 | `#0c1522` | Panels |
| Surface 2 | `#0a1522` | Evidence and scene cards |
| Surface 3 | `#17283b` | Raised controls |
| Primary ink | `#e8edf5` | Main content |
| Secondary ink | `#a4b3c5` | Explanatory copy |
| Muted ink | `#8296ac` | Supporting metadata |
| Cyan | `#78c8e5` | Interactive/available |
| Bright cyan | `#8bd5e8` | Primary action |
| Green | `#7bd9b8` | Ready/solved/success |
| Red | `#ff9b9b` | Errors/failure |
| Soft border | `#ffffff18` | Panel separation |

Typography uses system sans-serif for readable prose and system monospace for codes, labels, timers, and technical metadata. No remote font request is required.

## Component patterns
- **Primary action:** high-contrast cyan fill, dark text, minimum 44px height.
- **Secondary action:** dark raised surface with a cyan border.
- **Status:** text plus a colored indicator; color is never the only signal.
- **Evidence card:** title, readable clue text, source, discovery time, discoverer, and an explicit revisit action.
- **Scene node:** object name and description with available/locked/used state; only server-authorized objects may render.
- **Terminal result:** clear success/failure heading, reason, energy, mechanism count, completion time, and host rematch action.
- **Errors and notices:** use alert/status semantics and plain-language copy rather than raw internal error codes.

## Layout
- Narrow phones: one-column controls and scene nodes; no horizontal scrolling.
- Phones and tablets: two-column scene nodes where space permits; stacked lobby controls.
- Desktop: centered mission column with three-column scene nodes.
- Landscape phones: reduce hero spacing so the room controls remain reachable.
- Safe-area insets are respected on notched devices.

## Interaction and accessibility
- Keyboard-visible focus ring on links, buttons, and inputs.
- Minimum 44px interactive targets.
- Explicit labels for room code, operator name, and mechanism inputs.
- Status updates use live regions; failures use alert semantics.
- Reduced-motion preference disables nonessential motion and smooth scrolling.
- High-contrast and forced-colors modes preserve borders, focus, and state labels.
- Locked/available/used states include text, not color alone.
- No remote fonts, audio autoplay, or motion-only information.

## Responsive breakpoints
- `<=380px`: compact phone layout.
- `<=480px`: single-column scene nodes.
- `<=600px`: phone layout and stacked lobby actions.
- `>=768px`: wider panels and three-column scene nodes.
- `<=700px` landscape height: compact vertical spacing.

The source of truth for these tokens and patterns is `apps/web/src/styles.css`.
