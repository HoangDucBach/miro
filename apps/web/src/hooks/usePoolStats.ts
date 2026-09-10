import { useBalance, useReadContracts } from "wagmi";
import { passportPoolAbi, testUsdcAbi } from "@/generated";
import { cc3Testnet } from "@/lib/chains";
import { contracts } from "@/lib/contracts";

/**
 * The pool as a whole, independent of who is connected -- what every lending protocol puts
 * at the top of a market page: how much has been supplied, how much is still available,
 * how much is out on loan, and on what terms.
 *
 * None of it is aggregated off-chain: `totalLPDeposits` is the pool's own principal
 * bookkeeping, the tUSDC balance is read from the token, and the collateral figure is the
 * pool's native tCTC balance -- which is exactly what `depositCollateral` pays into.
 *
 * chainId is pinned as everywhere else: this must read correctly while the wallet sits on
 * Sepolia, and it takes no account, so it renders for visitors who have not connected.
 */
export function usePoolStats() {
  const poolBase = {
    address: contracts.passportPool,
    abi: passportPoolAbi,
    chainId: cc3Testnet.id,
  } as const;

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { ...poolBase, functionName: "totalLPDeposits" },
      { ...poolBase, functionName: "INTEREST_BPS" },
      { ...poolBase, functionName: "BASE_LTV_BPS" },
      {
        address: contracts.testUsdc,
        abi: testUsdcAbi,
        chainId: cc3Testnet.id,
        functionName: "balanceOf",
        args: [contracts.passportPool],
      },
    ],
  });

  // Native tCTC has no contract to call, so it comes from the node rather than the batch.
  const collateral = useBalance({ address: contracts.passportPool, chainId: cc3Testnet.id });

  const [totalDeposits, interestBps, baseLtvBps, poolBalance] = data ?? [];

  return {
    /** LP principal ever deposited and not withdrawn -- the pool's supply side. */
    totalDeposits: (totalDeposits?.result as bigint | undefined) ?? 0n,
    /** tUSDC the pool holds right now: what is borrowable and what backs a withdrawal. */
    poolBalance: (poolBalance?.result as bigint | undefined) ?? 0n,
    /** Flat borrow rate, charged once per borrow rather than accrued per block. */
    interestBps: (interestBps?.result as bigint | undefined) ?? 0n,
    /** LTV a borrower with no passport history gets, before any score uplift. */
    baseLtvBps: (baseLtvBps?.result as bigint | undefined) ?? 0n,
    /** Native tCTC locked as collateral across every borrower. */
    totalCollateral: collateral.data?.value ?? 0n,
    isLoading: isLoading || collateral.isLoading,
    refetch: (): void => {
      void refetch();
      void collateral.refetch();
    },
  };
}
