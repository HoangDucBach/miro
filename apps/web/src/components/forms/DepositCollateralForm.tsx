"use client";

import { useDepositCollateral } from "@/hooks/useDepositCollateral";
import { AmountForm } from "./AmountForm";

export function DepositCollateralForm() {
  const { deposit, isPending, isConfirmed, error } = useDepositCollateral();

  return (
    <AmountForm
      label="Deposit collateral (tCTC)"
      submitLabel="Deposit"
      decimals={18}
      onSubmit={deposit}
      isPending={isPending}
      isConfirmed={isConfirmed}
      error={error}
    />
  );
}
