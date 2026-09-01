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

  // Without this, a confirmed deposit/borrow/repay leaves the score and pool position
  // showing pre-transaction values until the page is reloaded.
  useEffect(() => {
    if (receipt.isSuccess) {
      void queryClient.invalidateQueries();
    }
  }, [receipt.isSuccess, hash, queryClient]);

  return {
    isPending: isSubmitting || (Boolean(hash) && receipt.isLoading),
    isConfirmed: receipt.isSuccess,
    error: writeError ?? receipt.error ?? null,
  };
}
