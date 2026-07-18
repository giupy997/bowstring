// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {Bowstring} from "../src/Bowstring.sol";

/// @notice End-to-end fork tests against Robinhood Chain V4. Requires
///         ROBINHOOD_RPC env (https://rpc.mainnet.chain.robinhood.com).
///         Run with:  forge test --match-contract BowstringFork -vv
contract BowstringForkTest is Test {
    address constant POOL_MANAGER     = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address constant POSITION_MANAGER = 0x58daec3116aae6D93017bAAea7749052E8a04fA7;
    address constant PERMIT2          = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    uint160 constant HOOK_FLAGS = uint160(0x20CC);
    uint160 constant HOOK_MASK  = uint160(0x3FFF);

    uint256 constant SLOT_GENESIS_ETH_RAISED = 6;
    uint256 constant SLOT_GENESIS_MINTED     = 7;
    uint256 constant SLOT_GENESIS_COMPLETE   = 8;
    uint256 constant SLOT_CURRENT_DIFFICULTY = 11;

    Bowstring internal bow;

    function setUp() public {
        vm.createSelectFork(vm.envString("ROBINHOOD_RPC"));

        bytes memory initCode = abi.encodePacked(
            type(Bowstring).creationCode,
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

        bow = Bowstring(payable(predicted));
        require(uint160(predicted) & HOOK_MASK == HOOK_FLAGS, "bad hook bits");
        require(bow.controller() == address(this), "controller mismatch");
    }

    /// Verifies seedPool against real V4: we shortcut the 210-tx genesis fill
    /// by setting state directly, then call seedPool to exercise pool init,
    /// LP minting, and Permit2 approvals.
    function test_seedPool_completes() public {
        uint256 eth = 10.5 ether;
        vm.store(address(bow), bytes32(SLOT_GENESIS_MINTED), bytes32(bow.GENESIS_CAP()));
        vm.store(address(bow), bytes32(SLOT_GENESIS_ETH_RAISED), bytes32(eth));
        vm.deal(address(bow), eth);

        bow.seedPool();

        assertTrue(bow.genesisComplete(), "genesis not complete");
        assertGt(bow.currentDifficulty(), 0, "difficulty not set");
        // V4 liquidity math can leave a few wei of dust above MINING_SUPPLY;
        // tolerate up to 10k wei (extremely tight relative to 18.9M * 1e18).
        assertApproxEqAbs(
            bow.balanceOf(address(bow)),
            bow.MINING_SUPPLY(),
            10_000,
            "mining supply not held by contract"
        );
        assertGe(bow.balanceOf(address(bow)), bow.MINING_SUPPLY(), "below mining supply");
    }

    /// After seedPool, mine() should be callable. We slam difficulty to max
    /// so any nonce satisfies the proof, then verify a successful mint.
    function test_mine_afterSeed() public {
        uint256 eth = 10.5 ether;
        vm.store(address(bow), bytes32(SLOT_GENESIS_MINTED), bytes32(bow.GENESIS_CAP()));
        vm.store(address(bow), bytes32(SLOT_GENESIS_ETH_RAISED), bytes32(eth));
        vm.deal(address(bow), eth);
        bow.seedPool();

        vm.store(address(bow), bytes32(SLOT_CURRENT_DIFFICULTY), bytes32(type(uint256).max));

        address miner = address(0xBEEF);
        vm.prank(miner);
        bow.mine(1);

        assertEq(bow.balanceOf(miner), bow.BASE_REWARD(), "miner did not receive reward");
        assertEq(bow.totalMints(), 1);
    }

    /// partialSeed path: only controller can call, must wait 30 min, requires
    /// some genesisMinted. Verifies the time-gated controller-only branch.
    function test_partialSeed_byController() public {
        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        bow.mintGenesis{value: 0.05 ether}(5);

        assertEq(bow.genesisMinted(), 5_000e18);

        vm.warp(block.timestamp + 30 minutes + 1);
        bow.partialSeed();

        assertTrue(bow.genesisComplete());
        assertGt(bow.currentDifficulty(), 0);
    }

    /// partialSeed must revert before the 30 minute delay.
    function test_partialSeed_revertsBeforeDelay() public {
        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        bow.mintGenesis{value: 0.05 ether}(5);

        vm.expectRevert(Bowstring.TooSoon.selector);
        bow.partialSeed();
    }

    /// partialSeed must revert if called by anyone other than the controller.
    function test_partialSeed_revertsForNonController() public {
        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        bow.mintGenesis{value: 0.05 ether}(5);

        vm.warp(block.timestamp + 30 minutes + 1);
        vm.prank(buyer);
        vm.expectRevert(Bowstring.NotController.selector);
        bow.partialSeed();
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
