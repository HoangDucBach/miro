"use client";

import { Button, Spinner, Tooltip } from "@heroui/react";
import { HandMoneyIcon } from "@solar-icons/react/linear/hand-money";
import { formatCooldown, useFaucet } from "@/hooks/useFaucet";
import { formatAmount } from "@/lib/pool";

/**
 * Testnet tUSDC on demand. Disabled rather than hidden during the cooldown, with the wait
 * in a tooltip: hiding it would look like the faucet had gone away, and leaving it live
 * would just produce a revert.
 */
export function FaucetButton() {
  const { claim, faucetAmount, isReady, secondsLeft, isPending, error } = useFaucet();

  // Until FAUCET_AMOUNT is read the value is 0, and "Get 0 tUSDC" states something false
  // about what the button does.
  const label = faucetAmount > 0n ? `Get ${formatAmount(faucetAmount, 6, 0)} tUSDC` : "Get test tUSDC";

  // viem errors carry a one-line `shortMessage` alongside a message that runs to hundreds
  // of characters of ABI and request dump -- unreadable in a tooltip. Fall back to a
  // trimmed message only when the short form is absent.
  const reason =
    error && "shortMessage" in error && typeof error.shortMessage === "string"
      ? error.shortMessage
      : error?.message.split("\n")[0].slice(0, 140);

  const help = reason ?? (isReady ? "Mints test tUSDC to your wallet" : `Next claim in ${formatCooldown(secondsLeft)}`);

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>
        <Button isDisabled={!isReady} isPending={isPending} size="sm" variant="outline" onPress={() => void claim()}>
          {isPending ? <Spinner color="current" size="sm" /> : <HandMoneyIcon className="size-4" />}
          {isPending ? "Claiming…" : label}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content placement="bottom" className="max-w-xs">
        {help}
      </Tooltip.Content>
    </Tooltip>
  );
}
