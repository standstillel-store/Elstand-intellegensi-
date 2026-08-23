// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TestnetFaucet
/// @notice Distributes NATIVE tBNB (not an ERC-20) on BSC Testnet (chain id 97).
///
/// ARCHITECTURE NOTE (per the brief's own question — "kalau faucet tBNB
/// native tidak cocok dibuat sebagai ERC20 faucet, jelaskan arsitektur yang
/// benar"): tBNB is BSC Testnet's native gas asset, exactly like ETH on
/// Ethereum — it is not a token contract, has no `balanceOf`/`transfer`,
/// and cannot be "held" by an ERC-20 faucet pattern. The only correct
/// architecture is a plain contract that:
///   1. Is funded by simply sending it native tBNB (a normal value
///      transfer, hence the `receive()` function below — no ERC-20
///      `approve`/`transferFrom` step exists for native currency).
///   2. Pays out via `payable(user).call{value: amount}("")` — the
///      recommended low-level native transfer pattern post-EIP-1884
///      (`.transfer`/`.send` can break on recipients with custom fallback
///      logic due to their fixed 2300 gas stipend; `.call` doesn't have
///      that ceiling, which is why it's paired with `nonReentrant` below).
/// No ERC-20 interface, no `IERC20`, no token address — this contract only
/// ever moves the chain's native asset.
contract TestnetFaucet is Ownable, Pausable, ReentrancyGuard {
    /// @notice Amount of tBNB (in wei) paid out per successful claim.
    uint256 public claimAmount;

    /// @notice Minimum seconds a wallet must wait between claims.
    uint256 public cooldownSeconds;

    /// @notice Hard ceiling so a single claim can never be configured to
    /// drain a meaningful fraction of the contract balance in one shot —
    /// defense in depth against a misconfigured `claimAmount` (owner
    /// error, not just malicious owner) rather than trusting `setClaimAmount`
    /// alone.
    uint256 public constant MAX_CLAIM_AMOUNT = 0.05 ether; // 0.05 tBNB

    mapping(address => uint256) public lastClaimAt;

    event FaucetClaimed(address indexed user, uint256 amount, uint256 timestamp);
    event ClaimAmountUpdated(uint256 oldAmount, uint256 newAmount);
    event CooldownUpdated(uint256 oldCooldown, uint256 newCooldown);
    event Funded(address indexed from, uint256 amount);
    event EmergencyWithdraw(address indexed to, uint256 amount);

    error ClaimAmountTooHigh(uint256 requested, uint256 max);
    error CooldownNotElapsed(uint256 nextClaimAt);
    error InsufficientFaucetBalance(uint256 requested, uint256 available);
    error NativeTransferFailed();
    error ZeroAddress();

    constructor(uint256 _claimAmount, uint256 _cooldownSeconds, address initialOwner) Ownable(initialOwner) {
        if (_claimAmount > MAX_CLAIM_AMOUNT) revert ClaimAmountTooHigh(_claimAmount, MAX_CLAIM_AMOUNT);
        claimAmount = _claimAmount;
        cooldownSeconds = _cooldownSeconds;
    }

    /// @notice Anyone can top up the faucet by simply sending tBNB here.
    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    /// @notice Claim `claimAmount` of native tBNB. Reverts (does not
    /// silently no-op) if the cooldown hasn't elapsed or the faucet is
    /// underfunded, so a frontend/backend integration gets an explicit,
    /// checkable failure rather than a false-positive "success" tx.
    function claim() external whenNotPaused nonReentrant {
        uint256 next = lastClaimAt[msg.sender] + cooldownSeconds;
        if (lastClaimAt[msg.sender] != 0 && block.timestamp < next) {
            revert CooldownNotElapsed(next);
        }

        uint256 amount = claimAmount;
        if (address(this).balance < amount) {
            revert InsufficientFaucetBalance(amount, address(this).balance);
        }

        // Effects before interaction (checks-effects-interactions), on top
        // of nonReentrant — belt and suspenders against reentrancy via a
        // malicious `msg.sender` contract's fallback.
        lastClaimAt[msg.sender] = block.timestamp;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert NativeTransferFailed();

        emit FaucetClaimed(msg.sender, amount, block.timestamp);
    }

    /// @notice Seconds remaining until `user` can claim again (0 = claimable now).
    function timeUntilNextClaim(address user) external view returns (uint256) {
        uint256 next = lastClaimAt[user] + cooldownSeconds;
        if (lastClaimAt[user] == 0 || block.timestamp >= next) return 0;
        return next - block.timestamp;
    }

    function setClaimAmount(uint256 newAmount) external onlyOwner {
        if (newAmount > MAX_CLAIM_AMOUNT) revert ClaimAmountTooHigh(newAmount, MAX_CLAIM_AMOUNT);
        emit ClaimAmountUpdated(claimAmount, newAmount);
        claimAmount = newAmount;
    }

    function setCooldown(uint256 newCooldownSeconds) external onlyOwner {
        emit CooldownUpdated(cooldownSeconds, newCooldownSeconds);
        cooldownSeconds = newCooldownSeconds;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Owner-only emergency withdrawal of native tBNB. Does not
    /// bypass `paused` deliberately being callable even while paused, so
    /// funds are never trapped behind an emergency pause the owner
    /// themselves triggered.
    function emergencyWithdraw(address payable to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount > address(this).balance) revert InsufficientFaucetBalance(amount, address(this).balance);
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
        emit EmergencyWithdraw(to, amount);
    }
}
