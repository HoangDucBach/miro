// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @notice Stake-gated employer allowlist. Only streams from a staked, registered
///         employer count toward collateral. Simple stand-in for KYC for now, could
///         move to attestation-based identity and slashing later.
contract EmployerRegistry {
    uint256 public constant MIN_STAKE = 100 ether; // 100 tCTC

    mapping(address => uint256) public stakeOf;

    event Registered(address indexed employer, uint256 stake);
    event Deregistered(address indexed employer, uint256 refunded);

    function register() external payable {
        require(msg.value >= MIN_STAKE, "stake below minimum");
        require(stakeOf[msg.sender] == 0, "already registered");
        stakeOf[msg.sender] = msg.value;
        emit Registered(msg.sender, msg.value);
    }

    function isVerified(address employer) external view returns (bool) {
        return stakeOf[employer] >= MIN_STAKE;
    }

    /// @dev No timelock, so an employer can deregister mid-stream. StreamVerifierASC only
    ///      checks isVerified once, at stream creation, so this doesn't retroactively
    ///      invalidate an active stream.
    function deregister() external {
        uint256 stake = stakeOf[msg.sender];
        require(stake > 0, "not registered");
        stakeOf[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: stake}("");
        require(ok, "refund failed");
        emit Deregistered(msg.sender, stake);
    }
}
