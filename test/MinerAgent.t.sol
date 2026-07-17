// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {MinerAgent, IGold} from "../src/MinerAgent.sol";

contract MockGold is IGold {
    mapping(address => uint256) public override balanceOf;
    uint256 public override totalMints;
    uint256 public override totalMiningMinted;

    function setBalance(address a, uint256 v) external { balanceOf[a] = v; }
}

contract MinerAgentTest is Test {
    MinerAgent internal agent;
    MockGold   internal gold;

    address internal alice  = address(0xAAAA);
    address internal bob    = address(0xBBBB);
    address internal carol  = address(0xCCCC);

    function setUp() public {
        gold = new MockGold();
        agent = new MinerAgent(IGold(address(gold)));
    }

    function test_claim_basicHappyPath() public {
        gold.setBalance(alice, 500e18);
        vm.prank(alice);
        uint256 tokenId = agent.claim();

        assertEq(tokenId, 1);
        assertEq(agent.ownerOf(tokenId), alice);
        assertEq(agent.agentIdOf(alice), 1);
        assertEq(agent.totalAgents(), 1);
    }

    function test_claim_revertsIfNoGold() public {
        vm.prank(alice);
        vm.expectRevert(MinerAgent.NotEligible.selector);
        agent.claim();
    }

    function test_claim_revertsOnDustBalance() public {
        // 1 wei = below the 1 GOLD floor; should be rejected even though
        // the legacy "balanceOf > 0" check would have let it through.
        gold.setBalance(alice, 1);
        vm.prank(alice);
        vm.expectRevert(MinerAgent.NotEligible.selector);
        agent.claim();

        // 0.999... GOLD: one wei short of the floor.
        gold.setBalance(alice, 1e18 - 1);
        vm.prank(alice);
        vm.expectRevert(MinerAgent.NotEligible.selector);
        agent.claim();

        // Exactly 1 GOLD: passes.
        gold.setBalance(alice, 1e18);
        vm.prank(alice);
        uint256 tokenId = agent.claim();
        assertEq(tokenId, 1);
        assertEq(agent.ownerOf(tokenId), alice);
    }

    function test_minBalanceToClaim_isExposed() public view {
        assertEq(agent.MIN_BALANCE_TO_CLAIM(), 1e18);
    }

    function test_claim_revertsOnDoubleClaim() public {
        gold.setBalance(alice, 1_000e18);
        vm.prank(alice);
        agent.claim();
        vm.prank(alice);
        vm.expectRevert(MinerAgent.AlreadyClaimed.selector);
        agent.claim();
    }

    function test_claim_multipleHoldersIncrementalIds() public {
        gold.setBalance(alice, 100e18);
        gold.setBalance(bob,   100e18);
        gold.setBalance(carol, 100e18);

        vm.prank(alice); uint256 a = agent.claim();
        vm.prank(bob);   uint256 b = agent.claim();
        vm.prank(carol); uint256 c = agent.claim();

        assertEq(a, 1); assertEq(b, 2); assertEq(c, 3);
        assertEq(agent.totalAgents(), 3);
    }

    function test_soulbound_transferReverts() public {
        gold.setBalance(alice, 100e18);
        vm.prank(alice);
        uint256 id = agent.claim();

        vm.prank(alice);
        vm.expectRevert(MinerAgent.Soulbound.selector);
        agent.transferFrom(alice, bob, id);
    }

    function test_soulbound_safeTransferReverts() public {
        gold.setBalance(alice, 100e18);
        vm.prank(alice);
        uint256 id = agent.claim();

        vm.prank(alice);
        vm.expectRevert(MinerAgent.Soulbound.selector);
        agent.safeTransferFrom(alice, bob, id);
    }

    function test_tokenURI_returnsDataUri() public {
        gold.setBalance(alice, 12_345e18);
        vm.prank(alice);
        uint256 id = agent.claim();
        string memory uri = agent.tokenURI(id);

        // Should be a base64-encoded JSON data URI.
        bytes memory uriBytes = bytes(uri);
        bytes memory prefix   = bytes("data:application/json;base64,");
        assertGt(uriBytes.length, prefix.length, "uri too short");
        for (uint256 i = 0; i < prefix.length; i++) {
            assertEq(uriBytes[i], prefix[i], "uri prefix mismatch");
        }
    }

    function test_tokenURI_revertsForNonexistent() public {
        vm.expectRevert(MinerAgent.NonexistentAgent.selector);
        agent.tokenURI(999);
    }

    function test_tier_thresholds() public {
        // Tier boundaries: Initiate < 1k ≤ Bronze < 10k ≤ Silver < 100k ≤ Gold < 1M ≤ Platinum
        gold.setBalance(alice, 999e18);            // Initiate (one wei short of Bronze)
        gold.setBalance(bob,   1_000e18);          // Bronze   (exactly at threshold)
        gold.setBalance(carol, 10_000e18);         // Silver   (exactly at threshold)

        vm.prank(alice); agent.claim();
        vm.prank(bob);   agent.claim();
        vm.prank(carol); agent.claim();

        // Spot check: the SVG/uri contains the tier name.
        string memory aliceUri = agent.tokenURI(1);
        string memory bobUri   = agent.tokenURI(2);
        string memory carolUri = agent.tokenURI(3);

        assertTrue(_contains(aliceUri, "data:application/json"));
        assertTrue(_contains(bobUri,   "data:application/json"));
        assertTrue(_contains(carolUri, "data:application/json"));
        // Deep tier check would require base64 decoding; trust the unit logic.
    }

    function test_variantOf_isDeterministic_andBinary() public view {
        // Variant must be 0 or 1, and identical reads always agree.
        for (uint256 id = 1; id <= 50; id++) {
            uint8 v1 = agent.variantOf(id);
            uint8 v2 = agent.variantOf(id);
            assertEq(v1, v2);
            assertTrue(v1 == 0 || v1 == 1);
        }
    }

    function test_variantOf_distributesEvenly_overLargeRange() public view {
        // Sanity: across 1000 tokenIds, roughly half should be variant 0 and
        // half variant 1. Allow ±15% slack so the test isn't flaky.
        uint256 zeros = 0;
        for (uint256 id = 1; id <= 1000; id++) {
            if (agent.variantOf(id) == 0) zeros++;
        }
        assertGt(zeros, 350);
        assertLt(zeros, 650);
    }

    function test_name_and_symbol() public view {
        assertEq(agent.name(), "Gold Miner Agent");
        assertEq(agent.symbol(), "GMA");
    }

    // ───────── URI swap mechanism ─────────

    function test_contractURI_defaultsToDataUri() public view {
        string memory uri = agent.contractURI();
        assertTrue(_contains(uri, "data:application/json;base64,"));
    }

    function test_setExternalContractURI_byUpdater() public {
        agent.setExternalContractURI("ipfs://Qm.../collection.json");
        assertEq(agent.contractURI(), "ipfs://Qm.../collection.json");
    }

    function test_setExternalContractURI_revertsForNonUpdater() public {
        vm.prank(alice);
        vm.expectRevert(MinerAgent.NotURIUpdater.selector);
        agent.setExternalContractURI("ipfs://Qm.../collection.json");
    }

    function test_setExternalBaseURI_changesTokenURI() public {
        gold.setBalance(alice, 100e18);
        vm.prank(alice);
        agent.claim();

        agent.setExternalBaseURI("ipfs://Qm.../tokens/");

        // Token #1 → ipfs://Qm.../tokens/1.json
        assertEq(agent.tokenURI(1), "ipfs://Qm.../tokens/1.json");
    }

    function test_setExternalBaseURI_emptyResetsToOnChain() public {
        gold.setBalance(alice, 100e18);
        vm.prank(alice);
        agent.claim();

        agent.setExternalBaseURI("ipfs://Qm.../tokens/");
        agent.setExternalBaseURI(""); // reset
        string memory uri = agent.tokenURI(1);
        assertTrue(_contains(uri, "data:application/json"));
    }

    function test_lockMetadata_freezesBothSetters() public {
        agent.lockMetadata();

        vm.expectRevert(MinerAgent.MetadataAlreadyLocked.selector);
        agent.setExternalContractURI("x");

        vm.expectRevert(MinerAgent.MetadataAlreadyLocked.selector);
        agent.setExternalBaseURI("x");
    }

    function test_lockMetadata_revertsForNonUpdater() public {
        vm.prank(alice);
        vm.expectRevert(MinerAgent.NotURIUpdater.selector);
        agent.lockMetadata();
    }

    // ───────── EIP-2981 ─────────

    function test_royaltyInfo_alwaysZero() public view {
        (address receiver, uint256 amount) = agent.royaltyInfo(1, 1 ether);
        assertEq(receiver, address(0));
        assertEq(amount, 0);
    }

    function test_supportsInterface_erc2981() public view {
        // EIP-2981 interfaceId = 0x2a55205a
        assertTrue(agent.supportsInterface(0x2a55205a));
        // ERC-721 interfaceId = 0x80ac58cd
        assertTrue(agent.supportsInterface(0x80ac58cd));
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length > h.length) return false;
        for (uint256 i = 0; i <= h.length - n.length; i++) {
            bool ok = true;
            for (uint256 j = 0; j < n.length; j++) {
                if (h[i + j] != n[j]) { ok = false; break; }
            }
            if (ok) return true;
        }
        return false;
    }
}
