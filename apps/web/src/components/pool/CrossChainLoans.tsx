"use client";

import { Card, Chip, Skeleton } from "@heroui/react";
import { useAccount } from "wagmi";
import { Loadable } from "@/components/ui/Loadable";
import { ProtocolIcon } from "@/components/ui/ProtocolIcon";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { useRepayAave, useRepayMorpho } from "@/hooks/useRepayCrossChain";
import { useCrossChainLoans, type CrossChainLoan } from "@/hooks/useCrossChainLoans";
import { RepayLoanModal } from "./RepayLoanModal";
import { formatHealthFactor, healthLevel } from "@/lib/crosschain";
import { formatToken, formatUsd } from "@/lib/format";

/**
 * Aave denominates a whole account in USD, Morpho in the market's own tokens -- so the
 * same row prints "$30,181.87" for one and "10,000 mCOL" for the other rather than
 * pinning a dollar sign on a token amount that was never priced.
 */
function amount(value: bigint, decimals: number, symbol: string) {
  return symbol === "USD" ? formatUsd(value, decimals) : `${formatToken(value, decimals, 2)} ${symbol}`;
}

function LoanRow({
  loan,
  isLoading,
  action,
}: {
  loan: CrossChainLoan;
  isLoading: boolean;
  /** The repay control for this protocol, or null once nothing is owed. */
  action: React.ReactNode;
}) {
  const isOpen = loan.debt > 0n;
  const health = loan.healthFactor === null ? null : formatHealthFactor(loan.healthFactor);
  const level = loan.healthFactor === null ? null : healthLevel(loan.healthFactor);

  return (
    <div className="border-default flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-solid p-4">
      <div className="flex items-center gap-3">
        <ProtocolIcon className="size-8" name={loan.protocol} />
        <div>
          <p className="font-medium">{loan.protocol}</p>
          <p className="text-muted text-xs">Ethereum Sepolia</p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-right">
          <Loadable className="h-6 w-20 rounded" isLoading={isLoading}>
            <p className="tabular-nums">{amount(loan.debt, loan.debtDecimals, loan.debtSymbol)}</p>
          </Loadable>
          <p className="text-muted text-xs">Outstanding</p>
        </div>
        <div className="text-right">
          <Loadable className="h-6 w-20 rounded" isLoading={isLoading}>
            <p className="tabular-nums">
              {amount(loan.collateral, loan.collateralDecimals, loan.collateralSymbol)}
            </p>
          </Loadable>
          <p className="text-muted text-xs">Collateral</p>
        </div>
        {/* Morpho Blue publishes no health factor, so the column is a dash there rather
         * than a number we would have to price ourselves from its oracle. */}
        <div className="w-20 text-right">
          <Loadable className="h-6 w-12 rounded" isLoading={isLoading}>
            {isOpen && health && level ? (
              <Chip color={level === "Safe" ? "success" : level === "Watch" ? "warning" : "danger"}>
                {health}
              </Chip>
            ) : (
              <Chip color={isOpen ? "warning" : "default"}>{isOpen ? "Open" : "Settled"}</Chip>
            )}
          </Loadable>
          {isOpen && health ? <p className="text-muted mt-1 text-xs">Health</p> : null}
        </div>
        {isOpen ? action : null}
      </div>
    </div>
  );
}

/**
 * The borrower's debt on the protocols the passport is built from, read live rather than
 * inferred from the passport. Open loans are the interesting case: a score says a borrower
 * repaid before, this says what they still owe, and a lender deciding on the Miro pool
 * wants both.
 */
export function CrossChainLoans() {
  const { isConnected } = useAccount();
  const { loans, isConfigured, isLoading } = useCrossChainLoans();
  // Hooks before the early return: a repay hook per protocol, since each one's approve
  // target, argument shape and top-up story differ.
  const aave = useRepayAave();
  const morpho = useRepayMorpho();

  if (!isConnected || !isConfigured) return null;

  const open = loans.filter((l) => l.debt > 0n).length;

  return (
    <Card className="border-default shadow-panel border border-solid" variant="transparent">
      <Card.Header>
        <Card.Title>Loans on other chains</Card.Title>
        <Card.Description>
          Live positions on the protocols this passport scores from.
        </Card.Description>
      </Card.Header>

      <Card.Content className="flex flex-col gap-3">
        {isLoading && loans.length === 0 ? (
          // Two rows because two protocols are configured; a different count would make
          // the list jump when the real ones land.
          [0, 1].map((i) => <Skeleton className="h-[74px] w-full rounded-2xl" key={i} />)
        ) : (
          <Stagger className="flex flex-col gap-3">
            {loans.map((loan) => {
              const isAave = loan.protocol === "Aave V3";
              const state = isAave ? aave : morpho;
              return (
                <StaggerItem key={loan.protocol}>
                  <LoanRow
                    isLoading={isLoading}
                    loan={loan}
                    action={
                      <RepayLoanModal
                        error={state.error}
                        isConfirmed={state.isConfirmed}
                        isPending={state.isPending}
                        onConfirm={() =>
                          isAave
                            ? aave.repay(loan.repay.amount, loan.repay.balance)
                            : morpho.repay(loan.repay.shares, loan.repay.amount)
                        }
                        protocol={loan.protocol}
                        terms={loan.repay}
                      />
                    }
                  />
                </StaggerItem>
              );
            })}
          </Stagger>
        )}
      </Card.Content>

      <Card.Footer>
        <Card.Description className="text-xs">
          {open > 0
            ? `${open} position${open === 1 ? "" : "s"} still open. Repaying here settles the loan on its own chain and emits the event the worker proves into this passport.`
            : "Nothing outstanding. A repayment on either protocol is what the worker proves into this passport."}
        </Card.Description>
      </Card.Footer>
    </Card>
  );
}
