import { useWritePassportPoolWithdrawCollateral } from "@/generated";
import { contracts } from "@/lib/contracts";
import { cc3Testnet } from "@/lib/chains";
import { useTransactionState } from "./useContractAction";

export function useWithdrawCollateral() {
  const write = useWritePassportPoolWithdrawCollateral();
  const state = useTransactionState(write);

  const withdraw = (amountWei: bigint) =>
    write.writeContractAsync({ address: contracts.passportPool, chainId: cc3Testnet.id, args: [amountWei] });

  return { withdraw, ...state };
}
