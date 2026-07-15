// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/*
   ███╗   ██╗ ██████╗ ███╗   ██╗ ██████╗███████╗
   ████╗  ██║██╔═══██╗████╗  ██║██╔════╝██╔════╝
   ██╔██╗ ██║██║   ██║██╔██╗ ██║██║     █████╗
   ██║╚██╗██║██║   ██║██║╚██╗██║██║     ██╔══╝
   ██║ ╚████║╚██████╔╝██║ ╚████║╚██████╗███████╗
   ╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝╚══════╝

   Mined ERC20 with a self-hook. The token contract IS
   its own Uniswap V4 hook and its own PoW miner. One
   address, one bytecode, one autonomous agent.

   Site: https://nonceagent8004.com
   X:    https://x.com/Nonceagent8004
*/

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";

interface IPositionManager {
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;
}

interface IAllowanceTransfer {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

contract Nonce is ERC20, IHooks, ReentrancyGuard {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using BalanceDeltaLibrary for BalanceDelta;

    uint256 public constant TOTAL_SUPPLY     = 21_000_000e18;
    uint256 public constant GENESIS_CAP      =  1_050_000e18;
    uint256 public constant GENESIS_LP       =  1_050_000e18;
    uint256 public constant MINING_SUPPLY    = 18_900_000e18;

    uint256 public constant GENESIS_PRICE    = 0.01 ether;
    uint256 public constant GENESIS_UNIT     = 1_000e18;
    uint256 public constant MAX_UNITS_PER_TX = 5;

    uint256 public constant ERA_MINTS              = 100_000;
    uint256 public constant BASE_REWARD            = 100e18;
    // Base produces a block every ~2 seconds. EPOCH_BLOCKS = 600 → ~20 min
    // epoch (challenge refresh window). TARGET_BLOCKS_PER_MINT = 300 → the
    // retargeting algorithm aims for 1 mint per ~600 s (10 min) on average,
    // Bitcoin-grade slow. At BASE_REWARD = 100 NONCE that stretches the 18.9M
    // mining supply over ~3.6 years. MAX_MINTS_PER_BLOCK = 1 caps the per-
    // block burst to a single mint, so neither one block nor a flood of
    // parallel miners can sweep emission the way the v1 (>>32 start, 10 per
    // block) allowed — that misconfig let ~1% of supply mint in 10 minutes.
    uint256 public constant EPOCH_BLOCKS           = 600;
    uint256 public constant ADJUSTMENT_INTERVAL    = 2_016;
    uint256 public constant TARGET_BLOCKS_PER_MINT = 300;
    uint256 public constant MAX_MINTS_PER_BLOCK    = 1;

    uint256 public constant SWAP_FEE_BPS = 100;
    uint24  public constant LP_FEE       = 0;
    int24   public constant TICK_SPACING = 200;
    int24   public constant TICK_LOWER   = -887_200;
    int24   public constant TICK_UPPER   =  887_200;

    uint256 public constant PARTIAL_SEED_DELAY = 30 minutes;

    /// @notice Window after deploy after which any genesis buyer can call
    ///         `refundGenesis` to redeem their NONCE for the ETH they paid,
    ///         provided the pool has not yet been seeded. Acts as a safety
    ///         net if `seedPool` / `partialSeed` cannot complete.
    uint256 public constant REFUND_GRACE = 3 days;

    IPoolManager public immutable poolManager;
    address      public immutable positionManager;
    address      public immutable permit2;
    address      public immutable controller;
    uint256      public immutable deployedAt;

    uint8 internal constant ACTION_MINT_POSITION = 0x02;
    uint8 internal constant ACTION_SETTLE_PAIR   = 0x0d;

    uint256 public genesisEthRaised;
    uint256 public genesisMinted;
    bool    public genesisComplete;

    uint256 public totalMints;
    uint256 public totalMiningMinted;
    uint256 public currentDifficulty;
    uint256 public lastAdjustmentMint;
    uint256 public lastAdjustmentBlock;
    mapping(uint256 => uint256) public mintsInBlock;
    mapping(bytes32 => bool)    public usedProofs;

    PoolKey public poolKey;

    error NotPoolManager();
    error InvalidAction();
    error GenesisAlreadyComplete();
    error GenesisNotComplete();
    error GenesisSoldOut();
    error TxCapExceeded();
    error InsufficientPayment();
    error GenesisNotSoldOut();
    error InsufficientWork();
    error ProofAlreadyUsed();
    error BlockCapReached();
    error SupplyExhausted();
    error EthTransferFailed();
    error NotController();
    error NothingToClaim();
    error UnsupportedSwapMode();
    error InsufficientLiquidity();
    error WrongPairConfig();
    error TooSoon();
    error NothingToSeed();
    error RefundGraceNotPassed();
    error MustBeUnitMultiple();

    event GenesisMint(address indexed buyer, uint256 ethPaid, uint256 hashOut);
    event PoolSeeded(uint256 eth, uint256 hash, uint160 sqrtPriceX96);
    event LiquidityAdded(uint256 ethAmt, uint256 hashAmt, uint128 liquidity);
    event Mined(address indexed miner, uint256 nonce, uint256 reward, uint256 era);
    event DifficultyAdjusted(uint256 from, uint256 to, uint256 blocksTaken);
    event Halving(uint256 era, uint256 newReward);
    event FeeCollected(address indexed origin, bool isBuy, uint256 fee);
    event FeesClaimed(address indexed to, uint256 amount);
    event GenesisRefund(address indexed buyer, uint256 ethReturned, uint256 tokenBurned);

    constructor(
        IPoolManager poolManager_,
        address      positionManager_,
        address      permit2_
    ) ERC20("Nonce", "NONCE") {
        require(address(poolManager_) != address(0));
        require(positionManager_      != address(0));
        require(permit2_              != address(0));
        poolManager     = poolManager_;
        positionManager = positionManager_;
        permit2         = permit2_;
        controller = tx.origin;
        deployedAt = block.timestamp;
        Hooks.validateHookPermissions(IHooks(address(this)), _permissions());
    }

    function mintGenesis(uint256 units) external payable nonReentrant {
        if (genesisComplete)                          revert GenesisAlreadyComplete();
        if (units == 0 || units > MAX_UNITS_PER_TX)   revert TxCapExceeded();
        uint256 tokenAmount = units * GENESIS_UNIT;
        uint256 cost       = units * GENESIS_PRICE;
        if (msg.value < cost)                         revert InsufficientPayment();
        if (genesisMinted + tokenAmount > GENESIS_CAP) revert GenesisSoldOut();

        genesisMinted    += tokenAmount;
        genesisEthRaised += cost;

        uint256 excess = msg.value - cost;
        if (excess > 0) {
            (bool ok,) = msg.sender.call{value: excess}("");
            if (!ok) revert EthTransferFailed();
        }

        _mint(msg.sender, tokenAmount);
        emit GenesisMint(msg.sender, cost, tokenAmount);
    }

    /// @notice Genesis buyer escape hatch. After `REFUND_GRACE` from deploy,
    ///         if the pool has not been seeded yet, holders of genesis NONCE
    ///         can burn their balance back to the contract and recover the
    ///         ETH at the original 0.01 ETH / 1,000 NONCE price. Useful when
    ///         seeding is technically blocked and would otherwise lock
    ///         buyer ETH on the contract forever.
    function refundGenesis(uint256 tokenAmount) external nonReentrant {
        if (genesisComplete)                                  revert GenesisAlreadyComplete();
        if (block.timestamp < deployedAt + REFUND_GRACE)      revert RefundGraceNotPassed();
        if (tokenAmount == 0 || tokenAmount % GENESIS_UNIT != 0) revert MustBeUnitMultiple();

        uint256 units   = tokenAmount / GENESIS_UNIT;
        uint256 ethBack = units * GENESIS_PRICE;

        // Reverts if the caller does not hold `tokenAmount`.
        _burn(msg.sender, tokenAmount);

        // Decrement counters so a later `partialSeed` reflects post-refund state.
        genesisMinted    -= tokenAmount;
        genesisEthRaised -= ethBack;

        (bool ok,) = msg.sender.call{value: ethBack}("");
        if (!ok) revert EthTransferFailed();

        emit GenesisRefund(msg.sender, ethBack, tokenAmount);
    }

    function seedPool() external nonReentrant {
        if (genesisComplete)             revert GenesisAlreadyComplete();
        if (genesisMinted < GENESIS_CAP) revert GenesisNotSoldOut();
        _seedBody();
    }

    function partialSeed() external nonReentrant {
        if (msg.sender != controller)                          revert NotController();
        if (genesisComplete)                                   revert GenesisAlreadyComplete();
        if (block.timestamp < deployedAt + PARTIAL_SEED_DELAY) revert TooSoon();
        if (genesisMinted == 0)                                revert NothingToSeed();
        _seedBody();
    }

    function _seedBody() internal {
        genesisComplete = true;

        uint256 eth    = genesisEthRaised;
        uint256 tokenLP = genesisMinted;

        _mint(address(this), tokenLP + MINING_SUPPLY);

        poolKey = PoolKey({
            currency0:   CurrencyLibrary.ADDRESS_ZERO,
            currency1:   Currency.wrap(address(this)),
            fee:         LP_FEE,
            tickSpacing: TICK_SPACING,
            hooks:       IHooks(address(this))
        });

        uint160 sqrtPriceX96 = _sqrtPriceX96FromAmounts(eth, tokenLP);
        poolManager.initialize(poolKey, sqrtPriceX96);

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(TICK_LOWER),
            TickMath.getSqrtPriceAtTick(TICK_UPPER),
            eth,
            tokenLP
        );
        if (liquidity == 0) revert InsufficientLiquidity();

        // Starting target. v1 used >>32 (~1 in 4.3B), far too easy: combined
        // with 10 mints/block it let the network mint ~1% of supply in the
        // first 10 minutes. >>42 is 1024× harder (~1 in 4.4T), so even at the
        // ~13 GH/s aggregate hashrate observed at v1 launch a solve lands on
        // the order of minutes, not milliseconds. The ±4× retarget every
        // ADJUSTMENT_INTERVAL mints then converges toward the 10-min target.
        currentDifficulty   = type(uint256).max >> 42;
        lastAdjustmentBlock = block.number;
        lastAdjustmentMint  = 0;

        _approve(address(this), permit2, type(uint256).max);
        IAllowanceTransfer(permit2).approve(
            address(this), positionManager, type(uint160).max, type(uint48).max
        );
        IAllowanceTransfer(permit2).approve(
            address(this), address(poolManager), type(uint160).max, type(uint48).max
        );

        bytes memory actions = abi.encodePacked(ACTION_MINT_POSITION, ACTION_SETTLE_PAIR);
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(
            poolKey,
            TICK_LOWER,
            TICK_UPPER,
            liquidity,
            eth,
            tokenLP,
            controller,
            bytes("")
        );
        params[1] = abi.encode(poolKey.currency0, poolKey.currency1);

        IPositionManager(positionManager).modifyLiquidities{value: eth}(
            abi.encode(actions, params),
            block.timestamp + 120
        );

        emit LiquidityAdded(eth, tokenLP, liquidity);
        emit PoolSeeded(eth, tokenLP, sqrtPriceX96);
    }

    function _permissions() internal pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize:                true,
            afterInitialize:                 false,
            beforeAddLiquidity:              false,
            afterAddLiquidity:               false,
            beforeRemoveLiquidity:           false,
            afterRemoveLiquidity:            false,
            beforeSwap:                      true,
            afterSwap:                       true,
            beforeDonate:                    false,
            afterDonate:                     false,
            beforeSwapReturnDelta:           true,
            afterSwapReturnDelta:            true,
            afterAddLiquidityReturnDelta:    false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function beforeInitialize(address, PoolKey calldata key, uint160) external view returns (bytes4) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        if (!genesisComplete) revert GenesisNotComplete();
        if (Currency.unwrap(key.currency0) != address(0)) revert WrongPairConfig();
        return IHooks.beforeInitialize.selector;
    }

    function beforeSwap(
        address sender,
        PoolKey calldata,
        IPoolManager.SwapParams calldata params,
        bytes calldata
    ) external nonReentrant returns (bytes4, BeforeSwapDelta, uint24) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        if (!genesisComplete) revert GenesisNotComplete();

        bool isBuy        = params.zeroForOne;
        bool isExactInput = params.amountSpecified < 0;

        if (!isBuy && !isExactInput) revert UnsupportedSwapMode();

        if (!isBuy || !isExactInput) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        uint256 ethIn = uint256(-params.amountSpecified);
        uint256 fee   = (ethIn * SWAP_FEE_BPS) / 10_000;
        if (fee == 0) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        poolManager.take(CurrencyLibrary.ADDRESS_ZERO, address(this), fee);
        emit FeeCollected(sender, true, fee);

        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(int128(int256(fee)), 0), 0);
    }

    function afterSwap(
        address sender,
        PoolKey calldata,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) external returns (bytes4, int128) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();

        bool isBuy        = params.zeroForOne;
        bool isExactInput = params.amountSpecified < 0;

        bool ethIsUnspecified = (isBuy && !isExactInput) || (!isBuy && isExactInput);
        if (!ethIsUnspecified) {
            return (IHooks.afterSwap.selector, 0);
        }

        int128  ethDelta  = delta.amount0();
        uint256 ethAmount = ethDelta < 0 ? uint256(int256(-ethDelta)) : uint256(int256(ethDelta));
        if (ethAmount == 0) {
            return (IHooks.afterSwap.selector, 0);
        }

        uint256 fee = (ethAmount * SWAP_FEE_BPS) / 10_000;
        if (fee == 0) {
            return (IHooks.afterSwap.selector, 0);
        }

        poolManager.take(CurrencyLibrary.ADDRESS_ZERO, address(this), fee);
        emit FeeCollected(sender, isBuy, fee);

        return (IHooks.afterSwap.selector, int128(int256(fee)));
    }

    function beforeAddLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external pure returns (bytes4) { revert InvalidAction(); }
    function afterAddLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, BalanceDelta, BalanceDelta, bytes calldata)
        external pure returns (bytes4, BalanceDelta) { revert InvalidAction(); }
    function beforeRemoveLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external pure returns (bytes4) { revert InvalidAction(); }
    function afterRemoveLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, BalanceDelta, BalanceDelta, bytes calldata)
        external pure returns (bytes4, BalanceDelta) { revert InvalidAction(); }
    function afterInitialize(address, PoolKey calldata, uint160, int24)
        external pure returns (bytes4) { revert InvalidAction(); }
    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external pure returns (bytes4) { revert InvalidAction(); }
    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external pure returns (bytes4) { revert InvalidAction(); }

    function mine(uint256 nonce) external nonReentrant {
        if (!genesisComplete)                                  revert GenesisNotComplete();
        if (totalMiningMinted >= MINING_SUPPLY)                revert SupplyExhausted();
        if (mintsInBlock[block.number] >= MAX_MINTS_PER_BLOCK) revert BlockCapReached();

        bytes32 result = keccak256(abi.encode(_challenge(msg.sender), nonce));
        if (uint256(result) >= currentDifficulty) revert InsufficientWork();

        bytes32 key = keccak256(abi.encode(msg.sender, nonce, _epoch()));
        if (usedProofs[key]) revert ProofAlreadyUsed();
        usedProofs[key] = true;

        mintsInBlock[block.number]++;
        totalMints++;

        if (totalMints - lastAdjustmentMint >= ADJUSTMENT_INTERVAL) {
            _adjustDifficulty();
        }

        uint256 era    = totalMints / ERA_MINTS;
        uint256 reward = era < 64 ? BASE_REWARD >> era : 0;

        uint256 left = MINING_SUPPLY - totalMiningMinted;
        if (reward > left) reward = left;
        if (reward == 0)   revert SupplyExhausted();

        totalMiningMinted += reward;
        _transfer(address(this), msg.sender, reward);

        if (era > 0 && totalMints % ERA_MINTS == 0) {
            emit Halving(era, reward);
        }
        emit Mined(msg.sender, nonce, reward, era);
    }

    function _challenge(address miner) internal view returns (bytes32) {
        return keccak256(abi.encode(
            block.chainid,
            address(this),
            miner,
            _epoch()
        ));
    }

    function _epoch() internal view returns (uint256) {
        return block.number / EPOCH_BLOCKS;
    }

    function _adjustDifficulty() internal {
        uint256 taken  = block.number - lastAdjustmentBlock;
        uint256 target = ADJUSTMENT_INTERVAL * TARGET_BLOCKS_PER_MINT;
        uint256 old    = currentDifficulty;

        uint256 next = taken == 0
            ? old / 4
            : FullMath.mulDiv(old, taken, target);

        if (next < old / 4) next = old / 4;
        if (next > old * 4) next = old * 4;
        if (next == 0)      next = 1;

        currentDifficulty   = next;
        lastAdjustmentMint  = totalMints;
        lastAdjustmentBlock = block.number;

        emit DifficultyAdjusted(old, next, taken);
    }

    function claimFees() external nonReentrant {
        if (msg.sender != controller) revert NotController();
        uint256 amt = address(this).balance;
        if (amt == 0) revert NothingToClaim();
        (bool ok,) = controller.call{value: amt}("");
        if (!ok) revert EthTransferFailed();
        emit FeesClaimed(controller, amt);
    }

    function getChallenge(address miner) external view returns (bytes32) {
        return _challenge(miner);
    }

    function epochBlocksLeft() external view returns (uint256) {
        return EPOCH_BLOCKS - (block.number % EPOCH_BLOCKS);
    }

    function currentReward() external view returns (uint256) {
        uint256 era = totalMints / ERA_MINTS;
        return era < 64 ? BASE_REWARD >> era : 0;
    }

    function miningState() external view returns (
        uint256 era,
        uint256 reward,
        uint256 difficulty,
        uint256 minted,
        uint256 remaining,
        uint256 epoch,
        uint256 epochBlocksLeft_
    ) {
        era              = totalMints / ERA_MINTS;
        reward           = era < 64 ? BASE_REWARD >> era : 0;
        difficulty       = currentDifficulty;
        minted           = totalMiningMinted;
        remaining        = MINING_SUPPLY - totalMiningMinted;
        epoch            = _epoch();
        epochBlocksLeft_ = EPOCH_BLOCKS - (block.number % EPOCH_BLOCKS);
    }

    function genesisState() external view returns (
        uint256 minted,
        uint256 remaining,
        uint256 ethRaised,
        bool    complete
    ) {
        minted    = genesisMinted;
        remaining = GENESIS_CAP - genesisMinted;
        ethRaised = genesisEthRaised;
        complete  = genesisComplete;
    }

    /// @notice True iff `refundGenesis` is currently callable. The window
    ///         opens at `deployedAt + REFUND_GRACE` and stays open until the
    ///         pool is seeded.
    function refundUnlocked() external view returns (bool) {
        return !genesisComplete && block.timestamp >= deployedAt + REFUND_GRACE;
    }

    function _sqrtPriceX96FromAmounts(uint256 amount0, uint256 amount1)
        internal pure returns (uint160)
    {
        require(amount0 > 0);
        uint256 priceX96  = (amount1 << 96) / amount0;
        uint256 ratioX192 = priceX96 << 96;
        uint256 s = _sqrt(ratioX192);
        require(s <= type(uint160).max);
        return uint160(s);
    }

    function _sqrt(uint256 x) internal pure returns (uint256 z) {
        if (x == 0) return 0;
        z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }

    receive() external payable {}
}
