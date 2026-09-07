"use client";

import { Typography } from "@heroui/react";
import { useAccount } from "wagmi";
import { BorrowForm } from "@/components/forms/BorrowForm";
import { DepositCollateralForm } from "@/components/forms/DepositCollateralForm";
import { RepayForm } from "@/components/forms/RepayForm";
import { WithdrawCollateralForm } from "@/components/forms/WithdrawCollateralForm";
import { PoolPositionCard } from "@/components/PoolPositionCard";

export default function PoolPage() {
  const { isConnected } = useAccount();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <Typography type="h3">PassportPool</Typography>

      <Typography type="body-sm" color="muted">
        Always over-collateralized (max 75% LTV) — a higher passport score raises the LTV
        cap, it never removes the collateral requirement. Repaying in full here also
        reports back into the same passport it reads from.
      </Typography>

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
        <Typography type="body-sm" color="muted">
          Connect a wallet to interact with the pool.
        </Typography>
      )}
    </main>
  );
}
