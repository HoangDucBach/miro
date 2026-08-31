import { createConfig, http, type Config } from "wagmi";
import { injected } from "wagmi/connectors";
import { cc3Testnet, sepolia } from "./chains";

/**
 * Plain wagmi config, not RainbowKit (see the removed dependency's git history): its
 * default wallet list statically pulls in a connector whose dependency chain fails to
 * resolve under Next 16 + Turbopack SSR.
 *
 * Only `injected` (MetaMask/browser wallets) for now, not `walletConnect`: its connector
 * eagerly initializes an IndexedDB-backed store at construction time, which runs during
 * SSR too (Node has no IndexedDB) and throws an unhandled rejection on every request.
 * Injected covers the realistic demo/dev path (a browser wallet extension); revisit
 * WalletConnect once its connector is constructed lazily/client-only, or accept the noisy
 * SSR warning if mobile-wallet support becomes a real requirement.
 */
const connectors = [injected()];

export const wagmiConfig: Config = createConfig({
  chains: [sepolia, cc3Testnet],
  connectors,
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC),
    [cc3Testnet.id]: http(process.env.NEXT_PUBLIC_CC3_RPC),
  },
  ssr: true,
});
