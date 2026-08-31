"use client";

import { useRepay } from "@/hooks/useRepay";
import { AmountForm } from "./AmountForm";

export function RepayForm() {
  const { repay, isPending, isConfirmed, error } = useRepay();

  return (
    <AmountForm
      label="Repay (tUSDC)"
      submitLabel="Repay"
      decimals={6}
      onSubmit={repay}
      isPending={isPending}
      isConfirmed={isConfirmed}
      error={error}
    />
  );
}
