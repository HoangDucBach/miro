"use client";

import { Card } from "@heroui/react";
import { formatUnits } from "viem";
import { usePassportPoolPosition } from "@/hooks/usePassportPoolPosition";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted text-xs">{label}</p>
      <p className="text-lg font-medium tabular-nums">{value}</p>
    </div>
  );
}

export function PoolPositionCard() {
  const { collateral, debt, creditLimit, maxLtvBps, isLoading } = usePassportPoolPosition();

  if (isLoading) {
    return (
      <Card>
        <Card.Header>
          <Card.Description>Loading position…</Card.Description>
        </Card.Header>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Collateral (tCTC)" value={formatUnits(collateral, 18)} />
        <Stat label="Debt (tUSDC)" value={formatUnits(debt, 6)} />
        <Stat label="Credit limit (tUSDC)" value={formatUnits(creditLimit, 6)} />
        <Stat label="Max LTV" value={`${(Number(maxLtvBps) / 100).toFixed(0)}%`} />
      </Card.Header>
    </Card>
  );
}
