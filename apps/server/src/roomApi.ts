import type { IncomingMessage, ServerResponse } from "node:http";
import { matchMaker } from "colyseus";
import { ZodError } from "zod";
import { createRoomRequestSchema, joinRoomRequestSchema } from "./messages";
import { generateRoomCode, normalizeRoomCode, roomCodeRegistry, ROOM_TTL_MS } from "./roomCodes";

const ROOM_TYPE = "parallax";

export interface RoomApiDependencies {
  matchMaker: Pick<typeof matchMaker, "query" | "createRoom" | "joinById">;
  registry: typeof roomCodeRegistry;
}

const defaultDependencies: RoomApiDependencies = {
  matchMaker,
  registry: roomCodeRegistry,
};
const MAX_BODY_BYTES = 4096;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const rateBuckets = new Map<string, { windowStartedAt: number; count: number }>();

function withinRateLimit(request: IncomingMessage): boolean {
  const key = request.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  if (rateBuckets.size > 5_000) {
    for (const [address, bucket] of rateBuckets) {
      if (now - bucket.windowStartedAt >= RATE_WINDOW_MS) rateBuckets.delete(address);
    }
  }
  const current = rateBuckets.get(key);
  if (!current || now - current.windowStartedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(key, { windowStartedAt: now, count: 1 });
    return true;
  }
  if (current.count >= RATE_LIMIT) return false;
  current.count += 1;
  return true;
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

function cors(request: IncomingMessage, response: ServerResponse) {
  const origin = request.headers.origin;
  const allowed = (process.env.WEB_ORIGINS ?? process.env.WEB_ORIGIN ?? "http://localhost:5173")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (origin && !allowed.includes(origin)) return false;
  if (origin) response.setHeader("access-control-allow-origin", origin);
  response.setHeader("vary", "Origin");
  response.setHeader("access-control-allow-methods", "POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "Content-Type");
  response.setHeader("access-control-max-age", "600");
  return true;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (request.headers["content-type"]?.split(";")[0]?.trim() !== "application/json") {
    throw new Error("content_type_required");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) throw new Error("body_too_large");
    chunks.push(buffer);
  }
  if (size === 0) throw new Error("body_required");
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function roomMetadata(room: { metadata?: unknown }) {
  return room.metadata && typeof room.metadata === "object"
    ? room.metadata as { roomCode?: unknown; expiresAt?: unknown }
    : {};
}

export async function handleRoomApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: RoomApiDependencies = defaultDependencies,
): Promise<boolean> {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  if (!path.startsWith("/api/rooms")) return false;
  if (!cors(request, response)) {
    json(response, 403, { error: "origin_not_allowed" });
    return true;
  }
  if (request.method !== "OPTIONS" && !withinRateLimit(request)) {
    response.setHeader("retry-after", "60");
    json(response, 429, { error: "rate_limited" });
    return true;
  }
  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return true;
  }
  if (request.method !== "POST") {
    json(response, 405, { error: "method_not_allowed" });
    return true;
  }

  let allocatedCode: string | null = null;
  try {
    if (path === "/api/rooms") {
      const body = createRoomRequestSchema.parse(await readJson(request));
      const now = Date.now();
      const expiresAt = now + ROOM_TTL_MS;
      const rooms = await dependencies.matchMaker.query({ name: ROOM_TYPE });
      const used = new Set(rooms.map((room) => roomMetadata(room).roomCode).filter((value): value is string => typeof value === "string"));
      const roomCode = generateRoomCode(dependencies.registry, used, expiresAt);
      allocatedCode = roomCode;
      const room = await dependencies.matchMaker.createRoom(ROOM_TYPE, { roomCode, expiresAt });
      dependencies.registry.bind(roomCode, room.roomId);
      const reservation = await dependencies.matchMaker.joinById(room.roomId, { displayName: body.displayName });
      json(response, 201, { roomCode, reservation });
      return true;
    }

    if (path === "/api/rooms/join") {
      const body = joinRoomRequestSchema.parse(await readJson(request));
      const roomCode = normalizeRoomCode(body.roomCode);
      const rooms = await dependencies.matchMaker.query({ name: ROOM_TYPE });
      const room = rooms.find((candidate) => roomMetadata(candidate).roomCode === roomCode);
      if (!room) {
        json(response, 404, { error: "room_code_invalid_or_expired" });
        return true;
      }
      const expiresAt = roomMetadata(room).expiresAt;
      if (typeof expiresAt !== "number" || expiresAt <= Date.now()) {
        dependencies.registry.release(roomCode);
        json(response, 410, { error: "room_code_expired" });
        return true;
      }
      try {
        const reservation = await dependencies.matchMaker.joinById(room.roomId, { displayName: body.displayName });
        json(response, 200, { roomCode, reservation });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "room_unavailable";
        json(response, 409, { error: "room_unavailable", detail });
      }
      return true;
    }

    json(response, 404, { error: "not_found" });
    return true;
  } catch (error) {
    if (allocatedCode) dependencies.registry.release(allocatedCode);
    if (error instanceof ZodError) {
      json(response, 400, { error: "invalid_request", issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })) });
      return true;
    }
    const message = error instanceof Error ? error.message : "request_failed";
    const status = message === "body_too_large" ? 413
      : message === "content_type_required" ? 415
      : message === "body_required" || error instanceof SyntaxError ? 400
      : 503;
    json(response, status, { error: message });
    return true;
  }
}
