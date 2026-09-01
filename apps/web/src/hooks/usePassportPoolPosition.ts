import { useAccount, useReadContracts } from "wagmi";
import { passportPoolAbi } from "@/generated";
import { contracts } from "@/lib/contracts";
import { cc3Testnet } from "@/lib/chains";

/**
 * A borrower's full PassportPool position in one round trip: `useReadContracts` batches
 * the four reads into a single multicall instead of four separate RPC requests, and this
 * is the one place that shape is assembled -- callers get a flat, ready-to-render object.
 *
 * PassportPool only exists on CC3 Testnet, so `chainId` is pinned per-call here too --
 * same reasoning as usePassportScore: this must read correctly regardless of which chain
 * the wallet is currently switched to (e.g. Sepolia, mid-Aave-transaction).
 */
export function usePassportPoolPosition() {
  const { address } = useAccount();

  const contractBase = { address: contracts.passportPool, abi: passportPoolAbi, chainId: cc3Testnet.id } as const;
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
