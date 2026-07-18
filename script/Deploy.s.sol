// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {Bowstring} from "../src/Bowstring.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

/// @notice Deploys Bowstring via the canonical deterministic-deployer factory
///         (0x4e59b44847b379578588920cA78FbF26c0B4956C, Arachnid's proxy)
///         after mining a CREATE2 salt that yields an address whose
///         lower 14 bits match the V4 hook permission flags.
///
///         This fork targets **Robinhood Chain mainnet** (chainId 4663).
///         V4 addresses below are the canonical day-one deployment; verify
///         against https://docs.uniswap.org/contracts/v4/deployments before
///         each production run (Uniswap can republish at new addresses).
///         CREATE2 factory presence on 4663 verified on-chain 2026-07-15.
///
/// Required env:
///   PRIVATE_KEY or use --ledger / --account
///   POOL_MANAGER (optional, defaults to Robinhood Chain)
///   POSITION_MANAGER (optional, defaults to Robinhood Chain)
///   PERMIT2 (optional, defaults to canonical)
contract Deploy is Script {
    // CREATE2_FACTORY (0x4e59...956C) is inherited from forge-std/Base.sol

    // Robinhood Chain mainnet (chainId 4663) — Uniswap V4 canonical deployment.
    address constant RH_POOL_MANAGER     = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address constant RH_POSITION_MANAGER = 0x58daec3116aae6D93017bAAea7749052E8a04fA7;
    // Permit2 is deterministically deployed at the same address on every
    // EVM chain — same value as on Ethereum mainnet.
    address constant CANONICAL_PERMIT2     = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    // Hook permission flags packed into the lower 14 bits of the address.
    // beforeInitialize(13) | beforeSwap(7) | afterSwap(6)
    //                     | beforeSwapReturnDelta(3) | afterSwapReturnDelta(2)
    uint160 constant HOOK_FLAGS = uint160(0x20CC);
    uint160 constant HOOK_MASK  = uint160(0x3FFF);

    function run() external {
        address poolManager     = _envOr("POOL_MANAGER", RH_POOL_MANAGER);
        address positionManager = _envOr("POSITION_MANAGER", RH_POSITION_MANAGER);
        address permit2         = _envOr("PERMIT2", CANONICAL_PERMIT2);

        bytes memory initCode = abi.encodePacked(
            type(Bowstring).creationCode,
            abi.encode(poolManager, positionManager, permit2)
        );
        bytes32 initCodeHash = keccak256(initCode);

        console2.log("Mining hook salt...");
        console2.log("PoolManager:    ", poolManager);
        console2.log("PositionManager:", positionManager);
        console2.log("Permit2:        ", permit2);
        console2.log("InitCode hash:  ", vm.toString(initCodeHash));

        (bytes32 salt, address predicted) = _mineSalt(initCodeHash);
        console2.log("Salt found:     ", vm.toString(salt));
        console2.log("Predicted addr: ", predicted);

        vm.startBroadcast();
        _deploy(salt, initCode);
        vm.stopBroadcast();

        require(predicted.code.length > 0, "no code at predicted address");
        require(uint160(predicted) & HOOK_MASK == HOOK_FLAGS, "hook bits mismatch");
        console2.log("Bowstring deployed:  ", predicted);
        console2.log("Controller (tx.origin):", tx.origin);
    }

    function _mineSalt(bytes32 initCodeHash) internal view returns (bytes32, address) {
        for (uint256 i = 0; i < 1_000_000; i++) {
            bytes32 salt = bytes32(i);
            address addr = vm.computeCreate2Address(salt, initCodeHash, CREATE2_FACTORY);
            if (uint160(addr) & HOOK_MASK == HOOK_FLAGS) {
                return (salt, addr);
            }
        }
        revert("no salt found in range");
    }

    function _deploy(bytes32 salt, bytes memory initCode) internal {
        bytes memory payload = abi.encodePacked(salt, initCode);
        (bool ok,) = CREATE2_FACTORY.call(payload);
        require(ok, "create2 factory call failed");
    }

    function _envOr(string memory key, address fallback_) internal view returns (address) {
        try vm.envAddress(key) returns (address v) {
            return v;
        } catch {
            return fallback_;
        }
    }
}
