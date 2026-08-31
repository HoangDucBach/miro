"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { parseUnits } from "viem";
import { amountSchema, type AmountFormValues } from "@/schemas/forms";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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
    <form onSubmit={handleSubmit(submit)} className="rounded-xl border border-border p-4">
      <Field data-invalid={Boolean(errors.amount) || undefined}>
        <FieldLabel htmlFor={`${label}-amount`}>{label}</FieldLabel>
        <div className="flex gap-2">
          <FieldContent>
            <Input id={`${label}-amount`} type="number" step="any" placeholder="0.0" {...register("amount")} />
          </FieldContent>
          <Button type="submit" disabled={isPending} className="shrink-0">
            {isPending ? "Submitting…" : submitLabel}
          </Button>
        </div>
        <FieldError errors={[errors.amount, error ? { message: error.message } : undefined]} />
      </Field>
      {isConfirmed && <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">Confirmed.</p>}
    </form>
  );
}
