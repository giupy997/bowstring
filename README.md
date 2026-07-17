# GOLD — Robinhood Chain

Mined ERC-20 with a self-hook — the token contract IS its own Uniswap V4
hook. One address, one bytecode: the token, the hook, and the PoW miner
are the same contract.

This repo is the **Robinhood Chain mainnet** (chainId 4663) fork of the
Base project (`~/Desktop/daemon-base`, itself a fork of the original
Ethereum project `~/Desktop/pick`). Contract logic is identical; only the
deploy script V4 addresses, timing constants, frontend chain config, and
explorer URLs differ.

Logic forked 1:1 from `hash256.org` (MIT). Branding and frontend are new.

## Architecture

- **Token** — ERC-20 named `Gold` / `GOLD`, 21M cap, 18 decimals.
- **Genesis sale** — 1.05M GOLD (5%) sold at `0.01 ETH` per `1,000 GOLD`,
  max 5 units per tx. ETH raised goes into the Uniswap V4 pool.
- **Pool seeding** — once genesis is sold out (or 30 min after deploy via
  `partialSeed`), 1.05M GOLD + raised ETH form the V4 LP; the controller
  receives the LP position.
- **Mining** — 18.9M GOLD (90%) released via PoW.
  - Challenge: `keccak256(keccak256(chainId, contract, miner, epoch), nonce) < currentDifficulty`
  - Epoch: every 100 blocks (~20 min, see block-number note below)
  - Reward: `100 GOLD >> era`, era = `totalMints / 100_000`
  - Retarget: every 2016 mints, clamped ±4×, targeting ~1 mint / 10 min
  - Cap: 1 mint/block
  - Replay protection: per-(miner, nonce, epoch)
- **Self-hook** — 1% of every swap is taken as ETH and accumulated on the
  contract. `controller` (the address that deployed the contract) calls
  `claimFees()` to withdraw.

> **Robinhood Chain block-number semantics.** Robinhood Chain is an
> Arbitrum-stack L2: inside the EVM, `block.number` returns the **parent
> chain (Ethereum) height**, advancing every ~12 s — NOT the ~0.1 s L2
> block index that the JSON-RPC layer reports. Verified on-chain
> 2026-07-15 via `eth_call` state-override (NUMBER opcode == Ethereum
> mainnet height). The timing constants therefore use the original
> Ethereum-denominated values: `EPOCH_BLOCKS = 100` → ~20 min epoch,
> `TARGET_BLOCKS_PER_MINT = 50` → ~1 mint / 10 min, 18.9M GOLD released
> over ~3.6 years at target rate.

## Verified chain facts (2026-07-15)

| Thing | Value |
|-------|-------|
| Chain id | 4663 |
| RPC | `https://rpc.mainnet.chain.robinhood.com` |
| Explorer | `https://robinhoodchain.blockscout.com` |
| Gas token | ETH |
| Uniswap V4 PoolManager | `0x8366a39CC670B4001A1121B8F6A443A643e40951` (code present ✓) |
| Uniswap V4 PositionManager | `0x58daec3116aae6D93017bAAea7749052E8a04fA7` (code present ✓) |
| Uniswap V4 Universal Router | `0x8876789976dEcBfCbBbe364623C63652db8C0904` |
| Uniswap V4 Quoter | `0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` (code present ✓) |
| CREATE2 factory (Arachnid) | `0x4e59b44847b379578588920cA78FbF26c0B4956C` (code present ✓) |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` (code present ✓) |
| `eth_getLogs` range | ~10k blocks per query (100k times out) |

## Setup

```bash
cp .env.example .env
# fill ROBINHOOD_RPC (and BLOCKSCOUT verifier settings if verifying)
forge build
forge test
```

## Deploying

> **Read this before you spend gas.** Deployment is irreversible. The address
> that signs the deploy tx becomes `controller` for life (via `tx.origin`)
> and receives all LP swap fees. Use a fresh, dedicated EOA — **not** a Safe,
> factory, or smart-contract wallet.

### 1. Fund the deploy wallet

Send ETH to the EOA that will sign the deploy (L2 gas is cheap; a small
amount covers a comfortable buffer). Bridge via the official Robinhood
Chain bridge.

### 2. Dry-run against a fork

```bash
forge script script/Deploy.s.sol \
  --rpc-url $ROBINHOOD_RPC \
  -vvv
```

The script:
1. Mines a CREATE2 salt that lands the address at `addr & 0x3FFF == 0x20CC`
   (≈ 16k iterations average, sub-second).
2. Logs the predicted address.
3. Does NOT broadcast — review the logs.

### 3. Real deployment (Robinhood Chain mainnet)

Pick **one** of these signing methods:

**Foundry encrypted keystore** (`cast wallet import gold --interactive`):
```bash
forge script script/Deploy.s.sol \
  --rpc-url $ROBINHOOD_RPC \
  --account gold \
  --broadcast \
  --verify \
  --verifier blockscout \
  --verifier-url 'https://robinhoodchain.blockscout.com/api/' \
  --slow
```

**Ledger:**
```bash
forge script script/Deploy.s.sol \
  --rpc-url $ROBINHOOD_RPC \
  --ledger \
  --sender 0xYourLedgerAddress \
  --broadcast \
  --verify \
  --verifier blockscout \
  --verifier-url 'https://robinhoodchain.blockscout.com/api/'
```

**Private key** (least safe, only for testnets / throwaway wallets):
```bash
PRIVATE_KEY=0x... forge script script/Deploy.s.sol \
  --rpc-url $ROBINHOOD_RPC \
  --private-key $PRIVATE_KEY \
  --broadcast
```

### 4. Post-deploy checks

After the tx confirms:

- Verify the deployed address matches the predicted one (`broadcast/`).
- Verify on Blockscout the source is shown (`--verify` flag did this).
- Read `controller()` — must be your deploy EOA.
- Read `genesisComplete()` — must be `false`.
- Fill `GOLD_ADDRESS` in `web/src/lib/contract.ts`.

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
GOLD_ADDRESS=0xYourGold \
forge script script/DeployMinerAgent.s.sol \
  --rpc-url $ROBINHOOD_RPC \
  --account gold \
  --broadcast \
  --verify \
  --verifier blockscout \
  --verifier-url 'https://robinhoodchain.blockscout.com/api/'
```

Then fill `MINER_AGENT_ADDRESS` in `web/src/lib/contract.ts` and flip
`CLAIM_LIVE` in `MinerAgent.tsx`.

### 8. Wire MinerAgent metadata

```bash
MINER_AGENT_ADDRESS=0xYourMinerAgent \
BASE_URI="https://YOUR_DOMAIN/api/agent/" \
CONTRACT_URI="https://YOUR_DOMAIN/api/collection" \
forge script script/SetMinerAgentURI.s.sol \
  --rpc-url $ROBINHOOD_RPC \
  --account gold \
  --broadcast
```

### 9. Register on ERC-8004 (when a registry exists on Robinhood Chain)

```bash
AGENT_URI="https://YOUR_DOMAIN/agent.json" \
IDENTITY_REGISTRY=0x...                    \
forge script script/RegisterAgent.s.sol  \
  --rpc-url $ROBINHOOD_RPC --account gold --broadcast
```

The ERC-8004 IdentityRegistry address on Robinhood Chain must be supplied
via the `IDENTITY_REGISTRY` env var — no canonical deployment is known on
4663 yet. Check 8004scan.io or the EIP repo before running; after
registration, fill the agent id into the NFT metadata routes
(`web/src/app/api/agent/[id]/route.ts`, `api/collection/route.ts`).

## Pre-launch checklist (branding)

- [ ] Domain: replace `gold-tbd.com` placeholders (`layout.tsx`,
      `api/collection/route.ts`) and the `Site:`/`X:` lines in
      `src/Gold.sol` — the contract header is immutable once deployed.
- [ ] `NEXT_PUBLIC_WC_PROJECT_ID` (Reown/WalletConnect) in Netlify env.
- [ ] NFT artworks: the 10 IPFS artworks referenced by
      `api/agent/[id]/route.ts` are still the NONCE set — regenerate or
      re-pin for the Gold brand.
- [ ] `web/public/logo.png` + hero art still NONCE-branded.

## Testing

```bash
forge test -vv
```

The unit tests cover the contract surface (mine, genesis, refund,
seed, swap, claim, soulbound NFT, tier resolution). They are
chain-agnostic — no fork required. Fork tests (`GoldFork`) run
against `ROBINHOOD_RPC`.

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
