"use client";

import { Button, Dropdown, Label, ListBox, Select } from "@heroui/react";
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

  // One button, not one per connector: a browser with six wallet extensions produced six
  // buttons in a row, which overflowed the topbar. A dropdown holds any number.
  return (
    <Dropdown>
      <Dropdown.Trigger>
        <Button isPending={isPending}>Connect wallet</Button>
      </Dropdown.Trigger>
      <Dropdown.Popover>
        <Dropdown.Menu
          onAction={(key) => {
            const connector = connectors.find((c) => c.uid === String(key));
            if (connector) connect({ connector });
          }}
        >
          {connectors.map((connector) => (
            <Dropdown.Item key={connector.uid} id={connector.uid} textValue={connector.name}>
              <Label>{connector.name}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
