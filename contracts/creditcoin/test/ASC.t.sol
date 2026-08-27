// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {StreamVerifierASC} from "../src/StreamVerifierASC.sol";
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

/// @notice Records every ASC to pool call so tests can assert routing without a real CreditPool.
contract MockCreditPool is ICreditPool {
    struct WithdrawnCall {
        address borrower;
        uint256 amount;
    }

    WithdrawnCall[] public withdrawnCalls;

    function onTokenWithdrawn(address borrower, uint256 amount) external {
        withdrawnCalls.push(WithdrawnCall(borrower, amount));
    }

    function withdrawnCallCount() external view returns (uint256) {
        return withdrawnCalls.length;
    }
}

contract ASCTest is Test {
    StreamVerifierASC asc;
    MockCreditPool pool;

    uint64 constant SEPOLIA_CHAIN_KEY = 1;
    address sablierLockup = makeAddr("sablierLockup");
    address otherContract = makeAddr("otherContract");
    address borrower = makeAddr("borrower");
    address demoToken = makeAddr("demoToken");

    address constant PRECOMPILE_ADDR = 0x0000000000000000000000000000000000000FD2;

    bytes32 constant SIG_CREATED = keccak256(
        "CreateLockupLinearStream(uint256,(address,address,address,uint128,address,bool,bool,(uint40,uint40),string),uint40,uint40,(uint128,uint128))"
    );
    bytes32 constant SIG_WITHDRAWN = keccak256("WithdrawFromLockupStream(uint256,address,address,uint128)");
    bytes32 constant SIG_CANCELLED = keccak256("CancelLockupStream(uint256,address,address,address,uint128,uint128)");

    function setUp() public {
        pool = new MockCreditPool();
        asc = new StreamVerifierASC(SEPOLIA_CHAIN_KEY, sablierLockup);
        asc.setPool(address(pool));

        MockNativeQueryVerifier mockImpl = new MockNativeQueryVerifier();
        vm.etch(PRECOMPILE_ADDR, address(mockImpl).code);
    }

    // =================================================================
    // Wiring / access control (no precompile involved)
    // =================================================================

    function test_constructor_wiring() public view {
        assertEq(asc.SOURCE_CHAIN_KEY(), SEPOLIA_CHAIN_KEY);
        assertEq(asc.SOURCE_SABLIER_LOCKUP(), sablierLockup);
    }

    function test_setPool_onlyOwner() public {
        StreamVerifierASC fresh = new StreamVerifierASC(SEPOLIA_CHAIN_KEY, sablierLockup);
        vm.prank(address(0xdead));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(0xdead)));
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

    /// @dev Mirrors Sablier's real CreateLockupLinearStream event: only streamId is
    ///      indexed, everything else (commonParams, cliffTime, granularity, unlockAmounts)
    ///      is ABI-encoded together as the event's non-indexed data.
    function _createdLog(
        uint256 streamId,
        address recipient_,
        address token_,
        uint128 depositAmount,
        uint40 startTime,
        uint40 endTime,
        bool cancelable_,
        bool transferable_
    ) internal view returns (EvmV1Decoder.LogEntryTuple memory) {
        bytes32[] memory topics = new bytes32[](2);
        topics[0] = SIG_CREATED;
        topics[1] = bytes32(streamId);

        StreamVerifierASC.SablierCreateEventCommon memory common = StreamVerifierASC.SablierCreateEventCommon({
            funder: address(0xF1),
            sender: address(0xF2),
            recipient: recipient_,
            depositAmount: depositAmount,
            token: token_,
            cancelable: cancelable_,
            transferable: transferable_,
            timestamps: StreamVerifierASC.SablierTimestamps({start: startTime, end: endTime}),
            shape: "LINEAR"
        });
        StreamVerifierASC.SablierUnlockAmounts memory unlockAmounts =
            StreamVerifierASC.SablierUnlockAmounts({start: 0, cliff: 0});

        bytes memory data = abi.encode(common, uint40(0), uint40(0), unlockAmounts);
        return _buildLog(sablierLockup, topics, data);
    }

    /// @dev Mirrors Sablier's real WithdrawFromLockupStream event: streamId, to and token
    ///      are all indexed; only amount is non-indexed data.
    function _withdrawnLog(uint256 streamId, address to_, address token_, uint128 amount)
        internal
        view
        returns (EvmV1Decoder.LogEntryTuple memory)
    {
        bytes32[] memory topics = new bytes32[](4);
        topics[0] = SIG_WITHDRAWN;
        topics[1] = bytes32(streamId);
        topics[2] = bytes32(uint256(uint160(to_)));
        topics[3] = bytes32(uint256(uint160(token_)));
        return _buildLog(sablierLockup, topics, abi.encode(amount));
    }

    function _cancelledLog(uint256 streamId, address sender_, address recipient_, address token_)
        internal
        view
        returns (EvmV1Decoder.LogEntryTuple memory)
    {
        bytes32[] memory topics = new bytes32[](4);
        topics[0] = SIG_CANCELLED;
        topics[1] = bytes32(uint256(uint160(sender_)));
        topics[2] = bytes32(uint256(uint160(recipient_)));
        topics[3] = bytes32(uint256(uint160(token_)));
        return _buildLog(sablierLockup, topics, abi.encode(streamId, uint128(0), uint128(0)));
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

    function _defaultCreatedLog(uint256 streamId, address recipient_, uint128 depositAmount)
        internal
        view
        returns (EvmV1Decoder.LogEntryTuple memory)
    {
        return _createdLog(
            streamId,
            recipient_,
            demoToken,
            depositAmount,
            uint40(block.timestamp),
            uint40(block.timestamp + 180 days),
            false,
            false
        );
    }

    // =================================================================
    // processStreamEvent happy paths
    // =================================================================

    function test_processStreamEvent_created_registersStream() public {
        bytes memory tx_ = _buildEncodedTx(_singleLog(_defaultCreatedLog(1, borrower, 6000e18)), 1);

        assertTrue(_submit(tx_, keccak256("tx-created-1"), 100));

        (address recBorrower, address token, uint128 depositAmount,,, bool exists) = asc.streamById(1);
        assertTrue(exists);
        assertEq(recBorrower, borrower);
        assertEq(token, demoToken);
        assertEq(depositAmount, 6000e18);
        assertEq(asc.streamIdOf(borrower), 1);
    }

    function test_processStreamEvent_created_revertsIfCancelable() public {
        bytes memory tx_ = _buildEncodedTx(
            _singleLog(
                _createdLog(
                    1, borrower, demoToken, 6000e18, uint40(block.timestamp), uint40(block.timestamp + 180 days), true, false
                )
            ),
            1
        );

        vm.expectRevert("stream is cancelable");
        _submit(tx_, keccak256("tx-cancelable"), 100);
    }

    function test_processStreamEvent_created_revertsIfTransferable() public {
        bytes memory tx_ = _buildEncodedTx(
            _singleLog(
                _createdLog(
                    1, borrower, demoToken, 6000e18, uint40(block.timestamp), uint40(block.timestamp + 180 days), false, true
                )
            ),
            1
        );

        vm.expectRevert("stream is transferable");
        _submit(tx_, keccak256("tx-transferable"), 100);
    }

    function test_processStreamEvent_withdrawn_callsPool() public {
        bytes memory createTx = _buildEncodedTx(_singleLog(_defaultCreatedLog(1, borrower, 6000e18)), 1);
        _submit(createTx, keccak256("tx-created-2"), 100);

        bytes memory withdrawTx = _buildEncodedTx(_singleLog(_withdrawnLog(1, borrower, demoToken, 1000e18)), 1);
        _submit(withdrawTx, keccak256("tx-withdrawn-1"), 101);

        assertEq(pool.withdrawnCallCount(), 1);
        (address calledBorrower, uint256 calledAmount) = pool.withdrawnCalls(0);
        assertEq(calledBorrower, borrower);
        assertEq(calledAmount, 1000e18);
    }

    function test_processStreamEvent_withdrawn_routesByStreamIdNotWithdrawalDestination() public {
        // `to` (the withdrawal destination) can differ from the borrower identity, which
        // is looked up by streamId instead. Non-transferable streams guarantee the
        // recipient recorded at creation never changes, so this routing stays correct.
        address someOtherWallet = makeAddr("someOtherWallet");
        bytes memory createTx = _buildEncodedTx(_singleLog(_defaultCreatedLog(1, borrower, 6000e18)), 1);
        _submit(createTx, keccak256("tx-created-route"), 100);

        bytes memory withdrawTx = _buildEncodedTx(_singleLog(_withdrawnLog(1, someOtherWallet, demoToken, 500e18)), 1);
        _submit(withdrawTx, keccak256("tx-withdrawn-route"), 101);

        (address calledBorrower,) = pool.withdrawnCalls(0);
        assertEq(calledBorrower, borrower); // not someOtherWallet
    }

    function test_processStreamEvent_withdrawn_revertsForUnknownStream() public {
        bytes memory tx_ = _buildEncodedTx(_singleLog(_withdrawnLog(1, borrower, demoToken, 1000e18)), 1);

        vm.expectRevert("unknown stream");
        _submit(tx_, keccak256("tx-unknown"), 100);
    }

    function test_processStreamEvent_multipleLogsInOneReceipt_bothRouted() public {
        // Created and Withdrawn for the same borrower in one receipt. Created has to be
        // routed first so Withdrawn's rec.exists check passes in the same call.
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](2);
        logs[0] = _defaultCreatedLog(1, borrower, 6000e18);
        logs[1] = _withdrawnLog(1, borrower, demoToken, 500e18);
        bytes memory tx_ = _buildEncodedTx(logs, 1);

        _submit(tx_, keccak256("tx-combo"), 100);

        (,,,,, bool exists) = asc.streamById(1);
        assertTrue(exists);
        assertEq(pool.withdrawnCallCount(), 1);
    }

    // =================================================================
    // processStreamEvent guards and reverts
    // =================================================================

    function test_processStreamEvent_wrongChain_reverts() public {
        bytes memory tx_ = _buildEncodedTx(_singleLog(_defaultCreatedLog(1, borrower, 6000e18)), 1);
        INativeQueryVerifier.MerkleProof memory proof = _validMerkleProof(keccak256("tx-wrong-chain"));

        vm.expectRevert("wrong chain");
        asc.processStreamEvent(
            SEPOLIA_CHAIN_KEY + 1, 100, tx_, proof.root, proof.siblings, bytes32(0), new bytes32[](0)
        );
    }

    function test_processStreamEvent_poolNotSet_reverts() public {
        StreamVerifierASC fresh = new StreamVerifierASC(SEPOLIA_CHAIN_KEY, sablierLockup);
        bytes memory tx_ = _buildEncodedTx(_singleLog(_defaultCreatedLog(1, borrower, 6000e18)), 1);
        INativeQueryVerifier.MerkleProof memory proof = _validMerkleProof(keccak256("tx-no-pool"));

        vm.expectRevert("pool not set");
        fresh.processStreamEvent(
            SEPOLIA_CHAIN_KEY, 100, tx_, proof.root, proof.siblings, bytes32(0), new bytes32[](0)
        );
    }

    function test_processStreamEvent_invalidProof_reverts() public {
        bytes memory tx_ = _buildEncodedTx(_singleLog(_defaultCreatedLog(1, borrower, 6000e18)), 1);
        // INVALID_ROOT makes the mock revert. Read it before vm.expectRevert, which only
        // watches the very next call.
        bytes32 invalidRoot = MockNativeQueryVerifier(PRECOMPILE_ADDR).INVALID_ROOT();

        vm.expectRevert("mock verifier: invalid proof");
        _submit(tx_, invalidRoot, 100);
    }

    function test_processStreamEvent_replayProtection_rejectsSecondSubmission() public {
        bytes memory tx_ = _buildEncodedTx(_singleLog(_defaultCreatedLog(1, borrower, 6000e18)), 1);
        bytes32 root = keccak256("tx-replay");

        assertTrue(_submit(tx_, root, 100));

        vm.expectRevert("already processed");
        _submit(tx_, root, 100); // identical (chainKey, blockHeight, proof) => identical txKey
    }

    function test_processStreamEvent_sameRootDifferentBlockHeight_isNotReplay() public {
        // txKey depends on chainKey, blockHeight and txIndex, so a different blockHeight
        // with the same proof root is a distinct event, not a replay.
        bytes memory tx1 = _buildEncodedTx(_singleLog(_defaultCreatedLog(1, borrower, 6000e18)), 1);
        bytes memory tx2 = _buildEncodedTx(_singleLog(_withdrawnLog(1, borrower, demoToken, 100e18)), 1);
        bytes32 root = keccak256("tx-shared-root");

        assertTrue(_submit(tx1, root, 100));
        assertTrue(_submit(tx2, root, 101)); // different blockHeight => different txKey
    }

    function test_processStreamEvent_failedSourceTx_reverts() public {
        bytes memory tx_ = _buildEncodedTx(_singleLog(_defaultCreatedLog(1, borrower, 6000e18)), 0);

        vm.expectRevert("source tx failed");
        _submit(tx_, keccak256("tx-failed"), 100);
    }

    function test_processStreamEvent_badTxType_reverts() public {
        bytes memory tx_ = _buildEncodedTxWithType(5, _singleLog(_defaultCreatedLog(1, borrower, 6000e18)), 1);

        vm.expectRevert("bad tx type");
        _submit(tx_, keccak256("tx-badtype"), 100);
    }

    function test_processStreamEvent_ignoresLogsFromOtherEmitters() public {
        EvmV1Decoder.LogEntryTuple memory foreignLog = _defaultCreatedLog(1, borrower, 6000e18);
        foreignLog.address_ = otherContract;

        bytes memory tx_ = _buildEncodedTx(_singleLog(foreignLog), 1);
        _submit(tx_, keccak256("tx-foreign"), 100);

        (,,,,, bool exists) = asc.streamById(1);
        assertFalse(exists); // log from a non-SablierLockup contract must be ignored
    }

    function test_processStreamEvent_ignoresUnrelatedEventSignatures() public {
        bytes32[] memory topics = new bytes32[](1);
        topics[0] = keccak256("SomeUnrelatedEvent(uint256)");
        EvmV1Decoder.LogEntryTuple memory unrelatedLog = _buildLog(sablierLockup, topics, abi.encode(uint256(1)));

        bytes memory tx_ = _buildEncodedTx(_singleLog(unrelatedLog), 1);
        // Must not revert, unrecognized signatures are just skipped.
        assertTrue(_submit(tx_, keccak256("tx-unrelated"), 100));
    }

    function test_processStreamEvent_cancelSignature_neverRoutedNotEvenAttempted() public {
        // Unlike the salary-stream design, cancel routing isn't just unimplemented -- it's
        // structurally unreachable, because only non-cancelable streams are ever accepted
        // as collateral in the first place. A CancelLockupStream-signature log is simply
        // skipped, same as any other unrecognized signature; it must not revert.
        bytes memory tx_ = _buildEncodedTx(_singleLog(_cancelledLog(1, address(0xF2), borrower, demoToken)), 1);
        assertTrue(_submit(tx_, keccak256("tx-cancelled"), 100));
    }

    // =================================================================
    // remainingLocked / collateralToken
    // =================================================================

    function test_remainingLocked_afterCreated_matchesUnvestedAmount() public {
        uint128 deposit = 6000e18;
        uint40 start = uint40(block.timestamp);
        uint40 end = uint40(block.timestamp + 6000);
        bytes memory tx_ = _buildEncodedTx(
            _singleLog(_createdLog(1, borrower, demoToken, deposit, start, end, false, false)), 1
        );
        _submit(tx_, keccak256("tx-locked"), 100);

        assertEq(asc.remainingLocked(borrower), deposit); // nothing vested yet

        vm.warp(block.timestamp + 1000);
        assertEq(asc.remainingLocked(borrower), deposit - uint256(deposit) * 1000 / 6000);
    }

    function test_remainingLocked_pastEndTime_returnsZero() public {
        uint128 deposit = 6000e18;
        uint40 start = uint40(block.timestamp);
        uint40 end = uint40(block.timestamp + 6000);
        bytes memory tx_ = _buildEncodedTx(
            _singleLog(_createdLog(1, borrower, demoToken, deposit, start, end, false, false)), 1
        );
        _submit(tx_, keccak256("tx-fullyvested"), 100);

        vm.warp(end + 1 days);
        assertEq(asc.remainingLocked(borrower), 0);
    }

    function test_collateralToken_returnsStreamToken() public {
        bytes memory tx_ = _buildEncodedTx(_singleLog(_defaultCreatedLog(1, borrower, 6000e18)), 1);
        _submit(tx_, keccak256("tx-token"), 100);

        assertEq(asc.collateralToken(borrower), demoToken);
    }

    function test_collateralToken_noStream_returnsZeroAddress() public view {
        assertEq(asc.collateralToken(address(0x9999)), address(0));
    }
}
