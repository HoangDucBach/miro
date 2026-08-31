import { useWaitForTransactionReceipt } from "wagmi";
import type { Hash } from "viem";

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
 * the submitted tx through confirmation and merges the wallet-rejection/revert/timeout
 * error states into one field. Every mutating hook in this app (deposit, borrow, repay,
 * withdraw, the repay-path's approve) composes this instead of re-deriving
 * pending/confirmed/error handling five times over -- single responsibility, reused by
 * every call site (DRY). Submitting the tx itself stays with each caller, since each
 * contract function's `args` shape is different and there's no honest way to generalize
 * "call writeContractAsync" without losing that type safety.
 */
export function useTransactionState(write: WriteState): TransactionState {
  const { data: hash, error: writeError, isPending: isSubmitting } = write;
  const receipt = useWaitForTransactionReceipt({ hash });

  return {
    isPending: isSubmitting || (Boolean(hash) && receipt.isLoading),
    isConfirmed: receipt.isSuccess,
    error: writeError ?? receipt.error ?? null,
  };
}
