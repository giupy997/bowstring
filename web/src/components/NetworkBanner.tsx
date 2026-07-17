"use client";

import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { robinhoodChain } from "@/lib/wagmi";

const EXPECTED_CHAIN = robinhoodChain;

export function NetworkBanner() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected) return null;
  if (chainId === EXPECTED_CHAIN.id) return null;

  return (
    <div
      className="w-full px-6 py-3 text-sm font-mono flex items-center justify-between gap-4"
      style={{
        background: "#3a1c1c",
        color: "#fca5a5",
        borderBottom: "1px solid #5a2a2a",
      }}
    >
      <span>
        Wrong network. GOLD lives on {EXPECTED_CHAIN.name} (chainId{" "}
        {EXPECTED_CHAIN.id}). Your wallet is on chainId {chainId}.
      </span>
      <button
        onClick={() => switchChain({ chainId: EXPECTED_CHAIN.id })}
        disabled={isPending}
        className="btn"
        style={{
          background: "#fca5a5",
          color: "#3a1c1c",
          borderColor: "#fca5a5",
        }}
      >
        {isPending ? "switching…" : `switch to ${EXPECTED_CHAIN.name}`}
      </button>
    </div>
  );
}
