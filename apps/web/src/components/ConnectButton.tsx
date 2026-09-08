"use client";

import { Button, Label, ListBox, Select } from "@heroui/react";
import { useAccount, useConnect, useSwitchChain } from "wagmi";
import { shortAddress } from "@/lib/address";

/**
 * Minimal wallet connect/chain-switch UI built directly on wagmi's own hooks, not a
 * wallet-UI library -- see src/lib/wagmi.ts for why RainbowKit was dropped. Small enough
 * that hand-rolling it is less code and less risk than pulling in a replacement.
 */
export function ConnectButton() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { switchChain, chains } = useSwitchChain();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <Select
          aria-label="Network"
          className="w-44"
          value={chain ? String(chain.id) : null}
          onChange={(value) => value && switchChain({ chainId: Number(value) })}
        >
          <Label className="sr-only">Network</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {chains.map((c) => (
                <ListBox.Item key={c.id} id={String(c.id)} textValue={c.name}>
                  {c.name}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <span className="text-sm tabular-nums">{shortAddress(address)}</span>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {connectors.map((connector) => (
        <Button key={connector.uid} isPending={isPending} onPress={() => connect({ connector })}>
          {connector.name}
        </Button>
      ))}
    </div>
  );
}
