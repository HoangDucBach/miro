import { defineChain } from "viem";
import { sepolia } from "viem/chains";

/**
 * Creditcoin CC3 Testnet. Not a built-in viem chain, so it's defined here once and reused
 * everywhere (wagmi config, chain-switch UI) instead of being re-declared per call site.
 * Chain ID verified live via `cast chain-id --rpc-url $CC3_RPC` (2026-08-28) -- never
 * assume it, the RPC endpoint's own numeric response is the only source of truth.
 */
export const cc3Testnet = defineChain({
  id: 102_031,
  name: "Creditcoin CC3 Testnet",
  nativeCurrency: { name: "Creditcoin", symbol: "CTC", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_CC3_RPC ?? "https://rpc.cc3-testnet.creditcoin.network"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://creditcoin-testnet.blockscout.com" },
  },
  testnet: true,
});

export { sepolia };
