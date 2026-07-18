import type { Address } from "viem";

// Bowstring ERC-20 token + V4 hook + PoW miner — Robinhood Chain (4663).
// Deployed via Deploy.s.sol on 2026-07-18, verified on Blockscout.
// Hook bits validated: lower 14 bits of address == 0x20CC.
// tx: 0x533739f4b1204b96334ea90a8562f70f3e755ffe719645478d1b5577e3d060ef
// block: 13217993 · salt: 0x159a0 · controller: 0x4e912cf5…0A5623
export const BOW_ADDRESS: Address =
  "0x0156DC9F55D852f45C895Ec7daAa08Ca7fc120cC";

export const BOW_DECIMALS = 18;
export const BOW_SYMBOL = "BOW";

// MinerAgent ERC-721 contract address, deployed against the Bowstring token
// above via DeployMinerAgent.s.sol on 2026-07-18, verified on Blockscout.
// tx: 0x66ced2be27a6a41de02d0ff89cc8e1a9aaf852136b2c9db4ccecada83bc24941
// block: 13222806 · uriUpdater: 0x4e912cf5…0A5623
export const MINER_AGENT_ADDRESS: Address =
  "0x4746b7EAF60E3dBbbC74f7173Ef4d8967a68236c";

// V4 PoolManager on Robinhood Chain — used to display pool info, not
// required for contract reads. Canonical day-one deployment; verify against
// https://docs.uniswap.org/contracts/v4/deployments before relying on it.
export const POOL_MANAGER_ADDRESS: Address =
  "0x8366a39CC670B4001A1121B8F6A443A643e40951";
