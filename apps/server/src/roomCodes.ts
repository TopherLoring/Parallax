import { randomInt } from "node:crypto";

export const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 6;
export const ROOM_TTL_MS = 30 * 60 * 1_000;

export interface RoomCodeRecord {
  roomId: string | null;
  expiresAt: number;
}

export class RoomCodeRegistry {
  private readonly records = new Map<string, RoomCodeRecord>();

  reserve(code: string, expiresAt: number, now = Date.now()): boolean {
    this.cleanup(now);
    if (this.records.has(code) || expiresAt <= now) return false;
    this.records.set(code, { roomId: null, expiresAt });
    return true;
  }

  bind(code: string, roomId: string): boolean {
    const record = this.records.get(code);
    if (!record) return false;
    this.records.set(code, { ...record, roomId });
    return true;
  }

  get(code: string, now = Date.now()): RoomCodeRecord | null {
    const record = this.records.get(code);
    if (!record) return null;
    if (record.expiresAt <= now) {
      this.records.delete(code);
      return null;
    }
    return record;
  }

  release(code: string): void {
    this.records.delete(code);
  }

  cleanup(now = Date.now()): void {
    for (const [code, record] of this.records) {
      if (record.expiresAt <= now) this.records.delete(code);
    }
  }

  has(code: string, now = Date.now()): boolean {
    return this.get(code, now) !== null;
  }

  get size(): number {
    return this.records.size;
  }
}

export const roomCodeRegistry = new RoomCodeRegistry();

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function generateRoomCode(
  registry: RoomCodeRegistry,
  externallyUsedCodes: ReadonlySet<string>,
  expiresAt: number,
): string {
  for (let attempt = 0; attempt < 128; attempt += 1) {
    let code = "";
    for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
      code += ROOM_CODE_ALPHABET.charAt(randomInt(ROOM_CODE_ALPHABET.length));
    }
    if (externallyUsedCodes.has(code)) continue;
    if (registry.reserve(code, expiresAt)) return code;
  }
  throw new Error("Unable to allocate a unique room code");
}
