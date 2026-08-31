"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";

/**
 * React context (wagmi's chain/account state, TanStack Query's cache) isn't supported in
 * Server Components, so this whole tree is a Client Component -- the one place that
 * boundary exists, rendered as deep as possible (just wrapping `children`) so the rest of
 * the app can still be server-rendered where it doesn't need wallet state.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
