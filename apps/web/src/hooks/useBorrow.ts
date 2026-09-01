import { useWritePassportPoolBorrow } from "@/generated";
import { contracts } from "@/lib/contracts";
import { cc3Testnet } from "@/lib/chains";
import { useTransactionState } from "./useContractAction";

/** @param amount tUSDC, 6 decimals -- matches TestUSDC.decimals(), not 18. */
export function useBorrow() {
  const write = useWritePassportPoolBorrow();
  const state = useTransactionState(write);

  const borrow = (amount: bigint) =>
    write.writeContractAsync({ address: contracts.passportPool, chainId: cc3Testnet.id, args: [amount] });

  return { borrow, ...state };
}
