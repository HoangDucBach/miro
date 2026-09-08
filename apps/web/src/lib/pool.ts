import { formatUnits } from "viem";

/**
 * All of these read off values the pool computes itself, never a price feed of our own, so
 * a re-pricing of collateral moves them without any change here. `collateralValue` is
 * already denominated in the debt asset (the contract rescales it to debtDecimals), so it
 * divides against `debt` directly.
 */

/** Current loan-to-value, in basis points: debt over the pool's own valuation of collateral. */
export function ltvBps(debt: bigint, collateralValue: bigint): bigint {
  if (collateralValue === 0n) return 0n;
  return (debt * 10_000n) / collateralValue;
}

/**
 * Collateral that can be withdrawn while the remaining collateral still covers the debt.
 *
 * creditLimit scales linearly with collateral, so withdrawing `w` leaves a limit of
 * creditLimit * (collateral - w) / collateral. Requiring that to stay >= debt gives
 * w <= collateral * (creditLimit - debt) / creditLimit.
 */
export function withdrawableCollateral(
  collateral: bigint,
  debt: bigint,
  creditLimit: bigint,
): bigint {
  if (creditLimit === 0n || debt >= creditLimit) return 0n;
  return (collateral * (creditLimit - debt)) / creditLimit;
}

/** Headroom left on the credit line. Floored, since debt can exceed a re-priced limit. */
export function borrowable(debt: bigint, creditLimit: bigint): bigint {
  return debt >= creditLimit ? 0n : creditLimit - debt;
}

export type RiskLevel = "Low" | "Medium" | "High";

/**
 * Risk is expressed against the borrower's own cap, not an absolute LTV: a 60% LTV is
 * comfortable under a 90% cap and nearly liquidatable under a 65% one, and the cap moves
 * with the passport score.
 */
export function riskLevel(ltv: bigint, maxLtv: bigint): RiskLevel {
  if (maxLtv === 0n || ltv === 0n) return "Low";
  const usedPct = (ltv * 100n) / maxLtv;
  if (usedPct < 50n) return "Low";
  if (usedPct < 80n) return "Medium";
  return "High";
}

/** Basis points as a percentage string, e.g. 7500n -> "75%", 6250n -> "62.5%". */
export function formatBps(bps: bigint): string {
  const pct = Number(bps) / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}

/**
 * Token amounts are shown truncated, never rounded up: rounding 27.999 to 28 on a
 * "withdrawable" figure invites a transaction that reverts for exceeding it.
 */
export function formatAmount(value: bigint, decimals: number, maxFractionDigits = 4): string {
  const raw = formatUnits(value, decimals);
  const [whole, fraction] = raw.split(".");
  // Grouped on the digit string, not via Number(): an 18-decimal balance can have a whole
  // part past 2^53, where Number() would silently round it.
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (!fraction) return grouped;
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, "");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}
