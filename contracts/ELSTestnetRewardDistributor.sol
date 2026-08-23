// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ELSTestnetRewardDistributor
/// @notice Holds ELS Testnet tokens and transfers real on-chain rewards for
/// Earn quests (Provide Liquidity, Buy ELS). ELS itself is on-chain
/// (ERC-20); AI Energy is NOT — it stays an internal/off-chain ledger
/// (lib/energy.ts / ai_token table) and is credited by the existing backend
/// separately from this contract. This contract only ever moves ELS.
///
/// DISTRIBUTOR ROLE, NOT BACKEND SIGNER MODEL: the backend never holds a
/// private key that can move funds directly from here. It calls
/// `distribute()` as `owner` (an operational signer, distinct from the
/// deployer/admin key per the brief's Section 7 — see deployment notes).
/// The `claimId` param is what turns the brief's DB-level anti-replay
/// (reward_submissions' unique (chain_id, tx_hash, quest_id) + one CLAIMED
/// row per wallet+quest) into an on-chain guarantee too: even if the
/// backend's own dedup ever had a bug, this contract independently refuses
/// to pay the same `claimId` twice.
contract ELSTestnetRewardDistributor is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The ELS Testnet ERC-20 token this distributor pays out.
    /// Immutable — a distributor that could be repointed to a different
    /// token post-deployment is a much larger trust assumption than one
    /// that can't be, and nothing in this system needs it to change.
    IERC20 public immutable elsToken;

    /// @notice claimId => already paid. claimId is the backend's
    /// `reward_submissions.id` (or any other value the backend guarantees
    /// unique per (wallet, quest) claim) — NOT the user's proof-of-action
    /// tx hash, since that hash belongs to a *different* transaction (the
    /// liquidity-add / buy-ELS tx the user did) than this payout tx.
    mapping(bytes32 => bool) public claimed;

    event RewardDistributed(address indexed user, uint256 amount, bytes32 indexed claimId, uint256 timestamp);
    event EmergencyWithdraw(address indexed to, uint256 amount);

    error AlreadyClaimed(bytes32 claimId);
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientDistributorBalance(uint256 requested, uint256 available);

    constructor(address elsTokenAddress, address initialOwner) Ownable(initialOwner) {
        if (elsTokenAddress == address(0)) revert ZeroAddress();
        elsToken = IERC20(elsTokenAddress);
    }

    /// @notice Pay `amount` of ELS to `user` for a specific `claimId`.
    /// Owner-only (the backend's operational signer) — this is NOT a
    /// public claim function; the backend has already run its full
    /// verification pipeline (tx exists, right chain, right sender, right
    /// event, not reused) before ever calling this.
    /// @param claimId Unique identifier for this specific reward grant —
    /// pass keccak256/bytes32 of the backend's reward_submissions.id (or
    /// equivalent). Reusing a claimId reverts; it is never silently
    /// ignored, so a backend retry-after-timeout bug fails loudly instead
    /// of double-paying.
    function distribute(address user, uint256 amount, bytes32 claimId) external onlyOwner whenNotPaused nonReentrant {
        if (user == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (claimed[claimId]) revert AlreadyClaimed(claimId);

        uint256 balance = elsToken.balanceOf(address(this));
        if (balance < amount) revert InsufficientDistributorBalance(amount, balance);

        // Effects before interaction.
        claimed[claimId] = true;

        elsToken.safeTransfer(user, amount);

        emit RewardDistributed(user, amount, claimId, block.timestamp);
    }

    /// @notice Current ELS balance available for distribution.
    function distributorBalance() external view returns (uint256) {
        return elsToken.balanceOf(address(this));
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Owner-only emergency withdrawal of the ELS held here —
    /// e.g. to migrate to a new distributor, or recover funds if this
    /// contract is ever deprecated. Deliberately callable while paused so
    /// funds are never trapped.
    function emergencyWithdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 balance = elsToken.balanceOf(address(this));
        if (amount > balance) revert InsufficientDistributorBalance(amount, balance);
        elsToken.safeTransfer(to, amount);
        emit EmergencyWithdraw(to, amount);
    }
}
