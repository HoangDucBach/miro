/**
 * Wallet and RPC errors arrive as viem `BaseError`s whose `message` runs to hundreds of
 * characters of ABI, request body and version footer. `shortMessage` is the one line
 * meant for people; everything else is for a bug report.
 */
export function errorText(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (!(error instanceof Error)) return "Something went wrong.";

  const short = (error as { shortMessage?: unknown }).shortMessage;
  if (typeof short === "string" && short.length > 0) return short;

  return error.message.split("\n")[0].slice(0, 160);
}
