// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {Nonce} from "../src/Nonce.sol";

/// @notice End-to-end fork tests against mainnet V4. Requires MAINNET_RPC env.
///         Run with:  forge test --match-contract NonceFork -vv
contract NonceForkTest is Test {
    address constant POOL_MANAGER     = 0x000000000004444c5dc75cB358380D2e3dE08A90;
    address constant POSITION_MANAGER = 0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e;
    address constant PERMIT2          = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    uint160 constant HOOK_FLAGS = uint160(0x20CC);
    uint160 constant HOOK_MASK  = uint160(0x3FFF);

    uint256 constant SLOT_GENESIS_ETH_RAISED = 6;
    uint256 constant SLOT_GENESIS_MINTED     = 7;
    uint256 constant SLOT_GENESIS_COMPLETE   = 8;
    uint256 constant SLOT_CURRENT_DIFFICULTY = 11;

    Nonce internal nonce;

    function setUp() public {
        vm.createSelectFork(vm.envString("MAINNET_RPC"));

        bytes memory initCode = abi.encodePacked(
            type(Nonce).creationCode,
            abi.encode(POOL_MANAGER, POSITION_MANAGER, PERMIT2)
        );
        bytes32 initCodeHash = keccak256(initCode);

        (bytes32 salt, address predicted) = _mineSalt(initCodeHash);

        // Prank tx.origin = address(this) so the constructor records us as controller.
        bytes memory payload = abi.encodePacked(salt, initCode);
        vm.prank(address(this), address(this));
        (bool ok,) = CREATE2_DEPLOYER.call(payload);
        require(ok, "create2 deploy failed");
        require(predicted.code.length > 0, "no code at predicted");

        nonce = Nonce(payable(predicted));
        require(uint160(predicted) & HOOK_MASK == HOOK_FLAGS, "bad hook bits");
        require(nonce.controller() == address(this), "controller mismatch");
    }

    /// Verifies seedPool against real V4: we shortcut the 210-tx genesis fill
    /// by setting state directly, then call seedPool to exercise pool init,
    /// LP minting, and Permit2 approvals.
    function test_seedPool_completes() public {
        uint256 eth = 10.5 ether;
        vm.store(address(nonce), bytes32(SLOT_GENESIS_MINTED), bytes32(nonce.GENESIS_CAP()));
        vm.store(address(nonce), bytes32(SLOT_GENESIS_ETH_RAISED), bytes32(eth));
        vm.deal(address(nonce), eth);

        nonce.seedPool();

        assertTrue(nonce.genesisComplete(), "genesis not complete");
        assertGt(nonce.currentDifficulty(), 0, "difficulty not set");
        // V4 liquidity math can leave a few wei of dust above MINING_SUPPLY;
        // tolerate up to 10k wei (extremely tight relative to 18.9M * 1e18).
        assertApproxEqAbs(
            nonce.balanceOf(address(nonce)),
            nonce.MINING_SUPPLY(),
            10_000,
            "mining supply not held by contract"
        );
        assertGe(nonce.balanceOf(address(nonce)), nonce.MINING_SUPPLY(), "below mining supply");
    }

    /// After seedPool, mine() should be callable. We slam difficulty to max
    /// so any nonce satisfies the proof, then verify a successful mint.
    function test_mine_afterSeed() public {
        uint256 eth = 10.5 ether;
        vm.store(address(nonce), bytes32(SLOT_GENESIS_MINTED), bytes32(nonce.GENESIS_CAP()));
        vm.store(address(nonce), bytes32(SLOT_GENESIS_ETH_RAISED), bytes32(eth));
        vm.deal(address(nonce), eth);
        nonce.seedPool();

        vm.store(address(nonce), bytes32(SLOT_CURRENT_DIFFICULTY), bytes32(type(uint256).max));

        address miner = address(0xBEEF);
        vm.prank(miner);
        nonce.mine(1);

        assertEq(nonce.balanceOf(miner), nonce.BASE_REWARD(), "miner did not receive reward");
        assertEq(nonce.totalMints(), 1);
    }

    /// partialSeed path: only controller can call, must wait 30 min, requires
    /// some genesisMinted. Verifies the time-gated controller-only branch.
    function test_partialSeed_byController() public {
        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        nonce.mintGenesis{value: 0.05 ether}(5);

        assertEq(nonce.genesisMinted(), 5_000e18);

        vm.warp(block.timestamp + 30 minutes + 1);
        nonce.partialSeed();

        assertTrue(nonce.genesisComplete());
        assertGt(nonce.currentDifficulty(), 0);
    }

    /// partialSeed must revert before the 30 minute delay.
    function test_partialSeed_revertsBeforeDelay() public {
        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        nonce.mintGenesis{value: 0.05 ether}(5);

        vm.expectRevert(Nonce.TooSoon.selector);
        nonce.partialSeed();
    }

    /// partialSeed must revert if called by anyone other than the controller.
    function test_partialSeed_revertsForNonController() public {
        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        nonce.mintGenesis{value: 0.05 ether}(5);

        vm.warp(block.timestamp + 30 minutes + 1);
        vm.prank(buyer);
        vm.expectRevert(Nonce.NotController.selector);
        nonce.partialSeed();
    }

    function _mineSalt(bytes32 initCodeHash) internal pure returns (bytes32, address) {
        for (uint256 i = 0; i < 1_000_000; i++) {
            bytes32 salt = bytes32(i);
            address addr = _create2Addr(CREATE2_DEPLOYER, salt, initCodeHash);
            if (uint160(addr) & HOOK_MASK == HOOK_FLAGS) {
                return (salt, addr);
            }
        }
        revert("salt mine exhausted");
    }

    function _create2Addr(address deployer, bytes32 salt, bytes32 initCodeHash) internal pure returns (address) {
        return address(uint160(uint256(keccak256(
            abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash)
        ))));
    }
}
