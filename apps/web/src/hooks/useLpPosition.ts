import { useAccount, useReadContracts } from "wagmi";
import { passportPoolAbi, testUsdcAbi } from "@/generated";
import { cc3Testnet } from "@/lib/chains";
import { contracts } from "@/lib/contracts";

/**
 * A lender's side of the pool in one multicall. The pool's tUSDC balance is read from the
 * token, not the pool, because that balance -- not `totalLPDeposits` -- is what withdrawLP
 * divides against when it pays out.
 *
 * chainId is pinned as everywhere else: PassportPool lives only on CC3 Testnet, and this
 * must read correctly while the wallet sits on Sepolia.
 */
export function useLpPosition() {
  const { address } = useAccount();

  const { data, isLoading, refetch } = useReadContracts({
    contracts: address
      ? [
          {
            address: contracts.passportPool,
            abi: passportPoolAbi,
            chainId: cc3Testnet.id,
            functionName: "lpDeposits",
            args: [address],
          },
          {
            address: contracts.passportPool,
            abi: passportPoolAbi,
            chainId: cc3Testnet.id,
            functionName: "totalLPDeposits",
          },
          {
            address: contracts.testUsdc,
            abi: testUsdcAbi,
            chainId: cc3Testnet.id,
            functionName: "balanceOf",
            args: [contracts.passportPool],
          },
          {
            address: contracts.testUsdc,
            abi: testUsdcAbi,
            chainId: cc3Testnet.id,
            functionName: "balanceOf",
            args: [address],
          },
        ]
      : undefined,
    query: { enabled: Boolean(address) },
  });

  const [lpDeposit, totalDeposits, poolBalance, walletBalance] = data ?? [];

  return {
    lpDeposit: (lpDeposit?.result as bigint | undefined) ?? 0n,
    totalDeposits: (totalDeposits?.result as bigint | undefined) ?? 0n,
    /** tUSDC the pool holds right now -- the divisor withdrawLP actually uses. */
    poolBalance: (poolBalance?.result as bigint | undefined) ?? 0n,
    walletBalance: (walletBalance?.result as bigint | undefined) ?? 0n,
    isLoading,
    refetch: (): void => {
      void refetch();
    },
  };
}
