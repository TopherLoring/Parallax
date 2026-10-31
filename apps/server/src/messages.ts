import { z } from "zod";

const displayName = z.string().trim().min(1).max(20);

export const createRoomRequestSchema = z.object({
  displayName,
}).strict();

export const joinRoomRequestSchema = z.object({
  roomCode: z.string().trim().toUpperCase().regex(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/),
  displayName,
}).strict();

export const joinOptionsSchema = z.object({
  displayName,
}).strict();

export const roomCreateOptionsSchema = z.object({
  roomCode: z.string().regex(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/),
  expiresAt: z.number().int().positive(),
}).strict();

export const readyMessageSchema = z.object({
  ready: z.boolean(),
}).strict();

export const emptyMessageSchema = z.object({}).strict();
export const startMessageSchema = emptyMessageSchema;

export const inspectMessageSchema = z.object({
  objectId: z.string().trim().min(1).max(80),
}).strict();

export const attemptMessageSchema = z.object({
  mechanismId: z.string().trim().min(1).max(80),
  answer: z.string().trim().min(1).max(200),
  actionId: z.string().trim().min(1).max(128),
}).strict();

export type JoinOptions = z.infer<typeof joinOptionsSchema>;
export type RoomCreateOptions = z.infer<typeof roomCreateOptionsSchema>;
