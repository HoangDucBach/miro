import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWaitForTransactionReceipt } from "wagmi";
import type { Hash } from "viem";
import { cc3Testnet } from "@/lib/chains";

interface WriteState {
  data: Hash | undefined;
  error: Error | null;
  isPending: boolean;
}

export interface TransactionState {
  isPending: boolean;
  isConfirmed: boolean;
  error: Error | null;
}

/**
 * Turns a raw wagmi write hook's state into "is this done yet, and did it work": tracks
 * the submitted tx through confirmation, merges the wallet-rejection/revert/timeout error
 * states into one field, and refreshes every on-chain read once the tx lands. Every
 * mutating hook in this app (deposit, borrow, repay, withdraw, the repay-path's approve)
 * composes this instead of re-deriving pending/confirmed/error/refetch handling five
 * times over -- single responsibility, reused by every call site (DRY). Submitting the tx
 * itself stays with each caller, since each contract function's `args` shape is different
 * and there's no honest way to generalize "call writeContractAsync" without losing that
 * type safety.
 */
export function useTransactionState(write: WriteState): TransactionState {
  const { data: hash, error: writeError, isPending: isSubmitting } = write;
  // chainId pinned: every mutating action in this app targets CC3 Testnet, and the
  // wallet may well be switched to Sepolia (mid-Aave/Morpho flow) when one lands.
  const receipt = useWaitForTransactionReceipt({ hash, chainId: cc3Testnet.id });
  const queryClient = useQueryClient();

  // A reverted transaction is not an error to viem: waitForTransactionReceipt resolves
  // with `status: "reverted"` rather than throwing, so wagmi reports isSuccess === true
  // and error === null. Taken at face value that shows the user "Confirmed" for a
  // transaction that changed nothing. The receipt's own status is the source of truth.
  const isReverted = receipt.data?.status === "reverted";
  const isConfirmed = receipt.isSuccess && !isReverted;

  // Refetched on either outcome. After a revert the chain state is unchanged, but the
  // page may have been showing an optimistic figure, and re-reading is how it gets back
  // to what is actually true.
  useEffect(() => {
    if (receipt.isSuccess) {
      void queryClient.invalidateQueries();
    }
  }, [receipt.isSuccess, hash, queryClient]);

  return {
    isPending: isSubmitting || (Boolean(hash) && receipt.isLoading),
    isConfirmed,
    error:
      writeError ??
      receipt.error ??
      (isReverted
        ? new Error("The transaction reverted on chain and changed nothing.")
        : null),
  };
}
