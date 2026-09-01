import { useAccount } from "wagmi";
import { useReadCreditPassportScoreOf } from "@/generated";
import { contracts } from "@/lib/contracts";
import { cc3Testnet } from "@/lib/chains";

/**
 * The connected wallet's aggregate credit-passport score. Deliberately aggregate only --
 * per-source history (`sourceStats`) is keyed by `sourceId` and isn't enumerable
 * client-side without an indexer, so it isn't shown here rather than being faked.
 *
 * The score is inherently cross-chain: CreditPassport only exists on CC3 Testnet, but
 * borrowing activity happens on Sepolia. Pinning `chainId` here means the score reads
 * correctly (and identically) no matter which network the wallet is currently switched
 * to -- a portable passport shouldn't visually depend on the wallet's active chain.
 */
export function usePassportScore() {
  const { address } = useAccount();
  const { data: score, isLoading, refetch } = useReadCreditPassportScoreOf({
    address: contracts.creditPassport,
    chainId: cc3Testnet.id,
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  return { score: score ?? 0n, isLoading, refetch };
}
