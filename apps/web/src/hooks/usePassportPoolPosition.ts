import { useAccount, useReadContracts } from "wagmi";
import { passportPoolAbi } from "@/generated";
import { contracts } from "@/lib/contracts";

/**
 * A borrower's full PassportPool position in one round trip: `useReadContracts` batches
 * the four reads into a single multicall instead of four separate RPC requests, and this
 * is the one place that shape is assembled -- callers get a flat, ready-to-render object.
 */
export function usePassportPoolPosition() {
  const { address } = useAccount();

  const contractBase = { address: contracts.passportPool, abi: passportPoolAbi } as const;
  const { data, isLoading, refetch } = useReadContracts({
    contracts: address
      ? [
          { ...contractBase, functionName: "collateralOf", args: [address] },
          { ...contractBase, functionName: "debt", args: [address] },
          { ...contractBase, functionName: "creditLimit", args: [address] },
          { ...contractBase, functionName: "maxLtvBps", args: [address] },
        ]
      : undefined,
    query: { enabled: Boolean(address) },
  });

  const [collateral, debt, creditLimit, maxLtvBps] = data ?? [];

  return {
    collateral: (collateral?.result as bigint | undefined) ?? 0n,
    debt: (debt?.result as bigint | undefined) ?? 0n,
    creditLimit: (creditLimit?.result as bigint | undefined) ?? 0n,
    maxLtvBps: (maxLtvBps?.result as bigint | undefined) ?? 0n,
    isLoading,
    // Wrapped rather than returned directly: useReadContracts' refetch carries an
    // inferred type tied to @wagmi/core's internals that isn't safely nameable outside
    // this module, and callers only ever need "refresh," not TanStack's full refetch options.
    refetch: (): void => {
      void refetch();
    },
  };
}
