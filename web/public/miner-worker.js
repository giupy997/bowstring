// Standalone WASM-backed PoW worker. Served as a static asset from /public
// so webpack doesn't have to parse the underlying .wasm (Next 14's bundled
// webpack chokes on modern wasm-bindgen reference-type sections).
//
// Loaded by useMiner.ts via:
//   new Worker("/miner-worker.js", { type: "module" });

import init, { try_nonces } from "./miner-wasm/miner.js";

const ready = init();
let stopped = true;

self.addEventListener("message", async (e) => {
  await ready;
  const msg = e.data;
  if (msg.type === "stop") {
    stopped = true;
    return;
  }
  if (msg.type === "start") {
    stopped = false;
    runMineStep(
      msg.workerId,
      msg.challenge,
      msg.target,
      msg.startNonce,
      msg.batchSize,
      performance.now(),
      0n
    );
  }
});

function runMineStep(
  workerId,
  challenge,
  target,
  nonce,
  batchSize,
  reportT0,
  reportHashes
) {
  if (stopped) return;

  const result = try_nonces(challenge, target, nonce, batchSize);
  const nextNonce = nonce + batchSize;
  const nextHashes = reportHashes + batchSize;

  if (result !== undefined) {
    self.postMessage({ type: "solution", workerId, nonce: result });
    stopped = true;
    return;
  }

  const now = performance.now();
  const elapsed = now - reportT0;

  if (elapsed > 500) {
    self.postMessage({
      type: "progress",
      workerId,
      hashes: nextHashes,
      elapsedMs: elapsed,
      currentNonce: nextNonce,
    });
    setTimeout(
      () =>
        runMineStep(workerId, challenge, target, nextNonce, batchSize, now, 0n),
      0
    );
  } else {
    setTimeout(
      () =>
        runMineStep(
          workerId,
          challenge,
          target,
          nextNonce,
          batchSize,
          reportT0,
          nextHashes
        ),
      0
    );
  }
}
