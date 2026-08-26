import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { JsonRpcProvider } from "ethers";
import type { chainInfo } from "@gluwa/usc-sdk";
import { creditcoinProvider, makeChainInfoProvider, resolveSourceChainKey, sourceProvider, SEPOLIA_EVM_CHAIN_ID } from "./chain.js";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("sourceProvider", () => {
  it("throws when SEPOLIA_RPC is missing", () => {
    delete process.env.SEPOLIA_RPC;
    expect(() => sourceProvider()).toThrow("missing required env var: SEPOLIA_RPC");
  });

  it("builds a provider from SEPOLIA_RPC when set", () => {
    process.env.SEPOLIA_RPC = "https://example-sepolia-rpc.test";
    const provider = sourceProvider();
    expect(provider).toBeInstanceOf(JsonRpcProvider);
  });
});

describe("creditcoinProvider", () => {
  it("falls back to the public CC3 testnet RPC when CC3_RPC is unset", () => {
    delete process.env.CC3_RPC;
    const provider = creditcoinProvider();
    expect(provider).toBeInstanceOf(JsonRpcProvider);
    expect(provider._getConnection().url).toBe("https://rpc.cc3-testnet.creditcoin.network");
  });

  it("uses CC3_RPC when set", () => {
    process.env.CC3_RPC = "https://example-cc3-rpc.test";
    const provider = creditcoinProvider();
    expect(provider._getConnection().url).toBe("https://example-cc3-rpc.test");
  });
});

describe("makeChainInfoProvider", () => {
  it("wraps the given provider", () => {
    const cc = new JsonRpcProvider("https://example-cc3-rpc.test");
    const info = makeChainInfoProvider(cc);
    expect(info).toBeDefined();
    expect(typeof info.getSupportedChains).toBe("function");
  });
});

describe("resolveSourceChainKey", () => {
  function mockInfo(chains: chainInfo.ChainInfo[]): chainInfo.ChainInfoProvider {
    return {
      getSupportedChains: vi.fn().mockResolvedValue(chains),
    } as unknown as chainInfo.ChainInfoProvider;
  }

  it("finds Sepolia by EVM chainId, not chainKey", async () => {
    const info = mockInfo([
      { chainKey: 3, chainId: 1, chainName: "0xEthereum", chainEncoding: 1 },
      { chainKey: 1, chainId: SEPOLIA_EVM_CHAIN_ID, chainName: "0xSepolia", chainEncoding: 1 },
    ]);

    const sepolia = await resolveSourceChainKey(info);
    expect(sepolia.chainKey).toBe(1);
    expect(sepolia.chainId).toBe(SEPOLIA_EVM_CHAIN_ID);
  });

  it("throws when Sepolia is not in the supported chains list", async () => {
    const info = mockInfo([{ chainKey: 3, chainId: 1, chainName: "0xEthereum", chainEncoding: 1 }]);

    await expect(resolveSourceChainKey(info)).rejects.toThrow("Sepolia not found in supported chains");
  });

  it("does not confuse chainKey with chainId when both happen to collide", async () => {
    // A chain whose chainKey equals SEPOLIA_EVM_CHAIN_ID but chainId does not must be ignored.
    const info = mockInfo([{ chainKey: SEPOLIA_EVM_CHAIN_ID, chainId: 999, chainName: "0xDecoy", chainEncoding: 1 }]);

    await expect(resolveSourceChainKey(info)).rejects.toThrow("Sepolia not found in supported chains");
  });
});
