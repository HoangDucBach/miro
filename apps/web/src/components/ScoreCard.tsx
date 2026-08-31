"use client";

import { useAccount } from "wagmi";
import { usePassportScore } from "@/hooks/usePassportScore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ScoreCard() {
  const { isConnected } = useAccount();
  const { score, isLoading } = usePassportScore();

  if (!isConnected) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground">Connect a wallet to see your credit passport.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription>Credit passport score</CardDescription>
        <CardTitle className="text-4xl font-semibold tabular-nums">{isLoading ? "…" : score.toString()}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">
          Aggregate only — attested repayments across every registered source, not a per-source breakdown.
        </p>
      </CardContent>
    </Card>
  );
}
