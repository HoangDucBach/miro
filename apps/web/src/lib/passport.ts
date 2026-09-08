/**
 * Mirrors CreditPassport.scoreOf so the dashboard can explain a score instead of just
 * printing it. The parameters are read from the contract rather than restated here --
 * see usePassportDetail -- so a redeployed contract with different weights cannot leave
 * this quietly describing the old ones.
 */

export interface PassportRecord {
  firstSeenAt: bigint;
  cappedRepays: bigint;
  negativeEvents: bigint;
  sourceCount: bigint;
}

export interface ScoringParams {
  repayPoints: bigint;
  diversityPoints: bigint;
  agePeriod: bigint;
  agePointsPerPeriod: bigint;
  ageCapPeriods: bigint;
  negativePenalty: bigint;
}

export interface ScoreBreakdown {
  repay: bigint;
  diversity: bigint;
  age: bigint;
  penalty: bigint;
  /** agePeriods actually credited, after the cap -- shown so the row can explain itself. */
  agePeriods: bigint;
  /** Recomputed total. The headline figure stays the contract's own scoreOf; see below. */
  total: bigint;
}

export function scoreBreakdown(
  record: PassportRecord,
  params: ScoringParams,
  nowSeconds: bigint,
): ScoreBreakdown {
  // scoreOf short-circuits on an unseen borrower, so an empty passport must read as all
  // zeroes rather than accruing age from the epoch.
  if (record.firstSeenAt === 0n) {
    return { repay: 0n, diversity: 0n, age: 0n, penalty: 0n, agePeriods: 0n, total: 0n };
  }

  const repay = record.cappedRepays * params.repayPoints;
  const diversity =
    record.sourceCount > 1n ? (record.sourceCount - 1n) * params.diversityPoints : 0n;

  // nowSeconds is 0 until the block loads, and a chain reorg can briefly put it behind
  // firstSeenAt; either way a negative elapsed time must read as no age, not as a
  // negative bigint division.
  let agePeriods =
    params.agePeriod === 0n || nowSeconds <= record.firstSeenAt
      ? 0n
      : (nowSeconds - record.firstSeenAt) / params.agePeriod;
  if (agePeriods > params.ageCapPeriods) agePeriods = params.ageCapPeriods;
  const age = agePeriods * params.agePointsPerPeriod;

  const penalty = record.negativeEvents * params.negativePenalty;
  const positive = repay + diversity + age;

  // Floors at zero exactly as the contract does, rather than showing a negative score.
  return { repay, diversity, age, penalty, agePeriods, total: positive > penalty ? positive - penalty : 0n };
}

/** Formats a uint40 unix timestamp as a date, or null when the passport is unseen. */
export function firstSeenDate(firstSeenAt: bigint): Date | null {
  return firstSeenAt === 0n ? null : new Date(Number(firstSeenAt) * 1000);
}
