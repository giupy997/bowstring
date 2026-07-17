"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useWatchContractEvent,
  usePublicClient,
  useBlockNumber,
} from "wagmi";
import { formatUnits, parseAbiItem, type Address } from "viem";
import { GOLD_ADDRESS, GOLD_SYMBOL } from "@/lib/contract";

/**
 * Unified on-chain activity feed for the Gold contract. Surfaces the three
 * meaningful event types into a single chronological list:
 *
 *   - GenesisMint   buyer paid ETH for raw GOLD during the pre-seed phase
 *   - Mined         miner found a valid nonce, received the era's reward
 *   - FeeCollected  someone swapped on the V4 pool, 1% landed on the contract
 *
 * Two layers stacked together:
 *   1. On mount, fetch historical logs back ~50k blocks (~1 week) so the
 *      feed isn't empty on fresh page loads.
 *   2. After mount, useWatchContractEvent keeps appending live activity.
 *
 * Anti-flash: a small dedupe by txHash prevents historical + live overlap
 * from rendering the same event twice.
 */

type Kind = "genesis" | "mined" | "buy" | "sell";

type Activity = {
  kind: Kind;
  actor: Address;
  /** Amount tied to the event:
   *  - genesis: GOLD tokens minted
   *  - mined: GOLD reward
   *  - buy/sell: ETH fee (1% of trade size) */
  amount: bigint;
  txHash: `0x${string}`;
  blockNumber: bigint;
  /** Best-effort relative timestamp — when the row first appeared on screen */
  seenAt: number;
};

// Cap the in-memory feed. The list scrolls inside a fixed-height container
// (see render), so a larger window here just means more history available
// to the user without growing the visible panel.
const MAX_VISIBLE = 30;
// Robinhood Chain produces L2 blocks every ~0.1s, and the official RPC
// times out on getLogs ranges much above 10k blocks (verified 2026-07-15:
// 10k ok, 100k "log query timed out"). 10k blocks ≈ 17 minutes of
// history — fine for a live-activity feed; older history can be
// re-fetched in chunks if we ever need it.
const LOOKBACK_BLOCKS = 10_000n;
const SECONDS_PER_BLOCK = 0.1;    // Robinhood Chain L2 cadence (~0.1s)

/**
 * Estimate the wall-clock time a past block was mined at from its L2
 * block height. Accurate to within seconds across recent ranges and
 * avoids an extra `getBlock` round-trip per event.
 */
function blockTimestampMs(eventBlock: bigint, currentBlock: bigint): number {
  const blocksAgo = Number(currentBlock - eventBlock);
  return Date.now() - blocksAgo * SECONDS_PER_BLOCK * 1000;
}

const eventGenesisMint = parseAbiItem(
  "event GenesisMint(address indexed buyer, uint256 ethPaid, uint256 hashOut)"
);
const eventMined = parseAbiItem(
  "event Mined(address indexed miner, uint256 nonce, uint256 reward, uint256 era)"
);
const eventFeeCollected = parseAbiItem(
  "event FeeCollected(address indexed origin, bool isBuy, uint256 fee)"
);

function shortAddr(a: Address): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function relativeTime(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function labelFor(act: Activity): { tag: string; color: string; line: React.ReactNode } {
  const actor = (
    <span style={{ color: "var(--fg-muted)" }}>{shortAddr(act.actor)}</span>
  );
  switch (act.kind) {
    case "genesis":
      return {
        tag: "GENESIS",
        color: "var(--accent)",
        line: (
          <>
            {actor}{" "}
            <span style={{ color: "var(--fg)" }}>bought</span>{" "}
            <span style={{ color: "var(--accent)" }}>
              {formatUnits(act.amount, 18)} {GOLD_SYMBOL}
            </span>
          </>
        ),
      };
    case "mined":
      return {
        tag: "MINED",
        color: "var(--ok)",
        line: (
          <>
            {actor}{" "}
            <span style={{ color: "var(--fg)" }}>mined</span>{" "}
            <span style={{ color: "var(--accent)" }}>
              {formatUnits(act.amount, 18)} {GOLD_SYMBOL}
            </span>
          </>
        ),
      };
    case "buy":
    case "sell":
      return {
        tag: act.kind === "buy" ? "BUY" : "SELL",
        color: act.kind === "buy" ? "var(--ok)" : "var(--danger)",
        line: (
          <>
            {actor}{" "}
            <span style={{ color: "var(--fg)" }}>
              {act.kind === "buy" ? "bought" : "sold"} GOLD, fee
            </span>{" "}
            <span style={{ color: "var(--accent)" }}>
              {formatUnits(act.amount, 18)} ETH
            </span>
          </>
        ),
      };
  }
}

export function RecentMints() {
  const [activity, setActivity] = useState<Activity[]>([]);
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const publicClient = usePublicClient();
  const { data: currentBlock } = useBlockNumber();

  const insert = useCallback((entries: Activity[]) => {
    setActivity((prev) => {
      // Dedupe on (txHash, kind, actor) — same tx can emit multiple events.
      const seen = new Set(
        prev.map((a) => `${a.txHash}:${a.kind}:${a.actor.toLowerCase()}`)
      );
      const fresh = entries.filter(
        (a) => !seen.has(`${a.txHash}:${a.kind}:${a.actor.toLowerCase()}`)
      );
      if (fresh.length === 0) return prev;
      return [...fresh, ...prev]
        .sort((a, b) =>
          // Sort by blockNumber desc, ties broken by seenAt desc.
          a.blockNumber === b.blockNumber
            ? b.seenAt - a.seenAt
            : Number(b.blockNumber - a.blockNumber)
        )
        .slice(0, MAX_VISIBLE);
    });
  }, []);

  // ─── Historical fetch on mount ───────────────────────────────────────
  useEffect(() => {
    if (!publicClient || !currentBlock) return;
    let cancelled = false;
    (async () => {
      try {
        const fromBlock =
          currentBlock > LOOKBACK_BLOCKS ? currentBlock - LOOKBACK_BLOCKS : 0n;
        const baseFilter = {
          address: GOLD_ADDRESS,
          fromBlock,
          toBlock: currentBlock,
        } as const;

        // Promise.allSettled (not Promise.all): if any single event type
        // fetch fails (RPC rejects range, transient 429, etc) the other
        // two still populate the feed instead of nothing showing.
        const settled = await Promise.allSettled([
          publicClient.getLogs({ ...baseFilter, event: eventGenesisMint }),
          publicClient.getLogs({ ...baseFilter, event: eventMined }),
          publicClient.getLogs({ ...baseFilter, event: eventFeeCollected }),
        ]);

        if (cancelled) return;

        const genLogs   = settled[0].status === "fulfilled" ? settled[0].value : [];
        const minedLogs = settled[1].status === "fulfilled" ? settled[1].value : [];
        const feeLogs   = settled[2].status === "fulfilled" ? settled[2].value : [];

        // Surface partial failures in dev console so we can spot a flaky
        // RPC quickly without breaking the UI.
        settled.forEach((r, i) => {
          if (r.status === "rejected") {
            const labels = ["GenesisMint", "Mined", "FeeCollected"];
            console.warn(`[activity] getLogs ${labels[i]} failed:`, r.reason);
          }
        });

        // seenAt is derived per-event from the block number so each row
        // shows its actual on-chain age, not the moment the page loaded.
        const fresh: Activity[] = [
          ...genLogs.map<Activity>((l) => ({
            kind: "genesis",
            actor: l.args.buyer as Address,
            amount: (l.args.hashOut as bigint) ?? 0n,
            txHash: l.transactionHash as `0x${string}`,
            blockNumber: l.blockNumber as bigint,
            seenAt: blockTimestampMs(l.blockNumber as bigint, currentBlock),
          })),
          ...minedLogs.map<Activity>((l) => ({
            kind: "mined",
            actor: l.args.miner as Address,
            amount: (l.args.reward as bigint) ?? 0n,
            txHash: l.transactionHash as `0x${string}`,
            blockNumber: l.blockNumber as bigint,
            seenAt: blockTimestampMs(l.blockNumber as bigint, currentBlock),
          })),
          ...feeLogs.map<Activity>((l) => ({
            kind: (l.args.isBuy ? "buy" : "sell") as Kind,
            actor: l.args.origin as Address,
            amount: (l.args.fee as bigint) ?? 0n,
            txHash: l.transactionHash as `0x${string}`,
            blockNumber: l.blockNumber as bigint,
            seenAt: blockTimestampMs(l.blockNumber as bigint, currentBlock),
          })),
        ];

        insert(fresh);
      } catch (err) {
        // Catches a setup-level failure (publicClient unavailable, etc).
        // Per-event errors are now handled inside allSettled above.
        console.warn("[activity] historical fetch setup failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, currentBlock, insert]);

  // ─── Re-render every 10s so "X ago" stays fresh ─────────────────────
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  // ─── Live watchers ──────────────────────────────────────────────────
  useWatchContractEvent({
    address: GOLD_ADDRESS,
    abi: [eventGenesisMint],
    eventName: "GenesisMint",
    onLogs(logs) {
      const now = Date.now();
      insert(
        logs.map((l) => ({
          kind: "genesis",
          actor: (l as { args: { buyer: Address } }).args.buyer,
          amount:
            (l as { args: { hashOut: bigint } }).args.hashOut ?? 0n,
          txHash: l.transactionHash as `0x${string}`,
          blockNumber: l.blockNumber as bigint,
          seenAt: now,
        }))
      );
    },
  });

  useWatchContractEvent({
    address: GOLD_ADDRESS,
    abi: [eventMined],
    eventName: "Mined",
    onLogs(logs) {
      const now = Date.now();
      insert(
        logs.map((l) => ({
          kind: "mined",
          actor: (l as { args: { miner: Address } }).args.miner,
          amount: (l as { args: { reward: bigint } }).args.reward ?? 0n,
          txHash: l.transactionHash as `0x${string}`,
          blockNumber: l.blockNumber as bigint,
          seenAt: now,
        }))
      );
    },
  });

  useWatchContractEvent({
    address: GOLD_ADDRESS,
    abi: [eventFeeCollected],
    eventName: "FeeCollected",
    onLogs(logs) {
      const now = Date.now();
      insert(
        logs.map((l) => {
          const args = (
            l as { args: { origin: Address; isBuy: boolean; fee: bigint } }
          ).args;
          return {
            kind: (args.isBuy ? "buy" : "sell") as Kind,
            actor: args.origin,
            amount: args.fee ?? 0n,
            txHash: l.transactionHash as `0x${string}`,
            blockNumber: l.blockNumber as bigint,
            seenAt: now,
          };
        })
      );
    },
  });

  return (
    <div className="panel p-4">
      <div className="panel-label mb-3">recent activity</div>
      {activity.length === 0 ? (
        <div
          className="font-mono text-sm"
          style={{ color: "var(--fg-muted)" }}
        >
          {loading ? "loading on-chain activity…" : "no activity yet"}
        </div>
      ) : (
        // Fixed-height scrollable region so the activity panel never
        // grows the page when traffic picks up. Roughly 6 rows visible;
        // the rest scrolls. Custom scrollbar styling lives in globals.css
        // under .scroll-thin so the bar matches the dark theme.
        <ul
          className="space-y-1.5 font-mono text-sm overflow-y-auto pr-1 scroll-thin"
          style={{ maxHeight: 240 }}
        >
          {activity.map((a, i) => {
            const meta = labelFor(a);
            return (
              <li
                key={`${a.txHash}-${a.kind}-${a.actor}-${i}`}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex items-center gap-2 min-w-0 flex-1">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-sm shrink-0"
                    style={{
                      background: "var(--bg-elevated)",
                      border: `1px solid ${meta.color}`,
                      color: meta.color,
                      letterSpacing: "0.08em",
                    }}
                  >
                    {meta.tag}
                  </span>
                  <span className="truncate">{meta.line}</span>
                </span>
                <a
                  href={`https://robinhoodchain.blockscout.com/tx/${a.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs hover:underline"
                  style={{ color: "var(--fg-dim)" }}
                  title={a.txHash}
                >
                  {relativeTime(a.seenAt)}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
