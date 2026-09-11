import { describe, expect, it, vi } from "vitest";
import { LogScanner, type LogSource, type ScanTarget } from "./scanner.js";

const AAVE: ScanTarget = { label: "Aave Repay", address: "0xAAAA", topic0: "0xa1" };
const MORPHO: ScanTarget = { label: "Morpho Repay", address: "0xBBBB", topic0: "0xb1" };

function memoryStore(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    get: vi.fn(async (k: string) => m.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => void m.set(k, v)),
    map: m,
  };
}

function source(head: number, logs: Awaited<ReturnType<LogSource["getLogs"]>> = []) {
  return {
    getBlockNumber: vi.fn(async () => head),
    getLogs: vi.fn(async () => logs),
  };
}

describe("LogScanner", () => {
  it("starts at the safe head on a first run, so history is not replayed", async () => {
    const src = source(1_000);
    const scanner = new LogScanner(src, memoryStore(), [AAVE], { confirmations: 2 });

    expect(await scanner.tick()).toEqual([]);
    expect(scanner.position).toBe(998);
    expect(src.getLogs).not.toHaveBeenCalled();
  });

  it("resumes from the persisted cursor after a restart", async () => {
    const src = source(1_000);
    const store = memoryStore({ "scanner:cursor": "900" });
    const scanner = new LogScanner(src, store, [AAVE], { confirmations: 2 });

    await scanner.tick();

    // The block after the cursor through the safe head, in one request.
    expect(src.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({ fromBlock: 901, toBlock: 998 }),
    );
    expect(store.map.get("scanner:cursor")).toBe("998");
  });

  it("looks back on a first run when asked, for a worker deployed after its sources", async () => {
    const src = source(1_000);
    const scanner = new LogScanner(src, memoryStore(), [AAVE], { confirmations: 2, initialLookback: 50 });

    await scanner.tick();

    expect(src.getLogs).toHaveBeenCalledWith(expect.objectContaining({ fromBlock: 949, toBlock: 998 }));
  });

  it("asks for every target in one request and attributes each log to its own", async () => {
    const src = source(1_000, [
      { address: "0xaaaa", topics: ["0xa1"], transactionHash: "0x1", blockNumber: 950 },
      { address: "0xbbbb", topics: ["0xb1"], transactionHash: "0x2", blockNumber: 951 },
      // Right address, wrong event: the batched filter is OR over both lists, so this
      // would come back from the node and must be dropped here.
      { address: "0xaaaa", topics: ["0xb1"], transactionHash: "0x3", blockNumber: 952 },
    ]);
    const scanner = new LogScanner(src, memoryStore({ "scanner:cursor": "900" }), [AAVE, MORPHO]);

    const found = await scanner.tick();

    expect(src.getLogs).toHaveBeenCalledTimes(1);
    expect(src.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({ address: ["0xAAAA", "0xBBBB"], topics: [["0xa1", "0xb1"]] }),
    );
    expect(found.map((f) => [f.target.label, f.txHash])).toEqual([
      ["Aave Repay", "0x1"],
      ["Morpho Repay", "0x2"],
    ]);
  });

  it("walks a long gap one span at a time rather than one oversized request", async () => {
    const src = source(10_000);
    const scanner = new LogScanner(src, memoryStore({ "scanner:cursor": "1000" }), [AAVE], {
      confirmations: 0,
      maxSpan: 2_000,
    });

    await scanner.tick();
    expect(src.getLogs).toHaveBeenLastCalledWith(expect.objectContaining({ fromBlock: 1_001, toBlock: 3_000 }));
    await scanner.tick();
    expect(src.getLogs).toHaveBeenLastCalledWith(expect.objectContaining({ fromBlock: 3_001, toBlock: 5_000 }));
    expect(scanner.position).toBe(5_000);
  });

  it("leaves the cursor alone when the RPC fails, so the range is re-asked", async () => {
    const src = source(1_000);
    src.getLogs.mockRejectedValueOnce(new Error("response too large"));
    const store = memoryStore({ "scanner:cursor": "900" });
    const scanner = new LogScanner(src, store, [AAVE]);

    await expect(scanner.tick()).rejects.toThrow("response too large");
    expect(store.map.get("scanner:cursor")).toBe("900");

    await scanner.tick();
    expect(src.getLogs).toHaveBeenLastCalledWith(expect.objectContaining({ fromBlock: 901 }));
  });

  it("does nothing while the head has not moved past the confirmation lag", async () => {
    const src = source(1_000);
    const scanner = new LogScanner(src, memoryStore({ "scanner:cursor": "998" }), [AAVE], { confirmations: 2 });

    expect(await scanner.tick()).toEqual([]);
    expect(src.getLogs).not.toHaveBeenCalled();
  });
});
