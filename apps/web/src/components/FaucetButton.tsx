"use client";

import { Button, Spinner, Tooltip } from "@heroui/react";
import { HandMoneyIcon } from "@solar-icons/react/linear/hand-money";
import { formatCooldown, useFaucet } from "@/hooks/useFaucet";
import { errorText } from "@/lib/errors";
import { formatToken } from "@/lib/format";

/**
 * Testnet tUSDC on demand. Disabled rather than hidden during the cooldown, with the wait
 * in a tooltip: hiding it would look like the faucet had gone away, and leaving it live
 * would just produce a revert.
 */
export function FaucetButton() {
  const { claim, faucetAmount, isReady, secondsLeft, isPending, error } = useFaucet();

  // Until FAUCET_AMOUNT is read the value is 0, and "Get 0 tUSDC" states something false
  // about what the button does.
  const label = faucetAmount > 0n ? `Get ${formatToken(faucetAmount, 6, 0)} tUSDC` : "Get test tUSDC";

  const reason = errorText(error);

  const help = reason ?? (isReady ? "Mints test tUSDC to your wallet" : `Next claim in ${formatCooldown(secondsLeft)}`);

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>
        {/* Declining in the wallet rejects this promise. Left uncaught it becomes an
            unhandled rejection, and Next's dev overlay throws an error page over the app
            for what is simply the user changing their mind. The reason still reaches the
            tooltip through the hook's own error state. */}
        <Button
          isDisabled={!isReady}
          isPending={isPending}
          size="sm"
          variant="outline"
          onPress={() => {
            claim().catch(() => {});
          }}
        >
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
