import { z } from "zod";

/** Every PassportPool form takes one positive decimal amount -- one schema, reused by all
 *  four forms instead of four near-identical ones (DRY). */
export const amountSchema = z.object({
  amount: z.coerce.number().positive("Enter an amount greater than zero"),
});

export type AmountFormValues = z.infer<typeof amountSchema>;
