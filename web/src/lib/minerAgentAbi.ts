// Minimal ABI for the MinerAgent ERC-721 contract — only the functions the
// frontend actually calls. The full ABI lives in out/MinerAgent.sol/MinerAgent.json
// post-compilation; we keep this trimmed version inline for bundle size.
export const minerAgentAbi = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "agentIdOf",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalAgents",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "MIN_BALANCE_TO_CLAIM",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  // Errors the claim() function may revert with.
  { type: "error", name: "AlreadyClaimed", inputs: [] },
  { type: "error", name: "NotEligible", inputs: [] },
  // Event emitted on successful claim, useful for tx success UX.
  {
    type: "event",
    name: "AgentMinted",
    anonymous: false,
    inputs: [
      { indexed: true, name: "agent", type: "address" },
      { indexed: true, name: "tokenId", type: "uint256" },
      { indexed: false, name: "heldBalanceAtClaim", type: "uint256" },
    ],
  },
] as const;
