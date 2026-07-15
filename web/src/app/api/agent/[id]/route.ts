// Dynamic per-token metadata endpoint for the MinerAgent (ERC-8004) NFT.
//
// The Solidity contract concatenates the configured base URI with the
// tokenId and ".json":
//
//   tokenURI(N) = externalBaseURI || N || ".json"
//
// So once `setExternalBaseURI("https://<domain>/api/agent/")` is called on
// MinerAgent post-deploy, every NFT resolves to
//
//   https://<domain>/api/agent/<N>.json
//
// which routes here. We then:
//   1. Read ownerOf(tokenId) on MinerAgent to get the holder.
//   2. Read balanceOf(owner) on Bowstring to get their current token holdings.
//   3. Map balance → tier (Initiate / Bronze / Silver / Gold / Platinum).
//   4. Map tokenId → variant (0 or 1) via deterministic hash, mirroring
//      MinerAgent.variantOf(tokenId).
//   5. Return OpenSea-compatible JSON pointing at the matching BOW_*.png.
//
// 10 NFT artworks total (5 tiers × 2 variants), each named after a state
// in a transaction lifecycle. The variant is fixed per tokenId; the tier
// recomputes live with every metadata fetch — so a wallet that grows from
// Silver to Gold visibly upgrades its badge without any on-chain action.

import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  http,
  parseAbi,
  encodeAbiParameters,
  keccak256,
} from "viem";
import { defineChain } from "viem";

// ───────── Configuration ─────────
// Robinhood Chain mainnet (4663). Defined inline: wagmi/viem don't ship it,
// and importing lib/wagmi here would drag RainbowKit into a route handler.
const CHAIN_ID = Number(process.env.NFT_CHAIN_ID ?? "4663");
const RPC_URL =
  process.env.NFT_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
const CHAIN = defineChain({
  id: CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

const BOW_ADDRESS = (process.env.NFT_BOW_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;
const MINER_AGENT_ADDRESS = (process.env.NFT_MINER_AGENT_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

const client = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) });

const minerAgentAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
]);

const bowstringAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

// ───────── Tier × variant table ─────────
//
// Each tier has TWO artwork variants drawn from the 10-piece BOW
// collection. Mapping by narrative progression: token #1 (Genesis Signal)
// goes to the Initiate tier (start of the journey); token #10
// (Confirmation State) goes to Platinum (final state).
//
// Images pinned to IPFS via Pinata as a single CIDv1 folder. Each NFT's
// image field resolves to ipfs://<folder>/BOW_X.png — every wallet and
// marketplace (OpenSea / MetaMask / Rarible / Blur) accepts the ipfs://
// scheme and resolves through its preferred gateway. The folder pin is
// content-addressed, so the URLs are provably immutable forever; even if
// Pinata drops the pin tomorrow, anyone re-pinning the same 11 PNGs gets
// the identical CID and the URLs keep resolving.
const IPFS_ROOT = "ipfs://bafybeiauhz7wvnvbw3iqvlpygpinhqfuv4ldh6mv3d3zb7r6kfcztcn6lq";

type Tier = {
  name: string;
  /** Two ipfs:// URIs — index 0 and 1 picked by variantFor. */
  variants: readonly [string, string];
  /** State name from the artist's collection.json, one per variant. */
  variantNames: readonly [string, string];
  /** Hex with leading "#", used for OpenSea trait swatch. */
  color: string;
  /** Same color without "#", OpenSea spec for background_color. */
  bg: string;
  /** Floor balance in whole BOW to qualify for this tier. */
  minBowstring: number;
};

const TIERS = {
  platinum: {
    name: "Platinum",
    variants: [`${IPFS_ROOT}/BOW_9.png`, `${IPFS_ROOT}/BOW_10.png`],
    variantNames: ["Transition State", "Confirmation State"],
    color: "#e5e4e2",
    bg: "0e0e0d",
    minBowstring: 1_000_000,
  },
  gold: {
    name: "Gold",
    variants: [`${IPFS_ROOT}/BOW_7.png`, `${IPFS_ROOT}/BOW_8.png`],
    variantNames: ["Archived State", "Echo State"],
    color: "#f4c430",
    bg: "0e0a02",
    minBowstring: 100_000,
  },
  silver: {
    name: "Silver",
    variants: [`${IPFS_ROOT}/BOW_5.png`, `${IPFS_ROOT}/BOW_6.png`],
    variantNames: ["Replay Barrier", "Finalized State"],
    color: "#c0c0c8",
    bg: "0c0c10",
    minBowstring: 10_000,
  },
  bronze: {
    name: "Bronze",
    variants: [`${IPFS_ROOT}/BOW_3.png`, `${IPFS_ROOT}/BOW_4.png`],
    variantNames: ["Ordered Execution", "Verified State"],
    color: "#cd7f32",
    bg: "0e0801",
    minBowstring: 1_000,
  },
  initiate: {
    name: "Initiate",
    variants: [`${IPFS_ROOT}/BOW_1.png`, `${IPFS_ROOT}/BOW_2.png`],
    variantNames: ["Genesis Signal", "Pending State"],
    color: "#7a7a82",
    bg: "08080a",
    minBowstring: 0,
  },
} as const satisfies Record<string, Tier>;

function tierFor(balance: bigint): Tier {
  if (balance >= 1_000_000n * 10n ** 18n) return TIERS.platinum;
  if (balance >=   100_000n * 10n ** 18n) return TIERS.gold;
  if (balance >=    10_000n * 10n ** 18n) return TIERS.silver;
  if (balance >=     1_000n * 10n ** 18n) return TIERS.bronze;
  return TIERS.initiate;
}

/**
 * Mirrors MinerAgent.variantOf(tokenId) on-chain. Solidity computes
 *   keccak256(abi.encode(tokenId, "bowstring-variant")) % 2
 * viem's encodeAbiParameters produces byte-identical input to Solidity's
 * abi.encode, so the resulting hash matches and the JS/Solidity answer
 * agrees for any tokenId.
 */
function variantFor(tokenId: bigint): 0 | 1 {
  const encoded = encodeAbiParameters(
    [{ type: "uint256" }, { type: "string" }],
    [tokenId, "bowstring-variant"]
  );
  const hash = keccak256(encoded);
  return Number(BigInt(hash) % 2n) as 0 | 1;
}

// ───────── Handler ─────────

export const revalidate = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const raw = params.id.replace(/\.json$/i, "");

  let tokenId: bigint;
  try {
    tokenId = BigInt(raw);
    if (tokenId <= 0n) throw new Error("tokenId must be positive");
  } catch {
    return NextResponse.json({ error: "Invalid tokenId" }, { status: 400 });
  }

  // Resolve current owner. Reverts if the token doesn't exist.
  let owner: `0x${string}`;
  try {
    owner = await client.readContract({
      address: MINER_AGENT_ADDRESS,
      abi: minerAgentAbi,
      functionName: "ownerOf",
      args: [tokenId],
    });
  } catch {
    return NextResponse.json(
      { error: `Agent #${tokenId} does not exist` },
      { status: 404 }
    );
  }

  // Resolve current BOW balance and pick the tier + variant.
  const balance = await client.readContract({
    address: BOW_ADDRESS,
    abi: bowstringAbi,
    functionName: "balanceOf",
    args: [owner],
  });

  const tier = tierFor(balance);
  const variant = variantFor(tokenId);
  const variantName = tier.variantNames[variant];
  const variantPath = tier.variants[variant];
  const nonceHeld = Number(balance / 10n ** 18n);

  const metadata = {
    name: `Bowstring Miner Agent #${tokenId} — ${variantName}`,
    description:
      `${variantName.toUpperCase()}. BOW Miner Agent — soulbound ERC-8004 ` +
      "identity attached to the autonomous Bowstring agent on Robinhood " +
      "Chain. The tier badge reflects the holder's live BOW balance, " +
      "so the NFT visually upgrades as you accumulate. The variant is " +
      "fixed at mint time, hashed deterministically from the tokenId. " +
      "Minimum 1 BOW held to claim; transfers are blocked at the " +
      "contract level.",
    // variantPath is already a full ipfs:// URI — no origin prefix needed.
    image: variantPath,
    background_color: tier.bg,
    // TODO(post-registration): point at the agent's registry page once
    // Bowstring is registered on an ERC-8004 IdentityRegistry reachable
    // from Robinhood Chain (see script/RegisterAgent.s.sol).
    external_url: "https://robinhoodchain.blockscout.com/token/" + MINER_AGENT_ADDRESS,
    attributes: [
      { trait_type: "Tier", value: tier.name },
      { trait_type: "State", value: variantName },
      {
        display_type: "number",
        trait_type: "Variant",
        value: variant + 1,
      },
      {
        display_type: "number",
        trait_type: "BOW Held",
        value: nonceHeld,
      },
      {
        display_type: "number",
        trait_type: "Tier Floor",
        value: tier.minBowstring,
      },
      { trait_type: "Agent Wallet", value: owner },
      { trait_type: "Tier Color", value: tier.color },
      // ERC-8004 backlink — fill the agent id in once Bowstring is
      // registered on an ERC-8004 IdentityRegistry (RegisterAgent.s.sol).
      { trait_type: "ERC-8004 Agent", value: "TBD" },
      { trait_type: "Agent Network", value: "Robinhood Chain" },
    ],
  };

  return NextResponse.json(metadata, {
    headers: {
      "Cache-Control":
        "public, s-maxage=60, max-age=60, stale-while-revalidate=300",
    },
  });
}
