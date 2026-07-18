// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

interface IERC2981 is IERC165 {
    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external view returns (address receiver, uint256 royaltyAmount);
}

interface IBowstring {
    function balanceOf(address account) external view returns (uint256);
    function totalMints() external view returns (uint256);
    function totalMiningMinted() external view returns (uint256);
}

/// @title MinerAgent
/// @notice Soulbound ERC-721 collection that gives each BOW holder a
///         self-contained on-chain identity, ERC-8004 aligned. One agent
///         NFT per address; transfers are blocked because the token
///         represents proof of participation, not a tradeable asset.
///         Metadata + image are generated on-chain from live BOW state,
///         so the badge reflects the holder's current standing without
///         off-chain hosting.
contract MinerAgent is ERC721, IERC2981 {
    using Strings for uint256;
    using Strings for address;

    IBowstring public immutable bowstring;

    /// @notice Minimum BOW balance required to claim an agent NFT. Set above
    ///         dust so an attacker can't spin up thousands of wallets, dust
    ///         each with 1 wei, and farm meaningless Initiate-tier mints.
    ///         1 full BOW at the genesis price (0.01 ETH per 1k BOW) costs
    ///         ~10 microETH plus gas — a real economic floor per identity.
    uint256 public constant MIN_BALANCE_TO_CLAIM = 1e18;

    /// @notice The only address allowed to swap external metadata URIs or
    ///         freeze them. Set once at construction.
    address public immutable uriUpdater;

    uint256 public totalAgents;

    /// @notice tokenId minted to each address, 0 if never claimed.
    mapping(address => uint256) public agentIdOf;

    /// @notice Optional override for the collection-level metadata. When set,
    ///         `contractURI()` returns this string verbatim instead of the
    ///         default on-chain SVG card.
    string public externalContractURI;

    /// @notice Optional override for per-token metadata. When set, `tokenURI`
    ///         returns `externalBaseURI + tokenId + ".json"` instead of the
    ///         default on-chain SVG.
    string public externalBaseURI;

    /// @notice Once true, neither `externalContractURI` nor `externalBaseURI`
    ///         can change again. One-way switch.
    bool public metadataLocked;

    error AlreadyClaimed();
    error NotEligible();
    error Soulbound();
    error NonexistentAgent();
    error NotURIUpdater();
    error MetadataAlreadyLocked();

    event AgentMinted(address indexed agent, uint256 indexed tokenId, uint256 heldBalanceAtClaim);
    event ExternalContractURISet(string uri);
    event ExternalBaseURISet(string uri);
    event MetadataLocked();

    constructor(IBowstring bowstring_) ERC721("Bowstring Miner Agent", "BMA") {
        bowstring = bowstring_;
        uriUpdater = msg.sender;
    }

    /// @notice Mint one MinerAgent NFT to `msg.sender`. Eligibility = holds
    ///         at least `MIN_BALANCE_TO_CLAIM` BOW (1 full token). One claim
    ///         per address, ever.
    function claim() external returns (uint256 tokenId) {
        if (agentIdOf[msg.sender] != 0)                              revert AlreadyClaimed();
        if (bowstring.balanceOf(msg.sender) < MIN_BALANCE_TO_CLAIM)     revert NotEligible();

        unchecked { tokenId = ++totalAgents; }
        agentIdOf[msg.sender] = tokenId;
        _safeMint(msg.sender, tokenId);

        emit AgentMinted(msg.sender, tokenId, bowstring.balanceOf(msg.sender));
    }

    // ───────── Soulbound transfer block ─────────

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        // allow mint (from == 0) and burn (to == 0); block transfers between EOAs.
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    // ───────── URI swap controls ─────────

    function setExternalContractURI(string calldata uri) external {
        if (msg.sender != uriUpdater)  revert NotURIUpdater();
        if (metadataLocked)            revert MetadataAlreadyLocked();
        externalContractURI = uri;
        emit ExternalContractURISet(uri);
    }

    function setExternalBaseURI(string calldata uri) external {
        if (msg.sender != uriUpdater)  revert NotURIUpdater();
        if (metadataLocked)            revert MetadataAlreadyLocked();
        externalBaseURI = uri;
        emit ExternalBaseURISet(uri);
    }

    function lockMetadata() external {
        if (msg.sender != uriUpdater)  revert NotURIUpdater();
        metadataLocked = true;
        emit MetadataLocked();
    }

    // ───────── Dynamic on-chain metadata ─────────

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert NonexistentAgent();
        if (bytes(externalBaseURI).length > 0) {
            return string(abi.encodePacked(externalBaseURI, tokenId.toString(), ".json"));
        }
        address owner = _ownerOf(tokenId);
        uint256 heldBalance = bowstring.balanceOf(owner);
        return _buildTokenURI(tokenId, owner, heldBalance);
    }

    /// @notice OpenSea-style collection-level metadata. Either an external
    ///         URI (when set via `setExternalContractURI`) or an on-chain
    ///         default card encoded as a data URI.
    function contractURI() external view returns (string memory) {
        if (bytes(externalContractURI).length > 0) {
            return externalContractURI;
        }
        return _defaultContractURI();
    }

    function _defaultContractURI() internal pure returns (string memory) {
        string memory svg = _collectionSvg();
        string memory image = Base64.encode(bytes(svg));
        string memory json = string(abi.encodePacked(
            '{"name":"Bowstring Miner Agent",',
            '"description":"Soulbound ERC-8004 identity NFTs for $BOW participants. One per address, claimable once. Metadata reflects the live $BOW holdings of the agent wallet.",',
            '"image":"data:image/svg+xml;base64,', image, '",',
            '"external_link":"https://github.com/giupy997/bowstring"}'
        ));
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    function _collectionSvg() internal pure returns (string memory) {
        return string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">',
              '<rect width="600" height="600" fill="#08080a"/>',
              '<rect x="20" y="20" width="560" height="560" fill="none" stroke="#f4c430" stroke-width="1" opacity="0.4"/>',
              '<text x="300" y="280" fill="#f4c430" font-family="monospace" font-size="56" font-weight="700" text-anchor="middle">$BOW</text>',
              '<text x="300" y="330" fill="#ededed" font-family="monospace" font-size="28" font-weight="700" text-anchor="middle">MINER AGENTS</text>',
              '<text x="300" y="370" fill="#5a5a62" font-family="monospace" font-size="12" letter-spacing="4" text-anchor="middle">ERC-8004 IDENTITIES</text>',
              '<text x="300" y="540" fill="#5a5a62" font-family="monospace" font-size="11" letter-spacing="3" text-anchor="middle">SOULBOUND  ON-CHAIN  MIT</text>',
            '</svg>'
        ));
    }

    // ───────── EIP-2981 royalty (0% — soulbound, signaling-only) ─────────

    function royaltyInfo(uint256 /*tokenId*/, uint256 /*salePrice*/)
        external pure override returns (address receiver, uint256 royaltyAmount)
    {
        return (address(0), 0);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, IERC165) returns (bool) {
        return interfaceId == type(IERC2981).interfaceId
            || super.supportsInterface(interfaceId);
    }

    function _buildTokenURI(uint256 tokenId, address owner, uint256 heldBalance)
        internal pure returns (string memory)
    {
        string memory tier = _tier(heldBalance);
        string memory image = Base64.encode(bytes(_svg(tokenId, owner, heldBalance, tier)));
        string memory json = _buildJson(tokenId, owner, heldBalance, tier, image);
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    function _buildJson(uint256 tokenId, address owner, uint256 heldBalance, string memory tier, string memory image)
        internal pure returns (string memory)
    {
        return string(abi.encodePacked(
            '{"name":"Bowstring Miner Agent #', tokenId.toString(), '",',
            '"description":"ERC-8004 aligned identity for a BOW participant. Soulbound; reflects live BOW holdings of the agent wallet.",',
            '"image":"data:image/svg+xml;base64,', image, '",',
            '"attributes":[',
                '{"trait_type":"Tier","value":"', tier, '"},',
                '{"trait_type":"BOW Held","display_type":"number","value":', (heldBalance / 1e18).toString(), '},',
                '{"trait_type":"Agent Wallet","value":"', Strings.toHexString(uint160(owner), 20), '"}',
            ']}'
        ));
    }

    function _tier(uint256 heldBalance) internal pure returns (string memory) {
        if (heldBalance >= 1_000_000e18) return "Platinum";
        if (heldBalance >=   100_000e18) return "Gold";
        if (heldBalance >=    10_000e18) return "Silver";
        if (heldBalance >=     1_000e18) return "Bronze";
        return "Initiate";
    }

    /// @notice Picks one of two artwork variants per tokenId. The off-chain
    ///         metadata server (see /api/agent/[id]/route.ts) uses this to
    ///         alternate between the two BOW artworks assigned to each
    ///         tier. Deterministic from tokenId so the variant never
    ///         changes for a given NFT.
    function variantOf(uint256 tokenId) public pure returns (uint8) {
        return uint8(uint256(keccak256(abi.encode(tokenId, "bowstring-variant"))) % 2);
    }

    function _tierColor(string memory tier) internal pure returns (string memory) {
        bytes32 h = keccak256(bytes(tier));
        if (h == keccak256("Platinum")) return "#e5e4e2";
        if (h == keccak256("Gold"))     return "#f4c430";
        if (h == keccak256("Silver"))   return "#c0c0c8";
        if (h == keccak256("Bronze"))   return "#cd7f32";
        return "#7a7a82";
    }

    function _svg(uint256 tokenId, address owner, uint256 heldBalance, string memory tier)
        internal pure returns (string memory)
    {
        string memory color = _tierColor(tier);
        return string(abi.encodePacked(
            _svgHeader(color),
            _svgBody(tokenId, owner, heldBalance, color),
            _svgFooter(tier, color)
        ));
    }

    function _svgHeader(string memory color) internal pure returns (string memory) {
        return string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
              '<rect width="400" height="400" fill="#08080a"/>',
              '<rect x="14" y="14" width="372" height="372" fill="none" stroke="', color, '" stroke-width="1" opacity="0.4"/>',
              '<text x="28" y="46" fill="', color, '" font-family="monospace" font-size="13" font-weight="700" letter-spacing="2">BOW MINER AGENT</text>',
              '<text x="28" y="64" fill="#5a5a62" font-family="monospace" font-size="9" letter-spacing="3">ERC-8004 IDENTITY</text>'
        ));
    }

    function _svgBody(uint256 tokenId, address owner, uint256 heldBalance, string memory color)
        internal pure returns (string memory)
    {
        string memory addrShort = string(abi.encodePacked(
            "0x", _hexSlice(uint160(owner), 36, 40),
            unicode"…",
            _hexSlice(uint160(owner), 0, 4)
        ));
        return string(abi.encodePacked(
            '<text x="28" y="220" fill="#ededed" font-family="monospace" font-size="64" font-weight="700">#', tokenId.toString(), '</text>',
            '<text x="28" y="252" fill="#c8c8cc" font-family="monospace" font-size="13">', addrShort, '</text>',
            '<text x="28" y="306" fill="#8a8a92" font-family="monospace" font-size="9" letter-spacing="2">BOW HELD</text>',
            '<text x="28" y="338" fill="', color, '" font-family="monospace" font-size="28" font-weight="700">', (heldBalance / 1e18).toString(), '</text>'
        ));
    }

    function _svgFooter(string memory tier, string memory color) internal pure returns (string memory) {
        return string(abi.encodePacked(
            '<text x="372" y="372" fill="', color, '" font-family="monospace" font-size="10" font-weight="700" text-anchor="end" letter-spacing="2">', _upper(tier), '</text>',
            '</svg>'
        ));
    }

    function _hexSlice(uint160 v, uint256 fromNibble, uint256 toNibble) internal pure returns (string memory) {
        bytes memory hexChars = "0123456789abcdef";
        bytes memory out = new bytes(toNibble - fromNibble);
        for (uint256 i = 0; i < out.length; i++) {
            uint256 nibble = (uint256(v) >> ((toNibble - 1 - (fromNibble + i)) * 4)) & 0xf;
            out[i] = hexChars[nibble];
        }
        return string(out);
    }

    function _upper(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(b.length);
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            if (c >= 0x61 && c <= 0x7a) out[i] = bytes1(uint8(c) - 32);
            else out[i] = c;
        }
        return string(out);
    }
}
