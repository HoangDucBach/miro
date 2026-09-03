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
    <Card>
      <Card.Header>
        <Card.Description>Credit passport score</Card.Description>
        <Card.Title className="text-4xl font-semibold tabular-nums">
          {isLoading ? "…" : score.toString()}
        </Card.Title>
        <Card.Description>
          Aggregate only — attested repayments across every registered source, not a per-source breakdown.
        </Card.Description>
      </Card.Header>
    </Card>
  );
}
