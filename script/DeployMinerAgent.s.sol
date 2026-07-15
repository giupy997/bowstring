// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {MinerAgent, IBowstring} from "../src/MinerAgent.sol";

/// @notice Deploys the MinerAgent NFT contract pointing at an existing
///         Bowstring deployment. The Bowstring address must be passed via the
///         BOW_ADDRESS env var (so we never accidentally point at the
///         wrong chain's Bowstring).
///
///         Example (Sepolia):
///           BOW_ADDRESS=0xf8bcf8AE88B2fd5a67d74a6eeb6c4b5A366AE0Cc \
///           forge script script/DeployMinerAgent.s.sol \
///             --rpc-url $ROBINHOOD_RPC --account bowstring --broadcast --verify
contract DeployMinerAgent is Script {
    function run() external {
        address bowstringAddr = vm.envAddress("BOW_ADDRESS");
        console2.log("Bowstring:", bowstringAddr);

        vm.startBroadcast();
        MinerAgent agent = new MinerAgent(IBowstring(bowstringAddr));
        vm.stopBroadcast();

        console2.log("MinerAgent:", address(agent));
        console2.log("Name:      ", agent.name());
        console2.log("Symbol:    ", agent.symbol());
    }
}
