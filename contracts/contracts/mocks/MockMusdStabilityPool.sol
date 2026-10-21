// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IBurnableMock {
    function burn(address from, uint256 amount) external;
}

/// @dev Test double for the MUSD StabilityPool. Tracks deposits per depositor and lets tests
///      simulate a liquidation that burns part of every deposit and pays BTC pro-rata.
contract MockMusdStabilityPool {
    IERC20 public immutable musd;

    address[] internal depositors;
    mapping(address => bool) internal known;
    mapping(address => uint256) public deposits;
    mapping(address => uint256) public gains;
    uint256 public totalDeposits;
    bool public undercollateralized;

    constructor(address musd_) {
        musd = IERC20(musd_);
    }

    receive() external payable {}

    function provideToSP(uint256 amount) external {
        require(amount > 0, "zero");
        if (!known[msg.sender]) {
            known[msg.sender] = true;
            depositors.push(msg.sender);
        }
        musd.transferFrom(msg.sender, address(this), amount);
        deposits[msg.sender] += amount;
        totalDeposits += amount;
        _payGain(msg.sender);
    }

    function withdrawFromSP(uint256 amount) external {
        require(deposits[msg.sender] > 0, "no deposit");
        if (amount != 0) require(!undercollateralized, "StabilityPool: Cannot withdraw while there are troves with ICR < MCR");
        uint256 out = amount > deposits[msg.sender] ? deposits[msg.sender] : amount;
        deposits[msg.sender] -= out;
        totalDeposits -= out;
        musd.transfer(msg.sender, out);
        _payGain(msg.sender);
    }

    function getCompoundedMUSDDeposit(address depositor) external view returns (uint256) {
        return deposits[depositor];
    }

    function getDepositorCollateralGain(address depositor) external view returns (uint256) {
        return gains[depositor];
    }

    function getTotalMUSDDeposits() external view returns (uint256) {
        return totalDeposits;
    }

    /// @dev Simulate a liquidation offsetting `debt` MUSD against the pool for `msg.value` BTC.
    function simulateLiquidation(uint256 debt) external payable {
        uint256 total = totalDeposits;
        for (uint256 i = 0; i < depositors.length; i++) {
            address d = depositors[i];
            uint256 share = deposits[d];
            if (share == 0) continue;
            deposits[d] -= (debt * share) / total;
            gains[d] += (msg.value * share) / total;
        }
        totalDeposits -= debt;
        IBurnableMock(address(musd)).burn(address(this), debt);
    }

    function setUndercollateralized(bool value) external {
        undercollateralized = value;
    }

    function _payGain(address to) internal {
        uint256 gain = gains[to];
        if (gain == 0) return;
        gains[to] = 0;
        (bool ok, ) = to.call{value: gain}("");
        require(ok, "Sending BTC failed");
    }
}

contract MockMusdPriceFeed {
    uint256 public price;

    constructor(uint256 price_) {
        price = price_;
    }

    function setPrice(uint256 price_) external {
        price = price_;
    }

    function fetchPrice() external view returns (uint256) {
        return price;
    }
}
