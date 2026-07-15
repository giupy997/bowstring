# NONCE — Base

Mined ERC-20 with a self-hook — the token contract IS its own Uniswap V4
hook. One address, one bytecode: the token, the hook, and the PoW miner
are the same contract.

This repo is the **Base mainnet** fork of the original Ethereum mainnet
project (`~/Desktop/pick`). Contract logic is identical; only the deploy
script V4 addresses, frontend chain config, and explorer URLs differ.

Logic forked 1:1 from `hash256.org` (MIT). Branding and frontend are new.

## Architecture

- **Token** — ERC-20 named `Nonce` / `NONCE`, 21M cap, 18 decimals.
- **Genesis sale** — 1.05M NONCE (5%) sold at `0.01 ETH` per `1,000 NONCE`,
  max 5 units per tx. ETH raised goes into the Uniswap V4 pool.
- **Pool seeding** — once genesis is sold out (or 30 min after deploy via
  `partialSeed`), 1.05M NONCE + raised ETH form the V4 LP; the controller
  receives the LP position.
- **Mining** — 18.9M NONCE (90%) released via PoW.
  - Challenge: `keccak256(keccak256(chainId, contract, miner, epoch), nonce) < currentDifficulty`
  - Epoch: every 100 blocks
  - Reward: `100 NONCE >> era`, era = `totalMints / 100_000`
  - Retarget: every 2016 mints, clamped ±4×
  - Cap: 10 mints/block
  - Replay protection: per-(miner, nonce, epoch)
- **Self-hook** — 1% of every swap is taken as ETH and accumulated on the
  contract. `controller` (the address that deployed the contract) calls
  `claimFees()` to withdraw.

> **Base block-time scaling applied.** Base produces ~2s blocks (vs
> Ethereum's 12s), so the timing constants were scaled 6× to preserve
> the original wall-clock tokenomics:
> `EPOCH_BLOCKS = 600` → ~20 min epoch, `TARGET_BLOCKS_PER_MINT = 30` →
> ~1 mint per minute. 18.9M NONCE released over ~131 days at target
> rate, matching the Ethereum design intent.

## Setup

```bash
cp .env.example .env
# fill BASE_RPC, BASESCAN_KEY
forge build
forge test
```

## Deploying

> **Read this before you spend gas.** Deployment is irreversible. The address
> that signs the deploy tx becomes `controller` for life (via `tx.origin`)
> and receives all LP swap fees. Use a fresh, dedicated EOA — **not** a Safe,
> factory, or smart-contract wallet.

### 1. Fund the deploy wallet

Send ≥ 0.005 ETH (Base ETH) to the EOA that will sign the deploy. Base
gas is ~100× cheaper than mainnet so this covers a comfortable buffer.
Bridge ETH from L1 → Base via the official bridge, or buy directly on
Coinbase.

### 2. Dry-run against a Base fork

```bash
forge script script/Deploy.s.sol \
  --rpc-url $BASE_RPC \
  -vvv
```

The script:
1. Mines a CREATE2 salt that lands the address at `addr & 0x3FFF == 0x20CC`
   (≈ 16k iterations average, sub-second).
2. Logs the predicted address.
3. Does NOT broadcast — review the logs.

### 3. Real deployment (Base mainnet)

Pick **one** of these signing methods:

**Foundry encrypted keystore** (`cast wallet import nonce-base --interactive`):
```bash
forge script script/Deploy.s.sol \
  --rpc-url $BASE_RPC \
  --account nonce-base \
  --broadcast \
  --verify \
  --verifier-url 'https://api.basescan.org/v2/api?chainid=8453' \
  --etherscan-api-key $BASESCAN_KEY \
  --slow
```

**Ledger:**
```bash
forge script script/Deploy.s.sol \
  --rpc-url $BASE_RPC \
  --ledger \
  --sender 0xYourLedgerAddress \
  --broadcast \
  --verify \
  --verifier-url 'https://api.basescan.org/v2/api?chainid=8453' \
  --etherscan-api-key $BASESCAN_KEY
```

**Private key** (least safe, only for testnets / throwaway wallets):
```bash
PRIVATE_KEY=0x... forge script script/Deploy.s.sol \
  --rpc-url $BASE_RPC \
  --private-key $PRIVATE_KEY \
  --broadcast
```

### 4. Post-deploy checks

After the tx confirms:

- Verify the deployed address matches the predicted one (`broadcast/`).
- Verify on Basescan the source is shown (`--verify` flag did this).
- Read `controller()` — must be your deploy EOA.
- Read `genesisComplete()` — must be `false`.

### 5. Opening genesis

Genesis is permissionless — anyone can call `mintGenesis(units)` with
`units * 0.01 ETH`. Publicize the contract address; do not call it from
the controller wallet (unnecessary).

### 6. Seeding the pool

Two routes:

- **Full**: `seedPool()` — callable by anyone once `genesisMinted == GENESIS_CAP`.
- **Partial**: `partialSeed()` — callable **only by controller**, only after
  `deployedAt + 30 min`. Use this if genesis stalls below the cap.

Seeding initializes the V4 pool and mints LP to the controller. After this
call, `mine()` becomes callable.

### 7. Deploy MinerAgent (optional but recommended)

```bash
NONCE_ADDRESS=0xYourNonce \
forge script script/DeployMinerAgent.s.sol \
  --rpc-url $BASE_RPC \
  --account nonce-base \
  --broadcast \
  --verify \
  --verifier-url 'https://api.basescan.org/v2/api?chainid=8453' \
  --etherscan-api-key $BASESCAN_KEY
```

### 8. Wire MinerAgent metadata

```bash
MINER_AGENT_ADDRESS=0xYourMinerAgent \
BASE_URI="https://YOUR_DOMAIN/api/agent/" \
CONTRACT_URI="https://YOUR_DOMAIN/api/collection" \
forge script script/SetMinerAgentURI.s.sol \
  --rpc-url $BASE_RPC \
  --account nonce-base \
  --broadcast
```

### 9. Register on ERC-8004 (when the registry exists on Base)

```bash
AGENT_URI="https://YOUR_DOMAIN/agent.json" \
IDENTITY_REGISTRY=0x...                    \
forge script script/RegisterAgent.s.sol  \
  --rpc-url $BASE_RPC --account nonce-base --broadcast
```

The ERC-8004 IdentityRegistry on Base must be supplied via the
`IDENTITY_REGISTRY` env var — there's no hardcoded canonical address in
the script for Base yet. Check 8004scan.io or the EIP repo for the
current Base deployment before running.

## Testing

```bash
forge test -vv
```

The 49 unit tests cover the contract surface (mine, genesis, refund,
seed, swap, claim, soulbound NFT, tier resolution). They are
chain-agnostic — no fork required.

## Storage layout

| Slot | Variable |
|------|----------|
| 0    | `_balances` (mapping) |
| 1    | `_allowances` (mapping) |
| 2    | `_totalSupply` |
| 3    | `_name` |
| 4    | `_symbol` |
| 5    | `_status` (ReentrancyGuard) |
| 6    | `genesisEthRaised` |
| 7    | `genesisMinted` |
| 8    | `genesisComplete` |
| 9    | `totalMints` |
| 10   | `totalMiningMinted` |
| 11   | `currentDifficulty` |
| 12   | `lastAdjustmentMint` |
| 13   | `lastAdjustmentBlock` |
| 14   | `mintsInBlock` (mapping) |
| 15   | `usedProofs` (mapping) |
| 16+  | `poolKey` (struct) |
