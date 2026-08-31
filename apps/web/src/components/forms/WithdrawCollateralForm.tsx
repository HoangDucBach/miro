"use client";

import { useWithdrawCollateral } from "@/hooks/useWithdrawCollateral";
import { AmountForm } from "./AmountForm";

export function WithdrawCollateralForm() {
  const { withdraw, isPending, isConfirmed, error } = useWithdrawCollateral();

  return (
    <AmountForm
      label="Withdraw collateral (tCTC)"
      submitLabel="Withdraw"
      decimals={18}
      onSubmit={withdraw}
      isPending={isPending}
      isConfirmed={isConfirmed}
      error={error}
    />
  );
}
