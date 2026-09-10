import { erc20Abi } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { aavePoolAbi, morphoAbi } from "@/generated";
import { sepolia } from "@/lib/chains";
import { sourceProtocols } from "@/lib/contracts";
import { AAVE_BASE_DECIMALS, morphoBorrowAssets } from "@/lib/crosschain";

export type CrossChainLoan = {
  protocol: "Aave V3" | "Morpho Blue";
  /** Amount still owed, in `debtDecimals`. Zero means the position is settled. */
  debt: bigint;
  debtDecimals: number;
  debtSymbol: string;
  /** Collateral backing it, in `collateralDecimals`. */
  collateral: bigint;
  collateralDecimals: number;
  collateralSymbol: string;
  /** 1e18 fixed point, or null where the protocol doesn't report one. */
  healthFactor: bigint | null;
};

/**
 * The borrower's live positions on the protocols the passport scores from. Both are the
 * real, unmodified deployments on Sepolia -- this reads them directly, so an open loan
 * shows up here whether or not it has been proven into the passport yet.
 *
 * Deliberately read-only, and deliberately not gated on the wallet's current chain:
 * someone looking at their Miro position on CC3 still wants to see what they owe
 * elsewhere. Both protocols are read as one batch: a conditionally-assembled contract list
 * defeats wagmi's per-entry return typing, and a deployment either has the source
 * protocols configured or shows no panel at all.
 */
export function useCrossChainLoans() {
  const { address } = useAccount();
  const { aave, morpho } = sourceProtocols;
  const enabled = Boolean(address) && Boolean(aave) && Boolean(morpho);

  const { data, isLoading, refetch } = useReadContracts({
    contracts:
      address && aave && morpho
        ? ([
            {
              address: aave.pool,
              abi: aavePoolAbi,
              chainId: sepolia.id,
              functionName: "getUserAccountData",
              args: [address],
            },
            {
              address: morpho.morpho,
              abi: morphoAbi,
              chainId: sepolia.id,
              functionName: "position",
              args: [morpho.marketId, address],
            },
            {
              // Borrow shares only price into assets against the market totals.
              address: morpho.morpho,
              abi: morphoAbi,
              chainId: sepolia.id,
              functionName: "market",
              args: [morpho.marketId],
            },
            {
              address: morpho.loanToken,
              abi: erc20Abi,
              chainId: sepolia.id,
              functionName: "symbol",
            },
            {
              address: morpho.loanToken,
              abi: erc20Abi,
              chainId: sepolia.id,
              functionName: "decimals",
            },
            {
              address: morpho.collateralToken,
              abi: erc20Abi,
              chainId: sepolia.id,
              functionName: "symbol",
            },
            {
              address: morpho.collateralToken,
              abi: erc20Abi,
              chainId: sepolia.id,
              functionName: "decimals",
            },
          ] as const)
        : undefined,
    query: { enabled },
  });

  const loans: CrossChainLoan[] = [];

  const account = data?.[0]?.result;
  if (account) {
    const [totalCollateralBase, totalDebtBase, , , , healthFactor] = account;
    loans.push({
      protocol: "Aave V3",
      // Aave reports the whole account in USD, not per reserve: the borrower may have
      // supplied LINK and borrowed USDC, and one figure covers both.
      debt: totalDebtBase,
      debtDecimals: AAVE_BASE_DECIMALS,
      debtSymbol: "USD",
      collateral: totalCollateralBase,
      collateralDecimals: AAVE_BASE_DECIMALS,
      collateralSymbol: "USD",
      healthFactor,
    });
  }

  const position = data?.[1]?.result;
  const market = data?.[2]?.result;
  if (position && market) {
    const [, borrowShares, collateral] = position;
    const [, , totalBorrowAssets, totalBorrowShares] = market;
    loans.push({
      protocol: "Morpho Blue",
      debt: morphoBorrowAssets(borrowShares, totalBorrowAssets, totalBorrowShares),
      debtDecimals: data?.[4]?.result ?? 18,
      debtSymbol: data?.[3]?.result ?? "",
      collateral,
      collateralDecimals: data?.[6]?.result ?? 18,
      collateralSymbol: data?.[5]?.result ?? "",
      // Morpho Blue exposes no health factor; solvency is checked against LLTV at borrow
      // time, and computing one here would need the market's own oracle price.
      healthFactor: null,
    });
  }

  return {
    loans,
    /** False when this deployment has no source protocols configured. */
    isConfigured: Boolean(aave) && Boolean(morpho),
    isLoading,
    refetch: (): void => {
      void refetch();
    },
  };
}
