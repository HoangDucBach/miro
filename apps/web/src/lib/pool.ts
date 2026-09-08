import { formatUnits } from "viem";

/**
 * PassportPool never exposes the USD value of a borrower's collateral, so nothing here can
 * ask for it. What it does expose is `creditLimit`, which the contract derives as
 * collateralValue * maxLtvBps / 10000. Every figure below is recovered from that identity
 * instead of from a price feed, which keeps this consistent with the contract by
 * construction -- if the pool re-prices collateral, these move with it.
 */

/**
 * Current loan-to-value, in basis points.
 *
 *   ltv = debt / collateralValue
 *       = debt / (creditLimit * 10000 / maxLtvBps)
 *   ltvBps = debt * maxLtvBps / creditLimit
 */
export function ltvBps(debt: bigint, creditLimit: bigint, maxLtvBps: bigint): bigint {
  if (creditLimit === 0n) return 0n;
  return (debt * maxLtvBps) / creditLimit;
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
  const grouped = Number(whole).toLocaleString("en-US");
  if (!fraction) return grouped;
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, "");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}
