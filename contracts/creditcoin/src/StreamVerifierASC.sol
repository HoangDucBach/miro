// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EvmV1Decoder} from "./libs/EvmV1Decoder.sol";
import {INativeQueryVerifier, NativeQueryVerifierLib} from "./libs/NativeQueryVerifier.sol";
import {ICreditPool} from "./interfaces/ICreditPool.sol";
import {IStreamVerifier} from "./interfaces/IStreamVerifier.sol";

/// @notice Verifies Sablier Lockup lifecycle events emitted on Sepolia through the Block
///         Prover Precompile, then routes proven withdrawals into CreditPool.
/// @dev Only accepts streams that are provably non-cancelable and non-transferable at
///      creation time. Neither flag can ever flip back once set (renounce() on Sablier is
///      one-directional, cancelable -> non-cancelable, and transferability has no setter
///      at all), so the recipient recorded here is a permanent identity for the life of
///      the stream -- no separate ownerOf() re-check is ever needed.
contract StreamVerifierASC is IStreamVerifier, Ownable {
    INativeQueryVerifier public immutable VERIFIER;
    ICreditPool public pool; // set once by owner, after CreditPool is deployed
    uint64 public immutable SOURCE_CHAIN_KEY; // Sepolia chainKey, resolved via SDK at deploy time
    address public immutable SOURCE_SABLIER_LOCKUP; // only accept logs from Sablier's real deployment

    mapping(bytes32 => bool) public processedQueries; // replay protection, keyed on txKey

    struct StreamRecord {
        address borrower;
        address token;
        uint128 depositAmount;
        uint40 startTime;
        uint40 endTime;
        bool exists;
    }

    mapping(uint256 => StreamRecord) public streamById; // keyed by Sablier's own streamId
    mapping(address => uint256) public streamIdOf; // 1 active stream per borrower (MVP)

    // Mirrors of Sablier's own event structs, just enough to abi.decode non-indexed data.
    // Field names/order verified 2026-08-26 against sablier-labs/sdk/abi/lockup/v4.0/SablierLockup.json.
    struct SablierTimestamps {
        uint40 start;
        uint40 end;
    }

    struct SablierCreateEventCommon {
        address funder;
        address sender;
        address recipient;
        uint128 depositAmount;
        address token;
        bool cancelable;
        bool transferable;
        SablierTimestamps timestamps;
        string shape;
    }

    struct SablierUnlockAmounts {
        uint128 start;
        uint128 cliff;
    }

    bytes32 constant SIG_CREATED = keccak256(
        "CreateLockupLinearStream(uint256,(address,address,address,uint128,address,bool,bool,(uint40,uint40),string),uint40,uint40,(uint128,uint128))"
    );
    bytes32 constant SIG_WITHDRAWN = keccak256("WithdrawFromLockupStream(uint256,address,address,uint128)");

    event PoolSet(address pool);
    event StreamRegistered(address indexed borrower, address indexed token, uint256 depositAmount);
    event StreamEventProcessed(bytes32 indexed txKey, bytes32 indexed sig, address indexed borrower);

    constructor(uint64 sourceChainKey_, address sourceSablierLockup_) Ownable(msg.sender) {
        VERIFIER = NativeQueryVerifierLib.getVerifier();
        SOURCE_CHAIN_KEY = sourceChainKey_;
        SOURCE_SABLIER_LOCKUP = sourceSablierLockup_;
    }

    function setPool(address pool_) external onlyOwner {
        require(address(pool) == address(0), "pool already set");
        pool = ICreditPool(pool_);
        emit PoolSet(pool_);
    }

    /// @param chainKey             Creditcoin-internal chain id for the source chain (Sepolia)
    /// @param blockHeight          Sepolia block the tx was included in
    /// @param encodedTransaction   raw tx+receipt bytes proven by the precompile
    /// @param merkleRoot           Merkle root the precompile checks inclusion against
    /// @param siblings             Merkle path from encodedTransaction to merkleRoot
    /// @param lowerEndpointDigest  continuity-proof anchor
    /// @param continuityRoots      continuity-proof chain of header roots
    function processStreamEvent(
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
        bytes32 lowerEndpointDigest,
        bytes32[] calldata continuityRoots
    ) external returns (bool) {
        require(chainKey == SOURCE_CHAIN_KEY, "wrong chain");
        require(address(pool) != address(0), "pool not set");

        INativeQueryVerifier.MerkleProof memory merkleProof =
            INativeQueryVerifier.MerkleProof({root: merkleRoot, siblings: siblings});
        INativeQueryVerifier.ContinuityProof memory continuityProof =
            INativeQueryVerifier.ContinuityProof({lowerEndpointDigest: lowerEndpointDigest, roots: continuityRoots});

        // Replay check first. txKey is derived from a txIndex the precompile computes
        // itself, so it can't be spoofed by submitting a different Merkle path.
        bytes32 txKey = _computeQueryId(chainKey, blockHeight, merkleProof);
        require(!processedQueries[txKey], "already processed");

        // Verify the inclusion proof. Reverts on failure.
        require(VERIFIER.verifyAndEmit(chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof), "proof invalid");
        processedQueries[txKey] = true;

        // The precompile only proves the tx was included, not that it succeeded. A failed
        // source tx must not be treated as a real event, so check the receipt status too.
        require(
            EvmV1Decoder.isValidTransactionType(EvmV1Decoder.getTransactionType(encodedTransaction)), "bad tx type"
        );
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        require(receipt.receiptStatus == 1, "source tx failed");

        _routeLogs(receipt, txKey);
        return true;
    }

    function _routeLogs(EvmV1Decoder.ReceiptFields memory receipt, bytes32 txKey) internal {
        for (uint256 i = 0; i < receipt.receiptLogs.length; i++) {
            EvmV1Decoder.LogEntry memory log = receipt.receiptLogs[i];
            if (log.address_ != SOURCE_SABLIER_LOCKUP) continue;
            if (log.topics.length == 0) continue;

            bytes32 sig = log.topics[0];
            if (sig == SIG_CREATED) {
                _handleCreated(log, txKey);
            } else if (sig == SIG_WITHDRAWN) {
                _handleWithdrawn(log, txKey);
            }
            // CancelLockupStream is intentionally not routed: only non-cancelable streams
            // are ever recorded below, so a legitimate cancel can never target a stream
            // this contract has accepted as collateral.
        }
    }

    function _handleCreated(EvmV1Decoder.LogEntry memory log, bytes32 txKey) internal {
        // topics: [sig, streamId]; data: commonParams, cliffTime, granularity, unlockAmounts
        uint256 streamId = uint256(log.topics[1]);
        (SablierCreateEventCommon memory common,,,) =
            abi.decode(log.data, (SablierCreateEventCommon, uint40, uint40, SablierUnlockAmounts));

        require(!common.cancelable, "stream is cancelable");
        require(!common.transferable, "stream is transferable");

        streamById[streamId] = StreamRecord({
            borrower: common.recipient,
            token: common.token,
            depositAmount: common.depositAmount,
            startTime: common.timestamps.start,
            endTime: common.timestamps.end,
            exists: true
        });
        streamIdOf[common.recipient] = streamId;

        emit StreamRegistered(common.recipient, common.token, common.depositAmount);
        emit StreamEventProcessed(txKey, SIG_CREATED, common.recipient);
    }

    function _handleWithdrawn(EvmV1Decoder.LogEntry memory log, bytes32 txKey) internal {
        // topics: [sig, streamId, to, token]; data: amount. `to` is just the withdrawal
        // destination the recipient chose, not necessarily their own address -- the
        // borrower identity for garnishment purposes is looked up by streamId instead.
        uint256 streamId = uint256(log.topics[1]);
        uint128 amount = abi.decode(log.data, (uint128));

        StreamRecord storage rec = streamById[streamId];
        require(rec.exists, "unknown stream");

        pool.onTokenWithdrawn(rec.borrower, amount);
        emit StreamEventProcessed(txKey, SIG_WITHDRAWN, rec.borrower);
    }

    /// @inheritdoc IStreamVerifier
    function remainingLocked(address user) external view returns (uint256) {
        StreamRecord memory s = streamById[streamIdOf[user]];
        if (!s.exists) return 0;
        if (block.timestamp <= s.startTime) return s.depositAmount;

        uint256 t = block.timestamp >= s.endTime ? s.endTime : block.timestamp;
        uint256 vested = uint256(s.depositAmount) * (t - s.startTime) / (s.endTime - s.startTime);
        return s.depositAmount - vested; // portion not vested yet
    }

    /// @inheritdoc IStreamVerifier
    function collateralToken(address user) external view returns (address) {
        return streamById[streamIdOf[user]].token;
    }

    /// @dev Packs chainKey, blockHeight and txIndex into a 72-byte buffer and hashes it.
    ///      txIndex comes from the precompile's calculateTxIndex, not the caller, so the
    ///      key can't be spoofed with a mismatched Merkle path.
    function _computeQueryId(uint64 chainKey, uint64 blockHeight, INativeQueryVerifier.MerkleProof memory merkleProof)
        internal
        view
        returns (bytes32 queryId)
    {
        uint256 txIndex = VERIFIER.calculateTxIndex(merkleProof);
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, chainKey)
            mstore(add(ptr, 32), shl(192, blockHeight))
            mstore(add(ptr, 40), txIndex)
            queryId := keccak256(ptr, 72)
        }
    }
}
