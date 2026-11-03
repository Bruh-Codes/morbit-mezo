// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IMusdMock {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}

interface IPriceMock {
    function fetchPrice() external view returns (uint256);
}

/// @dev Minimal MUSD BorrowerOperations + TroveManager for tests: no fees or interest, 200 MUSD
///      gas compensation, 110% minimum ratio, 1800 MUSD minimum net debt.
contract MockBorrowerOperations {
    uint256 public constant GAS_COMP = 200e18;
    uint256 public constant MIN_NET_DEBT = 1800e18;
    IMusdMock public immutable musd;
    IPriceMock public immutable priceFeed;

    mapping(address => uint256) public coll;
    mapping(address => uint256) public debt;
    mapping(address => uint256) public status;

    constructor(address musd_, address priceFeed_) {
        musd = IMusdMock(musd_);
        priceFeed = IPriceMock(priceFeed_);
    }

    function openTrove(uint256 debtAmount, address, address) external payable {
        require(status[msg.sender] != 1, "trove is active");
        require(debtAmount >= MIN_NET_DEBT, "net debt must be greater than minimum");
        coll[msg.sender] = msg.value;
        debt[msg.sender] = debtAmount + GAS_COMP;
        status[msg.sender] = 1;
        _checkIcr(msg.sender);
        musd.mint(msg.sender, debtAmount);
    }

    function adjustTrove(uint256 collWithdrawal, uint256 debtChange, bool isDebtIncrease, address, address)
        external
        payable
    {
        require(status[msg.sender] == 1, "no trove");
        coll[msg.sender] = coll[msg.sender] + msg.value - collWithdrawal;
        if (isDebtIncrease) {
            debt[msg.sender] += debtChange;
            musd.mint(msg.sender, debtChange);
        } else if (debtChange > 0) {
            debt[msg.sender] -= debtChange;
            musd.burn(msg.sender, debtChange);
        }
        _checkIcr(msg.sender);
        if (collWithdrawal > 0) {
            (bool ok, ) = msg.sender.call{value: collWithdrawal}("");
            require(ok, "send failed");
        }
    }

    function closeTrove() external {
        require(status[msg.sender] == 1, "no trove");
        uint256 c = coll[msg.sender];
        musd.burn(msg.sender, debt[msg.sender] - GAS_COMP);
        coll[msg.sender] = 0;
        debt[msg.sender] = 0;
        status[msg.sender] = 2;
        (bool ok, ) = msg.sender.call{value: c}("");
        require(ok, "send failed");
    }

    function getTroveColl(address b) external view returns (uint256) {
        return coll[b];
    }

    function getTroveDebt(address b) external view returns (uint256) {
        return debt[b];
    }

    function getTroveStatus(address b) external view returns (uint256) {
        return status[b];
    }

    function _checkIcr(address b) internal view {
        require((coll[b] * priceFeed.fetchPrice()) / debt[b] >= 1.1e18, "ICR < MCR");
    }
}
