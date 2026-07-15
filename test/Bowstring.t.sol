// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {Bowstring} from "../src/Bowstring.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

/// @notice Unit tests for the non-V4 parts of Bowstring. We bypass the genesis →
///         seedPool → V4-pool path by setting `genesisComplete` and
///         `currentDifficulty` directly via vm.store, and pre-funding the
///         contract with `deal`. V4-integrated flows belong in fork tests.
contract BowstringTest is Test {
    Bowstring internal bow;
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
            type(Bowstring).creationCode,
            abi.encode(FAKE_PM, FAKE_POSM, FAKE_P2)
        );
        bytes32 initCodeHash = keccak256(initCode);

        (bytes32 salt, address predicted) = _mineSalt(initCodeHash, address(this));

        Bowstring deployed;
        assembly {
            deployed := create2(0, add(initCode, 0x20), mload(initCode), salt)
        }
        require(address(deployed) == predicted, "addr mismatch");
        require(uint160(predicted) & HOOK_MASK == HOOK_FLAGS, "hook bits");
        bow = deployed;

        vm.store(address(bow), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(1)));
        vm.store(address(bow), bytes32(SLOT_CURRENT_DIFFICULTY), bytes32(type(uint256).max));
        deal(address(bow), address(bow), bow.MINING_SUPPLY());
    }

    function test_mine_singleSuccess() public {
        uint256 reward = bow.currentReward();
        assertEq(reward, 100e18);

        vm.prank(miner);
        bow.mine(42);

        assertEq(bow.balanceOf(miner), 100e18);
        assertEq(bow.totalMints(), 1);
        assertEq(bow.totalMiningMinted(), 100e18);
        assertEq(bow.mintsInBlock(block.number), 1);
    }

    function test_mine_replayInSameEpochReverts() public {
        vm.prank(miner);
        bow.mine(42);

        // Move past the block cap (1 mint/block) but stay in the same epoch
        // so the proof-replay check is what fires.
        vm.roll(block.number + 1);
        vm.expectRevert(Bowstring.ProofAlreadyUsed.selector);
        vm.prank(miner);
        bow.mine(42);
    }

    function test_mine_blockCapReached() public {
        vm.prank(miner);
        bow.mine(0);
        assertEq(bow.mintsInBlock(block.number), 1);

        vm.expectRevert(Bowstring.BlockCapReached.selector);
        vm.prank(miner);
        bow.mine(99);
    }

    function test_mine_blockCapResetsNextBlock() public {
        vm.prank(miner);
        bow.mine(0);
        vm.roll(block.number + 1);
        vm.prank(miner);
        bow.mine(100);
        assertEq(bow.totalMints(), 2);
    }

    function test_mine_perWalletNoCollision() public {
        address miner2 = address(0xCAFE);

        vm.prank(miner);
        bow.mine(7);

        // Same nonce, different miner — different proof key → OK
        // (next block, because of the 1 mint/block cap).
        vm.roll(block.number + 1);
        vm.prank(miner2);
        bow.mine(7);

        assertEq(bow.balanceOf(miner), 100e18);
        assertEq(bow.balanceOf(miner2), 100e18);
    }

    function test_mine_difficultyTooHighReverts() public {
        // Set difficulty so low that very few hashes satisfy it.
        vm.store(address(bow), bytes32(SLOT_CURRENT_DIFFICULTY), bytes32(uint256(1)));

        vm.expectRevert(Bowstring.InsufficientWork.selector);
        vm.prank(miner);
        bow.mine(42);
    }

    function test_mine_supplyExhausted() public {
        // Drain the contract's BOW balance so the next mine has nothing left.
        deal(address(bow), address(bow), 0);
        // Mark all mining supply as already minted.
        vm.store(address(bow), bytes32(uint256(10)), bytes32(bow.MINING_SUPPLY()));

        vm.expectRevert(Bowstring.SupplyExhausted.selector);
        vm.prank(miner);
        bow.mine(42);
    }

    function test_genesisMint_buyOneUnit() public {
        // Reset genesisComplete=false to test genesis flow.
        vm.store(address(bow), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));

        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);

        vm.prank(buyer);
        bow.mintGenesis{value: 0.01 ether}(1);

        assertEq(bow.balanceOf(buyer), 1_000e18);
        assertEq(bow.genesisMinted(), 1_000e18);
        assertEq(bow.genesisEthRaised(), 0.01 ether);
    }

    function test_genesisMint_refundExcess() public {
        vm.store(address(bow), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));

        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);

        vm.prank(buyer);
        bow.mintGenesis{value: 0.5 ether}(5);

        // 5 units × 0.01 ETH = 0.05 ETH cost, 0.45 ETH refunded.
        assertEq(buyer.balance, 0.95 ether);
        assertEq(bow.balanceOf(buyer), 5_000e18);
    }

    function test_genesisMint_overTxCapReverts() public {
        vm.store(address(bow), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));

        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);

        vm.prank(buyer);
        vm.expectRevert(Bowstring.TxCapExceeded.selector);
        bow.mintGenesis{value: 0.06 ether}(6);
    }

    function test_genesisMint_underpaymentReverts() public {
        vm.store(address(bow), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));

        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);

        vm.prank(buyer);
        vm.expectRevert(Bowstring.InsufficientPayment.selector);
        bow.mintGenesis{value: 0.005 ether}(1);
    }

    function test_refund_revertsBeforeGrace() public {
        vm.store(address(bow), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));
        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        bow.mintGenesis{value: 0.01 ether}(1);

        vm.prank(buyer);
        vm.expectRevert(Bowstring.RefundGraceNotPassed.selector);
        bow.refundGenesis(1_000e18);
    }

    function test_refund_revertsAfterGenesisComplete() public {
        vm.store(address(bow), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));
        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        bow.mintGenesis{value: 0.01 ether}(1);
        vm.store(address(bow), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(1)));

        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(buyer);
        vm.expectRevert(Bowstring.GenesisAlreadyComplete.selector);
        bow.refundGenesis(1_000e18);
    }

    function test_refund_revertsForNonUnitMultiple() public {
        vm.store(address(bow), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));
        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        bow.mintGenesis{value: 0.01 ether}(1);

        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(buyer);
        vm.expectRevert(Bowstring.MustBeUnitMultiple.selector);
        bow.refundGenesis(500e18); // half a unit
    }

    function test_refund_revertsForZero() public {
        vm.store(address(bow), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));
        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(address(0xABCD));
        vm.expectRevert(Bowstring.MustBeUnitMultiple.selector);
        bow.refundGenesis(0);
    }

    function test_refund_successfulFullUnit() public {
        vm.store(address(bow), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));
        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);

        vm.prank(buyer);
        bow.mintGenesis{value: 0.01 ether}(1);
        assertEq(bow.balanceOf(buyer), 1_000e18);
        assertEq(buyer.balance, 0.99 ether);

        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(buyer);
        bow.refundGenesis(1_000e18);

        assertEq(bow.balanceOf(buyer), 0, "bow should be burned");
        assertEq(buyer.balance, 1 ether, "eth should be returned");
        assertEq(bow.genesisMinted(), 0);
        assertEq(bow.genesisEthRaised(), 0);
    }

    function test_refund_partialOfFiveUnits() public {
        vm.store(address(bow), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));
        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);

        vm.prank(buyer);
        bow.mintGenesis{value: 0.05 ether}(5);
        assertEq(bow.balanceOf(buyer), 5_000e18);
        assertEq(bow.genesisMinted(), 5_000e18);
        assertEq(bow.genesisEthRaised(), 0.05 ether);

        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(buyer);
        bow.refundGenesis(2_000e18);

        assertEq(bow.balanceOf(buyer), 3_000e18, "keeps 3 units worth");
        assertEq(buyer.balance, 0.97 ether, "0.02 eth back over the 0.95 untouched");
        assertEq(bow.genesisMinted(), 3_000e18);
        assertEq(bow.genesisEthRaised(), 0.03 ether);
    }

    function test_refund_doubleSpendReverts() public {
        vm.store(address(bow), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));
        address buyer = address(0xABCD);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        bow.mintGenesis{value: 0.01 ether}(1);

        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(buyer);
        bow.refundGenesis(1_000e18);

        vm.prank(buyer);
        vm.expectRevert();
        bow.refundGenesis(1_000e18);
    }

    function test_refundUnlocked_view() public {
        vm.store(address(bow), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(0)));
        assertFalse(bow.refundUnlocked(), "before grace");

        vm.warp(block.timestamp + 3 days + 1);
        assertTrue(bow.refundUnlocked(), "after grace, pre-seed");

        vm.store(address(bow), bytes32(SLOT_GENESIS_COMPLETE), bytes32(uint256(1)));
        assertFalse(bow.refundUnlocked(), "after seed");
    }

    function test_constants() public view {
        assertEq(bow.TOTAL_SUPPLY(), 21_000_000e18);
        assertEq(bow.MINING_SUPPLY(), 18_900_000e18);
        assertEq(bow.GENESIS_CAP(), 1_050_000e18);
        assertEq(bow.BASE_REWARD(), 100e18);
        assertEq(bow.ERA_MINTS(), 100_000);
        assertEq(bow.EPOCH_BLOCKS(), 100);
        assertEq(bow.ADJUSTMENT_INTERVAL(), 2_016);
        assertEq(bow.TARGET_BLOCKS_PER_MINT(), 50);
        assertEq(bow.MAX_MINTS_PER_BLOCK(), 1);
        assertEq(bow.name(), "Bowstring");
        assertEq(bow.symbol(), "BOW");
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
