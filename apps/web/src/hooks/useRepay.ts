import { useAccount } from "wagmi";
import { useReadTestUsdcAllowance, useWritePassportPoolRepay, useWriteTestUsdcApprove } from "@/generated";
import { contracts } from "@/lib/contracts";
import { useTransactionState } from "./useContractAction";

/**
 * Repaying moves tUSDC out of the borrower's wallet via `transferFrom`, so it needs an
 * ERC-20 approval first if the current allowance is too low -- unlike the other three
 * PassportPool actions, which never touch an external token's allowance.
 */
export function useRepay() {
  const { address } = useAccount();
  const { data: allowance, refetch: refetchAllowance } = useReadTestUsdcAllowance({
    address: contracts.testUsdc,
    args: address ? [address, contracts.passportPool] : undefined,
    query: { enabled: Boolean(address) },
  });

  const approveWrite = useWriteTestUsdcApprove();
  const approveState = useTransactionState(approveWrite);

  const repayWrite = useWritePassportPoolRepay();
  const repayState = useTransactionState(repayWrite);

  async function repay(amount: bigint) {
    if ((allowance ?? 0n) < amount) {
      await approveWrite.writeContractAsync({ address: contracts.testUsdc, args: [contracts.passportPool, amount] });
      await refetchAllowance();
    }
    return repayWrite.writeContractAsync({ address: contracts.passportPool, args: [amount] });
  }

  return {
    repay,
    isPending: approveState.isPending || repayState.isPending,
    isConfirmed: repayState.isConfirmed,
    error: approveState.error ?? repayState.error,
  };
}
