"use client";

import { useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther, formatUnits } from "viem";
import { nonceAbi } from "@/lib/nonceAbi";
import { NONCE_ADDRESS } from "@/lib/contract";

const PRICE_PER_UNIT_ETH = 0.01;
const TOKENS_PER_UNIT = 1000;
const MAX_UNITS_PER_TX = 5;

export function Genesis() {
  const { address, isConnected } = useAccount();
  const [units, setUnits] = useState(1);
  const [refundUnits, setRefundUnits] = useState(1);

  const { data: genesis } = useReadContract({
    address: NONCE_ADDRESS,
    abi: nonceAbi,
    functionName: "genesisState",
    query: { refetchInterval: 12_000 },
  });
  const complete = (genesis as readonly [bigint, bigint, bigint, boolean] | undefined)?.[3] ?? false;

  const { data: refundOpen } = useReadContract({
    address: NONCE_ADDRESS,
    abi: nonceAbi,
    functionName: "refundUnlocked",
    query: { refetchInterval: 60_000 },
  });

  const { data: userBalance } = useReadContract({
    address: NONCE_ADDRESS,
    abi: nonceAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && (refundOpen as boolean) === true, refetchInterval: 12_000 },
  });
  const userTokens = (userBalance as bigint | undefined) ?? 0n;
  const userUnits = userTokens / 1000n / 10n ** 18n; // floor divide to whole units

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  if (complete) {
    return (
      <div id="genesis" className="panel p-6">
        <div className="panel-label mb-2">genesis</div>
        <div className="font-mono text-sm" style={{ color: "var(--fg-muted)" }}>
          Genesis is complete. The V4 pool has been seeded — head to the mining
          section below.
        </div>
      </div>
    );
  }

  const cost = (PRICE_PER_UNIT_ETH * units).toFixed(2);
  const tokens = TOKENS_PER_UNIT * units;

  function handleMint() {
    writeContract({
      address: NONCE_ADDRESS,
      abi: nonceAbi,
      functionName: "mintGenesis",
      args: [BigInt(units)],
      value: parseEther(cost),
    });
  }

  function handleRefund() {
    writeContract({
      address: NONCE_ADDRESS,
      abi: nonceAbi,
      functionName: "refundGenesis",
      args: [BigInt(refundUnits) * BigInt(TOKENS_PER_UNIT) * 10n ** 18n],
    });
  }

  return (
    <div id="genesis" className="panel p-6 space-y-4">
      <div>
        <div className="panel-label">genesis mint</div>
        <p className="mt-2 text-sm" style={{ color: "var(--fg-muted)" }}>
          Buy raw NONCE at the fixed pre-pool rate of{" "}
          <span className="font-mono" style={{ color: "var(--fg)" }}>
            0.01 ETH per 1,000 NONCE
          </span>
          . Max {MAX_UNITS_PER_TX} units per tx. The ETH you spend funds the V4
          liquidity pool that goes live after genesis sells out.
        </p>
      </div>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="panel-label">units</label>
          <div className="flex gap-2 mt-1">
            {[1, 2, 3, 4, 5].map((u) => (
              <button
                key={u}
                onClick={() => setUnits(u)}
                className={`btn flex-1 ${units === u ? "btn-primary" : ""}`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm font-mono pt-2 border-t"
           style={{ borderColor: "var(--border)" }}>
        <div>
          <span style={{ color: "var(--fg-muted)" }}>cost: </span>
          <span>{cost} ETH</span>
        </div>
        <div className="text-right">
          <span style={{ color: "var(--fg-muted)" }}>you get: </span>
          <span style={{ color: "var(--accent)" }}>{String(tokens).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} NONCE</span>
        </div>
      </div>

      <button
        onClick={handleMint}
        disabled={!isConnected || isPending || isMining}
        className="btn btn-primary w-full"
      >
        {!isConnected
          ? "connect wallet to mint"
          : isPending
            ? "confirm in wallet…"
            : isMining
              ? "mining tx…"
              : isSuccess
                ? "minted ✓ (mint more?)"
                : `mint ${units} unit${units > 1 ? "s" : ""}`}
      </button>

      {(refundOpen as boolean) === true && userUnits > 0n && (
        <div className="pt-4 mt-2 border-t space-y-3"
             style={{ borderColor: "var(--border)" }}>
          <div>
            <div className="panel-label">refund (grace open)</div>
            <p className="mt-1 text-xs" style={{ color: "var(--fg-muted)" }}>
              Three days have passed without the pool being seeded. You can
              burn your genesis NONCE back for the ETH you paid. You currently
              hold {formatUnits(userTokens, 18)} NONCE ({userUnits.toString()}{" "}
              unit{userUnits === 1n ? "" : "s"} refundable).
            </p>
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="panel-label">refund units</label>
              <div className="flex gap-2 mt-1">
                {[1, 2, 3, 4, 5].map((u) => (
                  <button
                    key={u}
                    onClick={() => setRefundUnits(u)}
                    disabled={BigInt(u) > userUnits}
                    className={`btn flex-1 ${refundUnits === u ? "btn-primary" : ""}`}
                    style={BigInt(u) > userUnits ? { opacity: 0.3 } : undefined}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleRefund}
            disabled={!isConnected || isPending || isMining || BigInt(refundUnits) > userUnits}
            className="btn w-full"
            style={{
              background: "transparent",
              borderColor: "var(--danger)",
              color: "var(--danger)",
            }}
          >
            {isPending
              ? "confirm in wallet…"
              : isMining
                ? "refunding…"
                : `refund ${refundUnits} unit${refundUnits > 1 ? "s" : ""} (${(PRICE_PER_UNIT_ETH * refundUnits).toFixed(2)} ETH back)`}
          </button>
        </div>
      )}

      {error && (
        <div className="text-xs font-mono" style={{ color: "var(--danger)" }}>
          {error.message.split("\n")[0]}
        </div>
      )}
    </div>
  );
}
