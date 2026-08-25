// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EvmV1Decoder} from "./libs/EvmV1Decoder.sol";
import {INativeQueryVerifier, NativeQueryVerifierLib} from "./libs/NativeQueryVerifier.sol";
import {IEmployerRegistry} from "./interfaces/IEmployerRegistry.sol";
import {ICreditPool} from "./interfaces/ICreditPool.sol";
import {IStreamVerifier} from "./interfaces/IStreamVerifier.sol";

/// @notice Verifies SalaryStream lifecycle events emitted on Sepolia through the Block
///         Prover Precompile, then routes them into EmployerRegistry-gated StreamRecords
///         and CreditPool calls.
/// @dev Flow per call: check replay, verify the proof, validate receipt status and tx type,
///      then run business logic. This contract only verifies and stores stream state,
///      CreditPool owns the money logic.
contract StreamVerifierASC is IStreamVerifier, Ownable {
    INativeQueryVerifier public immutable VERIFIER;
    IEmployerRegistry public immutable registry;
    ICreditPool public pool; // set once by owner, after CreditPool is deployed
    uint64 public immutable SOURCE_CHAIN_KEY; // Sepolia chainKey, resolved via SDK at deploy time
    address public immutable SOURCE_STREAM_CONTRACT; // only accept logs from our SalaryStream

    mapping(bytes32 => bool) public processedQueries; // replay protection, keyed on txKey

    struct StreamRecord {
        address employer;
        uint256 deposit;
        uint256 ratePerSecond;
        uint256 startTime;
        uint256 stopTime;
        uint256 withdrawn;
        bool cancelled;
        bool exists;
    }

    mapping(address => StreamRecord) public streamOf; // 1 active stream per borrower (MVP)

    bytes32 constant SIG_CREATED =
        keccak256("SalaryStreamCreated(uint256,address,address,uint256,uint256,uint256,uint256)");
    bytes32 constant SIG_WITHDRAWN = keccak256("SalaryStreamWithdrawn(uint256,address,uint256)");
    bytes32 constant SIG_CANCELLED = keccak256("SalaryStreamCancelled(uint256,uint256,uint256)");

    event PoolSet(address pool);
    event StreamRegistered(address indexed borrower, address indexed employer, uint256 deposit);
    event StreamEventProcessed(bytes32 indexed txKey, bytes32 indexed sig, address indexed borrower);

    constructor(address registry_, uint64 sourceChainKey_, address sourceStreamContract_) Ownable(msg.sender) {
        registry = IEmployerRegistry(registry_);
        VERIFIER = NativeQueryVerifierLib.getVerifier();
        SOURCE_CHAIN_KEY = sourceChainKey_;
        SOURCE_STREAM_CONTRACT = sourceStreamContract_;
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
            if (log.address_ != SOURCE_STREAM_CONTRACT) continue;
            if (log.topics.length == 0) continue;

            bytes32 sig = log.topics[0];
            if (sig == SIG_CREATED) {
                _handleCreated(log, txKey);
            } else if (sig == SIG_WITHDRAWN) {
                _handleWithdrawn(log, txKey);
            } else if (sig == SIG_CANCELLED) {
                _handleCancelled(log, txKey);
            }
        }
    }

    function _handleCreated(EvmV1Decoder.LogEntry memory log, bytes32 txKey) internal {
        // topics: [sig, streamId, sender, recipient]; data: deposit, ratePerSecond, startTime, stopTime
        address employer = address(uint160(uint256(log.topics[2])));
        address borrower = address(uint160(uint256(log.topics[3])));
        require(registry.isVerified(employer), "employer not verified");

        (uint256 deposit, uint256 ratePerSecond, uint256 startTime, uint256 stopTime) =
            abi.decode(log.data, (uint256, uint256, uint256, uint256));

        streamOf[borrower] = StreamRecord({
            employer: employer,
            deposit: deposit,
            ratePerSecond: ratePerSecond,
            startTime: startTime,
            stopTime: stopTime,
            withdrawn: 0,
            cancelled: false,
            exists: true
        });

        emit StreamRegistered(borrower, employer, deposit);
        emit StreamEventProcessed(txKey, SIG_CREATED, borrower);
    }

    function _handleWithdrawn(EvmV1Decoder.LogEntry memory log, bytes32 txKey) internal {
        // topics: [sig, streamId, recipient]; data: amount
        address borrower = address(uint160(uint256(log.topics[2])));
        uint256 amount = abi.decode(log.data, (uint256));

        StreamRecord storage rec = streamOf[borrower];
        require(rec.exists, "unknown stream");
        rec.withdrawn += amount;

        pool.onSalaryWithdrawn(borrower, amount);
        emit StreamEventProcessed(txKey, SIG_WITHDRAWN, borrower);
    }

    function _handleCancelled(EvmV1Decoder.LogEntry memory, bytes32 txKey) internal pure {
        // TODO: SalaryStreamCancelled doesn't index the recipient, so there's no borrower
        // to route this to yet. Add an indexed recipient to the source event to fix this.
        txKey;
        revert("cancel routing: TODO wire recipient lookup");
    }

    /// @inheritdoc IStreamVerifier
    function remainingLocked(address user) external view returns (uint256) {
        StreamRecord memory s = streamOf[user];
        if (!s.exists || s.cancelled) return 0;
        uint256 t = block.timestamp >= s.stopTime ? s.stopTime : block.timestamp;
        uint256 vested = (t - s.startTime) * s.ratePerSecond;
        return s.deposit - vested; // portion not vested yet
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
