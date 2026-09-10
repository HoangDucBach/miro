import { erc20Abi, maxUint256 } from "viem";
import { useAccount, useConfig, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { aaveFaucetAbi, aavePoolAbi } from "@/generated";
import { sepolia } from "@/lib/chains";
import { sourceProtocols } from "@/lib/contracts";
import { morphoMarketAbi } from "@/lib/morpho";
import { useTransactionState } from "./useContractAction";

/** Aave's variable rate mode. The demo borrows variable; stable is deprecated on V3. */
const VARIABLE_RATE_MODE = 2n;

/**
 * Repaying is the only write this app makes on another chain, and both protocols need the
 * loan asset pulled by `transferFrom` -- so each repayment is an approve, mined, then the
 * repay itself. `writeContractAsync` resolves when the wallet hands back a hash, not when
 * the transaction lands, so sending the repay straight after the approve would race it
 * into an insufficient-allowance revert.
 */
async function approveMined(
  write: ReturnType<typeof useWriteContract>,
  config: ReturnType<typeof useConfig>,
  token: `0x${string}`,
  spender: `0x${string}`,
  amount: bigint,
): Promise<void> {
  const hash = await write.writeContractAsync({
    address: token,
    abi: erc20Abi,
    chainId: sepolia.id,
    functionName: "approve",
    args: [spender, amount],
  });
  const receipt = await waitForTransactionReceipt(config, { hash, chainId: sepolia.id });
  if (receipt.status === "reverted") {
    throw new Error("The approval reverted on chain, so nothing was transferred.");
  }
}

/**
 * Closes the borrower's Aave V3 position in full.
 *
 * `type(uint256).max` is Aave's own "repay everything" sentinel -- it clamps to the debt
 * rather than overpaying -- but the wallet still has to *hold* that much, and a borrower
 * who spent exactly what they borrowed is always short by the interest since. Sepolia's
 * Aave faucet is public, so the shortfall is minted first when there is one; that step is
 * skipped whenever the balance already covers the debt.
 */
export function useRepayAave() {
  const { address } = useAccount();
  const config = useConfig();
  const { aave } = sourceProtocols;

  const faucetWrite = useWriteContract();
  const approveWrite = useWriteContract();
  const repayWrite = useWriteContract();

  const faucetState = useTransactionState(faucetWrite, sepolia.id);
  const approveState = useTransactionState(approveWrite, sepolia.id);
  const repayState = useTransactionState(repayWrite, sepolia.id);

  /** @param debt exact debt from the variable debt token; @param balance reserve asset held */
  async function repay(debt: bigint, balance: bigint) {
    if (!address || !aave) throw new Error("No wallet, or no Aave deployment configured.");

    if (balance < debt) {
      if (!aave.faucet) {
        throw new Error("Not enough of the reserve asset to repay, and no faucet is configured.");
      }
      // A margin, not the exact shortfall: interest keeps accruing between this
      // transaction and the repay, so minting only the difference falls short again.
      const topUp = debt - balance + debt / 100n + 1n;
      const hash = await faucetWrite.writeContractAsync({
        address: aave.faucet,
        abi: aaveFaucetAbi,
        chainId: sepolia.id,
        functionName: "mint",
        args: [aave.reserveAsset, address, topUp],
      });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: sepolia.id });
      if (receipt.status === "reverted") {
        throw new Error("The faucet reverted, so the wallet is still short of the debt.");
      }
    }

    await approveMined(approveWrite, config, aave.reserveAsset, aave.pool, maxUint256);

    return repayWrite.writeContractAsync({
      address: aave.pool,
      abi: aavePoolAbi,
      chainId: sepolia.id,
      functionName: "repay",
      args: [aave.reserveAsset, maxUint256, VARIABLE_RATE_MODE, address],
    });
  }

  return {
    repay,
    isPending: faucetState.isPending || approveState.isPending || repayState.isPending,
    isConfirmed: repayState.isConfirmed,
    error: faucetState.error ?? approveState.error ?? repayState.error,
  };
}

/**
 * Closes the borrower's Morpho Blue position in full.
 *
 * By shares, not by assets: Morpho converts an asset amount back into shares, and asking
 * it to burn more shares than the position holds underflows `borrowShares -= shares` and
 * panics. Repaying the share balance is Morpho's own recommendation for closing a
 * position exactly, and it prices to the debt including interest.
 *
 * There is no faucet fallback here -- the demo loan token mints only to its owner -- so a
 * wallet short of the accrued interest gets a plain revert rather than a silent partial
 * repayment.
 */
export function useRepayMorpho() {
  const { address } = useAccount();
  const config = useConfig();
  const { morpho } = sourceProtocols;

  const approveWrite = useWriteContract();
  const repayWrite = useWriteContract();

  const approveState = useTransactionState(approveWrite, sepolia.id);
  const repayState = useTransactionState(repayWrite, sepolia.id);

  /** @param shares the position's borrowShares; @param assets what they price to, to approve */
  async function repay(shares: bigint, assets: bigint) {
    if (!address || !morpho) throw new Error("No wallet, or no Morpho market configured.");

    // Approved with headroom over the priced amount: the assets pulled are recomputed at
    // execution against a market that has accrued since this was read.
    await approveMined(
      approveWrite,
      config,
      morpho.market.loanToken,
      morpho.morpho,
      assets + assets / 100n + 1n,
    );

    return repayWrite.writeContractAsync({
      address: morpho.morpho,
      abi: morphoMarketAbi,
      chainId: sepolia.id,
      functionName: "repay",
      args: [morpho.market, 0n, shares, address, "0x"],
    });
  }

  return {
    repay,
    isPending: approveState.isPending || repayState.isPending,
    isConfirmed: repayState.isConfirmed,
    error: approveState.error ?? repayState.error,
  };
}
