"use client";

import { formatUnits } from "viem";
import { usePassportPoolPosition } from "@/hooks/usePassportPoolPosition";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-black/50 dark:text-white/50">{label}</p>
      <p className="text-lg font-medium tabular-nums">{value}</p>
    </div>
  );
}

export function PoolPositionCard() {
  const { collateral, debt, creditLimit, maxLtvBps, isLoading } = usePassportPoolPosition();

  if (isLoading) {
    return <div className="rounded-lg border border-black/10 p-6 dark:border-white/15">Loading position…</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 rounded-lg border border-black/10 p-6 sm:grid-cols-4 dark:border-white/15">
      <Stat label="Collateral (tCTC)" value={formatUnits(collateral, 18)} />
      <Stat label="Debt (tUSDC)" value={formatUnits(debt, 6)} />
      <Stat label="Credit limit (tUSDC)" value={formatUnits(creditLimit, 6)} />
      <Stat label="Max LTV" value={`${(Number(maxLtvBps) / 100).toFixed(0)}%`} />
    </div>
  );
}
