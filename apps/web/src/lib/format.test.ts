import { describe, expect, it } from "vitest";
import { formatPercent, formatToken, formatUsd, toDecimalString } from "./format";

describe("formatToken", () => {
  it("groups thousands", () => {
    expect(formatToken(1_234_567_000_000n, 6)).toBe("1,234,567");
  });

  it("drops trailing zeroes", () => {
    expect(formatToken(1_500_000n, 6)).toBe("1.5");
  });

  it("truncates rather than rounding up", () => {
    // dnum's own format rounds 27.9999 to 28. Showing a withdrawable ceiling as more than
    // it is invites a transaction that reverts for exceeding it.
    expect(formatToken(27_999_900n, 6, 2)).toBe("27.99");
    expect(formatToken(27_996_000n, 6, 2)).toBe("27.99");
  });

  it("shows dust as zero rather than inventing a digit", () => {
    expect(formatToken(1n, 18, 4)).toBe("0");
  });

  it("keeps whole parts past 2^53 exact", () => {
    const huge = 12_345_678_901_234_567_890n * 10n ** 18n;
    expect(formatToken(huge, 18, 0)).toBe("12,345,678,901,234,567,890");
  });

  it("truncates negatives toward zero, not away from it", () => {
    expect(formatToken(-1_999_000n, 6, 2)).toBe("-1.99");
  });
});

describe("formatUsd", () => {
  it("always pads to two places", () => {
    // "$10,000.7" reads as a typo; money has two decimals or none.
    expect(formatUsd(10_000_700_000n, 6)).toBe("$10,000.70");
    expect(formatUsd(10_000_000_000n, 6)).toBe("$10,000.00");
  });

  it("truncates the third place rather than rounding it up", () => {
    expect(formatUsd(1_999_900n, 6)).toBe("$1.99");
  });
});

describe("formatPercent", () => {
  it("renders whole percentages without a decimal", () => {
    expect(formatPercent(7_500n)).toBe("75%");
  });

  it("keeps fractional basis points", () => {
    expect(formatPercent(1_875n)).toBe("18.75%");
  });

  it("is zero for an untouched line", () => {
    expect(formatPercent(0n)).toBe("0%");
  });
});

describe("toDecimalString", () => {
  it("is ungrouped, so a field can parse its own value back", () => {
    expect(toDecimalString(1_234_567_000_000n, 6)).toBe("1234567");
  });

  it("keeps every decimal place the value carries", () => {
    expect(toDecimalString(1_000_000_000_000_000_001n, 18)).toBe("1.000000000000000001");
  });
});
