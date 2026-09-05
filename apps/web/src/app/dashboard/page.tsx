import { ScoreCard } from "@/components/ScoreCard";

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-xl font-semibold">Credit Passport</h1>

      <p className="text-muted text-sm">
        Real repayments on real lending protocols get attested onto Creditcoin via the
        Attestcoin Protocol — no bridge, no oracle operator. This is your portable score.
      </p>

      <ScoreCard />
    </main>
  );
}
