import { erc20Abi } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { aavePoolAbi, morphoAbi } from "@/generated";
import { sepolia } from "@/lib/chains";
import { sourceProtocols } from "@/lib/contracts";
import { AAVE_BASE_DECIMALS, morphoBorrowAssets } from "@/lib/crosschain";

/** What closing a position costs, and whether the wallet can currently cover it. */
export interface RepayTerms {
  /** Debt in the loan asset's own units, interest included. */
  amount: bigint;
  decimals: number;
  symbol: string;
  /** The wallet's balance of that asset. */
  balance: bigint;
  /** Morpho burns shares, not assets; zero for Aave, which repays by amount. */
  shares: bigint;
  /** True where a public faucet can cover a shortfall (Aave's Sepolia faucet). */
  canTopUp: boolean;
}

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
  repay: RepayTerms;
};

/**
 * The borrower's live positions on the protocols the passport scores from. Both are the
 * real, unmodified deployments on Sepolia -- this reads them directly, so an open loan
 * shows up here whether or not it has been proven into the passport yet.
 *
 * It reads what repaying would cost as well as what is owed, because the dashboard repays
 * these loans too: Aave's debt comes from its rebasing variable debt token (whose
 * balanceOf is the debt, interest included) rather than from the USD account summary,
 * which cannot be handed to `repay`.
 *
 * Deliberately not gated on the wallet's current chain: someone looking at their Miro
 * position on CC3 still wants to see what they owe elsewhere. Both protocols are read as
 * one batch -- a conditionally-assembled contract list defeats wagmi's per-entry return
 * typing, and a deployment either has the source protocols configured or shows no panel.
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
              address: aave.variableDebtToken,
              abi: erc20Abi,
              chainId: sepolia.id,
              functionName: "balanceOf",
              args: [address],
            },
            {
              address: aave.reserveAsset,
              abi: erc20Abi,
              chainId: sepolia.id,
              functionName: "balanceOf",
              args: [address],
            },
            { address: aave.reserveAsset, abi: erc20Abi, chainId: sepolia.id, functionName: "symbol" },
            { address: aave.reserveAsset, abi: erc20Abi, chainId: sepolia.id, functionName: "decimals" },
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
              address: morpho.market.loanToken,
              abi: erc20Abi,
              chainId: sepolia.id,
              functionName: "symbol",
            },
            {
              address: morpho.market.loanToken,
              abi: erc20Abi,
              chainId: sepolia.id,
              functionName: "decimals",
            },
            {
              address: morpho.market.loanToken,
              abi: erc20Abi,
              chainId: sepolia.id,
              functionName: "balanceOf",
              args: [address],
            },
            {
              address: morpho.market.collateralToken,
              abi: erc20Abi,
              chainId: sepolia.id,
              functionName: "symbol",
            },
            {
              address: morpho.market.collateralToken,
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
  if (account && aave) {
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
      repay: {
        amount: data?.[1]?.result ?? 0n,
        decimals: data?.[4]?.result ?? 18,
        symbol: data?.[3]?.result ?? "",
        balance: data?.[2]?.result ?? 0n,
        shares: 0n,
        canTopUp: Boolean(aave.faucet),
      },
    });
  }

  const position = data?.[5]?.result;
  const market = data?.[6]?.result;
  if (position && market) {
    const [, borrowShares, collateral] = position;
    const [, , totalBorrowAssets, totalBorrowShares] = market;
    const owed = morphoBorrowAssets(borrowShares, totalBorrowAssets, totalBorrowShares);
    const loanDecimals = data?.[8]?.result ?? 18;
    const loanSymbol = data?.[7]?.result ?? "";
    loans.push({
      protocol: "Morpho Blue",
      debt: owed,
      debtDecimals: loanDecimals,
      debtSymbol: loanSymbol,
      collateral,
      collateralDecimals: data?.[11]?.result ?? 18,
      collateralSymbol: data?.[10]?.result ?? "",
      // Morpho Blue exposes no health factor; solvency is checked against LLTV at borrow
      // time, and computing one here would need the market's own oracle price.
      healthFactor: null,
      repay: {
        amount: owed,
        decimals: loanDecimals,
        symbol: loanSymbol,
        balance: data?.[9]?.result ?? 0n,
        shares: borrowShares,
        // The demo loan token mints only to its owner, so a short wallet cannot self-serve.
        canTopUp: false,
      },
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
