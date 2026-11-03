// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IBtcToMusdSwapper} from "./MorbitEarnVaultV2.sol";

/// @notice Turns MUSD into native BTC. Pulls the MUSD from the caller (needs an allowance).
interface IMusdToBtcSwapper {
    function swapMusdToBtc(uint256 musdIn, uint256 minBtcOut, address recipient) external returns (uint256 btcOut);
}

/// @notice Mezo Pools router (Velodrome/Aerodrome-style), testnet 0x9a1f…D7E9.
interface IMezoRouter {
    struct Route {
        address from;
        address to;
        bool stable;
        address factory;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

/**
 * @title MezoPoolsSwapper
 * @notice Swaps between native BTC and MUSD on the Mezo Pools BTC/MUSD volatile pool. On Mezo, native BTC
 *         is also exposed as an ERC20 at a fixed precompile address, so the BTC that arrives as
 *         msg.value can be approved and spent by the router like any token. Holds nothing between calls.
 */
contract MezoPoolsSwapper is IBtcToMusdSwapper, IMusdToBtcSwapper {
    using SafeERC20 for IERC20;

    IMezoRouter public immutable router;
    address public immutable btc;
    address public immutable musd;
    address public immutable factory;

    constructor(address router_, address btc_, address musd_, address factory_) {
        router = IMezoRouter(router_);
        btc = btc_;
        musd = musd_;
        factory = factory_;
    }

    function swapBtcToMusd(uint256 minMusdOut, address recipient) external payable returns (uint256 musdOut) {
        IERC20(btc).forceApprove(address(router), msg.value);
        IMezoRouter.Route[] memory routes = new IMezoRouter.Route[](1);
        routes[0] = IMezoRouter.Route({from: btc, to: musd, stable: false, factory: factory});
        uint256[] memory amounts = router.swapExactTokensForTokens(
            msg.value,
            minMusdOut,
            routes,
            recipient,
            block.timestamp
        );
        musdOut = amounts[amounts.length - 1];
    }

    /// @notice The router pays BTC through the ERC20 precompile, which credits `recipient`'s native balance.
    function swapMusdToBtc(uint256 musdIn, uint256 minBtcOut, address recipient) external returns (uint256 btcOut) {
        IERC20(musd).safeTransferFrom(msg.sender, address(this), musdIn);
        IERC20(musd).forceApprove(address(router), musdIn);
        IMezoRouter.Route[] memory routes = new IMezoRouter.Route[](1);
        routes[0] = IMezoRouter.Route({from: musd, to: btc, stable: false, factory: factory});
        uint256[] memory amounts = router.swapExactTokensForTokens(musdIn, minBtcOut, routes, recipient, block.timestamp);
        btcOut = amounts[amounts.length - 1];
    }
}
