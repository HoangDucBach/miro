"use client";

import { Card, Chip, Meter, Separator, Typography } from "@heroui/react";
import { AltArrowLeftIcon } from "@solar-icons/react/linear/alt-arrow-left";
import { RefreshIcon } from "@solar-icons/react/linear/refresh";
import NextLink from "next/link";
import { Suspense } from "react";
import { useAccount } from "wagmi";
import { FaucetButton } from "@/components/FaucetButton";
import { ActionModal } from "@/components/pool/ActionModal";
import { Loadable } from "@/components/ui/Loadable";
import { PositionTabs } from "@/components/pool/PositionTabs";
import { useBorrow } from "@/hooks/useBorrow";
import { useDepositCollateral } from "@/hooks/useDepositCollateral";
import { usePassportPoolPosition } from "@/hooks/usePassportPoolPosition";
import { useWalletBalances } from "@/hooks/useWalletBalances";
import { useRepay } from "@/hooks/useRepay";
import { useWithdrawCollateral } from "@/hooks/useWithdrawCollateral";
import { formatPercent, formatToken, formatUsd } from "@/lib/format";
import { borrowable, ltvBps, riskLevel, withdrawableCollateral } from "@/lib/pool";

const COLLATERAL_DECIMALS = 18; // tCTC
const DEBT_DECIMALS = 6; // tUSDC

function Stat({ label, value, isLoading }: { label: string; value: string; isLoading: boolean }) {
  return (
    <div className="flex flex-col items-end text-right">
      <Loadable className="h-6 w-16 rounded" isLoading={isLoading}>
        <p className="text-lg font-medium tabular-nums">{value}</p>
      </Loadable>
      <p className="text-muted text-sm">{label}</p>
    </div>
  );
}

/** The balance-plus-actions block that both tabs share, differing only in token and copy. */
function PositionPanel({
  balance,
  headroom,
  headroomLabel,
  actions,
  isLoading,
}: {
  balance: string;
  headroom: string;
  headroomLabel: string;
  actions: React.ReactNode;
  isLoading: boolean;
}) {
  return (
    <div className="bg-surface-secondary flex flex-col gap-6 rounded-2xl p-6">
      <div>
        <Loadable className="h-9 w-56 rounded-xl sm:h-10" isLoading={isLoading}>
          <p className="text-3xl font-semibold tabular-nums sm:text-4xl">{balance}</p>
        </Loadable>
        <div className="mt-2">
          <Loadable className="h-5 w-44 rounded" isLoading={isLoading}>
            <p className="text-muted text-sm">
              {headroomLabel} <span className="text-accent tabular-nums">{headroom}</span>
            </p>
          </Loadable>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-3">{actions}</div>
    </div>
  );
}

export default function PoolPage() {
  const { isConnected } = useAccount();
  const { collateral, debt, creditLimit, maxLtvBps, collateralValue, isLoading } =
    usePassportPoolPosition();
  const wallet = useWalletBalances();
  const deposit = useDepositCollateral();
  const withdraw = useWithdrawCollateral();
  const borrow = useBorrow();
  const repay = useRepay();

  const ltv = ltvBps(debt, collateralValue);
  const risk = riskLevel(ltv, maxLtvBps);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-6 py-8">
      <NextLink
        className="text-muted hover:text-foreground flex w-fit items-center gap-2 text-sm transition-colors"
        href="/dashboard"
      >
        <AltArrowLeftIcon className="size-4" />
        Back to home
      </NextLink>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Typography type="h2">All pools</Typography>
        {isConnected ? <FaucetButton /> : null}
      </div>

      {isConnected ? (
        <Card className="border-default shadow-panel border border-solid" variant="transparent">
          {/* transparent + an explicit border: .card--transparent sets border-style:none,
              so border-solid must be named or the width renders nothing.

              Card.Header stacks its children by default; the reference puts the debt and
              its children by default, and the reference puts the debt and the stats on
              one line, so the row direction is set explicitly too. */}
          <Card.Header className="flex w-full flex-row flex-wrap items-end justify-between gap-6">
            <div>
              <Loadable className="h-10 w-40 rounded-xl" isLoading={isLoading}>
                <p className="text-accent text-4xl font-semibold tabular-nums">
                  {formatUsd(debt, DEBT_DECIMALS)}
                </p>
              </Loadable>
              <p className="text-muted mt-1 text-sm">Debt</p>
            </div>
            <div className="flex gap-8">
              <Stat label="Collateral" value={formatToken(collateral, COLLATERAL_DECIMALS, 2)} isLoading={isLoading} />
              <Stat label="Credit Limit" value={formatUsd(creditLimit, DEBT_DECIMALS)} isLoading={isLoading} />
              <Stat label="Max LTV" value={formatPercent(maxLtvBps)} isLoading={isLoading} />
            </div>
          </Card.Header>

          <Separator />

          <Card.Content className="flex flex-col gap-5">
            {/* A Meter, not a Slider: LTV is derived from debt against collateral, so there
             * is nothing here to drag. The reference draws a slider track, but a thumb
             * would advertise an adjustment the contract does not offer. */}
            <div className="bg-surface-secondary flex flex-col gap-4 rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-medium">
                  <RefreshIcon className="size-5" />
                  Loan To Value (LTV)
                </span>
                <div className="flex items-center gap-3">
                  <Loadable className="h-5 w-12 rounded" isLoading={isLoading}>
                    <span className="text-sm tabular-nums">{formatPercent(ltv)}</span>
                  </Loadable>
                  <Chip
                    color={risk === "Low" ? "success" : risk === "Medium" ? "warning" : "danger"}
                  >
                    {risk}
                  </Chip>
                </div>
              </div>

              {/* The bounds sit outside the Meter because .meter is a grid whose areas are
               * "label output" over "track track" -- anything wrapping the track stops
               * being a grid item, and the track collapses to zero height. */}
              <div className="flex items-center gap-3">
                <span className="text-muted text-xs tabular-nums">0%</span>
                <Meter
                  aria-label="Loan to value"
                  className="flex-1"
                  maxValue={Number(maxLtvBps)}
                  value={Number(ltv)}
                >
                  <Meter.Track>
                    <Meter.Fill />
                  </Meter.Track>
                </Meter>
                <span className="text-muted text-xs tabular-nums">{formatPercent(maxLtvBps)}</span>
              </div>
            </div>

            {/* Suspense is required, not decorative: useSearchParams on a prerendered
             * route makes the tree up to the nearest boundary client-rendered, and a
             * production build fails outright without one. */}
            <Suspense fallback={<div className="h-72" />}>
              <PositionTabs
                collateral={
                  <PositionPanel
                    isLoading={isLoading}
                    balance={`${formatToken(collateral, COLLATERAL_DECIMALS)} tCTC`}
                    headroom={`${formatToken(withdrawableCollateral(collateral, debt, creditLimit), COLLATERAL_DECIMALS)} tCTC`}
                    headroomLabel="Withdrawable"
                    actions={
                      <>
                        <ActionModal
                          action="Withdraw"
                          decimals={COLLATERAL_DECIMALS}
                          error={withdraw.error}
                          available={{
                            label: "Withdrawable",
                            symbol: "tCTC",
                            value: withdrawableCollateral(collateral, debt, creditLimit),
                          }}
                          fieldLabel="Amount to withdraw (tCTC)"
                          isConfirmed={withdraw.isConfirmed}
                          isPending={withdraw.isPending}
                          onSubmit={withdraw.withdraw}
                          variant="outline"
                        />
                        <ActionModal
                          action="Deposit"
                          decimals={COLLATERAL_DECIMALS}
                          error={deposit.error}
                          // Native tCTC, and gas comes out of the same balance, so this
                          // is a ceiling to stay under rather than a figure to match.
                          available={{ label: "In wallet", symbol: "tCTC", value: wallet.native }}
                          fieldLabel="Amount to deposit (tCTC)"
                          isConfirmed={deposit.isConfirmed}
                          isPending={deposit.isPending}
                          onSubmit={deposit.deposit}
                        />
                      </>
                    }
                  />
                }
                loan={
                  <PositionPanel
                    isLoading={isLoading}
                    balance={`${formatToken(debt, DEBT_DECIMALS, 2)} tUSDC`}
                    headroom={`${formatToken(borrowable(debt, creditLimit), DEBT_DECIMALS, 2)} tUSDC`}
                    headroomLabel="Borrowable"
                    actions={
                      <>
                        {/* "Approve and Repay" rather than "Repay": useRepay sends an
                         * ERC-20 approval first when the allowance is short, so the
                         * wallet may prompt twice. */}
                        <ActionModal
                          action="Approve and Repay"
                          decimals={DEBT_DECIMALS}
                          error={repay.error}
                          // Bounded by both the debt and what is actually held: repaying
                          // more than owed is refused, and more than held cannot transfer.
                          available={{
                            label: "Owed, and held",
                            symbol: "tUSDC",
                            value: debt < wallet.usdc ? debt : wallet.usdc,
                          }}
                          fieldLabel="Amount to repay (tUSDC)"
                          isConfirmed={repay.isConfirmed}
                          isPending={repay.isPending}
                          onSubmit={repay.repay}
                          variant="outline"
                        />
                        <ActionModal
                          action="Borrow"
                          decimals={DEBT_DECIMALS}
                          error={borrow.error}
                          available={{
                            label: "Borrowable",
                            symbol: "tUSDC",
                            value: borrowable(debt, creditLimit),
                          }}
                          fieldLabel="Amount to borrow (tUSDC)"
                          isConfirmed={borrow.isConfirmed}
                          isPending={borrow.isPending}
                          onSubmit={borrow.borrow}
                        />
                      </>
                    }
                  />
                }
              />
            </Suspense>
          </Card.Content>
        </Card>
      ) : (
        <Card className="border-default shadow-panel border border-solid" variant="transparent">
          <Card.Header>
            <Card.Description>Connect a wallet to interact with the pool.</Card.Description>
          </Card.Header>
        </Card>
      )}
    </main>
  );
}
