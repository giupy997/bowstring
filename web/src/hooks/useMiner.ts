"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { hexToBytes, type Hex } from "viem";
import { goldAbi } from "@/lib/goldAbi";
import { GOLD_ADDRESS } from "@/lib/contract";

type WorkerMsg =
  | { type: "progress"; workerId: number; hashes: bigint; elapsedMs: number; currentGold: bigint }
  | { type: "solution"; workerId: number; nonce: bigint };

type MinerStatus =
  | "idle"
  | "mining"
  | "submitting"
  | "confirming"
  | "won"
  | "error";

const BATCH_SIZE = 50_000n;

// Spread workers across the 64-bit nonce space so they never collide.
const WORKER_STRIDE = 1n << 56n;

export function useMiner() {
  const { isConnected } = useAccount();
  const { address } = useAccount();

  const { data: challenge, refetch: refetchChallenge } = useReadContract({
    address: GOLD_ADDRESS,
    abi: goldAbi,
    functionName: "getChallenge",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });

  const { data: difficulty } = useReadContract({
    address: GOLD_ADDRESS,
    abi: goldAbi,
    functionName: "currentDifficulty",
    query: { refetchInterval: 24_000 },
  });

  const { data: miningState } = useReadContract({
    address: GOLD_ADDRESS,
    abi: goldAbi,
    functionName: "miningState",
    query: { refetchInterval: 12_000 },
  });
  const epochBlocksLeft = (miningState as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint] | undefined)?.[6];

  const [status, setStatus] = useState<MinerStatus>("idle");
  const [hashrate, setHashrate] = useState(0);
  const [totalHashes, setTotalHashes] = useState<bigint>(0n);
  const [epochRollover, setEpochRollover] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workersRef = useRef<Worker[]>([]);
  const totalHashesRef = useRef<bigint>(0n);
  const rateWindowRef = useRef<{ hashes: bigint; t0: number } | null>(null);
  const totalHashesTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const { isLoading: isConfirming, isSuccess: confirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  // Once the tx confirms, flip status → won, refresh challenge for next round.
  useEffect(() => {
    if (confirmed) {
      setStatus("won");
      refetchChallenge();
    }
  }, [confirmed, refetchChallenge]);

  const cores = useMemo(
    () =>
      typeof navigator !== "undefined"
        ? Math.max(1, Math.min(navigator.hardwareConcurrency || 4, 16))
        : 4,
    []
  );

  // Expected time to find a solution (seconds) given current hashrate +
  // difficulty target. Returns Infinity for hashrate=0 or unknown difficulty.
  const expectedSecondsToSolve = useMemo<number>(() => {
    if (!difficulty || hashrate === 0) return Infinity;
    const d = difficulty as bigint;
    if (d === 0n) return Infinity;
    // expected_hashes = 2^256 / difficulty
    const expectedHashes = (2n ** 256n) / d;
    const expectedHashesNum = Number(expectedHashes);
    if (!isFinite(expectedHashesNum)) return Infinity;
    return expectedHashesNum / hashrate;
  }, [difficulty, hashrate]);

  const stop = useCallback(() => {
    workersRef.current.forEach((w) => {
      w.postMessage({ type: "stop" });
      w.terminate();
    });
    workersRef.current = [];
    setHashrate(0);
    rateWindowRef.current = null;
    if (totalHashesTimerRef.current) {
      clearInterval(totalHashesTimerRef.current);
      totalHashesTimerRef.current = null;
    }
    setStatus((s) => (s === "mining" ? "idle" : s));
  }, []);

  const submit = useCallback(
    async (nonce: bigint) => {
      try {
        setStatus("submitting");
        const hash = await writeContractAsync({
          address: GOLD_ADDRESS,
          abi: goldAbi,
          functionName: "mine",
          args: [nonce],
        });
        setTxHash(hash);
        setStatus("confirming");
      } catch (e) {
        const m = e instanceof Error ? e.message.split("\n")[0] : String(e);
        setError(m);
        setStatus("error");
      }
    },
    [writeContractAsync]
  );

  const start = useCallback(() => {
    if (!isConnected || !challenge || !difficulty) return;
    setError(null);
    setEpochRollover(false);
    setStatus("mining");
    totalHashesRef.current = 0n;
    setTotalHashes(0n);
    rateWindowRef.current = { hashes: 0n, t0: performance.now() };

    const challengeBytes = hexToBytes(challenge as Hex);
    const targetBytes = bigIntToBytes32BE(difficulty as bigint);

    const workers: Worker[] = [];
    for (let i = 0; i < cores; i++) {
      const worker = new Worker("/miner-worker.js", { type: "module" });

      worker.onmessage = (e: MessageEvent<WorkerMsg>) => {
        const msg = e.data;
        if (msg.type === "progress") {
          totalHashesRef.current += msg.hashes;
          const win = rateWindowRef.current;
          if (win) {
            win.hashes += msg.hashes;
            const elapsed = performance.now() - win.t0;
            if (elapsed > 250) {
              const rate = Number((win.hashes * 1000n) / BigInt(Math.max(1, Math.round(elapsed))));
              setHashrate(rate);
              rateWindowRef.current = { hashes: 0n, t0: performance.now() };
            }
          }
        } else if (msg.type === "solution") {
          workers.forEach((w) => {
            w.postMessage({ type: "stop" });
            w.terminate();
          });
          workersRef.current = [];
          if (totalHashesTimerRef.current) {
            clearInterval(totalHashesTimerRef.current);
            totalHashesTimerRef.current = null;
          }
          submit(msg.nonce);
        }
      };

      worker.postMessage({
        type: "start",
        workerId: i,
        challenge: challengeBytes,
        target: targetBytes,
        startGold: BigInt(i) * WORKER_STRIDE,
        batchSize: BATCH_SIZE,
      });
      workers.push(worker);
    }
    workersRef.current = workers;

    // Mirror the running total into state every 500ms so the UI can show it
    // without re-rendering on every progress message.
    if (totalHashesTimerRef.current) clearInterval(totalHashesTimerRef.current);
    totalHashesTimerRef.current = setInterval(() => {
      setTotalHashes(totalHashesRef.current);
    }, 500);
  }, [isConnected, challenge, difficulty, cores, submit]);

  // Auto-restart workers when the challenge rolls over to a new epoch.
  // Without this, workers keep grinding for the old challenge and the eventual
  // mine() tx reverts with InsufficientWork (since the contract recomputes the
  // challenge using the current epoch).
  const startRef = useRef(start);
  const stopRef = useRef(stop);
  useEffect(() => { startRef.current = start; }, [start]);
  useEffect(() => { stopRef.current = stop; }, [stop]);

  const prevChallengeRef = useRef<Hex | undefined>(undefined);
  useEffect(() => {
    const prev = prevChallengeRef.current;
    const current = challenge as Hex | undefined;
    prevChallengeRef.current = current;
    if (!prev || !current || prev === current) return;
    if (status !== "mining") return;
    // Epoch rolled over mid-mining: stop and re-start with the new challenge.
    setEpochRollover(true);
    stopRef.current();
    const t = setTimeout(() => startRef.current(), 120);
    return () => clearTimeout(t);
  }, [challenge, status]);

  // Always terminate workers on unmount.
  useEffect(() => {
    return () => {
      workersRef.current.forEach((w) => w.terminate());
      workersRef.current = [];
      if (totalHashesTimerRef.current) clearInterval(totalHashesTimerRef.current);
    };
  }, []);

  return {
    status,
    hashrate,
    totalHashes,
    epochRollover,
    epochBlocksLeft,
    expectedSecondsToSolve,
    cores,
    challenge: challenge as Hex | undefined,
    difficulty: difficulty as bigint | undefined,
    error,
    txHash,
    isConfirming,
    start,
    stop,
  };
}

function bigIntToBytes32BE(n: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = n;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}
