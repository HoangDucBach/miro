import { useAccount } from "wagmi";
import { useReadCreditPassportScoreOf } from "@/generated";
import { contracts } from "@/lib/contracts";

/**
 * The connected wallet's aggregate credit-passport score. Deliberately aggregate only --
 * per-source history (`sourceStats`) is keyed by `sourceId` and isn't enumerable
 * client-side without an indexer, so it isn't shown here rather than being faked.
 */
export function usePassportScore() {
  const { address } = useAccount();
  const { data: score, isLoading, refetch } = useReadCreditPassportScoreOf({
    address: contracts.creditPassport,
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  return { score: score ?? 0n, isLoading, refetch };
}
