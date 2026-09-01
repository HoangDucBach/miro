import { useWritePassportPoolDepositCollateral } from "@/generated";
import { contracts } from "@/lib/contracts";
import { cc3Testnet } from "@/lib/chains";
import { useTransactionState } from "./useContractAction";

/** Deposits native tCTC as PassportPool collateral. Payable, no args -- the amount is the
 *  tx value, not a function argument.
 *
 *  `chainId` is pinned so wagmi prompts a network switch when the wallet is on Sepolia,
 *  instead of sending this to whatever chain happens to be active (where PassportPool
 *  doesn't exist at that address, and the call would just revert confusingly). */
export function useDepositCollateral() {
  const write = useWritePassportPoolDepositCollateral();
  const state = useTransactionState(write);

  const deposit = (amountWei: bigint) =>
    write.writeContractAsync({ address: contracts.passportPool, chainId: cc3Testnet.id, value: amountWei });

  return { deposit, ...state };
}
