import type { Address } from "viem";

// Gold ERC-20 token + V4 hook + PoW miner — Robinhood Chain (4663).
// NOT DEPLOYED YET: replace the zero address with the Deploy.s.sol output
// (and verify the lower 14 bits of the address == 0x20CC hook flags)
// before going live. The UI shows a "not deployed" banner while zero.
export const GOLD_ADDRESS: Address =
  "0x0000000000000000000000000000000000000000";

export const GOLD_DECIMALS = 18;
export const GOLD_SYMBOL = "GOLD";

// MinerAgent ERC-721 contract address, deployed against the Gold token
// above via DeployMinerAgent.s.sol. NOT DEPLOYED YET — fill in after the
// token deploy. CLAIM_LIVE in MinerAgent.tsx stays off until this is set.
export const MINER_AGENT_ADDRESS: Address =
  "0x0000000000000000000000000000000000000000";

// V4 PoolManager on Robinhood Chain — used to display pool info, not
// required for contract reads. Canonical day-one deployment; verify against
// https://docs.uniswap.org/contracts/v4/deployments before relying on it.
export const POOL_MANAGER_ADDRESS: Address =
  "0x8366a39CC670B4001A1121B8F6A443A643e40951";
