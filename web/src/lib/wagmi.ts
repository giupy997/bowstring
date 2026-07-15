import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, baseSepolia } from "wagmi/chains";
import { http } from "viem";

// Get a free project id at https://cloud.reown.com (formerly WalletConnect Cloud).
// Until you set NEXT_PUBLIC_WC_PROJECT_ID, WalletConnect-based wallets (Rainbow,
// Trust, etc.) will not function in this app. MetaMask works regardless.
const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "PLACEHOLDER";

const rpcBase        = process.env.NEXT_PUBLIC_BASE_RPC;
const rpcBaseSepolia = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC;

// Default RPCs when the env vars aren't wired up yet. PublicNode is free,
// no API key, supports the canonical multicall3 contract that wagmi's
// useReadContracts batches through. For production load swap these for a
// dedicated endpoint (Alchemy / QuickNode) by setting NEXT_PUBLIC_BASE_RPC
// in the Netlify dashboard.
const DEFAULT_BASE_RPC         = "https://base-rpc.publicnode.com";
const DEFAULT_BASE_SEPOLIA_RPC = "https://base-sepolia-rpc.publicnode.com";

export const config = getDefaultConfig({
  appName: "Nonce",
  projectId,
  // Base first so RainbowKit defaults to it.
  chains: [base, baseSepolia],
  transports: {
    [base.id]:        http(rpcBase        ?? DEFAULT_BASE_RPC),
    [baseSepolia.id]: http(rpcBaseSepolia ?? DEFAULT_BASE_SEPOLIA_RPC),
  },
  ssr: true,
});
