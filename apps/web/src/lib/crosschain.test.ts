import { describe, expect, it } from "vitest";
import { formatHealthFactor, healthLevel, morphoBorrowAssets } from "./crosschain";

const WAD = 10n ** 18n;

describe("morphoBorrowAssets", () => {
  it("is zero for a borrower with no shares", () => {
    expect(morphoBorrowAssets(0n, 1_000n * WAD, 1_000n * WAD * 1_000_000n)).toBe(0n);
  });

  it("reverses the share price of a fresh market one-for-one", () => {
    // A market's first borrow mints shares at exactly VIRTUAL_SHARES per asset, so the
    // round trip must return the borrowed amount, not one wei less.
    const assets = 1_000n * WAD;
    const shares = assets * 1_000_000n;
    expect(morphoBorrowAssets(shares, assets, shares)).toBe(assets);
  });

  it("rounds up, so a debt is never understated", () => {
    // 1 share against a market where shares are worth slightly more than 1/1e6 asset.
    const totalAssets = 3n;
    const totalShares = 2_000_000n;
    // exact value is 1 * 4 / 3_000_000 -> 0.0000013, which must not floor to zero
    expect(morphoBorrowAssets(1n, totalAssets, totalShares)).toBe(1n);
  });

  it("tracks interest accrual: the same shares are worth more as the market grows", () => {
    const shares = 1_000n * WAD * 1_000_000n;
    const before = morphoBorrowAssets(shares, 1_000n * WAD, shares);
    const after = morphoBorrowAssets(shares, 1_050n * WAD, shares);
    expect(after).toBeGreaterThan(before);
  });
});

describe("formatHealthFactor", () => {
  it("renders a real ratio to two places", () => {
    expect(formatHealthFactor((165n * WAD) / 100n)).toBe("1.65");
    expect(formatHealthFactor(2n * WAD)).toBe("2.00");
  });

  it("returns null for Aave's no-debt sentinel rather than 78 digits", () => {
    expect(formatHealthFactor(2n ** 256n - 1n)).toBeNull();
  });
});

describe("healthLevel", () => {
  it("grades against Aave's liquidation threshold of 1.0", () => {
    expect(healthLevel(3n * WAD)).toBe("Safe");
    expect(healthLevel((120n * WAD) / 100n)).toBe("Watch");
    expect(healthLevel((105n * WAD) / 100n)).toBe("At risk");
  });
});
