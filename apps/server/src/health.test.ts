import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { handleHealthRequest } from "./health";

test("health endpoints distinguish liveness from readiness", async () => {
  let ready = false;
  const startedAt = Date.now() - 2_000;
  const server = createServer((request, response) => {
    if (!handleHealthRequest(request, response, { ready, startedAt })) {
      response.statusCode = 404;
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No TCP address assigned");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const live = await fetch(`${baseUrl}/health/live`);
    assert.equal(live.status, 200);
    assert.equal((await live.json()).status, "alive");

    const notReady = await fetch(`${baseUrl}/health/ready`);
    assert.equal(notReady.status, 503);
    assert.equal((await notReady.json()).status, "not-ready");

    ready = true;
    const isReady = await fetch(`${baseUrl}/health`);
    assert.equal(isReady.status, 200);
    assert.equal((await isReady.json()).status, "ready");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
