// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CreditPassport} from "../src/CreditPassport.sol";
import {EvmV1Decoder} from "../src/libs/EvmV1Decoder.sol";
import {INativeQueryVerifier} from "../src/libs/NativeQueryVerifier.sol";

/// @notice Stateless mock standing in for the Block Prover Precompile at 0x0FD2, installed via
///         `vm.etch`. Purely input-driven (no storage) so etched code behaves identically to a
///         normal deployment: `verifyAndEmit` reverts iff `merkleProof.root == INVALID_ROOT`,
///         `calculateTxIndex` derives a deterministic index from the whole proof so different
///         "transactions" (different roots) get different replay keys.
contract MockNativeQueryVerifier is INativeQueryVerifier {
    bytes32 public constant INVALID_ROOT = keccak256("INVALID_PROOF_MARKER");

    function verifyAndEmit(
        uint64,
        uint64,
        bytes calldata,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata
    ) external pure returns (bool) {
        if (merkleProof.root == INVALID_ROOT) revert("mock verifier: invalid proof");
        return true;
    }

    function calculateTxIndex(MerkleProof calldata merkleProof) external pure returns (uint64) {
        return uint64(uint256(keccak256(abi.encode(merkleProof.root))) % 1000);
    }
}

contract CreditPassportTest is Test {
    CreditPassport passport;

    uint64 constant SEPOLIA_CHAIN_KEY = 1;
    address aavePool = makeAddr("aavePool");
    address morpho = makeAddr("morpho");
    address otherContract = makeAddr("otherContract");
    address borrower = makeAddr("borrower");
    address reporter = makeAddr("reporter");

    address constant PRECOMPILE_ADDR = 0x0000000000000000000000000000000000000FD2;

    // Real event signatures of the two source protocols (shape-verified against their ABIs).
    bytes32 constant AAVE_REPAY_SIG = keccak256("Repay(address,address,address,uint256,bool)");
    bytes32 constant MORPHO_REPAY_SIG = keccak256("Repay(bytes32,address,address,uint256,uint256)");
    bytes32 constant AAVE_LIQUIDATION_SIG =
        keccak256("LiquidationCall(address,address,address,uint256,uint256,address,bool)");

    uint256 constant AAVE_MIN = 10e6; // 10 units of a 6-decimal asset
    uint256 constant MORPHO_MIN = 1e18; // 1 unit of an 18-decimal asset

    bytes32 aaveSourceId;
    bytes32 morphoSourceId;

    function setUp() public {
        passport = new CreditPassport();

        MockNativeQueryVerifier mockImpl = new MockNativeQueryVerifier();
        vm.etch(PRECOMPILE_ADDR, address(mockImpl).code);

        // Aave Repay: real event is `Repay(address indexed reserve, address indexed user,
        // address indexed repayer, uint256 amount, bool useATokens)` -- user (the
        // borrower whose debt shrank) IS indexed, topic 2. amount is data word 0.
        // Verified 2026-08-27 against aave-dao/aave-v3-origin's IPool.sol.
        passport.setSource(
            CreditPassport.SourceConfig({
                chainKey: SEPOLIA_CHAIN_KEY,
                emitter: aavePool,
                topic0: AAVE_REPAY_SIG,
                borrowerLoc: CreditPassport.BorrowerLoc.Topic2,
                borrowerDataWord: 0,
                amountDataWord: 0,
                minAmount: AAVE_MIN,
                negative: false,
                enabled: true
            })
        );
        // Morpho Repay: real event is `Repay(Id indexed id, address indexed caller,
        // address indexed onBehalf, uint256 assets, uint256 shares)` -- three indexed
        // params, so onBehalf (the borrower) is topic 3. assets is data word 0.
        // Verified 2026-08-27 against morpho-org/morpho-blue's EventsLib.sol.
        passport.setSource(
            CreditPassport.SourceConfig({
                chainKey: SEPOLIA_CHAIN_KEY,
                emitter: morpho,
                topic0: MORPHO_REPAY_SIG,
                borrowerLoc: CreditPassport.BorrowerLoc.Topic3,
                borrowerDataWord: 0,
                amountDataWord: 0,
                minAmount: MORPHO_MIN,
                negative: false,
                enabled: true
            })
        );

        aaveSourceId = passport.sourceIdFor(SEPOLIA_CHAIN_KEY, aavePool, AAVE_REPAY_SIG);
        morphoSourceId = passport.sourceIdFor(SEPOLIA_CHAIN_KEY, morpho, MORPHO_REPAY_SIG);
    }

    // =================================================================
    // Encoding helpers (mirror EvmV1Decoder's (uint8, bytes[]) chunk format)
    // =================================================================

    function _buildLog(address emitter, bytes32[] memory topics, bytes memory data)
        internal
        pure
        returns (EvmV1Decoder.LogEntryTuple memory)
    {
        return EvmV1Decoder.LogEntryTuple({address_: emitter, topics: topics, data: data});
    }

    /// @dev Mirrors Aave V3's real Repay event: reserve, user, and repayer are ALL
    ///      indexed -- user (the borrower whose debt shrank) is topic 2. amount and
    ///      useATokens are the only non-indexed fields (data word 0 and 1).
    function _aaveRepayLog(address user, uint256 amount) internal returns (EvmV1Decoder.LogEntryTuple memory) {
        bytes32[] memory topics = new bytes32[](4);
        topics[0] = AAVE_REPAY_SIG;
        topics[1] = bytes32(uint256(uint160(makeAddr("reserve"))));
        topics[2] = bytes32(uint256(uint160(user)));
        topics[3] = bytes32(uint256(uint160(makeAddr("repayer"))));
        bytes memory data = abi.encode(amount, false); // amount, useATokens
        return _buildLog(aavePool, topics, data);
    }

    /// @dev Mirrors Morpho Blue's real Repay event: id, caller, AND onBehalf are all
    ///      indexed -- onBehalf (the borrower) is topic 3. assets and shares are the
    ///      only non-indexed fields (data word 0 and 1).
    function _morphoRepayLog(address onBehalf, uint256 assets)
        internal
        returns (EvmV1Decoder.LogEntryTuple memory)
    {
        bytes32[] memory topics = new bytes32[](4);
        topics[0] = MORPHO_REPAY_SIG;
        topics[1] = keccak256("some-market-id");
        topics[2] = bytes32(uint256(uint160(makeAddr("caller"))));
        topics[3] = bytes32(uint256(uint160(onBehalf)));
        bytes memory data = abi.encode(assets, assets); // assets, shares
        return _buildLog(morpho, topics, data);
    }

    /// @dev Type-0 (legacy) encoding: chunks = [commonTx, LegacyFields, receipt].
    function _buildEncodedTx(EvmV1Decoder.LogEntryTuple[] memory logs, uint8 receiptStatus)
        internal
        pure
        returns (bytes memory)
    {
        bytes memory chunk0 =
            abi.encode(uint64(0), uint64(21000), address(0x1), false, address(0x2), uint256(0), bytes(""));
        bytes memory chunk1 = abi.encode(uint128(0), uint256(0), bytes32(0), bytes32(0));
        bytes memory chunk2 = abi.encode(receiptStatus, uint64(21000), logs, bytes(""));

        bytes[] memory chunks = new bytes[](3);
        chunks[0] = chunk0;
        chunks[1] = chunk1;
        chunks[2] = chunk2;
        return abi.encode(uint8(0), chunks);
    }

    function _buildEncodedTxWithType(uint8 txType, EvmV1Decoder.LogEntryTuple[] memory logs, uint8 receiptStatus)
        internal
        pure
        returns (bytes memory)
    {
        bytes memory chunk0 =
            abi.encode(uint64(0), uint64(21000), address(0x1), false, address(0x2), uint256(0), bytes(""));
        bytes memory chunk1 = abi.encode(uint128(0), uint256(0), bytes32(0), bytes32(0));
        bytes memory chunk2 = abi.encode(receiptStatus, uint64(21000), logs, bytes(""));

        bytes[] memory chunks = new bytes[](3);
        chunks[0] = chunk0;
        chunks[1] = chunk1;
        chunks[2] = chunk2;
        return abi.encode(txType, chunks);
    }

    function _singleLog(EvmV1Decoder.LogEntryTuple memory log)
        internal
        pure
        returns (EvmV1Decoder.LogEntryTuple[] memory)
    {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = log;
        return logs;
    }

    function _submit(bytes memory encodedTx, bytes32 root, uint64 blockHeight) internal returns (bool) {
        return _submitOnChain(encodedTx, root, blockHeight, SEPOLIA_CHAIN_KEY);
    }

    function _submitOnChain(bytes memory encodedTx, bytes32 root, uint64 blockHeight, uint64 chainKey)
        internal
        returns (bool)
    {
        INativeQueryVerifier.MerkleProofEntry[] memory siblings = new INativeQueryVerifier.MerkleProofEntry[](0);
        return passport.processAttestation(chainKey, blockHeight, encodedTx, root, siblings, bytes32(0), new bytes32[](0));
    }

    // =================================================================
    // Admin: source registry
    // =================================================================

    function test_setSource_onlyOwner() public {
        CreditPassport.SourceConfig memory cfg = _aaveConfig();
        vm.prank(address(0xdead));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(0xdead)));
        passport.setSource(cfg);
    }

    function test_setSource_storesConfigAtDerivedId() public view {
        (uint64 chainKey, address emitter, bytes32 topic0,,,, uint256 minAmount, bool negative, bool enabled) =
            passport.sources(aaveSourceId);
        assertEq(chainKey, SEPOLIA_CHAIN_KEY);
        assertEq(emitter, aavePool);
        assertEq(topic0, AAVE_REPAY_SIG);
        assertEq(minAmount, AAVE_MIN);
        assertFalse(negative);
        assertTrue(enabled);
    }

    function test_setSource_rejectsReservedChainKeyZero() public {
        CreditPassport.SourceConfig memory cfg = _aaveConfig();
        cfg.chainKey = 0;
        vm.expectRevert("chainKey 0 reserved");
        passport.setSource(cfg);
    }

    function test_setLocalReporter_onlyOwner() public {
        vm.prank(address(0xdead));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(0xdead)));
        passport.setLocalReporter(reporter, true);
    }

    function _aaveConfig() internal view returns (CreditPassport.SourceConfig memory) {
        return CreditPassport.SourceConfig({
            chainKey: SEPOLIA_CHAIN_KEY,
            emitter: aavePool,
            topic0: AAVE_REPAY_SIG,
            borrowerLoc: CreditPassport.BorrowerLoc.Topic2,
            borrowerDataWord: 0,
            amountDataWord: 0,
            minAmount: AAVE_MIN,
            negative: false,
            enabled: true
        });
    }

    // =================================================================
    // Cross-chain attestation processing
    // =================================================================

    function test_aaveShapedRepay_borrowerDecodedFromTopic2() public {
        bytes memory tx_ = _buildEncodedTx(_singleLog(_aaveRepayLog(borrower, 100e6)), 1);
        assertTrue(_submit(tx_, keccak256("tx-aave-1"), 100));

        (uint32 count,) = passport.sourceStats(borrower, aaveSourceId);
        assertEq(count, 1);
        assertEq(passport.scoreOf(borrower), 10); // 1 repay * 10 pts, single source, age 0
        (uint40 firstSeenAt,,, uint16 sourceCount) = passport.passports(borrower);
        assertEq(firstSeenAt, uint40(block.timestamp));
        assertEq(sourceCount, 1);
    }

    function test_morphoShapedRepay_borrowerDecodedFromTopic3() public {
        bytes memory tx_ = _buildEncodedTx(_singleLog(_morphoRepayLog(borrower, 5e18)), 1);
        assertTrue(_submit(tx_, keccak256("tx-morpho-1"), 100));

        (uint32 count,) = passport.sourceStats(borrower, morphoSourceId);
        assertEq(count, 1);
        // Neither the caller nor any data-word address got credited by mistake.
        (uint32 callerCount,) = passport.sourceStats(makeAddr("caller"), morphoSourceId);
        assertEq(callerCount, 0);
    }

    function test_belowMinAmount_ignored() public {
        bytes memory tx_ = _buildEncodedTx(_singleLog(_aaveRepayLog(borrower, AAVE_MIN - 1)), 1);
        assertTrue(_submit(tx_, keccak256("tx-dust"), 100));
        assertEq(passport.scoreOf(borrower), 0);
    }

    function test_unknownEmitter_ignored() public {
        EvmV1Decoder.LogEntryTuple memory log = _aaveRepayLog(borrower, 100e6);
        log.address_ = otherContract;
        bytes memory tx_ = _buildEncodedTx(_singleLog(log), 1);
        assertTrue(_submit(tx_, keccak256("tx-foreign"), 100));
        assertEq(passport.scoreOf(borrower), 0);
    }

    function test_unknownTopic_ignored() public {
        EvmV1Decoder.LogEntryTuple memory log = _aaveRepayLog(borrower, 100e6);
        log.topics[0] = keccak256("SomeUnrelatedEvent(uint256)");
        bytes memory tx_ = _buildEncodedTx(_singleLog(log), 1);
        assertTrue(_submit(tx_, keccak256("tx-unrelated"), 100));
        assertEq(passport.scoreOf(borrower), 0);
    }

    function test_wrongChainKey_sourceLookupMisses() public {
        // Registered under chainKey 1; a proof claiming chainKey 2 (assuming the precompile
        // accepted it) must not match the source config.
        bytes memory tx_ = _buildEncodedTx(_singleLog(_aaveRepayLog(borrower, 100e6)), 1);
        assertTrue(_submitOnChain(tx_, keccak256("tx-wrong-chain"), 100, 2));
        assertEq(passport.scoreOf(borrower), 0);
    }

    function test_disabledSource_ignored() public {
        CreditPassport.SourceConfig memory cfg = _aaveConfig();
        cfg.enabled = false;
        passport.setSource(cfg);

        bytes memory tx_ = _buildEncodedTx(_singleLog(_aaveRepayLog(borrower, 100e6)), 1);
        assertTrue(_submit(tx_, keccak256("tx-disabled"), 100));
        assertEq(passport.scoreOf(borrower), 0);
    }

    function test_replay_rejected() public {
        bytes memory tx_ = _buildEncodedTx(_singleLog(_aaveRepayLog(borrower, 100e6)), 1);
        bytes32 root = keccak256("tx-replay");
        assertTrue(_submit(tx_, root, 100));

        vm.expectRevert("already processed");
        _submit(tx_, root, 100);
    }

    function test_sameRootDifferentBlockHeight_isNotReplay() public {
        bytes memory tx_ = _buildEncodedTx(_singleLog(_aaveRepayLog(borrower, 100e6)), 1);
        bytes32 root = keccak256("tx-shared-root");
        assertTrue(_submit(tx_, root, 100));
        assertTrue(_submit(tx_, root, 101));
        assertEq(passport.scoreOf(borrower), 20); // both counted
    }

    function test_failedSourceTx_reverts() public {
        bytes memory tx_ = _buildEncodedTx(_singleLog(_aaveRepayLog(borrower, 100e6)), 0);
        vm.expectRevert("source tx failed");
        _submit(tx_, keccak256("tx-failed"), 100);
    }

    function test_badTxType_reverts() public {
        bytes memory tx_ = _buildEncodedTxWithType(5, _singleLog(_aaveRepayLog(borrower, 100e6)), 1);
        vm.expectRevert("bad tx type");
        _submit(tx_, keccak256("tx-badtype"), 100);
    }

    function test_invalidProof_reverts() public {
        bytes memory tx_ = _buildEncodedTx(_singleLog(_aaveRepayLog(borrower, 100e6)), 1);
        bytes32 invalidRoot = MockNativeQueryVerifier(PRECOMPILE_ADDR).INVALID_ROOT();
        vm.expectRevert("mock verifier: invalid proof");
        _submit(tx_, invalidRoot, 100);
    }

    function test_malformedLog_dataTooShort_skippedWithoutRevert() public {
        // Topics are long enough for the borrower (topic 2), but data is empty -- too
        // short for the configured amountDataWord (0), so this log must be skipped, not
        // revert the whole processAttestation call.
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = AAVE_REPAY_SIG;
        topics[1] = bytes32(0);
        topics[2] = bytes32(uint256(uint160(borrower)));
        EvmV1Decoder.LogEntryTuple memory log = _buildLog(aavePool, topics, bytes(""));
        bytes memory tx_ = _buildEncodedTx(_singleLog(log), 1);
        assertTrue(_submit(tx_, keccak256("tx-short"), 100));
        assertEq(passport.scoreOf(borrower), 0);
    }

    function test_malformedLog_topicsTooShort_skippedWithoutRevert() public {
        // Only [sig, reserve] present -- topic 2 (the borrower slot) doesn't exist.
        bytes32[] memory topics = new bytes32[](2);
        topics[0] = AAVE_REPAY_SIG;
        topics[1] = bytes32(0);
        EvmV1Decoder.LogEntryTuple memory log = _buildLog(aavePool, topics, abi.encode(uint256(100e6), false));
        bytes memory tx_ = _buildEncodedTx(_singleLog(log), 1);
        assertTrue(_submit(tx_, keccak256("tx-shorttopics"), 100));
        assertEq(passport.scoreOf(borrower), 0);
    }

    function test_multipleLogsOneReceipt_bothSourcesCredited() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](2);
        logs[0] = _aaveRepayLog(borrower, 100e6);
        logs[1] = _morphoRepayLog(borrower, 5e18);
        bytes memory tx_ = _buildEncodedTx(logs, 1);
        _submit(tx_, keccak256("tx-combo"), 100);

        // 2 repays * 10 + 1 diversity bonus (2 sources) * 20
        assertEq(passport.scoreOf(borrower), 40);
        (,,, uint16 sourceCount) = passport.passports(borrower);
        assertEq(sourceCount, 2);
    }

    // =================================================================
    // Per-source cap and negative events
    // =================================================================

    function test_perSourceCap_stopsCountingAtTen() public {
        for (uint256 i = 0; i < 12; i++) {
            bytes memory tx_ = _buildEncodedTx(_singleLog(_aaveRepayLog(borrower, 100e6)), 1);
            _submit(tx_, keccak256(abi.encodePacked("tx-cap-", i)), uint64(100 + i));
        }
        (uint32 rawCount,) = passport.sourceStats(borrower, aaveSourceId);
        assertEq(rawCount, 12); // raw count keeps going
        (, uint32 cappedRepays,,) = passport.passports(borrower);
        assertEq(cappedRepays, 10); // score contribution stops at the cap
        assertEq(passport.scoreOf(borrower), 100);
    }

    function test_negativeSource_penalizesAndFloorsAtZero() public {
        // Register an Aave liquidation-shaped source as negative: user is topic 3.
        passport.setSource(
            CreditPassport.SourceConfig({
                chainKey: SEPOLIA_CHAIN_KEY,
                emitter: aavePool,
                topic0: AAVE_LIQUIDATION_SIG,
                borrowerLoc: CreditPassport.BorrowerLoc.Topic3,
                borrowerDataWord: 0,
                amountDataWord: 0,
                minAmount: 0,
                negative: true,
                enabled: true
            })
        );

        // One good repay first: score 10.
        _submit(_buildEncodedTx(_singleLog(_aaveRepayLog(borrower, 100e6)), 1), keccak256("tx-good"), 100);
        assertEq(passport.scoreOf(borrower), 10);

        // Liquidation: topics [sig, collateralAsset, debtAsset, user]; data [debtToCover, liqAmount, ...].
        bytes32[] memory topics = new bytes32[](4);
        topics[0] = AAVE_LIQUIDATION_SIG;
        topics[1] = bytes32(uint256(uint160(makeAddr("collateralAsset"))));
        topics[2] = bytes32(uint256(uint160(makeAddr("debtAsset"))));
        topics[3] = bytes32(uint256(uint160(borrower)));
        EvmV1Decoder.LogEntryTuple memory liqLog =
            _buildLog(aavePool, topics, abi.encode(uint256(50e6), uint256(1e18)));
        _submit(_buildEncodedTx(_singleLog(liqLog), 1), keccak256("tx-liq"), 101);

        // 10 - 50 floors at 0.
        assertEq(passport.scoreOf(borrower), 0);
        (,, uint32 negativeEvents,) = passport.passports(borrower);
        assertEq(negativeEvents, 1);
    }

    // =================================================================
    // Local reporters
    // =================================================================

    function test_recordLocalRepay_unregisteredReverts() public {
        vm.prank(reporter);
        vm.expectRevert("not a reporter");
        passport.recordLocalRepay(borrower, 100e6);
    }

    function test_recordLocalRepay_countsAsDistinctSource() public {
        passport.setLocalReporter(reporter, true);

        // One cross-chain repay + one local repay = 2 sources.
        _submit(_buildEncodedTx(_singleLog(_aaveRepayLog(borrower, 100e6)), 1), keccak256("tx-x"), 100);
        vm.prank(reporter);
        passport.recordLocalRepay(borrower, 500e6);

        assertEq(passport.scoreOf(borrower), 40); // 2*10 + 1*20 diversity
        (uint32 localCount,) = passport.sourceStats(borrower, passport.localSourceIdFor(reporter));
        assertEq(localCount, 1);
    }

    function test_recordLocalRepay_disabledReporterReverts() public {
        passport.setLocalReporter(reporter, true);
        passport.setLocalReporter(reporter, false);
        vm.prank(reporter);
        vm.expectRevert("not a reporter");
        passport.recordLocalRepay(borrower, 100e6);
    }

    // =================================================================
    // scoreOf formula
    // =================================================================

    function test_scoreOf_unknownBorrower_zero() public view {
        assertEq(passport.scoreOf(address(0x9999)), 0);
    }

    function test_scoreOf_agePoints_growAndCap() public {
        _submit(_buildEncodedTx(_singleLog(_aaveRepayLog(borrower, 100e6)), 1), keccak256("tx-age"), 100);
        assertEq(passport.scoreOf(borrower), 10); // age 0

        vm.warp(block.timestamp + 30 days);
        assertEq(passport.scoreOf(borrower), 15); // +5 for one 30-day period

        vm.warp(block.timestamp + 365 days);
        assertEq(passport.scoreOf(borrower), 40); // age capped at 6 periods (+30)
    }

    function test_scoreOf_threeSources_fullFormula() public {
        passport.setLocalReporter(reporter, true);
        _submit(_buildEncodedTx(_singleLog(_aaveRepayLog(borrower, 100e6)), 1), keccak256("tx-a"), 100);
        _submit(_buildEncodedTx(_singleLog(_morphoRepayLog(borrower, 5e18)), 1), keccak256("tx-m"), 101);
        vm.prank(reporter);
        passport.recordLocalRepay(borrower, 500e6);

        // base 3*10 + diversity (3-1)*20 + age 0 = 70
        assertEq(passport.scoreOf(borrower), 70);
    }
}
