import { useAccount, useBalance, useReadContract } from "wagmi";
import { testUsdcAbi } from "@/generated";
import { cc3Testnet } from "@/lib/chains";
import { contracts } from "@/lib/contracts";

/**
 * What the connected wallet can actually spend, per asset.
 *
 * Collateral is native tCTC -- depositCollateral is payable and takes the amount as tx
 * value -- so its ceiling is the chain balance, not an ERC-20 one. Debt and lending are
 * tUSDC. Reading both here keeps every "available" hint on one source rather than each
 * form guessing.
 *
 * The native balance is the wallet's full holding; gas still has to come out of it, so a
 * deposit of exactly this figure will fail. It is a ceiling to stay under, not a target.
 */
export function useWalletBalances() {
  const { address } = useAccount();

  const { data: native } = useBalance({ address, chainId: cc3Testnet.id });

  const { data: usdc } = useReadContract({
    address: contracts.testUsdc,
    abi: testUsdcAbi,
    chainId: cc3Testnet.id,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  return {
    native: native?.value ?? 0n,
    usdc: (usdc as bigint | undefined) ?? 0n,
  };
}
