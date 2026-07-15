// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";

interface IMinerAgent {
    function setExternalBaseURI(string calldata uri) external;
    function setExternalContractURI(string calldata uri) external;
    function externalBaseURI() external view returns (string memory);
    function externalContractURI() external view returns (string memory);
    function uriUpdater() external view returns (address);
    function metadataLocked() external view returns (bool);
}

/// @notice One-shot script that points an already-deployed MinerAgent at
///         the metadata server in /web/src/app/api/agent (Option B for
///         dynamic tier resolution).
///
///         Must be run by the `uriUpdater` address (set at construction
///         to the deployer of MinerAgent). Fails if `metadataLocked` is
///         already true.
///
///         Example:
///           MINER_AGENT_ADDRESS=0x... \
///           BASE_URI="https://nonce.com/api/agent/" \
///           CONTRACT_URI="https://nonce.com/nft/collection.json" \
///           forge script script/SetMinerAgentURI.s.sol \
///             --rpc-url $MAINNET_RPC --account nonce-mainnet --broadcast
///
///         CONTRACT_URI is optional — leave it unset to keep the on-chain
///         default contractURI() SVG card.
contract SetMinerAgentURI is Script {
    function run() external {
        address minerAgentAddr = vm.envAddress("MINER_AGENT_ADDRESS");
        string memory baseUri  = vm.envString("BASE_URI");
        string memory contractUri = vm.envOr("CONTRACT_URI", string(""));

        IMinerAgent agent = IMinerAgent(minerAgentAddr);

        require(!agent.metadataLocked(), "MinerAgent: metadata frozen, cannot swap URIs");

        console2.log("MinerAgent:    ", minerAgentAddr);
        console2.log("URI updater:   ", agent.uriUpdater());
        console2.log("Current base:  ", agent.externalBaseURI());
        console2.log("New base:      ", baseUri);

        vm.startBroadcast();
        agent.setExternalBaseURI(baseUri);
        if (bytes(contractUri).length > 0) {
            agent.setExternalContractURI(contractUri);
            console2.log("New contract URI:", contractUri);
        }
        vm.stopBroadcast();

        console2.log("Done. tokenURI(N) -> ", string.concat(baseUri, "<N>.json"));
    }
}
