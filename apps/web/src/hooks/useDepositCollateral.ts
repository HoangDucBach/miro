import { useWritePassportPoolDepositCollateral } from "@/generated";
import { contracts } from "@/lib/contracts";
import { useTransactionState } from "./useContractAction";

/** Deposits native tCTC as PassportPool collateral. Payable, no args -- the amount is the
 *  tx value, not a function argument. */
export function useDepositCollateral() {
  const write = useWritePassportPoolDepositCollateral();
  const state = useTransactionState(write);

  const deposit = (amountWei: bigint) =>
    write.writeContractAsync({ address: contracts.passportPool, value: amountWei });

  return { deposit, ...state };
}
