// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IMintable {
    function mint(address to, uint256 amount) external;
}

/// @dev Test double for a BTC→MUSD swapper: takes native value and mints MUSD at `price`
///      scaled by `outBps` (10_000 = oracle price), so tests can model good and bad fills.
contract MockBtcSwapper {
    address public immutable musd;
    uint256 public price;
    uint256 public outBps = 10_000;

    constructor(address musd_, uint256 price_) {
        musd = musd_;
        price = price_;
    }

    function setOutBps(uint256 bps) external {
        outBps = bps;
    }

    function swapBtcToMusd(uint256, address recipient) external payable returns (uint256 out) {
        out = (msg.value * price * outBps) / 1e18 / 10_000;
        IMintable(musd).mint(recipient, out);
    }
}
