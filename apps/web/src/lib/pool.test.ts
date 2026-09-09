import { describe, expect, it } from "vitest";
import { borrowable, ltvBps, riskLevel, withdrawableCollateral } from "./pool";

describe("ltvBps", () => {
  it("is debt over the pool's valuation of collateral", () => {
    // $1,000 against $5,000 of collateral, both 6-decimal tUSDC units.
    expect(ltvBps(1_000_000_000n, 5_000_000_000n)).toBe(2_000n); // 20%
  });

  it("reads as zero rather than dividing by zero with no collateral", () => {
    expect(ltvBps(1_000_000_000n, 0n)).toBe(0n);
  });

  it("can exceed the cap after collateral is re-priced down", () => {
    // Nothing clamps this: an underwater position should show as underwater.
    expect(ltvBps(900n, 1_000n)).toBe(9_000n); // 90%, past the 75% ceiling
  });
});

describe("withdrawableCollateral", () => {
  it("frees the share of collateral the debt does not need", () => {
    // Debt is a quarter of the limit, so three quarters of collateral is free.
    expect(withdrawableCollateral(120n, 1_000n, 4_000n)).toBe(90n);
  });

  it("frees everything when there is no debt", () => {
    expect(withdrawableCollateral(120n, 0n, 4_000n)).toBe(120n);
  });

  it("frees nothing once debt has reached the limit", () => {
    expect(withdrawableCollateral(120n, 4_000n, 4_000n)).toBe(0n);
  });

  it("frees nothing while underwater, rather than going negative", () => {
    expect(withdrawableCollateral(120n, 5_000n, 4_000n)).toBe(0n);
  });

  it("is zero with no credit line, not a division by zero", () => {
    expect(withdrawableCollateral(120n, 0n, 0n)).toBe(0n);
  });
});

describe("borrowable", () => {
  it("is the headroom left on the line", () => {
    expect(borrowable(1_000n, 4_000n)).toBe(3_000n);
  });

  it("floors at zero when debt exceeds a re-priced limit", () => {
    expect(borrowable(5_000n, 4_000n)).toBe(0n);
  });
});

describe("riskLevel", () => {
  // Graded against the borrower's own cap, not an absolute LTV: the same 60% is
  // comfortable under a 90% cap and nearly liquidatable under a 65% one.
  it("calls 40% low under a 90% cap", () => {
    expect(riskLevel(4_000n, 9_000n)).toBe("Low"); // 44% of the cap
  });

  it("calls the same 40% medium under a 65% cap", () => {
    expect(riskLevel(4_000n, 6_500n)).toBe("Medium"); // 61% of the cap
  });

  it("calls it high once it is near the cap", () => {
    expect(riskLevel(6_000n, 6_500n)).toBe("High"); // 92% of the cap
  });

  it("treats an untouched line as low", () => {
    expect(riskLevel(0n, 7_500n)).toBe("Low");
  });

  it("does not divide by a zero cap", () => {
    expect(riskLevel(5_000n, 0n)).toBe("Low");
  });

  it("crosses to medium at half the cap and to high at four fifths", () => {
    expect(riskLevel(3_749n, 7_500n)).toBe("Low");
    expect(riskLevel(3_750n, 7_500n)).toBe("Medium");
    expect(riskLevel(5_999n, 7_500n)).toBe("Medium");
    expect(riskLevel(6_000n, 7_500n)).toBe("High");
  });
});
