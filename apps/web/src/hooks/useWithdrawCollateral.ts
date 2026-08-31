import { useWritePassportPoolWithdrawCollateral } from "@/generated";
import { contracts } from "@/lib/contracts";
import { useTransactionState } from "./useContractAction";

export function useWithdrawCollateral() {
  const write = useWritePassportPoolWithdrawCollateral();
  const state = useTransactionState(write);

  const withdraw = (amountWei: bigint) =>
    write.writeContractAsync({ address: contracts.passportPool, args: [amountWei] });

  return { withdraw, ...state };
}
