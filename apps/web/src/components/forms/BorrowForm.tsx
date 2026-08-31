"use client";

import { useBorrow } from "@/hooks/useBorrow";
import { AmountForm } from "./AmountForm";

export function BorrowForm() {
  const { borrow, isPending, isConfirmed, error } = useBorrow();

  return (
    <AmountForm
      label="Borrow (tUSDC)"
      submitLabel="Borrow"
      decimals={6}
      onSubmit={borrow}
      isPending={isPending}
      isConfirmed={isConfirmed}
      error={error}
    />
  );
}
