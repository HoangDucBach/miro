// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {EvmV1Decoder} from "./libs/EvmV1Decoder.sol";
import {INativeQueryVerifier, NativeQueryVerifierLib} from "./libs/NativeQueryVerifier.sol";
import {IEmployerRegistry} from "./interfaces/IEmployerRegistry.sol";
import {ICreditPool} from "./interfaces/ICreditPool.sol";
import {IStreamVerifier} from "./interfaces/IStreamVerifier.sol";

/// @notice Attestcoin Standard Contract (ASC) for StreamCredit. Verifies SalaryStream
///         lifecycle events emitted on Ethereum Sepolia via the Block Prover Precompile,
///         then routes them into EmployerRegistry-gated StreamRecords and CreditPool calls.
/// @dev Canonical ASC pattern: replay check → cryptographic verify → validate contents
///      (receipt status, tx type, emitter) → business logic. Split-contract architecture:
///      this contract verifies; CreditPool holds money logic (§2.3.2 / §2.3.3).
contract StreamVerifierASC is IStreamVerifier {
    INativeQueryVerifier public immutable VERIFIER;
    IEmployerRegistry public immutable registry;
    ICreditPool public pool; // set once by owner, after CreditPool is deployed
    uint64 public immutable SOURCE_CHAIN_KEY; // Sepolia chainKey, resolved via SDK at deploy time
    address public immutable SOURCE_STREAM_CONTRACT; // only accept logs from our SalaryStream
    address public owner;

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

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address registry_, uint64 sourceChainKey_, address sourceStreamContract_) {
        owner = msg.sender;
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

        // 1. Replay protection — queryId = keccak(chainKey, blockHeight, txIndex), where
        //    txIndex comes from the precompile itself (canonical pattern, USCBase._computeQueryId
        //    in gluwa/attestcoin-protocol-examples).
        bytes32 txKey = _computeQueryId(chainKey, blockHeight, merkleProof);
        require(!processedQueries[txKey], "already processed");

        // 2. Cryptographic verification (synchronous, reverts on invalid)
        require(VERIFIER.verifyAndEmit(chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof), "proof invalid");
        processedQueries[txKey] = true;

        // 3. MANDATORY: inclusion != success — check receipt status.
        //    The precompile only proves the tx was included; it says nothing about
        //    whether it reverted, so a failed source tx must never be treated as valid.
        require(
            EvmV1Decoder.isValidTransactionType(EvmV1Decoder.getTransactionType(encodedTransaction)), "bad tx type"
        );
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        require(receipt.receiptStatus == 1, "source tx failed");

        // 4. Extract our events only, from our contract only
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
        // NOTE: SalaryStreamCancelled does not carry the recipient in its topics/data
        // (see SalaryStream.sol event signature), so cancellation is routed by borrower
        // lookup at the CreditPool call site in a fuller implementation. Left as a TODO:
        // extend the source event to index `recipient` so this handler can resolve it
        // without an extra registry/lookup mapping.
        txKey;
        revert("cancel routing: TODO wire recipient lookup");
    }

    /// @inheritdoc IStreamVerifier
    function remainingLocked(address user) external view returns (uint256) {
        StreamRecord memory s = streamOf[user];
        if (!s.exists || s.cancelled) return 0;
        uint256 t = block.timestamp >= s.stopTime ? s.stopTime : block.timestamp;
        uint256 vested = (t - s.startTime) * s.ratePerSecond;
        return s.deposit - vested; // unvested = guaranteed-future portion
    }

    /// @dev Canonical replay-key derivation, matching USCBase._computeQueryId in
    ///      gluwa/attestcoin-protocol-examples: packs (chainKey, blockHeight, txIndex) into
    ///      a 72-byte buffer and hashes it. txIndex comes from the precompile's own
    ///      calculateTxIndex — never derived client-side — so the key can't be spoofed by
    ///      submitting a mismatched Merkle path.
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
