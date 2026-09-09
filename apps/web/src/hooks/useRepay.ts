import { useAccount, useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useReadTestUsdcAllowance, useWritePassportPoolRepay, useWriteTestUsdcApprove } from "@/generated";
import { contracts } from "@/lib/contracts";
import { cc3Testnet } from "@/lib/chains";
import { useTransactionState } from "./useContractAction";

/**
 * Repaying moves tUSDC out of the borrower's wallet via `transferFrom`, so it needs an
 * ERC-20 approval first if the current allowance is too low -- unlike the other three
 * PassportPool actions, which never touch an external token's allowance.
 *
 * The approve must be *mined* before the repay is sent, not merely submitted:
 * `writeContractAsync` resolves as soon as the wallet hands back a hash, so firing repay
 * straight after would race the approval and revert on insufficient allowance.
 */
export function useRepay() {
  const { address } = useAccount();
  const config = useConfig();
  const { data: allowance, refetch: refetchAllowance } = useReadTestUsdcAllowance({
    address: contracts.testUsdc,
    chainId: cc3Testnet.id,
    args: address ? [address, contracts.passportPool] : undefined,
    query: { enabled: Boolean(address) },
  });

  const approveWrite = useWriteTestUsdcApprove();
  const approveState = useTransactionState(approveWrite);

  const repayWrite = useWritePassportPoolRepay();
  const repayState = useTransactionState(repayWrite);

  async function repay(amount: bigint) {
    if ((allowance ?? 0n) < amount) {
      const approveHash = await approveWrite.writeContractAsync({
        address: contracts.testUsdc,
        chainId: cc3Testnet.id,
        args: [contracts.passportPool, amount],
      });
      const receipt = await waitForTransactionReceipt(config, { hash: approveHash, chainId: cc3Testnet.id });
      // waitForTransactionReceipt resolves on a reverted approve too. Proceeding would
      // send the second transaction into a revert for insufficient allowance, charging
      // gas twice to report the same failure.
      if (receipt.status === "reverted") {
        throw new Error("The approval reverted on chain, so nothing was transferred.");
      }
      await refetchAllowance();
    }
    return repayWrite.writeContractAsync({
      address: contracts.passportPool,
      chainId: cc3Testnet.id,
      args: [amount],
    });
  }

  return {
    repay,
    isPending: approveState.isPending || repayState.isPending,
    isConfirmed: repayState.isConfirmed,
    error: approveState.error ?? repayState.error,
  };
}
