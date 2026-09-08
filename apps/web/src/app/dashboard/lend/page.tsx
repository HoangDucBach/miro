"use client";

import { Card, Chip, Meter, Separator, Typography } from "@heroui/react";
import { AltArrowLeftIcon } from "@solar-icons/react/linear/alt-arrow-left";
import { ChartIcon } from "@solar-icons/react/linear/chart";
import NextLink from "next/link";
import { useAccount } from "wagmi";
import { FaucetButton } from "@/components/FaucetButton";
import { Loadable } from "@/components/ui/Loadable";
import { FadeIn } from "@/components/ui/FadeIn";
import { ActionModal } from "@/components/pool/ActionModal";
import { useLpDeposit } from "@/hooks/useLpDeposit";
import { useLpPosition } from "@/hooks/useLpPosition";
import { useLpWithdraw } from "@/hooks/useLpWithdraw";
import { lentOut, redeemableValue, utilisationBps } from "@/lib/lend";
import { formatAmount, formatBps } from "@/lib/pool";

const DECIMALS = 6; // tUSDC

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

export default function LendPage() {
  const { isConnected } = useAccount();
  const { lpDeposit, totalDeposits, poolBalance, walletBalance, isLoading } = useLpPosition();
  const deposit = useLpDeposit();
  const withdraw = useLpWithdraw();

  const redeemable = redeemableValue(lpDeposit, totalDeposits, poolBalance);
  const utilisation = utilisationBps(totalDeposits, poolBalance);
  const outOnLoan = lentOut(totalDeposits, poolBalance);

  // Signed: negative means part of the deposit is out on loan, not that value was lost.
  const delta = redeemable - lpDeposit;

  const usd = (v: bigint) => `$${formatAmount(v, DECIMALS, 2)}`;

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
        <Typography type="h2">Lend</Typography>
        {isConnected ? <FaucetButton /> : null}
      </div>

      <FadeIn>
      {isConnected ? (
        <Card className="border-default shadow-panel border border-solid" variant="transparent">
          <Card.Header className="flex w-full flex-row flex-wrap items-end justify-between gap-6">
            <div>
              <Loadable className="h-10 w-40 rounded-xl" isLoading={isLoading}>
                <p className="text-accent text-4xl font-semibold tabular-nums">{usd(redeemable)}</p>
              </Loadable>
              <p className="text-muted mt-1 text-sm">Redeemable now</p>
            </div>
            <div className="flex gap-8">
              <Stat isLoading={isLoading} label="Deposited" value={usd(lpDeposit)} />
              <Stat
                isLoading={isLoading}
                label={delta < 0n ? "Out on loan" : "Interest earned"}
                value={usd(delta < 0n ? -delta : delta)}
              />
              <Stat isLoading={isLoading} label="In wallet" value={usd(walletBalance)} />
            </div>
          </Card.Header>

          <Separator />

          <Card.Content className="flex flex-col gap-5">
            <div className="bg-surface-secondary flex flex-col gap-4 rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-medium">
                  <ChartIcon className="size-5" />
                  Pool utilisation
                </span>
                <div className="flex items-center gap-3">
                  <Loadable className="h-5 w-12 rounded" isLoading={isLoading}>
                    <span className="text-sm tabular-nums">{formatBps(utilisation)}</span>
                  </Loadable>
                  <Chip color={utilisation < 5_000n ? "success" : utilisation < 8_000n ? "warning" : "danger"}>
                    {utilisation < 5_000n ? "Liquid" : utilisation < 8_000n ? "Tight" : "Strained"}
                  </Chip>
                </div>
              </div>

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

              <p className="text-muted text-xs">
                {isLoading ? "…" : `${usd(outOnLoan)} of ${usd(totalDeposits)}`} deposited is out on loan.
                withdrawLP pays pro-rata against what the pool holds right now, so
                redeeming while utilisation is high returns less than principal — the rest
                is lent, not lost, and comes back as borrowers repay.
              </p>
            </div>

            <div className="bg-surface-secondary flex flex-col gap-6 rounded-2xl p-6">
              <div>
                <Loadable className="h-9 w-56 rounded-xl sm:h-10" isLoading={isLoading}>
                  <p className="text-3xl font-semibold tabular-nums sm:text-4xl">
                    {formatAmount(lpDeposit, DECIMALS, 2)} tUSDC
                  </p>
                </Loadable>
                <div className="mt-2">
                  <Loadable className="h-5 w-44 rounded" isLoading={isLoading}>
                    <p className="text-muted text-sm">
                      Redeemable now{" "}
                      <span className="text-accent tabular-nums">{usd(redeemable)}</span>
                    </p>
                  </Loadable>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                {/* Withdraw takes principal, not the payout -- see src/lib/lend.ts. */}
                <ActionModal
                  action="Withdraw"
                  decimals={DECIMALS}
                  error={withdraw.error}
                  fieldLabel="Principal to redeem (tUSDC)"
                  isConfirmed={withdraw.isConfirmed}
                  isPending={withdraw.isPending}
                  onSubmit={withdraw.withdraw}
                  variant="outline"
                />
                <ActionModal
                  action="Approve and Lend"
                  decimals={DECIMALS}
                  error={deposit.error}
                  fieldLabel="Amount to lend (tUSDC)"
                  isConfirmed={deposit.isConfirmed}
                  isPending={deposit.isPending}
                  onSubmit={deposit.deposit}
                />
              </div>
            </div>
          </Card.Content>
        </Card>
      ) : (
        <Card className="border-default shadow-panel border border-solid" variant="transparent">
          <Card.Header>
            <Card.Description>Connect a wallet to lend into the pool.</Card.Description>
          </Card.Header>
        </Card>
      )}
      </FadeIn>
    </main>
  );
}
