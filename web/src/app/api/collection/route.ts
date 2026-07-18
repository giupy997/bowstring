// OpenSea collection-level metadata endpoint, exposed at
//
//   https://bowstring-tbd.com/api/collection
//
// After the production MinerAgent deploys we call
//   MinerAgent.setExternalContractURI("https://bowstring-tbd.com/api/collection")
// so OpenSea / collection aggregators pull the rich card from here instead
// of falling back to the on-chain SVG default in MinerAgent._defaultContractURI.
//
// This is a *static* response — nothing on-chain to look up. Cached
// aggressively because it changes only when we want to rebrand the collection.

import { NextResponse } from "next/server";

export const revalidate = 3600;

// IPFS folder pin (CIDv1 dag-pb) — same root the /api/agent/[id] route
// uses for per-token variants. One CID, immutable, content-addressed.
const IPFS_ROOT = "ipfs://bafybeiauhz7wvnvbw3iqvlpygpinhqfuv4ldh6mv3d3zb7r6kfcztcn6lq";

export async function GET() {
  // OpenSea collection metadata standard:
  // https://docs.opensea.io/docs/contract-level-metadata
  const metadata = {
    name: "Bowstring Miner Agent",
    description:
      "Soulbound ERC-8004 identity NFTs attached to the autonomous " +
      "**Bowstring** agent on Robinhood Chain (4663). One per address, " +
      "claimable once a wallet holds at least 1 BOW. The tier badge — " +
      "Initiate, Bronze, Silver, Gold, Platinum — is computed live from " +
      "the holder's current BOW balance, so the NFT visibly upgrades " +
      "as you accumulate. 10 unique artworks (5 tiers × 2 variants), " +
      "each representing a transaction lifecycle state. " +
      "Tokens are non-transferable: a transfer attempt reverts at the " +
      "contract level. Royalties are 0% by design — these are identity, " +
      "not assets.",
    image: `${IPFS_ROOT}/collection.png`,
    banner_image: `${IPFS_ROOT}/collection.png`,
    // Featured = Platinum tier's Confirmation State, the most ornate
    // artwork of the 10, used as collection highlight.
    featured_image: `${IPFS_ROOT}/BOW_10.png`,
    external_link: "https://bowstring-tbd.com",
    collaborators: [],
    // Royalty config — soulbound collection, no secondary trade signal.
    // Some marketplaces still expect these fields to be present.
    fee_recipient: "0x0000000000000000000000000000000000000000",
    seller_fee_basis_points: 0,
  };

  return NextResponse.json(metadata, {
    headers: {
      "Cache-Control":
        "public, s-maxage=3600, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
