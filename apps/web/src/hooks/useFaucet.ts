import { useAccount, useBlock, useReadContracts } from "wagmi";
import { testUsdcAbi, useWriteTestUsdcFaucet } from "@/generated";
import { cc3Testnet } from "@/lib/chains";
import { contracts } from "@/lib/contracts";
import { useTransactionState } from "./useContractAction";

/**
 * The tUSDC faucet, plus the terms it enforces. The contract reverts with "faucet on
 * cooldown" and nothing else, so the amount, the cooldown and the caller's last claim are
 * read up front -- a UI can then say when the next claim opens instead of letting someone
 * discover it by having a transaction fail.
 *
 * Cooldown is measured against block.timestamp, the same clock the require() uses; the
 * browser's would drift and could offer a claim the chain then rejects.
 */
export function useFaucet() {
  const { address } = useAccount();
  const { data: block } = useBlock({ chainId: cc3Testnet.id });

  const base = { address: contracts.testUsdc, abi: testUsdcAbi, chainId: cc3Testnet.id } as const;
  const { data } = useReadContracts({
    contracts: address
      ? [
          { ...base, functionName: "FAUCET_AMOUNT" },
          { ...base, functionName: "FAUCET_COOLDOWN" },
          { ...base, functionName: "lastFaucetClaim", args: [address] },
        ]
      : undefined,
    query: { enabled: Boolean(address) },
  });

  const [amount, cooldown, lastClaim] = data ?? [];
  const faucetAmount = (amount?.result as bigint | undefined) ?? 0n;
  const faucetCooldown = (cooldown?.result as bigint | undefined) ?? 0n;
  const lastClaimedAt = (lastClaim?.result as bigint | undefined) ?? 0n;
  const now = block?.timestamp ?? 0n;

  const availableAt = lastClaimedAt === 0n ? 0n : lastClaimedAt + faucetCooldown;
  // Never-claimed reads as ready. While the block is still loading `now` is 0, which would
  // otherwise report a cooldown that has in fact expired, so that case waits rather than
  // guesses.
  const isReady = lastClaimedAt === 0n || (now > 0n && now >= availableAt);
  const secondsLeft = isReady || now === 0n ? 0n : availableAt - now;

  const write = useWriteTestUsdcFaucet();
  const state = useTransactionState(write);

  const claim = () =>
    write.writeContractAsync({ address: contracts.testUsdc, chainId: cc3Testnet.id });

  return { claim, faucetAmount, faucetCooldown, isReady, secondsLeft, ...state };
}

/** Formats a remaining-cooldown span as the coarsest useful unit. */
export function formatCooldown(seconds: bigint): string {
  if (seconds <= 0n) return "now";
  const h = seconds / 3600n;
  if (h >= 1n) return `${h}h ${(seconds % 3600n) / 60n}m`;
  const m = seconds / 60n;
  return m >= 1n ? `${m}m` : `${seconds}s`;
}
