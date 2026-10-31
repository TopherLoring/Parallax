# PARALLAX deployment

## Topology

- **Web client:** Cloudflare Pages static site.
- **Room server:** one Colyseus WebSocket web service on Render.
- **Transport:** HTTPS for matchmaking/health and WSS for room sessions.
- **State:** in-memory, single-instance. The room-code registry and active sessions are process-local.

The repository includes `wrangler.toml`, `render.yaml`, `apps/server/Dockerfile`, and Cloudflare Pages `_headers` for this topology.

## 1. Deploy the Colyseus server

1. Connect `TopherLoring/Parallax` to Render and create a Blueprint from the repository root.
2. Render reads `render.yaml` and builds `apps/server/Dockerfile`.
3. Set `WEB_ORIGINS` to the exact Cloudflare Pages production origin, for example `https://parallax.pages.dev`. Do not include a trailing slash.
4. Wait for `/health/ready` to return HTTP 200.
5. Confirm the Render service URL is `https://parallax-server.onrender.com` or update the web build variables to the assigned service hostname.

Render supports public WebSocket connections on web services. The free plan spins down after 15 minutes without inbound HTTP requests or WebSocket messages; a cold start can take about a minute. Client heartbeats are enabled to keep active rooms responsive, but free instances remain a demo/hobby tier, not a production availability guarantee. See the official [Render WebSockets guide](https://render.com/docs/websocket) and [free-instance limitations](https://render.com/docs/free).

**Important state limitation:** room state is in memory and there is no shared Colyseus presence/driver. A service restart or instance replacement destroys active rooms. Keep one instance. For production use, move to an always-on plan and add shared presence/driver-backed room-code storage before horizontal scaling.

## 2. Deploy the web client

1. Create a Cloudflare Pages project named `parallax` connected to this repository.
2. Set the build command to:

   ```sh
   bun install && bun run --filter @parallax/web build
   ```

3. Set the build output directory to `apps/web/dist`.
4. Set these Pages production build variables before building:

   - `VITE_GAME_SERVER_URL=wss://parallax-server.onrender.com`
   - `VITE_GAME_SERVER_HTTP_URL=https://parallax-server.onrender.com`

5. If Render assigned another hostname, change both values and update `apps/web/public/_headers` so `connect-src` permits that exact HTTPS/WSS host.
6. Verify the Pages origin exactly matches the server's `WEB_ORIGINS`.

Cloudflare Pages reads `_headers` from the public/static asset directory and applies the security headers to static responses. See the [Pages headers documentation](https://developers.cloudflare.com/pages/configuration/headers/) and [Wrangler Pages configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).

## 3. Production verification

- Open the Pages URL in two separate browsers/devices.
- Create a room on one device and join with the six-character code on the other.
- Verify the two players receive different private roles and clues.
- Complete the full sequence, including Systems recovery and Signals confirmation.
- Verify the countdown, shared energy, victory/failure state, reconnect, and host rematch.
- Confirm `https://parallax-server.onrender.com/health/live` and `/health/ready` respond as expected.
- Inspect browser network traffic: matchmaking uses HTTPS and room transport uses WSS.
- Inspect the built assets and logs for answer keys, clue content, role labels, local URLs, and secrets. None should be present in public state or operational logs.

## 4. Rollback and recovery

- Cloudflare Pages: select a previous successful deployment and roll back to it.
- Render: roll back to a previous successful deploy from the service Events/Deploys page.
- A server rollback/restart invalidates all in-memory rooms. Tell players to create a new room; do not promise session restoration across process restarts.
- Check Render logs for structured `server.started`, `room.created`, `game.started`, and `game.finished` events.
- Keep `WEB_ORIGINS` and the client build URLs aligned when changing domains.

## 5. Environment reference

| Variable | Location | Purpose |
|---|---|---|
| `PORT` | Render runtime | Injected listening port |
| `WEB_ORIGINS` | Render service | Exact comma-separated browser-origin allowlist |
| `VITE_GAME_SERVER_URL` | Pages build | Public WSS endpoint |
| `VITE_GAME_SERVER_HTTP_URL` | Pages build | Public HTTPS matchmaking/health endpoint |

No API keys or server secrets are required for the current game. Never commit production environment files.

## Current deployment status

Configuration is committed; no deployment has been performed from this workspace because Cloudflare/Render account authorization and production environment values are not available here. Public-device acceptance remains an explicit release gate.
