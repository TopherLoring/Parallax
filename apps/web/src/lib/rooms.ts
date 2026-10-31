import { Client, type Room } from "colyseus.js";

const serverUrl = import.meta.env.VITE_GAME_SERVER_URL ?? "ws://localhost:2567";
const httpUrl = import.meta.env.VITE_GAME_SERVER_HTTP_URL ?? serverUrl.replace(/^ws/, "http");

const client = new Client(serverUrl);

interface RoomApiResponse {
  roomCode: string;
  reservation: Parameters<Client["consumeSeatReservation"]>[0];
}

async function consumeReservation(path: string, body: Record<string, string>) {
  const response = await fetch(`${httpUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as RoomApiResponse & { error?: string; detail?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? payload.detail ?? `Request failed (${response.status})`);
  }
  const room = await client.consumeSeatReservation(payload.reservation) as Room;
  return { room, roomCode: payload.roomCode };
}

export function createRoom(displayName: string) {
  return consumeReservation("/api/rooms", { displayName: displayName.trim() });
}

export function joinRoom(roomCode: string, displayName: string) {
  return consumeReservation("/api/rooms/join", {
    roomCode: roomCode.trim().toUpperCase(),
    displayName: displayName.trim(),
  });
}
