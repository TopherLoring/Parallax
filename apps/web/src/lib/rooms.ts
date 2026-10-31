import { Client, type Room } from "colyseus.js";

const serverUrl = import.meta.env.VITE_GAME_SERVER_URL ?? "ws://localhost:2567";
const httpUrl = import.meta.env.VITE_GAME_SERVER_HTTP_URL ?? serverUrl.replace(/^ws/, "http");
const TOKEN_KEY = "parallax.reconnectionToken";
const ROOM_CODE_KEY = "parallax.roomCode";

const client = new Client(serverUrl);

interface RoomApiResponse {
  roomCode: string;
  reservation: Parameters<Client["consumeSeatReservation"]>[0];
}

function rememberRoom(room: Room, roomCode: string) {
  sessionStorage.setItem(TOKEN_KEY, room.reconnectionToken);
  sessionStorage.setItem(ROOM_CODE_KEY, roomCode);
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
  rememberRoom(room, payload.roomCode);
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

export async function reconnectRoom() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const roomCode = sessionStorage.getItem(ROOM_CODE_KEY);
  if (!token || !roomCode) throw new Error("No resumable room session");
  const room = await client.reconnect(token) as Room;
  rememberRoom(room, roomCode);
  return { room, roomCode };
}

export function clearStoredRoom() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(ROOM_CODE_KEY);
}
