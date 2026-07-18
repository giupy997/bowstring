import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain, http } from "viem";

// Get a free project id at https://cloud.reown.com (formerly WalletConnect Cloud).
// Until you set NEXT_PUBLIC_WC_PROJECT_ID, WalletConnect-based wallets (Rainbow,
// Trust, etc.) will not function in this app. MetaMask works regardless.
const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "PLACEHOLDER";

// Robinhood Chain mainnet — Arbitrum-stack L2, gas in ETH, chainId 4663.
// Not shipped in wagmi/chains yet, so we define it ourselves.
// multicall3 presence verified on-chain 2026-07-15 (canonical address),
// so wagmi's useReadContracts batching works out of the box.
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_ROBINHOOD_RPC ??
          "https://rpc.mainnet.chain.robinhood.com",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
    },
  },
});

export const config = getDefaultConfig({
  appName: "Bowstring",
  projectId,
  chains: [robinhoodChain],
  transports: {
    [robinhoodChain.id]: http(
      process.env.NEXT_PUBLIC_ROBINHOOD_RPC ??
        "https://rpc.mainnet.chain.robinhood.com"
    ),
  },
  ssr: true,
});
