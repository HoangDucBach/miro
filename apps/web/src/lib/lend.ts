/**
 * PassportPool's LP side keeps no share tokens. `lpDeposits` is plain principal
 * bookkeeping, and withdrawLP pays out pro-rata against whatever tUSDC the pool actually
 * holds at that moment:
 *
 *   payout = amount * usdc.balanceOf(pool) / totalLPDeposits
 *
 * Everything below mirrors that expression rather than assuming a deposit is worth what
 * was put in. Two consequences worth showing a lender plainly:
 *
 *   - Repayments carry 5% interest into the pool balance, so the balance can exceed total
 *     principal and a withdrawal returns more than it deposited.
 *   - Outstanding loans leave the pool holding less than total principal, so withdrawing
 *     while utilisation is high returns less. The shortfall is not lost, it is lent out --
 *     but it is borne by whoever withdraws first, not shared.
 */

/** What withdrawing the full deposit would pay right now, by the contract's own formula. */
export function redeemableValue(
  lpDeposit: bigint,
  totalDeposits: bigint,
  poolBalance: bigint,
): bigint {
  if (totalDeposits === 0n) return 0n;
  return (lpDeposit * poolBalance) / totalDeposits;
}

/**
 * Principal currently lent out, i.e. what the pool owes itself. Floors at zero: once
 * interest lands the balance exceeds principal, and that surplus is yield, not negative
 * utilisation.
 */
export function lentOut(totalDeposits: bigint, poolBalance: bigint): bigint {
  return poolBalance >= totalDeposits ? 0n : totalDeposits - poolBalance;
}

/** Share of deposited principal currently out on loan, in basis points. */
export function utilisationBps(totalDeposits: bigint, poolBalance: bigint): bigint {
  if (totalDeposits === 0n) return 0n;
  return (lentOut(totalDeposits, poolBalance) * 10_000n) / totalDeposits;
}
