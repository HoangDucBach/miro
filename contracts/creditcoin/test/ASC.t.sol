// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {StreamVerifierASC} from "../src/StreamVerifierASC.sol";
import {EmployerRegistry} from "../src/EmployerRegistry.sol";
import {EvmV1Decoder} from "../src/libs/EvmV1Decoder.sol";
import {INativeQueryVerifier} from "../src/libs/NativeQueryVerifier.sol";
import {ICreditPool} from "../src/interfaces/ICreditPool.sol";

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

/// @notice Records every ASC -> pool call so tests can assert routing without a real CreditPool.
contract MockCreditPool is ICreditPool {
    struct WithdrawnCall {
        address borrower;
        uint256 salary;
    }

    WithdrawnCall[] public withdrawnCalls;
    address[] public cancelledCalls;

    function onSalaryWithdrawn(address borrower, uint256 salary) external {
        withdrawnCalls.push(WithdrawnCall(borrower, salary));
    }

    function onStreamCancelled(address borrower) external {
        cancelledCalls.push(borrower);
    }

    function withdrawnCallCount() external view returns (uint256) {
        return withdrawnCalls.length;
    }

    function cancelledCallCount() external view returns (uint256) {
        return cancelledCalls.length;
    }
}

contract ASCTest is Test {
    StreamVerifierASC asc;
    EmployerRegistry registry;
    MockCreditPool pool;

    address owner = address(this);
    uint64 constant SEPOLIA_CHAIN_KEY = 1;
    address streamContract = makeAddr("streamContract");
    address otherContract = makeAddr("otherContract");
    address employer = makeAddr("employer");
    address borrower = makeAddr("borrower");

    address constant PRECOMPILE_ADDR = 0x0000000000000000000000000000000000000FD2;

    bytes32 constant SIG_CREATED =
        keccak256("SalaryStreamCreated(uint256,address,address,uint256,uint256,uint256,uint256)");
    bytes32 constant SIG_WITHDRAWN = keccak256("SalaryStreamWithdrawn(uint256,address,uint256)");
    bytes32 constant SIG_CANCELLED = keccak256("SalaryStreamCancelled(uint256,uint256,uint256)");

    function setUp() public {
        registry = new EmployerRegistry();
        pool = new MockCreditPool();
        asc = new StreamVerifierASC(address(registry), SEPOLIA_CHAIN_KEY, streamContract);
        asc.setPool(address(pool));

        vm.deal(employer, 200 ether);
        vm.prank(employer);
        registry.register{value: 100 ether}();

        MockNativeQueryVerifier mockImpl = new MockNativeQueryVerifier();
        vm.etch(PRECOMPILE_ADDR, address(mockImpl).code);
    }

    // =================================================================
    // Wiring / access control (no precompile involved)
    // =================================================================

    function test_constructor_wiring() public view {
        assertEq(asc.SOURCE_CHAIN_KEY(), SEPOLIA_CHAIN_KEY);
        assertEq(asc.SOURCE_STREAM_CONTRACT(), streamContract);
        assertEq(address(asc.registry()), address(registry));
    }

    function test_setPool_onlyOwner() public {
        StreamVerifierASC fresh = new StreamVerifierASC(address(registry), SEPOLIA_CHAIN_KEY, streamContract);
        vm.prank(address(0xdead));
        vm.expectRevert("not owner");
        fresh.setPool(address(0x1234));
    }

    function test_setPool_onlyOnce() public {
        vm.expectRevert("pool already set");
        asc.setPool(address(0x5678));
    }

    function test_remainingLocked_noStream_returnsZero() public view {
        assertEq(asc.remainingLocked(address(0x9999)), 0);
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

    function _createdLog(uint256 streamId, address employer_, address borrower_, uint256 deposit, uint256 rate)
        internal
        view
        returns (EvmV1Decoder.LogEntryTuple memory)
    {
        bytes32[] memory topics = new bytes32[](4);
        topics[0] = SIG_CREATED;
        topics[1] = bytes32(streamId);
        topics[2] = bytes32(uint256(uint160(employer_)));
        topics[3] = bytes32(uint256(uint160(borrower_)));
        bytes memory data = abi.encode(deposit, rate, block.timestamp, block.timestamp + 180 days);
        return _buildLog(streamContract, topics, data);
    }

    function _withdrawnLog(uint256 streamId, address borrower_, uint256 amount)
        internal
        view
        returns (EvmV1Decoder.LogEntryTuple memory)
    {
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = SIG_WITHDRAWN;
        topics[1] = bytes32(streamId);
        topics[2] = bytes32(uint256(uint160(borrower_)));
        return _buildLog(streamContract, topics, abi.encode(amount));
    }

    function _cancelledLog(uint256 streamId, uint256 senderRefund, uint256 recipientPayout)
        internal
        view
        returns (EvmV1Decoder.LogEntryTuple memory)
    {
        bytes32[] memory topics = new bytes32[](2);
        topics[0] = SIG_CANCELLED;
        topics[1] = bytes32(streamId);
        return _buildLog(streamContract, topics, abi.encode(senderRefund, recipientPayout));
    }

    /// @dev Type-0 (legacy) encoding: chunks = [commonTx, LegacyFields, receipt].
    function _buildEncodedTx(EvmV1Decoder.LogEntryTuple[] memory logs, uint8 receiptStatus)
        internal
        pure
        returns (bytes memory)
    {
        bytes memory chunk0 = abi.encode(uint64(0), uint64(21000), address(0x1), false, address(0x2), uint256(0), bytes(""));
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
        bytes memory chunk0 = abi.encode(uint64(0), uint64(21000), address(0x1), false, address(0x2), uint256(0), bytes(""));
        bytes memory chunk1 = abi.encode(uint128(0), uint256(0), bytes32(0), bytes32(0));
        bytes memory chunk2 = abi.encode(receiptStatus, uint64(21000), logs, bytes(""));

        bytes[] memory chunks = new bytes[](3);
        chunks[0] = chunk0;
        chunks[1] = chunk1;
        chunks[2] = chunk2;
        return abi.encode(txType, chunks);
    }

    function _singleLog(EvmV1Decoder.LogEntryTuple memory log) internal pure returns (EvmV1Decoder.LogEntryTuple[] memory) {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = log;
        return logs;
    }

    function _validMerkleProof(bytes32 root) internal pure returns (INativeQueryVerifier.MerkleProof memory) {
        INativeQueryVerifier.MerkleProofEntry[] memory siblings = new INativeQueryVerifier.MerkleProofEntry[](0);
        return INativeQueryVerifier.MerkleProof({root: root, siblings: siblings});
    }

    function _submit(bytes memory encodedTx, bytes32 root, uint64 blockHeight) internal returns (bool) {
        INativeQueryVerifier.MerkleProof memory proof = _validMerkleProof(root);
        return asc.processStreamEvent(
            SEPOLIA_CHAIN_KEY, blockHeight, encodedTx, proof.root, proof.siblings, bytes32(0), new bytes32[](0)
        );
    }

    // =================================================================
    // processStreamEvent — happy paths
    // =================================================================

    function test_processStreamEvent_created_registersStream() public {
        bytes memory tx_ = _buildEncodedTx(_singleLog(_createdLog(1, employer, borrower, 6000e6, 1e6)), 1);

        assertTrue(_submit(tx_, keccak256("tx-created-1"), 100));

        (address recEmployer, uint256 deposit,,,,, bool cancelled, bool exists) = asc.streamOf(borrower);
        assertTrue(exists);
        assertFalse(cancelled);
        assertEq(recEmployer, employer);
        assertEq(deposit, 6000e6);
    }

    function test_processStreamEvent_created_revertsIfEmployerNotVerified() public {
        address unverifiedEmployer = makeAddr("unverifiedEmployer");
        bytes memory tx_ =
            _buildEncodedTx(_singleLog(_createdLog(1, unverifiedEmployer, borrower, 6000e6, 1e6)), 1);

        vm.expectRevert("employer not verified");
        _submit(tx_, keccak256("tx-unverified"), 100);
    }

    function test_processStreamEvent_withdrawn_updatesRecordAndCallsPool() public {
        bytes memory createTx = _buildEncodedTx(_singleLog(_createdLog(1, employer, borrower, 6000e6, 1e6)), 1);
        _submit(createTx, keccak256("tx-created-2"), 100);

        bytes memory withdrawTx = _buildEncodedTx(_singleLog(_withdrawnLog(1, borrower, 1000e6)), 1);
        _submit(withdrawTx, keccak256("tx-withdrawn-1"), 101);

        (,,,,, uint256 withdrawn,,) = asc.streamOf(borrower);
        assertEq(withdrawn, 1000e6);
        assertEq(pool.withdrawnCallCount(), 1);
        (address calledBorrower, uint256 calledSalary) = pool.withdrawnCalls(0);
        assertEq(calledBorrower, borrower);
        assertEq(calledSalary, 1000e6);
    }

    function test_processStreamEvent_withdrawn_revertsForUnknownStream() public {
        bytes memory tx_ = _buildEncodedTx(_singleLog(_withdrawnLog(1, borrower, 1000e6)), 1);

        vm.expectRevert("unknown stream");
        _submit(tx_, keccak256("tx-unknown"), 100);
    }

    function test_processStreamEvent_multipleLogsInOneReceipt_bothRouted() public {
        // Created and Withdrawn for the same borrower in a single receipt — Created must be
        // routed first so Withdrawn's `rec.exists` check passes within the same call.
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](2);
        logs[0] = _createdLog(1, employer, borrower, 6000e6, 1e6);
        logs[1] = _withdrawnLog(1, borrower, 500e6);
        bytes memory tx_ = _buildEncodedTx(logs, 1);

        _submit(tx_, keccak256("tx-combo"), 100);

        (,,,,, uint256 withdrawn, bool cancelled, bool exists) = asc.streamOf(borrower);
        assertTrue(exists);
        assertFalse(cancelled);
        assertEq(withdrawn, 500e6);
        assertEq(pool.withdrawnCallCount(), 1);
    }

    // =================================================================
    // processStreamEvent — guards and reverts
    // =================================================================

    function test_processStreamEvent_wrongChain_reverts() public {
        bytes memory tx_ = _buildEncodedTx(_singleLog(_createdLog(1, employer, borrower, 6000e6, 1e6)), 1);
        INativeQueryVerifier.MerkleProof memory proof = _validMerkleProof(keccak256("tx-wrong-chain"));

        vm.expectRevert("wrong chain");
        asc.processStreamEvent(
            SEPOLIA_CHAIN_KEY + 1, 100, tx_, proof.root, proof.siblings, bytes32(0), new bytes32[](0)
        );
    }

    function test_processStreamEvent_poolNotSet_reverts() public {
        StreamVerifierASC fresh = new StreamVerifierASC(address(registry), SEPOLIA_CHAIN_KEY, streamContract);
        bytes memory tx_ = _buildEncodedTx(_singleLog(_createdLog(1, employer, borrower, 6000e6, 1e6)), 1);
        INativeQueryVerifier.MerkleProof memory proof = _validMerkleProof(keccak256("tx-no-pool"));

        vm.expectRevert("pool not set");
        fresh.processStreamEvent(
            SEPOLIA_CHAIN_KEY, 100, tx_, proof.root, proof.siblings, bytes32(0), new bytes32[](0)
        );
    }

    function test_processStreamEvent_invalidProof_reverts() public {
        bytes memory tx_ = _buildEncodedTx(_singleLog(_createdLog(1, employer, borrower, 6000e6, 1e6)), 1);
        // MockNativeQueryVerifier.INVALID_ROOT is the sentinel that makes the mock revert —
        // read before vm.expectRevert, which only watches the very next call.
        bytes32 invalidRoot = MockNativeQueryVerifier(PRECOMPILE_ADDR).INVALID_ROOT();

        vm.expectRevert("mock verifier: invalid proof");
        _submit(tx_, invalidRoot, 100);
    }

    function test_processStreamEvent_replayProtection_rejectsSecondSubmission() public {
        bytes memory tx_ = _buildEncodedTx(_singleLog(_createdLog(1, employer, borrower, 6000e6, 1e6)), 1);
        bytes32 root = keccak256("tx-replay");

        assertTrue(_submit(tx_, root, 100));

        vm.expectRevert("already processed");
        _submit(tx_, root, 100); // identical (chainKey, blockHeight, proof) => identical txKey
    }

    function test_processStreamEvent_sameRootDifferentBlockHeight_isNotReplay() public {
        // txKey depends on (chainKey, blockHeight, txIndex) — a different blockHeight with the
        // same proof root must be treated as a distinct event, not rejected as a replay.
        bytes memory tx1 = _buildEncodedTx(_singleLog(_createdLog(1, employer, borrower, 6000e6, 1e6)), 1);
        bytes memory tx2 = _buildEncodedTx(_singleLog(_withdrawnLog(1, borrower, 100e6)), 1);
        bytes32 root = keccak256("tx-shared-root");

        assertTrue(_submit(tx1, root, 100));
        assertTrue(_submit(tx2, root, 101)); // different blockHeight => different txKey
    }

    function test_processStreamEvent_failedSourceTx_reverts() public {
        bytes memory tx_ = _buildEncodedTx(_singleLog(_createdLog(1, employer, borrower, 6000e6, 1e6)), 0);

        vm.expectRevert("source tx failed");
        _submit(tx_, keccak256("tx-failed"), 100);
    }

    function test_processStreamEvent_badTxType_reverts() public {
        bytes memory tx_ =
            _buildEncodedTxWithType(5, _singleLog(_createdLog(1, employer, borrower, 6000e6, 1e6)), 1);

        vm.expectRevert("bad tx type");
        _submit(tx_, keccak256("tx-badtype"), 100);
    }

    function test_processStreamEvent_ignoresLogsFromOtherEmitters() public {
        bytes32[] memory topics = new bytes32[](4);
        topics[0] = SIG_CREATED;
        topics[1] = bytes32(uint256(1));
        topics[2] = bytes32(uint256(uint160(employer)));
        topics[3] = bytes32(uint256(uint160(borrower)));
        bytes memory data = abi.encode(uint256(6000e6), uint256(1e6), block.timestamp, block.timestamp + 180 days);
        EvmV1Decoder.LogEntryTuple memory foreignLog = _buildLog(otherContract, topics, data);

        bytes memory tx_ = _buildEncodedTx(_singleLog(foreignLog), 1);
        _submit(tx_, keccak256("tx-foreign"), 100);

        (,,,,,,, bool exists) = asc.streamOf(borrower);
        assertFalse(exists); // log from a non-SalaryStream contract must be ignored
    }

    function test_processStreamEvent_ignoresUnrelatedEventSignatures() public {
        bytes32[] memory topics = new bytes32[](1);
        topics[0] = keccak256("SomeUnrelatedEvent(uint256)");
        EvmV1Decoder.LogEntryTuple memory unrelatedLog = _buildLog(streamContract, topics, abi.encode(uint256(1)));

        bytes memory tx_ = _buildEncodedTx(_singleLog(unrelatedLog), 1);
        // Must not revert — unrecognized signatures are silently skipped.
        assertTrue(_submit(tx_, keccak256("tx-unrelated"), 100));
    }

    function test_processStreamEvent_cancelled_currentlyReverts_knownGap() public {
        // Documents the open TODO in _handleCancelled (SalaryStreamCancelled doesn't carry
        // the recipient address, so it can't yet be routed) — see StreamVerifierASC.sol.
        bytes memory tx_ = _buildEncodedTx(_singleLog(_cancelledLog(1, 1000e6, 5000e6)), 1);

        vm.expectRevert("cancel routing: TODO wire recipient lookup");
        _submit(tx_, keccak256("tx-cancelled"), 100);
    }

    // =================================================================
    // remainingLocked
    // =================================================================

    function test_remainingLocked_afterCreated_matchesUnvestedAmount() public {
        uint256 deposit = 6000e6;
        uint256 rate = 1e6; // 1 USDC/sec for a clean 6000-second stream in this test
        bytes memory tx_ = _buildEncodedTx(_singleLog(_createdLog(1, employer, borrower, deposit, rate)), 1);
        _submit(tx_, keccak256("tx-locked"), 100);

        assertEq(asc.remainingLocked(borrower), deposit); // nothing vested yet

        vm.warp(block.timestamp + 1000);
        assertEq(asc.remainingLocked(borrower), deposit - rate * 1000);
    }

    // NOTE: remainingLocked's `s.cancelled` branch has no test here — the only way to set
    // `cancelled = true` is via _handleCancelled, which currently reverts unconditionally
    // (see test_processStreamEvent_cancelled_currentlyReverts_knownGap). Storage-slot
    // manipulation was considered and rejected: StreamRecord packs `cancelled` and `exists`
    // into the same slot, making a hand-guessed slot index fragile and liable to silently
    // corrupt `exists` instead. Add this case once the cancel-routing TODO is resolved.
}
