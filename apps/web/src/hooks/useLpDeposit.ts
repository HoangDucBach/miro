import { useAccount, useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import {
  useReadTestUsdcAllowance,
  useWritePassportPoolDeposit,
  useWriteTestUsdcApprove,
} from "@/generated";
import { cc3Testnet } from "@/lib/chains";
import { contracts } from "@/lib/contracts";
import { useTransactionState } from "./useContractAction";

/**
 * Lending into the pool pulls tUSDC with `transferFrom`, so it needs an allowance first --
 * the same two-step useRepay does, and for the same reason: `writeContractAsync` resolves
 * on the wallet handing back a hash, so the approve must be *mined* before the deposit is
 * sent or it races and reverts on insufficient allowance.
 */
export function useLpDeposit() {
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

  const depositWrite = useWritePassportPoolDeposit();
  const depositState = useTransactionState(depositWrite);

  async function deposit(amount: bigint) {
    if ((allowance ?? 0n) < amount) {
      const hash = await approveWrite.writeContractAsync({
        address: contracts.testUsdc,
        chainId: cc3Testnet.id,
        args: [contracts.passportPool, amount],
      });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: cc3Testnet.id });
      // waitForTransactionReceipt resolves on a reverted approve too. Proceeding would
      // send the deposit into a revert for insufficient allowance, charging gas twice to
      // report the same failure.
      if (receipt.status === "reverted") {
        throw new Error("The approval reverted on chain, so nothing was transferred.");
      }
      await refetchAllowance();
    }
    return depositWrite.writeContractAsync({
      address: contracts.passportPool,
      chainId: cc3Testnet.id,
      args: [amount],
    });
  }

  return {
    deposit,
    isPending: approveState.isPending || depositState.isPending,
    isConfirmed: depositState.isConfirmed,
    error: approveState.error ?? depositState.error,
  };
}
