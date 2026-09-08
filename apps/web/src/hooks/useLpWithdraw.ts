import { useWritePassportPoolWithdrawLp } from "@/generated";
import { cc3Testnet } from "@/lib/chains";
import { contracts } from "@/lib/contracts";
import { useTransactionState } from "./useContractAction";

/**
 * The argument is an amount of *principal* to redeem, not the tUSDC paid out: the pool
 * converts it pro-rata against its own balance. See src/lib/lend.ts.
 */
export function useLpWithdraw() {
  const write = useWritePassportPoolWithdrawLp();
  const state = useTransactionState(write);

  const withdraw = (amount: bigint) =>
    write.writeContractAsync({
      address: contracts.passportPool,
      chainId: cc3Testnet.id,
      args: [amount],
    });

  return { withdraw, ...state };
}
