import { describe, expect, it } from "vitest";
import { firstSeenDate, scoreBreakdown, type PassportRecord, type ScoringParams } from "./passport";

/** The deployed CreditPassport's constants, so these cases mirror the real contract. */
const PARAMS: ScoringParams = {
  repayPoints: 10n,
  diversityPoints: 20n,
  agePeriod: 2_592_000n, // 30 days
  agePointsPerPeriod: 5n,
  ageCapPeriods: 6n,
  negativePenalty: 50n,
};

const DAY = 86_400n;
const NOW = 1_800_000_000n;

function record(over: Partial<PassportRecord> = {}): PassportRecord {
  return {
    firstSeenAt: NOW - 95n * DAY,
    cappedRepays: 3n,
    negativeEvents: 0n,
    sourceCount: 2n,
    ...over,
  };
}

describe("scoreBreakdown", () => {
  it("adds repayments, diversity and age", () => {
    const b = scoreBreakdown(record(), PARAMS, NOW);
    expect(b.repay).toBe(30n); // 3 x 10
    expect(b.diversity).toBe(20n); // (2 - 1) x 20
    expect(b.agePeriods).toBe(3n); // 95 days / 30
    expect(b.age).toBe(15n); // 3 x 5
    expect(b.total).toBe(65n);
  });

  it("pays no diversity for a single source", () => {
    expect(scoreBreakdown(record({ sourceCount: 1n }), PARAMS, NOW).diversity).toBe(0n);
  });

  it("stops crediting age at the cap", () => {
    // Ten years in; the contract clamps to AGE_CAP_PERIODS.
    const b = scoreBreakdown(record({ firstSeenAt: NOW - 3_650n * DAY }), PARAMS, NOW);
    expect(b.agePeriods).toBe(PARAMS.ageCapPeriods);
    expect(b.age).toBe(30n); // 6 x 5
  });

  it("subtracts negative events", () => {
    const b = scoreBreakdown(record({ negativeEvents: 1n }), PARAMS, NOW);
    expect(b.penalty).toBe(50n);
    expect(b.total).toBe(15n); // 65 - 50
  });

  it("floors at zero rather than showing a negative score", () => {
    // The contract returns 0 when the penalty outweighs everything, and so must this.
    const b = scoreBreakdown(record({ negativeEvents: 5n }), PARAMS, NOW);
    expect(b.penalty).toBe(250n);
    expect(b.total).toBe(0n);
  });

  it("reads an unseen passport as all zeroes", () => {
    // scoreOf short-circuits on firstSeenAt == 0; without the same guard the age term
    // would accrue from the unix epoch and invent a score for someone with no history.
    const b = scoreBreakdown(record({ firstSeenAt: 0n }), PARAMS, NOW);
    expect(b).toEqual({ repay: 0n, diversity: 0n, age: 0n, penalty: 0n, agePeriods: 0n, total: 0n });
  });

  it("credits no age before the chain timestamp has loaded", () => {
    // nowSeconds is 0 until useBlock resolves; a negative elapsed time must read as no
    // age, not as a negative bigint division.
    expect(scoreBreakdown(record(), PARAMS, 0n).age).toBe(0n);
  });

  it("credits no age when the timestamp sits at or behind first sight", () => {
    const r = record();
    expect(scoreBreakdown(r, PARAMS, r.firstSeenAt).age).toBe(0n);
  });
});

describe("firstSeenDate", () => {
  it("is null for an unseen passport", () => {
    expect(firstSeenDate(0n)).toBeNull();
  });

  it("converts uint40 seconds to a date", () => {
    expect(firstSeenDate(1_700_000_000n)?.toISOString()).toBe("2023-11-14T22:13:20.000Z");
  });
});
