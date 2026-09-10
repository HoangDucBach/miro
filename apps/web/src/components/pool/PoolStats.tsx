"use client";

import { Card, Meter, Separator } from "@heroui/react";
import { Loadable } from "@/components/ui/Loadable";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { usePoolStats } from "@/hooks/usePoolStats";
import { formatPercent, formatToken, formatUsd } from "@/lib/format";
import { lentOut, utilisationBps } from "@/lib/lend";

const DEBT_DECIMALS = 6; // tUSDC
const COLLATERAL_DECIMALS = 18; // tCTC

function Figure({
  label,
  value,
  hint,
  isLoading,
}: {
  label: string;
  value: string;
  hint?: string;
  isLoading: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-muted text-xs">{label}</p>
      <Loadable className="h-7 w-24 rounded" isLoading={isLoading}>
        <p className="text-xl font-medium tabular-nums">{value}</p>
      </Loadable>
      {hint ? <p className="text-muted text-xs">{hint}</p> : null}
    </div>
  );
}

/**
 * The market as a whole, above the connected wallet's own position -- the figures every
 * lending protocol leads with, so the pool reads as a market rather than as one person's
 * balance sheet. Renders without a wallet: none of it is account-scoped.
 */
export function PoolStats() {
  const { totalDeposits, poolBalance, interestBps, baseLtvBps, totalCollateral, isLoading } =
    usePoolStats();

  const borrowed = lentOut(totalDeposits, poolBalance);
  const utilisation = utilisationBps(totalDeposits, poolBalance);
  // Interest lands in the pool balance, so anything held above total principal is yield
  // already earned by lenders rather than idle liquidity.
  const yieldEarned = poolBalance > totalDeposits ? poolBalance - totalDeposits : 0n;

  return (
    <Card className="border-default shadow-panel border border-solid" variant="transparent">
      <Card.Header className="flex w-full flex-row flex-wrap items-end justify-between gap-4">
        <div>
          <Card.Title>Pool status</Card.Title>
          <Card.Description>tUSDC market on Creditcoin CC3 Testnet.</Card.Description>
        </div>
        <div className="text-right">
          <Loadable className="h-9 w-32 rounded-xl" isLoading={isLoading}>
            <p className="text-3xl font-semibold tabular-nums">
              {formatUsd(poolBalance, DEBT_DECIMALS)}
            </p>
          </Loadable>
          <p className="text-muted mt-1 text-sm">Available liquidity</p>
        </div>
      </Card.Header>

      <Separator />

      <Card.Content className="flex flex-col gap-5">
        <Stagger className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <StaggerItem>
            <Figure
              isLoading={isLoading}
              label="Total supplied"
              value={formatUsd(totalDeposits, DEBT_DECIMALS)}
              hint="LP principal"
            />
          </StaggerItem>
          <StaggerItem>
            <Figure
              isLoading={isLoading}
              label="Borrowed"
              value={formatUsd(borrowed, DEBT_DECIMALS)}
              hint="out on loan"
            />
          </StaggerItem>
          <StaggerItem>
            <Figure
              isLoading={isLoading}
              label="Interest earned"
              value={formatUsd(yieldEarned, DEBT_DECIMALS)}
              hint="paid by borrowers"
            />
          </StaggerItem>
          <StaggerItem>
            <Figure
              isLoading={isLoading}
              label="Collateral locked"
              value={`${formatToken(totalCollateral, COLLATERAL_DECIMALS, 2)} tCTC`}
              hint="across all borrowers"
            />
          </StaggerItem>
        </Stagger>

        <div className="bg-surface-secondary flex flex-col gap-3 rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Utilisation</span>
            <Loadable className="h-5 w-12 rounded" isLoading={isLoading}>
              <span className="text-sm tabular-nums">{formatPercent(utilisation)}</span>
            </Loadable>
          </div>
          {/* Same reasoning as the LTV meter below: utilisation is derived, so there is
           * nothing here to drag, and the bounds sit outside the grid areas. */}
          <div className="flex items-center gap-3">
            <span className="text-muted text-xs tabular-nums">0%</span>
            <Meter
              aria-label="Pool utilisation"
              className="flex-1"
              maxValue={10_000}
              value={Number(utilisation)}
            >
              <Meter.Track>
                <Meter.Fill />
              </Meter.Track>
            </Meter>
            <span className="text-muted text-xs tabular-nums">100%</span>
          </div>
        </div>
      </Card.Content>

      <Card.Footer>
        <Card.Description className="text-xs">
          Borrowing costs a flat {formatPercent(interestBps)}, charged once at borrow rather
          than accrued per block. Every borrower starts at {formatPercent(baseLtvBps)} LTV;
          the rest is earned by passport score.
        </Card.Description>
      </Card.Footer>
    </Card>
  );
}
