"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { BorrowForm } from "@/components/forms/BorrowForm";
import { DepositCollateralForm } from "@/components/forms/DepositCollateralForm";
import { RepayForm } from "@/components/forms/RepayForm";
import { WithdrawCollateralForm } from "@/components/forms/WithdrawCollateralForm";
import { PoolPositionCard } from "@/components/PoolPositionCard";
import { Button } from "@/components/ui/button";

export default function PoolPage() {
  const { isConnected } = useAccount();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">PassportPool</h1>
        <ConnectButton />
      </div>

      <p className="text-sm text-muted-foreground">
        Always over-collateralized (max 75% LTV) — a higher passport score raises the LTV
        cap, it never removes the collateral requirement. Repaying in full here also
        reports back into the same passport it reads from.
      </p>

      {isConnected ? (
        <>
          <PoolPositionCard />
          <div className="grid gap-4 sm:grid-cols-2">
            <DepositCollateralForm />
            <WithdrawCollateralForm />
            <BorrowForm />
            <RepayForm />
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Connect a wallet to interact with the pool.</p>
      )}

      <Button variant="link" className="w-fit p-0" render={<Link href="/">← Back to passport</Link>} />
    </main>
  );
}
