"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { parseUnits } from "viem";
import { amountSchema, type AmountFormValues } from "@/schemas/forms";

interface AmountFormProps {
  label: string;
  submitLabel: string;
  /** Decimals to convert the entered amount into on-chain units with -- 18 for tCTC
   *  (collateral), 6 for tUSDC (debt/repay), matching each token's own `decimals()`. */
  decimals: number;
  onSubmit: (amountWei: bigint) => Promise<unknown>;
  isPending: boolean;
  isConfirmed: boolean;
  error: Error | null;
}

/**
 * The one form every PassportPool action shares: an amount input, react-hook-form + zod
 * validation, and pending/confirmed/error feedback. Deposit, withdraw, borrow, and repay
 * are all this component with a different label/decimals/submit handler (DRY) rather than
 * four near-identical forms.
 */
export function AmountForm({ label, submitLabel, decimals, onSubmit, isPending, isConfirmed, error }: AmountFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AmountFormValues>({ resolver: zodResolver(amountSchema) });

  async function submit(values: AmountFormValues) {
    await onSubmit(parseUnits(values.amount.toString(), decimals));
    reset();
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-2 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <label className="text-sm font-medium" htmlFor={`${label}-amount`}>
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={`${label}-amount`}
          type="number"
          step="any"
          placeholder="0.0"
          className="w-full rounded border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
          {...register("amount")}
        />
        <button
          type="submit"
          disabled={isPending}
          className="shrink-0 rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {isPending ? "Submitting…" : submitLabel}
        </button>
      </div>
      {errors.amount && <p className="text-xs text-red-500">{errors.amount.message}</p>}
      {error && <p className="text-xs text-red-500">{error.message}</p>}
      {isConfirmed && <p className="text-xs text-green-600">Confirmed.</p>}
    </form>
  );
}
