// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {Nonce} from "../src/Nonce.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

/// @notice Unit tests for the non-V4 parts of Nonce. We bypass the genesis →
///         seedPool → V4-pool path by setting `genesisComplete` and
///         `currentDifficulty` directly via vm.store, and pre-funding the
///         contract with `deal`. V4-integrated flows belong in fork tests.
contract NonceTest is Test {
    Nonce internal nonce;
    address internal controller;
    address internal miner = address(0xBEEF);

    // Placeholders for constructor. They must be non-zero. They are never
    // dereferenced because we skip seedPool and hooks in these tests.
    address constant FAKE_PM   = address(0x1111);
    address constant FAKE_POSM = address(0x2222);
    address constant FAKE_P2   = address(0x3333);

    uint160 constant HOOK_FLAGS = uint160(0x20CC);
    uint160 constant HOOK_MASK  = uint160(0x3FFF);

    uint256 constant SLOT_GENESIS_COMPLETE   = 8;
    uint256 constant SLOT_CURRENT_DIFFICULTY = 11;

    function setUp() public {
        controller = address(this);

        bytes memory initCode = abi.encodePacked(
            type(Nonce).creationCode,
            abi.encode(FAKE_PM, FAKE_POSM, FAKE_P2)
        );
        bytes32 initCodeHash = keccak256(initCode);

        (bytes32 salt, address predicted) = _mineSalt(initCodeHash, address(this));

        Nonce deployed;
        assembly {
            deployed := create2(0, add(initCode, 0x20), mload(initCode), salt)
        }
        require(address(deployed) == predicted, "addr mismatch");
        require(uint160(predicted) & HOOK_MASK == HOOK_FLAGS, "hook bits");
        nonce = deployed;

        vm.store(address(nonce), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(1)));
        vm.store(address(nonce), bytes32(SLOT_CURRENT_DIFFICULTY), bytes32(type(uint256).max));
        deal(address(nonce), address(nonce), nonce.MINING_SUPPLY());
    }

    function test_mine_singleSuccess() public {
        uint256 reward = nonce.currentReward();
        assertEq(reward, 100e18);

        vm.prank(miner);
        nonce.mine(42);

        assertEq(nonce.balanceOf(miner), 100e18);
        assertEq(nonce.totalMints(), 1);
        assertEq(nonce.totalMiningMinted(), 100e18);
        assertEq(nonce.mintsInBlock(block.number), 1);
    }

    function test_mine_replayInSameEpochReverts() public {
        vm.prank(miner);
        nonce.mine(42);

        vm.expectRevert(Nonce.ProofAlreadyUsed.selector);
        vm.prank(miner);
        nonce.mine(42);
    }

    function test_mine_blockCapReached() public {
        for (uint256 i = 0; i < 10; i++) {
            vm.prank(miner);
            nonce.mine(i);
        }
        assertEq(nonce.mintsInBlock(block.number), 10);

        vm.expectRevert(Nonce.BlockCapReached.selector);
        vm.prank(miner);
        nonce.mine(99);
    }

    function test_mine_blockCapResetsNextBlock() public {
        for (uint256 i = 0; i < 10; i++) {
            vm.prank(miner);
            nonce.mine(i);
        }
        vm.roll(block.number + 1);
        vm.prank(miner);
        nonce.mine(100);
        assertEq(nonce.totalMints(), 11);
    }

    function test_mine_perWalletNoCollision() public {
        address miner2 = address(0xCAFE);

        vm.prank(miner);
        nonce.mine(7);

        // Same nonce, different miner — different proof key → OK
        vm.prank(miner2);
        nonce.mine(7);

        assertEq(nonce.balanceOf(miner), 100e18);
        assertEq(nonce.balanceOf(miner2), 100e18);
    }

    function test_mine_difficultyTooHighReverts() public {
        // Set difficulty so low that very few hashes satisfy it.
        vm.store(address(nonce), bytes32(SLOT_CURRENT_DIFFICULTY), bytes32(uint256(1)));

        vm.expectRevert(Nonce.InsufficientWork.selector);
        vm.prank(miner);
        nonce.mine(42);
    }

    function test_mine_supplyExhausted() public {
        // Drain the contract's NONCE balance so the next mine has nothing left.
        deal(address(nonce), address(nonce), 0);
        // Mark all mining supply as already minted.
        vm.store(address(nonce), bytes32(uint256(10)), bytes32(nonce.MINING_SUPPLY()));

        vm.expectRevert(Nonce.SupplyExhausted.selector);
        vm.prank(miner);
        nonce.mine(42);
    }

    function test_genesisMint_buyOneUnit() public {
        // Reset genesisComplete=false to test genesis flow.
        vm.store(address(nonce), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));

        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);

        vm.prank(buyer);
        nonce.mintGenesis{value: 0.01 ether}(1);

        assertEq(nonce.balanceOf(buyer), 1_000e18);
        assertEq(nonce.genesisMinted(), 1_000e18);
        assertEq(nonce.genesisEthRaised(), 0.01 ether);
    }

    function test_genesisMint_refundExcess() public {
        vm.store(address(nonce), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));

        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);

        vm.prank(buyer);
        nonce.mintGenesis{value: 0.5 ether}(5);

        // 5 units × 0.01 ETH = 0.05 ETH cost, 0.45 ETH refunded.
        assertEq(buyer.balance, 0.95 ether);
        assertEq(nonce.balanceOf(buyer), 5_000e18);
    }

    function test_genesisMint_overTxCapReverts() public {
        vm.store(address(nonce), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));

        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);

        vm.prank(buyer);
        vm.expectRevert(Nonce.TxCapExceeded.selector);
        nonce.mintGenesis{value: 0.06 ether}(6);
    }

    function test_genesisMint_underpaymentReverts() public {
        vm.store(address(nonce), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));

        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);

        vm.prank(buyer);
        vm.expectRevert(Nonce.InsufficientPayment.selector);
        nonce.mintGenesis{value: 0.005 ether}(1);
    }

    function test_refund_revertsBeforeGrace() public {
        vm.store(address(nonce), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));
        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        nonce.mintGenesis{value: 0.01 ether}(1);

        vm.prank(buyer);
        vm.expectRevert(Nonce.RefundGraceNotPassed.selector);
        nonce.refundGenesis(1_000e18);
    }

    function test_refund_revertsAfterGenesisComplete() public {
        vm.store(address(nonce), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));
        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        nonce.mintGenesis{value: 0.01 ether}(1);
        vm.store(address(nonce), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(1)));

        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(buyer);
        vm.expectRevert(Nonce.GenesisAlreadyComplete.selector);
        nonce.refundGenesis(1_000e18);
    }

    function test_refund_revertsForNonUnitMultiple() public {
        vm.store(address(nonce), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));
        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        nonce.mintGenesis{value: 0.01 ether}(1);

        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(buyer);
        vm.expectRevert(Nonce.MustBeUnitMultiple.selector);
        nonce.refundGenesis(500e18); // half a unit
    }

    function test_refund_revertsForZero() public {
        vm.store(address(nonce), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));
        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(address(0xABCD));
        vm.expectRevert(Nonce.MustBeUnitMultiple.selector);
        nonce.refundGenesis(0);
    }

    function test_refund_successfulFullUnit() public {
        vm.store(address(nonce), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));
        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);

        vm.prank(buyer);
        nonce.mintGenesis{value: 0.01 ether}(1);
        assertEq(nonce.balanceOf(buyer), 1_000e18);
        assertEq(buyer.balance, 0.99 ether);

        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(buyer);
        nonce.refundGenesis(1_000e18);

        assertEq(nonce.balanceOf(buyer), 0, "nonce should be burned");
        assertEq(buyer.balance, 1 ether, "eth should be returned");
        assertEq(nonce.genesisMinted(), 0);
        assertEq(nonce.genesisEthRaised(), 0);
    }

    function test_refund_partialOfFiveUnits() public {
        vm.store(address(nonce), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));
        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);

        vm.prank(buyer);
        nonce.mintGenesis{value: 0.05 ether}(5);
        assertEq(nonce.balanceOf(buyer), 5_000e18);
        assertEq(nonce.genesisMinted(), 5_000e18);
        assertEq(nonce.genesisEthRaised(), 0.05 ether);

        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(buyer);
        nonce.refundGenesis(2_000e18);

        assertEq(nonce.balanceOf(buyer), 3_000e18, "keeps 3 units worth");
        assertEq(buyer.balance, 0.97 ether, "0.02 eth back over the 0.95 untouched");
        assertEq(nonce.genesisMinted(), 3_000e18);
        assertEq(nonce.genesisEthRaised(), 0.03 ether);
    }

    function test_refund_doubleSpendReverts() public {
        vm.store(address(nonce), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));
        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        nonce.mintGenesis{value: 0.01 ether}(1);

        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(buyer);
        nonce.refundGenesis(1_000e18);

        vm.prank(buyer);
        vm.expectRevert();
        nonce.refundGenesis(1_000e18);
    }

    function test_refundUnlocked_view() public {
        vm.store(address(nonce), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));
        assertFalse(nonce.refundUnlocked(), "before grace");

        vm.warp(block.timestamp + 3 days + 1);
        assertTrue(nonce.refundUnlocked(), "after grace, pre-seed");

        vm.store(address(nonce), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(1)));
        assertFalse(nonce.refundUnlocked(), "after seed");
    }

    function test_constants() public view {
        assertEq(nonce.TOTAL_SUPPLY(), 21_000_000e18);
        assertEq(nonce.MINING_SUPPLY(), 18_900_000e18);
        assertEq(nonce.GENESIS_CAP(), 1_050_000e18);
        assertEq(nonce.BASE_REWARD(), 100e18);
        assertEq(nonce.ERA_MINTS(), 100_000);
        assertEq(nonce.EPOCH_BLOCKS(), 600);
        assertEq(nonce.ADJUSTMENT_INTERVAL(), 2_016);
        assertEq(nonce.TARGET_BLOCKS_PER_MINT(), 30);
        assertEq(nonce.MAX_MINTS_PER_BLOCK(), 10);
        assertEq(nonce.name(), "Nonce");
        assertEq(nonce.symbol(), "NONCE");
    }

    function _mineSalt(bytes32 initCodeHash, address deployer) internal pure returns (bytes32, address) {
        for (uint256 i = 0; i < 1_000_000; i++) {
            bytes32 salt = bytes32(i);
            address addr = _create2Addr(deployer, salt, initCodeHash);
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
