// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EvmV1Decoder} from "./libs/EvmV1Decoder.sol";
import {INativeQueryVerifier, NativeQueryVerifierLib} from "./libs/NativeQueryVerifier.sol";
import {ICreditPassport} from "./interfaces/ICreditPassport.sol";

/// @notice Portable, cross-chain credit record. Repayment events from real lending
///         protocols on other chains are proven through the Block Prover Precompile and
///         accumulated into a per-borrower score; same-chain protocols report directly.
/// @dev Sources are pure config, not code: adding a new protocol or a new source chain is
///      one setSource call describing where the borrower and amount live in that event's
///      log. Nothing about any specific chain is hardcoded.
contract CreditPassport is ICreditPassport, Ownable {
    INativeQueryVerifier public immutable VERIFIER;

    // ---------------------------------------------------------------
    // Source registry
    // ---------------------------------------------------------------

    /// @notice Where the borrower address lives in a source event. Topic1..Topic3 are
    ///         indexed positions; DataWord means a 32-byte word of the non-indexed data.
    enum BorrowerLoc {
        Topic1,
        Topic2,
        Topic3,
        DataWord
    }

    struct SourceConfig {
        uint64 chainKey; // Creditcoin-internal id of the source chain, never hardcoded here
        address emitter; // the lending protocol contract on that chain
        bytes32 topic0; // event signature hash
        BorrowerLoc borrowerLoc;
        uint8 borrowerDataWord; // used only when borrowerLoc == DataWord
        uint8 amountDataWord; // which data word holds the repaid amount
        uint256 minAmount; // anti-dust floor, in the event's own asset units
        bool negative; // liquidation-style events subtract score instead of adding
        bool enabled;
    }

    mapping(bytes32 => SourceConfig) public sources; // keyed by sourceIdFor(...)
    mapping(address => bool) public localReporters; // same-chain protocols, no proof needed

    // ---------------------------------------------------------------
    // Passport records
    // ---------------------------------------------------------------

    struct SourceStats {
        uint32 count;
        uint40 lastAt;
    }

    struct Passport {
        uint40 firstSeenAt;
        uint32 cappedRepays; // repays counted toward score, at most PER_SOURCE_CAP per source
        uint32 negativeEvents;
        uint16 sourceCount; // distinct sources that ever credited this borrower
    }

    mapping(address => Passport) public passports;
    mapping(address => mapping(bytes32 => SourceStats)) public sourceStats;
    mapping(bytes32 => bool) public processedQueries; // replay protection, keyed on txKey

    // ---------------------------------------------------------------
    // Scoring parameters
    // ---------------------------------------------------------------

    uint32 public constant PER_SOURCE_CAP = 10; // diminishing returns: farming one source stops paying
    uint256 public constant REPAY_POINTS = 10;
    uint256 public constant DIVERSITY_POINTS = 20; // per distinct source beyond the first
    uint256 public constant AGE_PERIOD = 30 days;
    uint256 public constant AGE_POINTS_PER_PERIOD = 5;
    uint256 public constant AGE_CAP_PERIODS = 6;
    uint256 public constant NEGATIVE_PENALTY = 50;

    event SourceSet(bytes32 indexed sourceId, uint64 chainKey, address emitter, bytes32 topic0, bool enabled);
    event LocalReporterSet(address indexed reporter, bool enabled);
    event RepayRecorded(address indexed borrower, bytes32 indexed sourceId, uint32 sourceCountForBorrower);
    event NegativeEventRecorded(address indexed borrower, bytes32 indexed sourceId);
    event AttestationProcessed(bytes32 indexed txKey, bytes32 indexed sourceId, address indexed borrower, uint256 amount);

    constructor() Ownable(msg.sender) {
        VERIFIER = NativeQueryVerifierLib.getVerifier();
    }

    // ---------------------------------------------------------------
    // Admin: source injection
    // ---------------------------------------------------------------

    function sourceIdFor(uint64 chainKey, address emitter, bytes32 topic0) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(chainKey, emitter, topic0));
    }

    /// @notice chainKey 0 is reserved for local reporters, so a cross-chain source can
    ///         never collide with a local one.
    function localSourceIdFor(address reporter) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(uint64(0), reporter, bytes32(0)));
    }

    function setSource(SourceConfig calldata cfg) external onlyOwner {
        require(cfg.chainKey != 0, "chainKey 0 reserved");
        require(cfg.emitter != address(0), "zero emitter");
        require(cfg.topic0 != bytes32(0), "zero topic");

        bytes32 id = sourceIdFor(cfg.chainKey, cfg.emitter, cfg.topic0);
        sources[id] = cfg;
        emit SourceSet(id, cfg.chainKey, cfg.emitter, cfg.topic0, cfg.enabled);
    }

    function setLocalReporter(address reporter, bool enabled) external onlyOwner {
        require(reporter != address(0), "zero reporter");
        localReporters[reporter] = enabled;
        emit LocalReporterSet(reporter, enabled);
    }

    // ---------------------------------------------------------------
    // Cross-chain path: proof-verified events
    // ---------------------------------------------------------------

    /// @param chainKey             Creditcoin-internal chain id the tx belongs to
    /// @param blockHeight          source-chain block the tx was included in
    /// @param encodedTransaction   raw tx+receipt bytes proven by the precompile
    /// @param merkleRoot           Merkle root the precompile checks inclusion against
    /// @param siblings             Merkle path from encodedTransaction to merkleRoot
    /// @param lowerEndpointDigest  continuity-proof anchor
    /// @param continuityRoots      continuity-proof chain of header roots
    function processAttestation(
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
        bytes32 lowerEndpointDigest,
        bytes32[] calldata continuityRoots
    ) external returns (bool) {
        bytes32 txKey =
            _verifyAndMark(chainKey, blockHeight, encodedTransaction, merkleRoot, siblings, lowerEndpointDigest, continuityRoots);
        _routeLogs(_decodeReceipt(encodedTransaction), chainKey, txKey);
        return true;
    }

    function _verifyAndMark(
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
        bytes32 lowerEndpointDigest,
        bytes32[] calldata continuityRoots
    ) internal returns (bytes32 txKey) {
        INativeQueryVerifier.MerkleProof memory merkleProof =
            INativeQueryVerifier.MerkleProof({root: merkleRoot, siblings: siblings});
        INativeQueryVerifier.ContinuityProof memory continuityProof =
            INativeQueryVerifier.ContinuityProof({lowerEndpointDigest: lowerEndpointDigest, roots: continuityRoots});

        // Replay check first. txKey is derived from a txIndex the precompile computes
        // itself, so it can't be spoofed by submitting a different Merkle path.
        txKey = _computeQueryId(chainKey, blockHeight, merkleProof);
        require(!processedQueries[txKey], "already processed");

        // Verify the inclusion proof against the claimed chainKey. Reverts on failure, so
        // a mismatched chainKey can never get this far with a valid-looking proof.
        require(
            VERIFIER.verifyAndEmit(chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof),
            "proof invalid"
        );
        processedQueries[txKey] = true;
    }

    /// @dev The precompile only proves the tx was included, not that it succeeded. A
    ///      failed source tx must not earn anyone credit, so check receipt status too.
    function _decodeReceipt(bytes calldata encodedTransaction)
        internal
        pure
        returns (EvmV1Decoder.ReceiptFields memory receipt)
    {
        require(EvmV1Decoder.isValidTransactionType(EvmV1Decoder.getTransactionType(encodedTransaction)), "bad tx type");
        receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        require(receipt.receiptStatus == 1, "source tx failed");
    }

    function _routeLogs(EvmV1Decoder.ReceiptFields memory receipt, uint64 chainKey, bytes32 txKey) internal {
        for (uint256 i = 0; i < receipt.receiptLogs.length; i++) {
            EvmV1Decoder.LogEntry memory log = receipt.receiptLogs[i];
            if (log.topics.length == 0) continue;

            bytes32 sourceId = sourceIdFor(chainKey, log.address_, log.topics[0]);
            SourceConfig memory cfg = sources[sourceId];
            if (!cfg.enabled) continue;

            (address borrower, uint256 amount, bool ok) = _decode(log, cfg);
            if (!ok) continue; // malformed shape: skip this log, others in the receipt may be fine
            if (amount < cfg.minAmount) continue;

            _record(borrower, sourceId, cfg.negative);
            emit AttestationProcessed(txKey, sourceId, borrower, amount);
        }
    }

    /// @dev Config-driven decoding is what makes sources injectable: any standard
    ///      (non-packed) event can be described by where its borrower and amount live.
    function _decode(EvmV1Decoder.LogEntry memory log, SourceConfig memory cfg)
        internal
        pure
        returns (address borrower, uint256 amount, bool ok)
    {
        if (cfg.borrowerLoc == BorrowerLoc.DataWord) {
            if (log.data.length < (uint256(cfg.borrowerDataWord) + 1) * 32) return (address(0), 0, false);
            borrower = address(uint160(uint256(_dataWord(log.data, cfg.borrowerDataWord))));
        } else {
            uint256 topicIndex = uint256(cfg.borrowerLoc) + 1; // Topic1 => topics[1]
            if (log.topics.length <= topicIndex) return (address(0), 0, false);
            borrower = address(uint160(uint256(log.topics[topicIndex])));
        }

        if (log.data.length < (uint256(cfg.amountDataWord) + 1) * 32) return (address(0), 0, false);
        amount = uint256(_dataWord(log.data, cfg.amountDataWord));
        ok = borrower != address(0);
    }

    function _dataWord(bytes memory data, uint8 wordIndex) internal pure returns (bytes32 w) {
        assembly {
            w := mload(add(add(data, 32), mul(wordIndex, 32)))
        }
    }

    // ---------------------------------------------------------------
    // Local path: same-chain protocols report directly
    // ---------------------------------------------------------------

    /// @inheritdoc ICreditPassport
    function recordLocalRepay(address borrower, uint256 amount) external {
        require(localReporters[msg.sender], "not a reporter");
        require(borrower != address(0), "zero borrower");
        amount; // thresholding is the reporter's responsibility; it is admin-registered

        _record(borrower, localSourceIdFor(msg.sender), false);
    }

    // ---------------------------------------------------------------
    // Recording + scoring
    // ---------------------------------------------------------------

    function _record(address borrower, bytes32 sourceId, bool negative) internal {
        Passport storage p = passports[borrower];
        if (p.firstSeenAt == 0) p.firstSeenAt = uint40(block.timestamp);

        if (negative) {
            p.negativeEvents++;
            emit NegativeEventRecorded(borrower, sourceId);
            return;
        }

        SourceStats storage s = sourceStats[borrower][sourceId];
        if (s.count == 0) p.sourceCount++;
        s.count++;
        s.lastAt = uint40(block.timestamp);
        if (s.count <= PER_SOURCE_CAP) p.cappedRepays++;

        emit RepayRecorded(borrower, sourceId, s.count);
    }

    /// @inheritdoc ICreditPassport
    /// @dev Deterministic, oracle-free: counts and diversity, not USD value. Repay counts
    ///      cap per source so farming one protocol stops paying; diversity and account age
    ///      reward exactly the behavior that is expensive to fake.
    function scoreOf(address borrower) public view returns (uint256) {
        Passport memory p = passports[borrower];
        if (p.firstSeenAt == 0) return 0;

        uint256 base = uint256(p.cappedRepays) * REPAY_POINTS;
        uint256 diversity = p.sourceCount > 1 ? (uint256(p.sourceCount) - 1) * DIVERSITY_POINTS : 0;
        uint256 agePeriods = (block.timestamp - p.firstSeenAt) / AGE_PERIOD;
        if (agePeriods > AGE_CAP_PERIODS) agePeriods = AGE_CAP_PERIODS;

        uint256 positive = base + diversity + agePeriods * AGE_POINTS_PER_PERIOD;
        uint256 penalty = uint256(p.negativeEvents) * NEGATIVE_PENALTY;
        return positive > penalty ? positive - penalty : 0;
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
