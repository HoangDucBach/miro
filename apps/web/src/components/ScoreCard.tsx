"use client";

import { useAccount } from "wagmi";
import { usePassportScore } from "@/hooks/usePassportScore";

export function ScoreCard() {
  const { isConnected } = useAccount();
  const { score, isLoading } = usePassportScore();

  if (!isConnected) {
    return (
      <div className="rounded-lg border border-black/10 p-6 dark:border-white/15">
        <p className="text-sm text-black/60 dark:text-white/60">Connect a wallet to see your credit passport.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-black/10 p-6 dark:border-white/15">
      <p className="text-sm text-black/60 dark:text-white/60">Credit passport score</p>
      <p className="mt-1 text-4xl font-semibold tabular-nums">{isLoading ? "…" : score.toString()}</p>
      <p className="mt-3 text-xs text-black/50 dark:text-white/50">
        Aggregate only — attested repayments across every registered source, not a per-source breakdown.
      </p>
    </div>
  );
}
