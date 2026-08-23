// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ELSTestnetSwap
/// @notice Fixed-rate tBNB -> ELS Testnet vending contract. NOT an AMM —
/// per the brief's own fallback instruction ("gunakan arsitektur testnet
/// paling sederhana dan aman" when V4 isn't available/verified on BSC
/// Testnet — confirmed NOT FOUND/NOT VERIFIED for chain 97 as of this
/// writing). A constant-rate vending machine is the simplest architecture
/// that still produces a real on-chain swap: user sends native tBNB in,
/// contract sends ELS out, at an owner-configurable fixed rate. No pool,
/// no price curve, no LP shares, no impermanent loss — appropriate for a
/// testnet "Buy ELS" quest where the actual economic terms don't matter,
/// only that a real, verifiable on-chain purchase happened.
contract ELSTestnetSwap is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable elsToken;

    /// @notice How many ELS (in ELS's smallest unit) 1 tBNB (1e18 wei) buys.
    /// e.g. rate = 1000 * 10**elsDecimals means 1 tBNB -> 1000 ELS.
    uint256 public rateElsPerNativeToken;

    /// @notice Minimum tBNB per swap — guards against dust swaps that would
    /// round `amountOut` to 0 while still emitting a "successful" event.
    uint256 public minSwapAmount;

    event SwapExecuted(
        address indexed user,
        address tokenIn, // address(0) sentinel = native tBNB
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 timestamp
    );
    event RateUpdated(uint256 oldRate, uint256 newRate);
    event MinSwapAmountUpdated(uint256 oldMin, uint256 newMin);
    event Funded(address indexed from, uint256 elsAmount);
    event EmergencyWithdrawNative(address indexed to, uint256 amount);
    event EmergencyWithdrawEls(address indexed to, uint256 amount);

    error BelowMinimumSwap(uint256 sent, uint256 minimum);
    error ZeroAmountOut();
    error InsufficientElsLiquidity(uint256 requested, uint256 available);
    error NativeTransferFailed();
    error ZeroAddress();
    error ZeroRate();

    constructor(address elsTokenAddress, uint256 initialRate, uint256 initialMinSwap, address initialOwner)
        Ownable(initialOwner)
    {
        if (elsTokenAddress == address(0)) revert ZeroAddress();
        if (initialRate == 0) revert ZeroRate();
        elsToken = IERC20(elsTokenAddress);
        rateElsPerNativeToken = initialRate;
        minSwapAmount = initialMinSwap;
    }

    /// @notice Swap native tBNB for ELS at the current fixed rate.
    /// `msg.value` IS the amountIn — there is no separate `approve` step
    /// on the tBNB side (native currency has none); ELS flows out via a
    /// normal ERC-20 transfer from this contract's own balance.
    function swap() external payable whenNotPaused nonReentrant {
        uint256 amountIn = msg.value;
        if (amountIn < minSwapAmount) revert BelowMinimumSwap(amountIn, minSwapAmount);

        uint256 amountOut = (amountIn * rateElsPerNativeToken) / 1 ether;
        if (amountOut == 0) revert ZeroAmountOut();

        uint256 available = elsToken.balanceOf(address(this));
        if (available < amountOut) revert InsufficientElsLiquidity(amountOut, available);

        elsToken.safeTransfer(msg.sender, amountOut);

        emit SwapExecuted(msg.sender, address(0), address(elsToken), amountIn, amountOut, block.timestamp);
    }

    /// @notice Read-only quote — lets the frontend show "you'll receive X
    /// ELS" before the user sends the transaction.
    function quote(uint256 amountIn) external view returns (uint256 amountOut) {
        return (amountIn * rateElsPerNativeToken) / 1 ether;
    }

    /// @notice Fund the contract's ELS liquidity. Requires the caller to
    /// have approved this contract first (standard ERC-20 approve/transferFrom
    /// two-step) — this is the "Approve if required" step from the brief,
    /// but it applies to FUNDING the vending machine, not to the swap()
    /// call itself (which only ever needs native tBNB approval, i.e. none).
    function fundEls(uint256 amount) external {
        elsToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount);
    }

    function setRate(uint256 newRate) external onlyOwner {
        if (newRate == 0) revert ZeroRate();
        emit RateUpdated(rateElsPerNativeToken, newRate);
        rateElsPerNativeToken = newRate;
    }

    function setMinSwapAmount(uint256 newMin) external onlyOwner {
        emit MinSwapAmountUpdated(minSwapAmount, newMin);
        minSwapAmount = newMin;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function emergencyWithdrawNative(address payable to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount > address(this).balance) revert NativeTransferFailed();
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
        emit EmergencyWithdrawNative(to, amount);
    }

    function emergencyWithdrawEls(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 balance = elsToken.balanceOf(address(this));
        if (amount > balance) revert InsufficientElsLiquidity(amount, balance);
        elsToken.safeTransfer(to, amount);
        emit EmergencyWithdrawEls(to, amount);
    }
}
