// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @notice Stake-gated employer allowlist. MVP proxy for KYC: only streams whose
///         `sender` is a staked, registered employer count toward collateral (§1.6).
///         Roadmap: attestation-based employer identity, slashing.
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

    /// @dev No timelock in MVP (stretch goal per §2.3.4) — deregistering mid-active-stream
    ///      is a known gap; StreamVerifierASC snapshots `isVerified` only at stream creation.
    function deregister() external {
        uint256 stake = stakeOf[msg.sender];
        require(stake > 0, "not registered");
        stakeOf[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: stake}("");
        require(ok, "refund failed");
        emit Deregistered(msg.sender, stake);
    }
}
