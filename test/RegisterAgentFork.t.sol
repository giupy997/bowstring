// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";

interface IIdentityRegistry {
    function register(string memory agentURI) external returns (uint256 agentId);
    function tokenURI(uint256 tokenId) external view returns (string memory);
    function ownerOf(uint256 tokenId) external view returns (address);
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
}

/// @notice End-to-end check that we can register PICK as an ERC-8004 agent
///         on a real chain. Forks Sepolia (where the registry has been
///         deployed at 0x8004A818...494BD9e), calls register() with a fake
///         agent URI, and verifies the NFT was minted to the caller.
///
///         Run with: forge test --match-contract RegisterAgentFork -vv
contract RegisterAgentForkTest is Test {
    address constant IDENTITY_REGISTRY_SEPOLIA = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    IIdentityRegistry internal reg;

    function setUp() public {
        vm.createSelectFork(vm.envString("SEPOLIA_RPC"));
        reg = IIdentityRegistry(IDENTITY_REGISTRY_SEPOLIA);
    }

    function test_registryIsLive() public view {
        assertEq(reg.name(), "AgentIdentity");
        assertEq(reg.symbol(), "AGENT");
    }

    function test_registerPick_mintsNftAndStoresUri() public {
        string memory uri = "https://example.com/pick-agent-test.json";

        // Use a deterministic address so re-runs don't collide in any way.
        address caller = address(0xCAFE);
        vm.prank(caller);
        uint256 agentId = reg.register(uri);

        assertGt(agentId, 0, "agentId should be non-zero");
        assertEq(reg.ownerOf(agentId), caller, "caller should own the agent NFT");
        assertEq(reg.tokenURI(agentId), uri, "uri should be stored exactly");

        console2.log("Registered as agent ID:", agentId);
    }

    function test_multipleRegistrations_distinctIds() public {
        address a = address(0xAAAA);
        address b = address(0xBBBB);

        vm.prank(a);
        uint256 idA = reg.register("https://example.com/a.json");
        vm.prank(b);
        uint256 idB = reg.register("https://example.com/b.json");

        assertEq(idB, idA + 1, "ids should increment");
        assertEq(reg.ownerOf(idA), a);
        assertEq(reg.ownerOf(idB), b);
    }
}
