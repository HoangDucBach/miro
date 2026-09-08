import {
  createUseReadContract,
  createUseWriteContract,
  createUseSimulateContract,
  createUseWatchContractEvent,
} from 'wagmi/codegen'

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// CreditPassport
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const creditPassportAbi = [
  {
    type: 'function',
    inputs: [
      { name: 'reporter', type: 'address' },
      { name: 'enabled', type: 'bool' },
    ],
    name: 'setLocalReporter',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ type: 'address' }],
    name: 'localReporters',
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'chainKey', type: 'uint64' },
      { name: 'emitter', type: 'address' },
      { name: 'topic0', type: 'bytes32' },
    ],
    name: 'sourceIdFor',
    outputs: [{ type: 'bytes32' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [{ name: 'reporter', type: 'address' }],
    name: 'localSourceIdFor',
    outputs: [{ type: 'bytes32' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      { name: 'borrower', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'recordLocalRepay',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'borrower', type: 'address' }],
    name: 'scoreOf',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'PER_SOURCE_CAP',
    outputs: [{ type: 'uint32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'REPAY_POINTS',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'DIVERSITY_POINTS',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'AGE_PERIOD',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'AGE_POINTS_PER_PERIOD',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'AGE_CAP_PERIODS',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'NEGATIVE_PENALTY',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ type: 'address' }],
    name: 'passports',
    outputs: [
      { name: 'firstSeenAt', type: 'uint40' },
      { name: 'cappedRepays', type: 'uint32' },
      { name: 'negativeEvents', type: 'uint32' },
      { name: 'sourceCount', type: 'uint16' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ type: 'address' }, { type: 'bytes32' }],
    name: 'sourceStats',
    outputs: [
      { name: 'count', type: 'uint32' },
      { name: 'lastAt', type: 'uint40' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ type: 'bytes32' }],
    name: 'sources',
    outputs: [
      { name: 'chainKey', type: 'uint64' },
      { name: 'emitter', type: 'address' },
      { name: 'topic0', type: 'bytes32' },
      { name: 'borrowerLoc', type: 'uint8' },
      { name: 'borrowerDataWord', type: 'uint8' },
      { name: 'amountDataWord', type: 'uint8' },
      { name: 'minAmount', type: 'uint256' },
      { name: 'negative', type: 'bool' },
      { name: 'enabled', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    inputs: [
      { name: 'sourceId', type: 'bytes32', indexed: true },
      { name: 'chainKey', type: 'uint64' },
      { name: 'emitter', type: 'address' },
      { name: 'topic0', type: 'bytes32' },
      { name: 'enabled', type: 'bool' },
    ],
    name: 'SourceSet',
  },
  {
    type: 'event',
    inputs: [
      { name: 'reporter', type: 'address', indexed: true },
      { name: 'enabled', type: 'bool' },
    ],
    name: 'LocalReporterSet',
  },
  {
    type: 'event',
    inputs: [
      { name: 'borrower', type: 'address', indexed: true },
      { name: 'sourceId', type: 'bytes32', indexed: true },
      { name: 'sourceCountForBorrower', type: 'uint32' },
    ],
    name: 'RepayRecorded',
  },
  {
    type: 'event',
    inputs: [
      { name: 'borrower', type: 'address', indexed: true },
      { name: 'sourceId', type: 'bytes32', indexed: true },
    ],
    name: 'NegativeEventRecorded',
  },
  {
    type: 'event',
    inputs: [
      { name: 'txKey', type: 'bytes32', indexed: true },
      { name: 'sourceId', type: 'bytes32', indexed: true },
      { name: 'borrower', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'AttestationProcessed',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PassportPool
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const passportPoolAbi = [
  {
    type: 'function',
    inputs: [],
    name: 'depositCollateral',
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [{ name: 'amount', type: 'uint256' }],
    name: 'withdrawCollateral',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'borrower', type: 'address' }],
    name: 'maxLtvBps',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'borrower', type: 'address' }],
    name: 'collateralValue',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'borrower', type: 'address' }],
    name: 'creditLimit',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'amount', type: 'uint256' }],
    name: 'borrow',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'amount', type: 'uint256' }],
    name: 'repay',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'amount', type: 'uint256' }],
    name: 'deposit',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'amount', type: 'uint256' }],
    name: 'withdrawLP',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ type: 'address' }],
    name: 'collateralOf',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ type: 'address' }],
    name: 'debt',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ type: 'address' }],
    name: 'principalSinceLastReport',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ type: 'address' }],
    name: 'lpDeposits',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'totalLPDeposits',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    inputs: [
      { name: 'borrower', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'CollateralDeposited',
  },
  {
    type: 'event',
    inputs: [
      { name: 'borrower', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'CollateralWithdrawn',
  },
  {
    type: 'event',
    inputs: [
      { name: 'borrower', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256' },
      { name: 'newDebt', type: 'uint256' },
    ],
    name: 'Borrowed',
  },
  {
    type: 'event',
    inputs: [
      { name: 'borrower', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256' },
      { name: 'remainingDebt', type: 'uint256' },
    ],
    name: 'Repaid',
  },
  {
    type: 'event',
    inputs: [
      { name: 'borrower', type: 'address', indexed: true },
      { name: 'principal', type: 'uint256' },
    ],
    name: 'FullRepayReported',
  },
  {
    type: 'event',
    inputs: [
      { name: 'lp', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'Deposited',
  },
  {
    type: 'event',
    inputs: [
      { name: 'lp', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'WithdrawnLP',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PriceOracle
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const priceOracleAbi = [
  {
    type: 'function',
    inputs: [],
    name: 'price',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'decimals',
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'newPrice', type: 'uint256' }],
    name: 'setPrice',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    inputs: [{ name: 'price', type: 'uint256' }],
    name: 'PriceUpdated',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// TestUsdc
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const testUsdcAbi = [
  {
    type: 'function',
    inputs: [{ type: 'address' }],
    name: 'balanceOf',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'faucet',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'FAUCET_AMOUNT',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'FAUCET_COOLDOWN',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ type: 'address' }],
    name: 'lastFaucetClaim',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'decimals',
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// React
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link creditPassportAbi}__
 */
export const useReadCreditPassport = /*#__PURE__*/ createUseReadContract({
  abi: creditPassportAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link creditPassportAbi}__ and `functionName` set to `"localReporters"`
 */
export const useReadCreditPassportLocalReporters =
  /*#__PURE__*/ createUseReadContract({
    abi: creditPassportAbi,
    functionName: 'localReporters',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link creditPassportAbi}__ and `functionName` set to `"sourceIdFor"`
 */
export const useReadCreditPassportSourceIdFor =
  /*#__PURE__*/ createUseReadContract({
    abi: creditPassportAbi,
    functionName: 'sourceIdFor',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link creditPassportAbi}__ and `functionName` set to `"localSourceIdFor"`
 */
export const useReadCreditPassportLocalSourceIdFor =
  /*#__PURE__*/ createUseReadContract({
    abi: creditPassportAbi,
    functionName: 'localSourceIdFor',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link creditPassportAbi}__ and `functionName` set to `"scoreOf"`
 */
export const useReadCreditPassportScoreOf = /*#__PURE__*/ createUseReadContract(
  { abi: creditPassportAbi, functionName: 'scoreOf' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link creditPassportAbi}__ and `functionName` set to `"PER_SOURCE_CAP"`
 */
export const useReadCreditPassportPerSourceCap =
  /*#__PURE__*/ createUseReadContract({
    abi: creditPassportAbi,
    functionName: 'PER_SOURCE_CAP',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link creditPassportAbi}__ and `functionName` set to `"REPAY_POINTS"`
 */
export const useReadCreditPassportRepayPoints =
  /*#__PURE__*/ createUseReadContract({
    abi: creditPassportAbi,
    functionName: 'REPAY_POINTS',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link creditPassportAbi}__ and `functionName` set to `"DIVERSITY_POINTS"`
 */
export const useReadCreditPassportDiversityPoints =
  /*#__PURE__*/ createUseReadContract({
    abi: creditPassportAbi,
    functionName: 'DIVERSITY_POINTS',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link creditPassportAbi}__ and `functionName` set to `"AGE_PERIOD"`
 */
export const useReadCreditPassportAgePeriod =
  /*#__PURE__*/ createUseReadContract({
    abi: creditPassportAbi,
    functionName: 'AGE_PERIOD',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link creditPassportAbi}__ and `functionName` set to `"AGE_POINTS_PER_PERIOD"`
 */
export const useReadCreditPassportAgePointsPerPeriod =
  /*#__PURE__*/ createUseReadContract({
    abi: creditPassportAbi,
    functionName: 'AGE_POINTS_PER_PERIOD',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link creditPassportAbi}__ and `functionName` set to `"AGE_CAP_PERIODS"`
 */
export const useReadCreditPassportAgeCapPeriods =
  /*#__PURE__*/ createUseReadContract({
    abi: creditPassportAbi,
    functionName: 'AGE_CAP_PERIODS',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link creditPassportAbi}__ and `functionName` set to `"NEGATIVE_PENALTY"`
 */
export const useReadCreditPassportNegativePenalty =
  /*#__PURE__*/ createUseReadContract({
    abi: creditPassportAbi,
    functionName: 'NEGATIVE_PENALTY',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link creditPassportAbi}__ and `functionName` set to `"passports"`
 */
export const useReadCreditPassportPassports =
  /*#__PURE__*/ createUseReadContract({
    abi: creditPassportAbi,
    functionName: 'passports',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link creditPassportAbi}__ and `functionName` set to `"sourceStats"`
 */
export const useReadCreditPassportSourceStats =
  /*#__PURE__*/ createUseReadContract({
    abi: creditPassportAbi,
    functionName: 'sourceStats',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link creditPassportAbi}__ and `functionName` set to `"sources"`
 */
export const useReadCreditPassportSources = /*#__PURE__*/ createUseReadContract(
  { abi: creditPassportAbi, functionName: 'sources' },
)

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link creditPassportAbi}__
 */
export const useWriteCreditPassport = /*#__PURE__*/ createUseWriteContract({
  abi: creditPassportAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link creditPassportAbi}__ and `functionName` set to `"setLocalReporter"`
 */
export const useWriteCreditPassportSetLocalReporter =
  /*#__PURE__*/ createUseWriteContract({
    abi: creditPassportAbi,
    functionName: 'setLocalReporter',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link creditPassportAbi}__ and `functionName` set to `"recordLocalRepay"`
 */
export const useWriteCreditPassportRecordLocalRepay =
  /*#__PURE__*/ createUseWriteContract({
    abi: creditPassportAbi,
    functionName: 'recordLocalRepay',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link creditPassportAbi}__
 */
export const useSimulateCreditPassport =
  /*#__PURE__*/ createUseSimulateContract({ abi: creditPassportAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link creditPassportAbi}__ and `functionName` set to `"setLocalReporter"`
 */
export const useSimulateCreditPassportSetLocalReporter =
  /*#__PURE__*/ createUseSimulateContract({
    abi: creditPassportAbi,
    functionName: 'setLocalReporter',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link creditPassportAbi}__ and `functionName` set to `"recordLocalRepay"`
 */
export const useSimulateCreditPassportRecordLocalRepay =
  /*#__PURE__*/ createUseSimulateContract({
    abi: creditPassportAbi,
    functionName: 'recordLocalRepay',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link creditPassportAbi}__
 */
export const useWatchCreditPassportEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: creditPassportAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link creditPassportAbi}__ and `eventName` set to `"SourceSet"`
 */
export const useWatchCreditPassportSourceSetEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: creditPassportAbi,
    eventName: 'SourceSet',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link creditPassportAbi}__ and `eventName` set to `"LocalReporterSet"`
 */
export const useWatchCreditPassportLocalReporterSetEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: creditPassportAbi,
    eventName: 'LocalReporterSet',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link creditPassportAbi}__ and `eventName` set to `"RepayRecorded"`
 */
export const useWatchCreditPassportRepayRecordedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: creditPassportAbi,
    eventName: 'RepayRecorded',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link creditPassportAbi}__ and `eventName` set to `"NegativeEventRecorded"`
 */
export const useWatchCreditPassportNegativeEventRecordedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: creditPassportAbi,
    eventName: 'NegativeEventRecorded',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link creditPassportAbi}__ and `eventName` set to `"AttestationProcessed"`
 */
export const useWatchCreditPassportAttestationProcessedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: creditPassportAbi,
    eventName: 'AttestationProcessed',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link passportPoolAbi}__
 */
export const useReadPassportPool = /*#__PURE__*/ createUseReadContract({
  abi: passportPoolAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link passportPoolAbi}__ and `functionName` set to `"maxLtvBps"`
 */
export const useReadPassportPoolMaxLtvBps = /*#__PURE__*/ createUseReadContract(
  { abi: passportPoolAbi, functionName: 'maxLtvBps' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link passportPoolAbi}__ and `functionName` set to `"collateralValue"`
 */
export const useReadPassportPoolCollateralValue =
  /*#__PURE__*/ createUseReadContract({
    abi: passportPoolAbi,
    functionName: 'collateralValue',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link passportPoolAbi}__ and `functionName` set to `"creditLimit"`
 */
export const useReadPassportPoolCreditLimit =
  /*#__PURE__*/ createUseReadContract({
    abi: passportPoolAbi,
    functionName: 'creditLimit',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link passportPoolAbi}__ and `functionName` set to `"collateralOf"`
 */
export const useReadPassportPoolCollateralOf =
  /*#__PURE__*/ createUseReadContract({
    abi: passportPoolAbi,
    functionName: 'collateralOf',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link passportPoolAbi}__ and `functionName` set to `"debt"`
 */
export const useReadPassportPoolDebt = /*#__PURE__*/ createUseReadContract({
  abi: passportPoolAbi,
  functionName: 'debt',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link passportPoolAbi}__ and `functionName` set to `"principalSinceLastReport"`
 */
export const useReadPassportPoolPrincipalSinceLastReport =
  /*#__PURE__*/ createUseReadContract({
    abi: passportPoolAbi,
    functionName: 'principalSinceLastReport',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link passportPoolAbi}__ and `functionName` set to `"lpDeposits"`
 */
export const useReadPassportPoolLpDeposits =
  /*#__PURE__*/ createUseReadContract({
    abi: passportPoolAbi,
    functionName: 'lpDeposits',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link passportPoolAbi}__ and `functionName` set to `"totalLPDeposits"`
 */
export const useReadPassportPoolTotalLpDeposits =
  /*#__PURE__*/ createUseReadContract({
    abi: passportPoolAbi,
    functionName: 'totalLPDeposits',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link passportPoolAbi}__
 */
export const useWritePassportPool = /*#__PURE__*/ createUseWriteContract({
  abi: passportPoolAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link passportPoolAbi}__ and `functionName` set to `"depositCollateral"`
 */
export const useWritePassportPoolDepositCollateral =
  /*#__PURE__*/ createUseWriteContract({
    abi: passportPoolAbi,
    functionName: 'depositCollateral',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link passportPoolAbi}__ and `functionName` set to `"withdrawCollateral"`
 */
export const useWritePassportPoolWithdrawCollateral =
  /*#__PURE__*/ createUseWriteContract({
    abi: passportPoolAbi,
    functionName: 'withdrawCollateral',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link passportPoolAbi}__ and `functionName` set to `"borrow"`
 */
export const useWritePassportPoolBorrow = /*#__PURE__*/ createUseWriteContract({
  abi: passportPoolAbi,
  functionName: 'borrow',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link passportPoolAbi}__ and `functionName` set to `"repay"`
 */
export const useWritePassportPoolRepay = /*#__PURE__*/ createUseWriteContract({
  abi: passportPoolAbi,
  functionName: 'repay',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link passportPoolAbi}__ and `functionName` set to `"deposit"`
 */
export const useWritePassportPoolDeposit = /*#__PURE__*/ createUseWriteContract(
  { abi: passportPoolAbi, functionName: 'deposit' },
)

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link passportPoolAbi}__ and `functionName` set to `"withdrawLP"`
 */
export const useWritePassportPoolWithdrawLp =
  /*#__PURE__*/ createUseWriteContract({
    abi: passportPoolAbi,
    functionName: 'withdrawLP',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link passportPoolAbi}__
 */
export const useSimulatePassportPool = /*#__PURE__*/ createUseSimulateContract({
  abi: passportPoolAbi,
})

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link passportPoolAbi}__ and `functionName` set to `"depositCollateral"`
 */
export const useSimulatePassportPoolDepositCollateral =
  /*#__PURE__*/ createUseSimulateContract({
    abi: passportPoolAbi,
    functionName: 'depositCollateral',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link passportPoolAbi}__ and `functionName` set to `"withdrawCollateral"`
 */
export const useSimulatePassportPoolWithdrawCollateral =
  /*#__PURE__*/ createUseSimulateContract({
    abi: passportPoolAbi,
    functionName: 'withdrawCollateral',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link passportPoolAbi}__ and `functionName` set to `"borrow"`
 */
export const useSimulatePassportPoolBorrow =
  /*#__PURE__*/ createUseSimulateContract({
    abi: passportPoolAbi,
    functionName: 'borrow',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link passportPoolAbi}__ and `functionName` set to `"repay"`
 */
export const useSimulatePassportPoolRepay =
  /*#__PURE__*/ createUseSimulateContract({
    abi: passportPoolAbi,
    functionName: 'repay',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link passportPoolAbi}__ and `functionName` set to `"deposit"`
 */
export const useSimulatePassportPoolDeposit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: passportPoolAbi,
    functionName: 'deposit',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link passportPoolAbi}__ and `functionName` set to `"withdrawLP"`
 */
export const useSimulatePassportPoolWithdrawLp =
  /*#__PURE__*/ createUseSimulateContract({
    abi: passportPoolAbi,
    functionName: 'withdrawLP',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link passportPoolAbi}__
 */
export const useWatchPassportPoolEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: passportPoolAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link passportPoolAbi}__ and `eventName` set to `"CollateralDeposited"`
 */
export const useWatchPassportPoolCollateralDepositedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: passportPoolAbi,
    eventName: 'CollateralDeposited',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link passportPoolAbi}__ and `eventName` set to `"CollateralWithdrawn"`
 */
export const useWatchPassportPoolCollateralWithdrawnEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: passportPoolAbi,
    eventName: 'CollateralWithdrawn',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link passportPoolAbi}__ and `eventName` set to `"Borrowed"`
 */
export const useWatchPassportPoolBorrowedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: passportPoolAbi,
    eventName: 'Borrowed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link passportPoolAbi}__ and `eventName` set to `"Repaid"`
 */
export const useWatchPassportPoolRepaidEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: passportPoolAbi,
    eventName: 'Repaid',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link passportPoolAbi}__ and `eventName` set to `"FullRepayReported"`
 */
export const useWatchPassportPoolFullRepayReportedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: passportPoolAbi,
    eventName: 'FullRepayReported',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link passportPoolAbi}__ and `eventName` set to `"Deposited"`
 */
export const useWatchPassportPoolDepositedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: passportPoolAbi,
    eventName: 'Deposited',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link passportPoolAbi}__ and `eventName` set to `"WithdrawnLP"`
 */
export const useWatchPassportPoolWithdrawnLpEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: passportPoolAbi,
    eventName: 'WithdrawnLP',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link priceOracleAbi}__
 */
export const useReadPriceOracle = /*#__PURE__*/ createUseReadContract({
  abi: priceOracleAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link priceOracleAbi}__ and `functionName` set to `"price"`
 */
export const useReadPriceOraclePrice = /*#__PURE__*/ createUseReadContract({
  abi: priceOracleAbi,
  functionName: 'price',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link priceOracleAbi}__ and `functionName` set to `"decimals"`
 */
export const useReadPriceOracleDecimals = /*#__PURE__*/ createUseReadContract({
  abi: priceOracleAbi,
  functionName: 'decimals',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link priceOracleAbi}__
 */
export const useWritePriceOracle = /*#__PURE__*/ createUseWriteContract({
  abi: priceOracleAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link priceOracleAbi}__ and `functionName` set to `"setPrice"`
 */
export const useWritePriceOracleSetPrice = /*#__PURE__*/ createUseWriteContract(
  { abi: priceOracleAbi, functionName: 'setPrice' },
)

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link priceOracleAbi}__
 */
export const useSimulatePriceOracle = /*#__PURE__*/ createUseSimulateContract({
  abi: priceOracleAbi,
})

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link priceOracleAbi}__ and `functionName` set to `"setPrice"`
 */
export const useSimulatePriceOracleSetPrice =
  /*#__PURE__*/ createUseSimulateContract({
    abi: priceOracleAbi,
    functionName: 'setPrice',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link priceOracleAbi}__
 */
export const useWatchPriceOracleEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: priceOracleAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link priceOracleAbi}__ and `eventName` set to `"PriceUpdated"`
 */
export const useWatchPriceOraclePriceUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: priceOracleAbi,
    eventName: 'PriceUpdated',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link testUsdcAbi}__
 */
export const useReadTestUsdc = /*#__PURE__*/ createUseReadContract({
  abi: testUsdcAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link testUsdcAbi}__ and `functionName` set to `"balanceOf"`
 */
export const useReadTestUsdcBalanceOf = /*#__PURE__*/ createUseReadContract({
  abi: testUsdcAbi,
  functionName: 'balanceOf',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link testUsdcAbi}__ and `functionName` set to `"allowance"`
 */
export const useReadTestUsdcAllowance = /*#__PURE__*/ createUseReadContract({
  abi: testUsdcAbi,
  functionName: 'allowance',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link testUsdcAbi}__ and `functionName` set to `"FAUCET_AMOUNT"`
 */
export const useReadTestUsdcFaucetAmount = /*#__PURE__*/ createUseReadContract({
  abi: testUsdcAbi,
  functionName: 'FAUCET_AMOUNT',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link testUsdcAbi}__ and `functionName` set to `"FAUCET_COOLDOWN"`
 */
export const useReadTestUsdcFaucetCooldown =
  /*#__PURE__*/ createUseReadContract({
    abi: testUsdcAbi,
    functionName: 'FAUCET_COOLDOWN',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link testUsdcAbi}__ and `functionName` set to `"lastFaucetClaim"`
 */
export const useReadTestUsdcLastFaucetClaim =
  /*#__PURE__*/ createUseReadContract({
    abi: testUsdcAbi,
    functionName: 'lastFaucetClaim',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link testUsdcAbi}__ and `functionName` set to `"decimals"`
 */
export const useReadTestUsdcDecimals = /*#__PURE__*/ createUseReadContract({
  abi: testUsdcAbi,
  functionName: 'decimals',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link testUsdcAbi}__
 */
export const useWriteTestUsdc = /*#__PURE__*/ createUseWriteContract({
  abi: testUsdcAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link testUsdcAbi}__ and `functionName` set to `"approve"`
 */
export const useWriteTestUsdcApprove = /*#__PURE__*/ createUseWriteContract({
  abi: testUsdcAbi,
  functionName: 'approve',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link testUsdcAbi}__ and `functionName` set to `"transfer"`
 */
export const useWriteTestUsdcTransfer = /*#__PURE__*/ createUseWriteContract({
  abi: testUsdcAbi,
  functionName: 'transfer',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link testUsdcAbi}__ and `functionName` set to `"faucet"`
 */
export const useWriteTestUsdcFaucet = /*#__PURE__*/ createUseWriteContract({
  abi: testUsdcAbi,
  functionName: 'faucet',
})

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link testUsdcAbi}__
 */
export const useSimulateTestUsdc = /*#__PURE__*/ createUseSimulateContract({
  abi: testUsdcAbi,
})

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link testUsdcAbi}__ and `functionName` set to `"approve"`
 */
export const useSimulateTestUsdcApprove =
  /*#__PURE__*/ createUseSimulateContract({
    abi: testUsdcAbi,
    functionName: 'approve',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link testUsdcAbi}__ and `functionName` set to `"transfer"`
 */
export const useSimulateTestUsdcTransfer =
  /*#__PURE__*/ createUseSimulateContract({
    abi: testUsdcAbi,
    functionName: 'transfer',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link testUsdcAbi}__ and `functionName` set to `"faucet"`
 */
export const useSimulateTestUsdcFaucet =
  /*#__PURE__*/ createUseSimulateContract({
    abi: testUsdcAbi,
    functionName: 'faucet',
  })
