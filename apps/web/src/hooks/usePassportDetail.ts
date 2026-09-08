import { useAccount, useBlock, useReadContracts } from "wagmi";
import { creditPassportAbi } from "@/generated";
import { cc3Testnet } from "@/lib/chains";
import { contracts } from "@/lib/contracts";
import type { PassportRecord, ScoringParams } from "@/lib/passport";

/**
 * The borrower's raw passport record plus the contract's own scoring parameters, batched
 * into one multicall. The parameters are read rather than hardcoded so the breakdown the
 * UI draws can never describe weights the deployed contract no longer uses.
 *
 * chainId is pinned for the same reason as usePassportScore: CreditPassport lives only on
 * CC3 Testnet, and the passport must read identically whatever chain the wallet is on.
 */
export function usePassportDetail() {
  const { address } = useAccount();

  const base = {
    address: contracts.creditPassport,
    abi: creditPassportAbi,
    chainId: cc3Testnet.id,
  } as const;

  // The chain's own clock, not the browser's: scoreOf ages a passport against
  // block.timestamp, so anything else can disagree by a whole period on a boundary.
  const { data: block } = useBlock({ chainId: cc3Testnet.id });

  const { data, isLoading } = useReadContracts({
    contracts: address
      ? [
          { ...base, functionName: "passports", args: [address] },
          { ...base, functionName: "scoreOf", args: [address] },
          { ...base, functionName: "REPAY_POINTS" },
          { ...base, functionName: "DIVERSITY_POINTS" },
          { ...base, functionName: "AGE_PERIOD" },
          { ...base, functionName: "AGE_POINTS_PER_PERIOD" },
          { ...base, functionName: "AGE_CAP_PERIODS" },
          { ...base, functionName: "NEGATIVE_PENALTY" },
          { ...base, functionName: "PER_SOURCE_CAP" },
        ]
      : undefined,
    query: { enabled: Boolean(address) },
  });

  const [passport, score, repay, diversity, agePeriod, agePoints, ageCap, penalty, perSourceCap] =
    data ?? [];

  // `passports` returns a struct, which viem gives back as a positional tuple.
  const record = passport?.result as
    | readonly [number, number, number, number]
    | undefined;

  const asRecord: PassportRecord = {
    firstSeenAt: BigInt(record?.[0] ?? 0),
    cappedRepays: BigInt(record?.[1] ?? 0),
    negativeEvents: BigInt(record?.[2] ?? 0),
    sourceCount: BigInt(record?.[3] ?? 0),
  };

  const params: ScoringParams = {
    repayPoints: (repay?.result as bigint | undefined) ?? 0n,
    diversityPoints: (diversity?.result as bigint | undefined) ?? 0n,
    agePeriod: (agePeriod?.result as bigint | undefined) ?? 0n,
    agePointsPerPeriod: (agePoints?.result as bigint | undefined) ?? 0n,
    ageCapPeriods: (ageCap?.result as bigint | undefined) ?? 0n,
    negativePenalty: (penalty?.result as bigint | undefined) ?? 0n,
  };

  return {
    record: asRecord,
    params,
    /** Chain time, for ageing the passport the way scoreOf does. 0 until the block loads. */
    nowSeconds: block?.timestamp ?? 0n,
    /** The contract's own figure. Always the one to display as the score. */
    score: (score?.result as bigint | undefined) ?? 0n,
    perSourceCap: BigInt((perSourceCap?.result as number | undefined) ?? 0),
    isLoading,
  };
}
