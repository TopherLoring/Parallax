import assert from "node:assert/strict";
import test from "node:test";
import { logEvent, type SafeLogFields } from "./logger";

test("structured logger emits only explicitly allowed correlation fields", () => {
  const originalLog = console.log;
  let output = "";
  console.log = (line?: unknown) => { output = String(line); };
  try {
    const safe: SafeLogFields = { roomCode: "ABC234", sessionId: "session-1", phase: "active" };
    logEvent("info", "room.test", safe);
  } finally {
    console.log = originalLog;
  }
  const record = JSON.parse(output) as Record<string, unknown>;
  assert.equal(record.event, "room.test");
  assert.equal(record.roomCode, "ABC234");
  assert.equal("answer" in record, false);
  assert.equal("clueContent" in record, false);
  assert.equal("displayName" in record, false);
});
