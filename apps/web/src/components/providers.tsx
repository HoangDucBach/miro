"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider, type State } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";

/**
 * React context (wagmi's chain/account state, TanStack Query's cache) isn't supported in
 * Server Components, so this whole tree is a Client Component -- the one place that
 * boundary exists, rendered as deep as possible (just wrapping `children`) so the rest of
 * the app can still be server-rendered where it doesn't need wallet state.
 */
export function Providers({
  children,
  initialState,
}: {
  children: React.ReactNode;
  /** wagmi state parsed from the request cookie on the server; see app/layout.tsx. */
  initialState?: State;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Most of what this app shows changes underneath it without any action in the
            // app: the worker relays a repayment and the score moves; interest accrues on
            // Sepolia. Polling at roughly Sepolia's block time keeps every figure live
            // without a reload. Each useReadContracts is one multicall, so this is a
            // handful of requests per tick, not one per figure. The registry scan opts
            // out below; it is the one query that is genuinely expensive.
            refetchInterval: 15_000,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
