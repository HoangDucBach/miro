"use client";

import { Avatar, Button, Tooltip } from "@heroui/react";
import { Logout2Icon } from "@solar-icons/react/linear/logout-2";
import { UserIcon } from "@solar-icons/react/linear/user";
import { useAccount, useDisconnect } from "wagmi";
import { usePassportScore } from "@/hooks/usePassportScore";
import { shortAddress } from "@/lib/address";

/**
 * Account block pinned to the foot of the rail. Disconnect lives here rather than in the
 * topbar, which now keeps only the network switcher -- two Disconnect buttons on screen at
 * once is the kind of thing that gets clicked by accident.
 */
export function SidebarProfile({ isCollapsed = false }: { isCollapsed?: boolean }) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { score, isLoading } = usePassportScore();

  // Connecting stays in the topbar, where it is visible without opening anything. Offering
  // it here too put two identical connect buttons on screen at once.
  if (!isConnected || !address) return null;

  // `color="accent"` alone only tints the icon: the solid accent ground exists solely
  // under .avatar--soft, and that is the muted --accent-soft, not the flat accent the
  // design uses. Styling the fallback directly is the pattern HeroUI's own docs show.
  const avatar = (
    <Avatar>
      <Avatar.Fallback className="bg-accent text-accent-foreground">
        <UserIcon />
      </Avatar.Fallback>
    </Avatar>
  );

  if (isCollapsed) {
    return (
      <div className="flex justify-center">
        <Tooltip delay={0}>
          <Tooltip.Trigger aria-label={`Connected as ${shortAddress(address)}`}>
            {avatar}
          </Tooltip.Trigger>
          <Tooltip.Content placement="right">{shortAddress(address)}</Tooltip.Content>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {avatar}

      {/* min-w-0 so the address truncates inside the rail instead of widening it. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm tabular-nums">{shortAddress(address)}</span>
          {/* Icon rather than a "Disconnect" label: the label cost ~95px of a 240px rail
           * and forced it wider, for the least-used control in the block. The tooltip
           * and aria-label carry the name the text used to. */}
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                aria-label="Disconnect wallet"
                size="sm"
                variant="ghost"
                onPress={() => disconnect()}
              >
                <Logout2Icon />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content placement="top">Disconnect</Tooltip.Content>
          </Tooltip>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted text-xs">Score</span>
          <span className="text-accent text-xs font-medium tabular-nums">
            {isLoading ? "…" : score.toString()}
          </span>
        </div>
      </div>
    </div>
  );
}
