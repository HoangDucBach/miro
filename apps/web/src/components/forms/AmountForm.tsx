"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button, FieldError, Input, Label, Spinner, TextField } from "@heroui/react";
import { Controller, useForm } from "react-hook-form";
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
 *
 * HeroUI's TextField owns its own value/onChange (React Aria), so the field goes through
 * react-hook-form's `Controller` rather than `register()` -- `register`'s ref/onChange
 * contract assumes a plain DOM input.
 */
export function AmountForm({ label, submitLabel, decimals, onSubmit, isPending, isConfirmed, error }: AmountFormProps) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AmountFormValues>({ resolver: zodResolver(amountSchema), defaultValues: { amount: "" } });

  async function submit(values: AmountFormValues) {
    try {
      await onSubmit(parseUnits(values.amount, decimals));
      reset();
    } catch {
      // Wallet rejection / revert already surfaces through the `error` prop below, which
      // the calling hook derives from wagmi's own state. Swallowing here keeps a declined
      // signature from becoming an unhandled promise rejection, and leaves the entered
      // amount in place so the user can retry without retyping.
    }
  }

  const message = errors.amount?.message ?? error?.message;

  return (
    <form className="border-default rounded-xl border p-4" onSubmit={handleSubmit(submit)}>
      <Controller
        control={control}
        name="amount"
        render={({ field }) => (
          <TextField
            isInvalid={Boolean(message)}
            name={field.name}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          >
            <Label>{label}</Label>
            <div className="flex gap-2">
              <Input className="flex-1" inputMode="decimal" placeholder="0.0" ref={field.ref} />
              <Button className="shrink-0" isPending={isPending} type="submit">
                {isPending ? <Spinner color="current" size="sm" /> : null}
                {isPending ? "Submitting…" : submitLabel}
              </Button>
            </div>
            {message ? <FieldError>{message}</FieldError> : null}
          </TextField>
        )}
      />
      {isConfirmed ? <p className="text-success mt-2 text-sm">Confirmed.</p> : null}
    </form>
  );
}
