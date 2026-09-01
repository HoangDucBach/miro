import { z } from "zod";

/**
 * Every PassportPool form takes one positive decimal amount -- one schema, reused by all
 * four forms instead of four near-identical ones (DRY).
 *
 * Kept as a string, not `z.coerce.number()`: routing the value through a JS number loses
 * precision on large amounts and stringifies small ones into scientific notation
 * ("1e-7"), which `parseUnits` rejects outright. The string goes to `parseUnits`
 * untouched.
 */
export const amountSchema = z.object({
  amount: z
    .string()
    .trim()
    .min(1, "Enter an amount")
    .regex(/^\d*\.?\d+$/, "Enter a valid number")
    .refine((v) => Number(v) > 0, "Enter an amount greater than zero"),
});

export type AmountFormValues = z.infer<typeof amountSchema>;
