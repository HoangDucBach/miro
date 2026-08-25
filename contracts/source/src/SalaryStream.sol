// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @notice Employer-funded, per-second vesting salary stream on Ethereum Sepolia.
/// @dev Single source contract emits ALL cross-chain events (Attestcoin best practice:
///      one contract, unambiguous non-standard event names) so the Creditcoin-side
///      StreamVerifierASC only ever has to watch one `emitter` address.
contract SalaryStream {
    struct Stream {
        address sender; // employer
        address recipient; // borrower
        uint256 deposit; // total locked at creation
        uint256 ratePerSecond; // deposit / (stopTime - startTime)
        uint256 startTime;
        uint256 stopTime;
        uint256 withdrawn;
        bool cancelled;
    }

    uint256 public nextStreamId;
    mapping(uint256 => Stream) public streams;

    event SalaryStreamCreated(
        uint256 indexed streamId,
        address indexed sender,
        address indexed recipient,
        uint256 deposit,
        uint256 ratePerSecond,
        uint256 startTime,
        uint256 stopTime
    );
    event SalaryStreamWithdrawn(uint256 indexed streamId, address indexed recipient, uint256 amount);
    event SalaryStreamCancelled(uint256 indexed streamId, uint256 senderRefund, uint256 recipientPayout);

    modifier onlyRecipient(uint256 streamId) {
        require(streams[streamId].recipient == msg.sender, "not recipient");
        _;
    }

    modifier onlyParty(uint256 streamId) {
        Stream storage s = streams[streamId];
        require(msg.sender == s.sender || msg.sender == s.recipient, "not a party");
        _;
    }

    /// @param recipient the employee receiving the stream
    /// @param stopTime  unix timestamp the stream fully vests by
    function createStream(address recipient, uint256 stopTime) external payable returns (uint256 streamId) {
        require(msg.value > 0, "zero deposit");
        require(recipient != address(0) && recipient != msg.sender, "invalid recipient");
        require(stopTime > block.timestamp, "stopTime in past");

        uint256 duration = stopTime - block.timestamp;
        // Integer division truncates: ratePerSecond * duration <= msg.value, almost always
        // strictly less. The remainder (at most `duration - 1` wei) is never claimable by the
        // recipient and never refunded to the sender on cancel — it stays stranded in the
        // contract. Accepted as an MVP tradeoff; see SalaryStream.t.sol for the invariant test.
        uint256 ratePerSecond = msg.value / duration;
        require(ratePerSecond > 0, "deposit too small for duration");

        streamId = nextStreamId++;
        streams[streamId] = Stream({
            sender: msg.sender,
            recipient: recipient,
            deposit: msg.value,
            ratePerSecond: ratePerSecond,
            startTime: block.timestamp,
            stopTime: stopTime,
            withdrawn: 0,
            cancelled: false
        });

        emit SalaryStreamCreated(streamId, msg.sender, recipient, msg.value, ratePerSecond, block.timestamp, stopTime);
    }

    /// @notice Vested but not-yet-withdrawn balance.
    function balanceOf(uint256 streamId) public view returns (uint256 withdrawable) {
        Stream storage s = streams[streamId];
        if (s.cancelled) return 0;
        uint256 t = block.timestamp >= s.stopTime ? s.stopTime : block.timestamp;
        uint256 vested = (t - s.startTime) * s.ratePerSecond;
        withdrawable = vested - s.withdrawn;
    }

    function withdraw(uint256 streamId, uint256 amount) external onlyRecipient(streamId) {
        Stream storage s = streams[streamId];
        require(!s.cancelled, "cancelled");
        require(amount > 0 && amount <= balanceOf(streamId), "amount exceeds vested balance");

        s.withdrawn += amount;
        emit SalaryStreamWithdrawn(streamId, msg.sender, amount);

        (bool ok,) = s.recipient.call{value: amount}("");
        require(ok, "transfer failed");
    }

    function cancel(uint256 streamId) external onlyParty(streamId) {
        Stream storage s = streams[streamId];
        require(!s.cancelled, "already cancelled");

        uint256 recipientPayout = balanceOf(streamId);
        uint256 senderRefund = s.deposit - s.withdrawn - recipientPayout;
        s.cancelled = true;
        s.withdrawn += recipientPayout;

        emit SalaryStreamCancelled(streamId, senderRefund, recipientPayout);

        if (recipientPayout > 0) {
            (bool okR,) = s.recipient.call{value: recipientPayout}("");
            require(okR, "recipient transfer failed");
        }
        if (senderRefund > 0) {
            (bool okS,) = s.sender.call{value: senderRefund}("");
            require(okS, "sender transfer failed");
        }
    }
}
