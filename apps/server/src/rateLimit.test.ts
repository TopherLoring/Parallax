import assert from "node:assert/strict";
import test from "node:test";
import { FixedWindowRateLimiter } from "./rateLimit";

test("fixed-window limiter allows the configured number and resets at the window boundary", () => {
  const limiter = new FixedWindowRateLimiter(2, 1_000);
  assert.equal(limiter.allow("player-1", 10_000), true);
  assert.equal(limiter.allow("player-1", 10_001), true);
  assert.equal(limiter.allow("player-1", 10_002), false);
  assert.equal(limiter.allow("player-1", 11_000), true);
});

test("rate limits are isolated by key and can be cleared on disposal", () => {
  const limiter = new FixedWindowRateLimiter(1, 1_000);
  assert.equal(limiter.allow("player-1", 5_000), true);
  assert.equal(limiter.allow("player-2", 5_000), true);
  assert.equal(limiter.allow("player-1", 5_001), false);
  limiter.forget("player-1");
  assert.equal(limiter.allow("player-1", 5_002), true);
  limiter.clear();
  assert.equal(limiter.allow("player-2", 5_003), true);
});
