"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Description,
  FieldError,
  InputGroup,
  Label,
  Spinner,
  TextField,
} from "@heroui/react";
import { Controller, useForm } from "react-hook-form";
import { parseUnits } from "viem";
import { formatToken } from "@/lib/format";
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
  /**
   * The ceiling this particular action is bounded by -- wallet balance, credit headroom,
   * withdrawable collateral. Each action has a different one, so it is passed in rather
   * than assumed here.
   */
  available?: { label: string; value: bigint; symbol: string };
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
export function AmountForm({
  label,
  submitLabel,
  decimals,
  onSubmit,
  isPending,
  isConfirmed,
  error,
  available,
}: AmountFormProps) {
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<AmountFormValues>({ resolver: zodResolver(amountSchema), defaultValues: { amount: "" } });

  async function submit(values: AmountFormValues) {
    const amountWei = parseUnits(values.amount, decimals);

    // Checked against the ceiling before submitting: every one of these actions reverts
    // when it exceeds its limit, and a revert costs gas to learn something the page
    // already knew. Compared in wei, not on the formatted string, which is truncated.
    if (available && amountWei > available.value) {
      setError("amount", {
        message: `Over ${available.label.toLowerCase()} (${formatToken(available.value, decimals)} ${available.symbol})`,
      });
      return;
    }

    try {
      await onSubmit(amountWei);
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
              {/* InputGroup rather than HeroUI's NumberField: NumberField hands back a JS
                  number, and this value is deliberately a string all the way to
                  parseUnits -- a float round-trip loses precision on large amounts and
                  turns small ones into "1e-7", which parseUnits rejects. The suffix gets
                  the unit out of the placeholder and into the field itself. */}
              <InputGroup className="flex-1">
                <InputGroup.Input inputMode="decimal" placeholder="0.0" ref={field.ref} />
                {available ? <InputGroup.Suffix>{available.symbol}</InputGroup.Suffix> : null}
              </InputGroup>
              <Button className="shrink-0" isPending={isPending} type="submit">
                {isPending ? <Spinner color="current" size="sm" /> : null}
                {isPending ? "Submitting…" : submitLabel}
              </Button>
            </div>
            {/* Rendered through Description so React Aria wires it to the input's
                aria-describedby, rather than floating as unassociated text. */}
            {available ? (
              <Description className="tabular-nums">
                {available.label} {formatToken(available.value, decimals)} {available.symbol}
              </Description>
            ) : null}
            {message ? <FieldError>{message}</FieldError> : null}
          </TextField>
        )}
      />
      {isConfirmed ? <p className="text-success mt-2 text-sm">Confirmed.</p> : null}
    </form>
  );
}
