import * as dn from "dnum";

/**
 * Display formatting for on-chain amounts, built on dnum so the arithmetic stays on the
 * bigint/decimals pair the chain actually returns -- never a float.
 *
 * Everything here truncates. dnum's own `format` rounds, and rounding an amount *up* is
 * not a cosmetic choice: showing "Withdrawable 28" when 27.999 is withdrawable invites a
 * transaction that reverts for exceeding it. Truncation can only ever understate.
 */

/** Drops digits below `digits` places, toward zero, keeping the value's own decimals. */
function truncate(value: bigint, decimals: number, digits: number): dn.Dnum {
  if (digits >= decimals) return [value, decimals];
  const factor = 10n ** BigInt(decimals - digits);
  // BigInt division truncates toward zero already; negating first keeps that true for
  // negatives rather than flooring them away from zero.
  const quotient = value < 0n ? -(-value / factor) : value / factor;
  return [quotient * factor, decimals];
}

/**
 * A token amount: grouped thousands, trailing zeroes dropped. `1.5 tCTC`, not `1.50`.
 * Four places by default -- enough to see dust without printing eighteen digits.
 */
export function formatToken(value: bigint, decimals: number, digits = 4): string {
  return dn.format(truncate(value, decimals, digits), { digits });
}

/**
 * A currency amount: always two places, padded. `$10,000.70`, never `$10,000.7`, because
 * a price with one decimal reads as a typo rather than a number.
 */
export function formatUsd(value: bigint, decimals: number): string {
  return `$${dn.format(truncate(value, decimals, 2), { digits: 2, trailingZeros: true })}`;
}

/** Basis points as a percentage: 7500n -> "75%", 1875n -> "18.75%". */
export function formatPercent(bps: bigint): string {
  return `${dn.format([bps, 2], { digits: 2 })}%`;
}

/**
 * The exact decimal string for an amount, for prefilling an input. Not grouped -- a field
 * that has to parse its own value back cannot have separators in it.
 */
export function toDecimalString(value: bigint, decimals: number): string {
  return dn.toString([value, decimals]);
}
