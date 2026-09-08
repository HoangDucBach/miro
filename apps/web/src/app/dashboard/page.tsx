import { Typography } from "@heroui/react";
import type { Metadata } from "next";
import { ScoreCard } from "@/components/ScoreCard";
import { SourceBreakdown } from "@/components/SourceBreakdown";

export const metadata: Metadata = { title: "Passport" };

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <Typography type="h3">Credit Passport</Typography>

      <Typography type="body-sm" color="muted">
        Real repayments on real lending protocols get attested onto Creditcoin via the
        Passport Protocol — no bridge, no oracle operator. This is your portable score.
      </Typography>

      <ScoreCard />
      <SourceBreakdown />
    </main>
  );
}
