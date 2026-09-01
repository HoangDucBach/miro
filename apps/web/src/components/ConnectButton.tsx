"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectButton() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, chains } = useSwitchChain();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <Select
          value={chain ? String(chain.id) : undefined}
          onValueChange={(value) => switchChain({ chainId: Number(value) })}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="Network" />
          </SelectTrigger>
          <SelectContent>
            {chains.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm tabular-nums">{shortAddress(address)}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => disconnect()}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {connectors.map((connector) => (
        <Button key={connector.uid} type="button" disabled={isPending} onClick={() => connect({ connector })}>
          {connector.name}
        </Button>
      ))}
    </div>
  );
}
