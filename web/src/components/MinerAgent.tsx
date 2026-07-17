"use client";

import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import Image from "next/image";
import { GOLD_ADDRESS, GOLD_SYMBOL, MINER_AGENT_ADDRESS } from "@/lib/contract";
import { goldAbi } from "@/lib/goldAbi";
import { minerAgentAbi } from "@/lib/minerAgentAbi";
import { formatUnits } from "viem";

/**
 * Preview + claim flow for the MinerAgent ERC-721 collection.
 *
 * Renders the four tier artworks and, for connected wallets, highlights
 * the tier they would qualify for. When CLAIM_LIVE is true (i.e. after
 * the production MinerAgent has been deployed and MINER_AGENT_ADDRESS
 * is set in contract.ts), the claim button becomes a full wagmi write
 * flow: confirm-in-wallet → on-chain confirmation → success state with
 * a link to the minted token on OpenSea / Etherscan.
 *
 * The whole writeContract pipeline is wired up regardless of the flag,
 * so flipping CLAIM_LIVE to true is the only change needed at launch.
 */

const CLAIM_LIVE = true;

// 5 tiers × 2 variants each = 10 NFT artworks. Variant per token is
// picked deterministically from the tokenId hash (see MinerAgent.variantOf
// and /api/agent/[id]/route.ts). In the preview gallery below we show the
// FIRST variant per tier — the holder may receive either variant after
// claim, depending on which tokenId they get assigned.
const TIERS = [
  {
    key: "initiate",
    name: "Initiate",
    images: ["/nft/GOLD_1.png", "/nft/GOLD_2.png"] as const,
    states: ["Genesis Signal", "Pending State"] as const,
    threshold: "< 1,000",
    minWei: 0n,
  },
  {
    key: "bronze",
    name: "Bronze",
    images: ["/nft/GOLD_3.png", "/nft/GOLD_4.png"] as const,
    states: ["Ordered Execution", "Verified State"] as const,
    threshold: "1k – 9.9k",
    minWei: 1_000n * 10n ** 18n,
  },
  {
    key: "silver",
    name: "Silver",
    images: ["/nft/GOLD_5.png", "/nft/GOLD_6.png"] as const,
    states: ["Replay Barrier", "Finalized State"] as const,
    threshold: "10k – 99.9k",
    minWei: 10_000n * 10n ** 18n,
  },
  {
    key: "gold",
    name: "Gold",
    images: ["/nft/GOLD_7.png", "/nft/GOLD_8.png"] as const,
    states: ["Archived State", "Echo State"] as const,
    threshold: "100k – 999.9k",
    minWei: 100_000n * 10n ** 18n,
  },
  {
    key: "platinum",
    name: "Platinum",
    images: ["/nft/GOLD_9.png", "/nft/GOLD_10.png"] as const,
    states: ["Transition State", "Confirmation State"] as const,
    threshold: "≥ 1M",
    minWei: 1_000_000n * 10n ** 18n,
  },
] as const;

const MIN_TO_CLAIM = 10n ** 18n; // 1 GOLD

function tierIndexFor(balance: bigint): number {
  if (balance >= TIERS[4].minWei) return 4;
  if (balance >= TIERS[3].minWei) return 3;
  if (balance >= TIERS[2].minWei) return 2;
  if (balance >= TIERS[1].minWei) return 1;
  return 0;
}

export function MinerAgent() {
  const { address, isConnected } = useAccount();

  // Always read GOLD balance to show the tier preview (regardless of CLAIM_LIVE).
  const { data: balance } = useReadContract({
    address: GOLD_ADDRESS,
    abi: goldAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Only hit MinerAgent when claim is live (otherwise MINER_AGENT_ADDRESS
  // is the zero address and the read would either fail or return garbage).
  const { data: existingAgentId } = useReadContract({
    address: MINER_AGENT_ADDRESS,
    abi: minerAgentAbi,
    functionName: "agentIdOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && CLAIM_LIVE },
  });

  const { writeContract, data: txHash, isPending, error: writeError, reset } =
    useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess,
    data: receipt,
  } = useWaitForTransactionReceipt({ hash: txHash });

  const userBalance = (balance as bigint | undefined) ?? 0n;
  const claimedId = (existingAgentId as bigint | undefined) ?? 0n;
  const currentTier = isConnected ? tierIndexFor(userBalance) : -1;
  const eligible = userBalance >= MIN_TO_CLAIM;
  const alreadyClaimed = claimedId > 0n;

  function handleClaim() {
    if (!CLAIM_LIVE || !address) return;
    writeContract({
      address: MINER_AGENT_ADDRESS,
      abi: minerAgentAbi,
      functionName: "claim",
    });
  }

  // Derive a single label + state for the action button based on the cascade
  // of preconditions (live? connected? eligible? already claimed? in flight?).
  const button = (() => {
    if (!CLAIM_LIVE) {
      return {
        label: "claim — live after production deploy",
        disabled: true,
        hint: "MinerAgent ships on the same tx batch as the production Gold launch.",
      };
    }
    if (!isConnected) {
      return { label: "connect wallet to claim", disabled: true, hint: null };
    }
    if (alreadyClaimed) {
      return {
        label: `already claimed: agent #${claimedId.toString()}`,
        disabled: true,
        hint: "one agent per address, soulbound",
      };
    }
    if (!eligible) {
      return {
        label: `need ≥ 1 ${GOLD_SYMBOL} to claim`,
        disabled: true,
        hint: "buy in genesis or earn via mining first",
      };
    }
    if (isPending) {
      return { label: "confirm in your wallet…", disabled: true, hint: null };
    }
    if (isConfirming) {
      return { label: "minting on-chain…", disabled: true, hint: null };
    }
    if (isSuccess) {
      return { label: "agent minted ✓", disabled: true, hint: null };
    }
    return {
      label: `claim ${TIERS[currentTier].name} agent NFT`,
      disabled: false,
      hint: null,
    };
  })();

  // On-chain success → extract minted tokenId from the AgentMinted event
  // if it shows up in logs (best effort — fallbacks to "view tx" if not).
  const mintedTokenId = (() => {
    if (!isSuccess || !receipt) return null;
    // AgentMinted(address indexed agent, uint256 indexed tokenId, uint256 heldBalanceAtClaim)
    // topic[0] = keccak("AgentMinted(address,uint256,uint256)") — we just
    // look for a log emitted by MINER_AGENT_ADDRESS with 3 topics.
    const log = receipt.logs.find(
      (l) =>
        l.address.toLowerCase() === MINER_AGENT_ADDRESS.toLowerCase() &&
        l.topics.length === 3
    );
    if (!log) return null;
    try {
      return BigInt(log.topics[2] as string);
    } catch {
      return null;
    }
  })();

  return (
    <section className="panel p-5" id="agent">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-mono text-xl">miner agent NFT</h2>
        <span
          className="font-mono text-xs"
          style={{ color: "var(--fg-muted)" }}
        >
          soulbound · ERC-8004 · on-chain tier
        </span>
      </div>

      <p
        className="text-sm mb-4 max-w-3xl"
        style={{ color: "var(--fg-muted)" }}
      >
        One badge per address, permanently bound to the wallet that claims it.
        10 artworks total — 5 tiers × 2 variants. Your tier scales with live{" "}
        {GOLD_SYMBOL} holdings (the NFT visibly upgrades as you accumulate);
        the variant is fixed at mint, hashed deterministically from your
        tokenId. Each artwork represents a state in a transaction lifecycle.
        Minimum 1 {GOLD_SYMBOL} held to claim.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        {TIERS.map((t, i) => {
          const isCurrent = i === currentTier;
          return (
            <div
              key={t.key}
              className="rounded-sm overflow-hidden flex flex-col"
              style={{
                border: isCurrent
                  ? "2px solid var(--accent)"
                  : "1px solid var(--border)",
                background: "var(--bg-elevated)",
                boxShadow: isCurrent ? "0 0 22px var(--accent-glow)" : "none",
                transition: "box-shadow 0.2s ease, border-color 0.2s ease",
              }}
            >
              <div
                className="relative w-full"
                style={{ aspectRatio: "1 / 1", background: "#000" }}
              >
                <Image
                  src={t.images[0]}
                  alt={`${t.name} tier — ${t.states[0]}`}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                  style={{ objectFit: "contain" }}
                  priority={i === 0 || i === 4}
                />
              </div>
              <div className="p-3 flex flex-col gap-1">
                <div className="flex items-baseline justify-between">
                  <span
                    className="font-mono text-sm"
                    style={{
                      color: isCurrent ? "var(--accent)" : "var(--fg)",
                      fontWeight: isCurrent ? 700 : 500,
                    }}
                  >
                    {t.name}
                  </span>
                  {isCurrent && (
                    <span
                      className="font-mono text-[10px] px-1.5 py-0.5 rounded-sm"
                      style={{
                        background: "var(--accent-glow)",
                        color: "var(--accent)",
                        letterSpacing: "0.1em",
                      }}
                    >
                      YOU
                    </span>
                  )}
                </div>
                <span
                  className="font-mono text-xs"
                  style={{ color: "var(--fg-muted)" }}
                >
                  {t.threshold} {GOLD_SYMBOL}
                </span>
                <span
                  className="font-mono text-[10px]"
                  style={{ color: "var(--fg-dim)" }}
                  title={`Variants: ${t.states[0]} · ${t.states[1]}`}
                >
                  {t.states[0]} · {t.states[1]}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="flex items-center justify-between gap-3 flex-wrap rounded-sm p-3"
        style={{
          border: "1px solid var(--border)",
          background: "var(--bg-elevated)",
        }}
      >
        <div className="font-mono text-xs space-y-1">
          {isConnected ? (
            <>
              <div>
                <span style={{ color: "var(--fg-muted)" }}>your balance:</span>{" "}
                <span style={{ color: "var(--fg)" }}>
                  {Number(formatUnits(userBalance, 18)).toLocaleString("en-US", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  {GOLD_SYMBOL}
                </span>
              </div>
              <div>
                <span style={{ color: "var(--fg-muted)" }}>qualifies for:</span>{" "}
                <span
                  style={{
                    color: eligible ? "var(--accent)" : "var(--fg-muted)",
                  }}
                >
                  {eligible
                    ? TIERS[currentTier].name
                    : `not eligible (need ≥ 1 ${GOLD_SYMBOL})`}
                </span>
              </div>
            </>
          ) : (
            <div style={{ color: "var(--fg-muted)" }}>
              connect a wallet to preview your tier
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleClaim}
            disabled={button.disabled}
            className="btn"
            style={{
              opacity: button.disabled ? 0.55 : 1,
              cursor: button.disabled ? "not-allowed" : "pointer",
            }}
            title={button.hint ?? undefined}
          >
            {button.label}
          </button>
          {button.hint && (
            <span
              className="font-mono text-[10px]"
              style={{ color: "var(--fg-dim)" }}
            >
              {button.hint}
            </span>
          )}
        </div>
      </div>

      {/* Transaction status / errors ----------------------------------- */}
      {(txHash || writeError) && (
        <div
          className="mt-3 p-3 rounded-sm font-mono text-xs"
          style={{
            border: "1px solid var(--border)",
            background: "var(--bg-elevated)",
            color: "var(--fg-muted)",
          }}
        >
          {writeError && (
            <div
              style={{ color: "var(--danger)", whiteSpace: "pre-wrap" }}
            >
              {writeError.message.split("\n").slice(0, 2).join("\n")}
              <button
                onClick={() => reset()}
                style={{
                  marginLeft: 8,
                  color: "var(--accent)",
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
              >
                dismiss
              </button>
            </div>
          )}
          {txHash && !writeError && (
            <div className="space-y-1">
              <div>
                tx:{" "}
                <a
                  href={`https://robinhoodchain.blockscout.com/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent)" }}
                  className="hover:underline"
                >
                  {txHash.slice(0, 12)}…{txHash.slice(-8)}
                </a>
              </div>
              {isConfirming && <div>waiting for on-chain confirmation…</div>}
              {isSuccess && (
                <div style={{ color: "var(--ok)" }}>
                  ✓ agent NFT minted
                  {mintedTokenId !== null && (
                    <>
                      {" "}
                      — #{mintedTokenId.toString()}{" "}
                      <a
                        href={`https://robinhoodchain.blockscout.com/token/${MINER_AGENT_ADDRESS}/instance/${mintedTokenId.toString()}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--accent)" }}
                        className="hover:underline"
                      >
                        view on OpenSea
                      </a>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <p
        className="font-mono text-[11px] mt-3"
        style={{ color: "var(--fg-dim)" }}
      >
        See the full capability manifest at{" "}
        <a
          href="/agent.json"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--accent)" }}
          className="hover:underline"
        >
          /agent.json
        </a>
        . Metadata resolves dynamically per token via the on-chain{" "}
        <code>ownerOf()</code> lookup → live balance check → tier image,
        so the badge reflects the wallet&apos;s current standing instead
        of a snapshot frozen at mint time.
      </p>
    </section>
  );
}
