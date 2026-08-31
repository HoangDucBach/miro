"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Minimal wallet connect/chain-switch UI built directly on wagmi's own hooks, not a UI
 * library -- see src/lib/wagmi.ts for why RainbowKit was dropped. Small enough that
 * hand-rolling it is less code and less risk than pulling in a replacement dependency.
 */
export function ConnectButton() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, chains } = useSwitchChain();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <select
          className="rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/20"
          value={chain?.id}
          onChange={(e) => switchChain({ chainId: Number(e.target.value) })}
        >
          {chains.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="tabular-nums">{shortAddress(address)}</span>
        <button type="button" onClick={() => disconnect()} className="underline underline-offset-4">
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {connectors.map((connector) => (
        <button
          key={connector.uid}
          type="button"
          disabled={isPending}
          onClick={() => connect({ connector })}
          className="rounded bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
        >
          {connector.name}
        </button>
      ))}
    </div>
  );
}
