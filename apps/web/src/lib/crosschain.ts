/**
 * Maths for reading a borrower's *existing* loans on the source protocols Miro scores
 * from -- Aave V3 and Morpho Blue, both on Sepolia, both unmodified.
 *
 * These are the same positions the worker proves into the passport. Showing them next to
 * the Miro pool is the point of the product: the passport is only interesting if you can
 * see the history it was built from, including debt that is still open.
 */

/** Aave prices every `getUserAccountData` figure in USD with 8 decimals, not in the asset. */
export const AAVE_BASE_DECIMALS = 8;

/** Aave and Morpho both carry health factors and LLTV as 1e18 fixed point. */
const WAD = 10n ** 18n;

/** Morpho SharesMathLib. Virtual shares keep an empty market from being drained by rounding. */
const VIRTUAL_SHARES = 1_000_000n;
const VIRTUAL_ASSETS = 1n;

/**
 * Converts Morpho borrow *shares* back into loan-token assets, rounding up exactly as
 * `SharesMathLib.toAssetsUp` does -- a debt shown rounded down would understate what the
 * borrower actually owes.
 */
export function morphoBorrowAssets(
  borrowShares: bigint,
  totalBorrowAssets: bigint,
  totalBorrowShares: bigint,
): bigint {
  if (borrowShares === 0n) return 0n;
  const y = totalBorrowAssets + VIRTUAL_ASSETS;
  const d = totalBorrowShares + VIRTUAL_SHARES;
  return (borrowShares * y + (d - 1n)) / d;
}

/**
 * Health factor as a display string. Aave returns `type(uint256).max` when there is no
 * debt at all, which would otherwise print as a 78-digit number; that case is `null`, for
 * a caller to render as a dash.
 */
export function formatHealthFactor(healthFactor: bigint): string | null {
  // Anything at this magnitude is the sentinel, not a real ratio: a genuine health factor
  // above a million would mean dust debt against a fortune in collateral.
  if (healthFactor >= 1_000_000n * WAD) return null;
  const whole = healthFactor / WAD;
  const hundredths = ((healthFactor % WAD) * 100n) / WAD;
  return `${whole}.${hundredths.toString().padStart(2, "0")}`;
}

/** Below this a position is at liquidation risk; Aave liquidates under 1.0. */
export function healthLevel(healthFactor: bigint): "Safe" | "Watch" | "At risk" {
  if (healthFactor >= 15n * (WAD / 10n)) return "Safe";
  if (healthFactor >= 11n * (WAD / 10n)) return "Watch";
  return "At risk";
}
