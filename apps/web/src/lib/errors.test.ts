import { describe, expect, it } from "vitest";
import { errorText } from "./errors";

describe("errorText", () => {
  it("is null when there is no error", () => {
    expect(errorText(null)).toBeNull();
    expect(errorText(undefined)).toBeNull();
  });

  it("prefers viem's one-line shortMessage over the full dump", () => {
    // A viem BaseError's `message` carries the request body, ABI and a version footer;
    // only `shortMessage` is written for a person to read.
    const err = Object.assign(new Error("User rejected the request.\n\nRequest Arguments:\n  from: 0x…\n\nVersion: viem@2.56.0"), {
      shortMessage: "User rejected the request.",
    });
    expect(errorText(err)).toBe("User rejected the request.");
  });

  it("falls back to the first line, capped, when there is no short form", () => {
    const err = new Error(`${"x".repeat(400)}\nsecond line`);
    const text = errorText(err);
    expect(text).toHaveLength(160);
    expect(text).not.toContain("second line");
  });

  it("passes a plain string through", () => {
    expect(errorText("Nothing to withdraw")).toBe("Nothing to withdraw");
  });

  it("does not crash on a non-Error throw", () => {
    expect(errorText({ nope: true })).toBe("Something went wrong.");
  });
});
