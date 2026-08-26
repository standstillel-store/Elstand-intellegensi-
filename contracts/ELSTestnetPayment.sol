// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ELSTestnetPayment
/// @notice Simple ELS payment processor for Elvoid Pro (premium membership)
/// and AI Energy purchases. NOT an AMM, NOT a swap — user pays a fixed ELS
/// price for a fixed productId, ELS moves user -> this contract -> treasury,
/// and a `PaymentExecuted` event is emitted. Standing alone from
/// ELSTestnetSwap.sol (buy ELS), ELSTestnetSell.sol (sell ELS), and
/// ELSTestnetRewardDistributor.sol (claim rewards) — none of those are
/// touched by this contract.
///
/// SOURCE OF TRUTH MODEL: this contract only proves "user paid the correct
/// ELS amount for a valid productId, exactly once." It never grants
/// membership or credits AI Energy itself — those stay backend-owned
/// (Supabase), same as the existing "no fake transaction" rule already
/// enforced in components/wallet/WalletProCards.tsx and
/// components/wallet/WalletAiEnergy.tsx. The backend must independently
/// read/verify `PaymentExecuted` (event + tx receipt on chain 97) before
/// crediting anything — a successful frontend tx callback is not sufficient
/// on its own.
///
/// Product prices/config below are taken directly from the existing
/// frontend, not invented:
///   - components/wallet/WalletProCards.tsx: ELVOID_PRO_WEEK = 1,500 ELS,
///     ELVOID_PRO_MONTH = 15,000 ELS
///   - components/wallet/WalletAiEnergy.tsx: AI_ENERGY_10 = 15 ELS (grants
///     10 AI Energy off-chain)
contract ELSTestnetPayment is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The ELS Testnet ERC-20 token this contract accepts as payment.
    /// Immutable for the same reasoning as ELSTestnetRewardDistributor.sol —
    /// a payment processor that could be repointed to a different token
    /// post-deployment is a much larger trust assumption than one that can't.
    IERC20 public immutable elsToken;

    /// @notice Where collected ELS payments are forwarded to. Owner-settable
    /// (e.g. if treasury multisig changes), guarded against address(0).
    address public treasury;

    struct Product {
        uint256 price; // ELS smallest unit (18 decimals)
        bool active;
    }

    /// @notice productId => config. productId is keccak256 of a human label,
    /// e.g. keccak256("ELVOID_PRO_WEEK") — see the constants below.
    mapping(bytes32 => Product) public products;

    /// @notice paymentId => already processed. paymentId is caller-supplied
    /// and MUST be unique per purchase attempt (e.g. a UUID/nonce minted by
    /// the frontend or backend before the tx is sent). Reusing a paymentId
    /// reverts — this is what makes it impossible for the same on-chain
    /// payment to be replayed into two membership/AI Energy grants.
    mapping(bytes32 => bool) public processedPayments;

    // ---- Canonical product identifiers (informational — pass the raw
    // bytes32 value to purchase()/setProduct(), these are just documented
    // constants for off-chain callers to mirror). ----
    bytes32 public constant ELVOID_PRO_WEEK = keccak256("ELVOID_PRO_WEEK");
    bytes32 public constant ELVOID_PRO_MONTH = keccak256("ELVOID_PRO_MONTH");
    bytes32 public constant AI_ENERGY_10 = keccak256("AI_ENERGY_10");

    event PaymentExecuted(
        bytes32 indexed paymentId,
        bytes32 indexed productId,
        address indexed buyer,
        uint256 amount,
        uint256 timestamp
    );
    event ProductConfigured(bytes32 indexed productId, uint256 price, bool active);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);

    error ZeroAddress();
    error ZeroAmount();
    error UnknownProduct(bytes32 productId);
    error InactiveProduct(bytes32 productId);
    error PriceMismatch(uint256 expected, uint256 provided);
    error AlreadyProcessed(bytes32 paymentId);

    constructor(address elsTokenAddress, address treasuryAddress, address initialOwner) Ownable(initialOwner) {
        if (elsTokenAddress == address(0)) revert ZeroAddress();
        if (treasuryAddress == address(0)) revert ZeroAddress();
        elsToken = IERC20(elsTokenAddress);
        treasury = treasuryAddress;

        // Seed the three products already surfaced in the frontend so the
        // contract is immediately usable post-deploy without a second
        // owner transaction. Owner can still adjust via setProduct().
        products[ELVOID_PRO_WEEK] = Product({price: 1_500 ether, active: true});
        products[ELVOID_PRO_MONTH] = Product({price: 15_000 ether, active: true});
        products[AI_ENERGY_10] = Product({price: 15 ether, active: true});

        emit ProductConfigured(ELVOID_PRO_WEEK, 1_500 ether, true);
        emit ProductConfigured(ELVOID_PRO_MONTH, 15_000 ether, true);
        emit ProductConfigured(AI_ENERGY_10, 15 ether, true);
    }

    /// @notice Pay for `productId` using ELS. `amount` must exactly match
    /// the product's configured price (protects the buyer from a frontend
    /// that sent a stale/wrong price, and protects the backend from ever
    /// having to trust a client-supplied amount). `paymentId` must be
    /// unique per attempt; reusing one reverts with AlreadyProcessed.
    /// Requires the caller to have already called
    /// `elsToken.approve(address(this), amount)`.
    function purchase(bytes32 paymentId, bytes32 productId, uint256 amount)
        external
        nonReentrant
        whenNotPaused
    {
        if (amount == 0) revert ZeroAmount();
        if (processedPayments[paymentId]) revert AlreadyProcessed(paymentId);

        Product memory product = products[productId];
        if (product.price == 0) revert UnknownProduct(productId);
        if (!product.active) revert InactiveProduct(productId);
        if (product.price != amount) revert PriceMismatch(product.price, amount);

        // Effects before interaction.
        processedPayments[paymentId] = true;

        elsToken.safeTransferFrom(msg.sender, treasury, amount);

        emit PaymentExecuted(paymentId, productId, msg.sender, amount, block.timestamp);
    }

    /// @notice Owner-only. Add or update a product's price/active state.
    /// Never touches `processedPayments` — a price change can never affect
    /// or unwind a payment that already happened.
    function setProduct(bytes32 productId, uint256 price, bool active) external onlyOwner {
        if (price == 0) revert ZeroAmount();
        products[productId] = Product({price: price, active: active});
        emit ProductConfigured(productId, price, active);
    }

    /// @notice Owner-only. Repoint where collected ELS is forwarded.
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(previous, newTreasury);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Read-only helper for frontend/backend to check a product
    /// before building a purchase() tx.
    function getProduct(bytes32 productId) external view returns (uint256 price, bool active) {
        Product memory p = products[productId];
        return (p.price, p.active);
    }

    /// @notice Read-only helper — has this paymentId already been consumed?
    function isProcessed(bytes32 paymentId) external view returns (bool) {
        return processedPayments[paymentId];
    }
}
