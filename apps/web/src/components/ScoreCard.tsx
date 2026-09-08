"use client";

import { Card } from "@heroui/react";
import { useAccount } from "wagmi";
import { usePassportScore } from "@/hooks/usePassportScore";

export function ScoreCard() {
  const { isConnected } = useAccount();
  const { score, isLoading } = usePassportScore();

  if (!isConnected) {
    return (
      <Card>
        <Card.Header>
          <Card.Description>Connect a wallet to see your credit passport.</Card.Description>
        </Card.Header>
      </Card>
    );
  }

  return (
    // HeroUI's media-card shape: a tight outer padding wrapping a rounded block, with the
    // copy below it. `.card` ships p-4, which would leave the block floating in a wide
    // margin, so the padding is pulled in and the text gets its own instead.
    <Card className="max-w-sm gap-3 overflow-hidden p-2">
      {/* Stands in for a cover image. Brighter than the card ground on purpose, so it
       * reads as a banner rather than as more surface. */}
      <div
        aria-hidden
        className="from-accent via-accent/70 to-accent/25 h-28 w-full rounded-2xl bg-linear-to-br"
      />

      <Card.Header className="gap-1 px-2">
        <Card.Description>Credit passport score</Card.Description>
        <Card.Title className="text-5xl font-semibold tabular-nums">
          {isLoading ? "…" : score.toString()}
        </Card.Title>
      </Card.Header>

      <Card.Footer className="px-2 pb-1">
        <Card.Description>
          Aggregate only — attested repayments across every registered source, not a
          per-source breakdown.
        </Card.Description>
      </Card.Footer>
    </Card>
  );
}
