import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { ascContract, submitProof } from "./submitter.js";
import type { ProofData } from "./proof.js";

const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function fakeProof(): ProofData {
  return {
    chainKey: 1,
    headerNumber: 100,
    txIndex: 0,
    txHash: "0xsource",
    txBytes: "0xdeadbeef",
    merkleProof: { root: "0xroot", siblings: [] },
    continuityProof: { lowerEndpointDigest: "0xdigest", roots: [] },
    cached: false,
    generatedAt: new Date(),
  } as unknown as ProofData;
}

describe("ascContract", () => {
  it("wires up a Contract at the given address, signed by the worker key", () => {
    const cc = new JsonRpcProvider("https://example-cc3-rpc.test");
    const asc = ascContract(cc, "0x1111111111111111111111111111111111111111", TEST_PRIVATE_KEY);

    expect(asc).toBeInstanceOf(Contract);
    expect(asc.target).toBe("0x1111111111111111111111111111111111111111");
    const wallet = asc.runner as Wallet;
    expect(wallet.address).toBe(new Wallet(TEST_PRIVATE_KEY).address);
  });
});

describe("submitProof", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("submits with the proof's fields in the right positions and returns the receipt hash", async () => {
    const processStreamEvent = vi.fn().mockResolvedValue({
      wait: vi.fn().mockResolvedValue({ hash: "0xreceipt" }),
    });
    const asc = { processStreamEvent } as unknown as Contract;
    const proof = fakeProof();

    const result = await submitProof(asc, proof);

    expect(result).toBe("0xreceipt");
    expect(processStreamEvent).toHaveBeenCalledTimes(1);
    expect(processStreamEvent).toHaveBeenCalledWith(
      proof.chainKey,
      proof.headerNumber,
      proof.txBytes,
      proof.merkleProof.root,
      proof.merkleProof.siblings,
      proof.continuityProof.lowerEndpointDigest,
      proof.continuityProof.roots,
    );
  });

  it("returns already-processed immediately on a replay rejection, without retrying", async () => {
    const processStreamEvent = vi.fn().mockRejectedValue(new Error("already processed"));
    const asc = { processStreamEvent } as unknown as Contract;

    const result = await submitProof(asc, fakeProof());

    expect(result).toBe("already-processed");
    expect(processStreamEvent).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures and succeeds once the underlying call succeeds", async () => {
    const processStreamEvent = vi
      .fn()
      .mockRejectedValueOnce(new Error("network hiccup"))
      .mockRejectedValueOnce(new Error("network hiccup"))
      .mockResolvedValueOnce({ wait: vi.fn().mockResolvedValue({ hash: "0xok" }) });
    const asc = { processStreamEvent } as unknown as Contract;

    const promise = submitProof(asc, fakeProof());
    // Let the retry backoff timers run out without actually waiting in real time.
    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toBe("0xok");
    expect(processStreamEvent).toHaveBeenCalledTimes(3);
  });

  it("throws the last error after exhausting all retries", async () => {
    const processStreamEvent = vi.fn().mockRejectedValue(new Error("rpc down"));
    const asc = { processStreamEvent } as unknown as Contract;

    const promise = submitProof(asc, fakeProof());
    promise.catch(() => {}); // prevent unhandled rejection warning before the assertion below
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow("rpc down");
    expect(processStreamEvent).toHaveBeenCalledTimes(3);
  });
});
