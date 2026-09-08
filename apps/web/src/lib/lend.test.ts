import { describe, expect, it } from "vitest";
import { lentOut, redeemableValue, utilisationBps } from "./lend";

describe("redeemableValue", () => {
  it("is the deposit's pro-rata share of what the pool actually holds", () => {
    // $5,000 of $20,000 principal, against a $13,000 balance.
    expect(redeemableValue(5_000n, 20_000n, 13_000n)).toBe(3_250n);
  });

  it("exceeds principal once repaid interest has landed", () => {
    // The pool holding more than total principal is yield, and a lender should see it.
    expect(redeemableValue(5_000n, 20_000n, 22_000n)).toBe(5_500n);
  });

  it("is zero before anyone has deposited, not a division by zero", () => {
    expect(redeemableValue(0n, 0n, 0n)).toBe(0n);
  });
});

describe("lentOut", () => {
  it("is the principal the pool is not currently holding", () => {
    expect(lentOut(20_000n, 13_000n)).toBe(7_000n);
  });

  it("is zero when the balance exceeds principal", () => {
    // That surplus is interest, not negative utilisation.
    expect(lentOut(20_000n, 22_000n)).toBe(0n);
  });
});

describe("utilisationBps", () => {
  it("is the share of principal out on loan", () => {
    expect(utilisationBps(20_000n, 13_000n)).toBe(3_500n); // 35%
  });

  it("is zero on an empty pool", () => {
    expect(utilisationBps(0n, 0n)).toBe(0n);
  });

  it("is fully drawn when the pool holds nothing", () => {
    expect(utilisationBps(20_000n, 0n)).toBe(10_000n);
  });
});
